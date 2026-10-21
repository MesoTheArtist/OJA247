import { notifyAdmin } from "../services/adminNotificationService.js";
import crypto from "crypto";
import Business from "../models/Business.js";
import User from "../models/User.js";
import SubscriptionPayment, { PLAN_PRICES } from "../models/SubscriptionPayment.js";
import PointsLedger from "../models/PointsLedger.js";
import { handleSubscriptionConversion } from "../services/referralService.js";
import { sendSubscriptionReceiptEmail } from "../services/emailService.js";
import { runInTransaction, MoneyRuleError } from "../utils/transactions.js";

import { isValidCronRequest } from "../utils/cronAuth.js";
// Looks up the business owner's login email for the receipt — Business
// itself only stores a public contact phone, not an email.
async function getOwnerEmail(businessId) {
  const owner = await User.findOne({ businessId }).select("email");
  return owner?.email || null;
}

const PLAN_DURATIONS_DAYS = {
  monthly: 30,
  six_month: 182,
  yearly: 365,
};

const PLAN_MONTHS = { monthly: 1, six_month: 6, yearly: 12 };

export const getSubscriptionPlans = (req, res) => {
  const labels = { monthly: "Monthly", six_month: "6 Months", yearly: "Yearly" };
  res.json({
    plans: Object.entries(PLAN_PRICES).map(([key, price]) => ({
      key,
      label: labels[key],
      price,
      months: PLAN_MONTHS[key],
      durationDays: PLAN_DURATIONS_DAYS[key],
    })),
  });
};

// Runs a follow-up step that must never undo or fail an activation that has
// already happened (points bookkeeping, the receipt email). A failure is logged
// loudly with the label so it can be fixed by hand, and nothing is thrown.
async function bestEffort(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`${label} failed after the subscription was activated — needs a manual look:`, err);
    return null;
  }
}

// A renewal bought before the current period ends starts when that period
// ends, so no paid days are lost. If the subscription already lapsed (or there
// never was one), the new period starts now.
function periodStartFor(currentExpiresAt, now = new Date()) {
  return currentExpiresAt && new Date(currentExpiresAt).getTime() > now.getTime()
    ? new Date(currentExpiresAt)
    : now;
}

function computePeriod(planType, from = new Date()) {
  const periodStart = from;
  const periodEnd = new Date(from);
  periodEnd.setDate(periodEnd.getDate() + PLAN_DURATIONS_DAYS[planType]);
  return { periodStart, periodEnd };
}

// --- Points held for a subscription payment ---------------------------------
//
// Points are taken off the business's balance THE MOMENT a payment is started
// (inside initiateSubscription), in the same transaction that creates the
// payment and its ledger line. Before, they were only deducted after the
// payment succeeded, so several payments started in a row could each be
// discounted by the same points, and when the deduction finally ran the
// balance was just floored to zero while every plan stayed active.
//
// If the payment then fails or is abandoned the points go back (failPayment).
// If it succeeds there is nothing left to do: they are already spent.

// Marks a payment failed and, if it was holding points, gives them back and
// writes the matching ledger line - all in one transaction. Safe to call twice:
// only the call that actually moves the payment out of `from` does anything.
async function failPayment(paymentId, { from = ["pending"] } = {}) {
  return runInTransaction(async (session) => {
    const claimed = await SubscriptionPayment.findOneAndUpdate(
      { _id: paymentId, status: { $in: from } },
      { $set: { status: "failed" } },
      { new: false, session } // returns the payment as it was, so we can see if it held points
    );
    if (!claimed) return false;

    if (claimed.pointsReserved && claimed.pointsApplied > 0) {
      await SubscriptionPayment.updateOne({ _id: paymentId }, { $set: { pointsReserved: false } }, { session });
      const business = await Business.findByIdAndUpdate(
        claimed.businessId,
        { $inc: { pointsBalance: claimed.pointsApplied } },
        { new: true, session }
      );
      if (business) {
        await PointsLedger.create(
          [
            {
              businessId: claimed.businessId,
              type: "redemption_refunded",
              points: claimed.pointsApplied,
              balanceAfter: business.pointsBalance,
              status: "n/a",
              subscriptionPaymentId: claimed._id,
            },
          ],
          { session }
        );
      }
    }
    return true;
  });
}

// A payment that was marked failed (so its points were given back) can still be
// completed later by Paystack, e.g. a slow bank. The cash is really in, so the
// plan is activated; this tries to take the points again. If the vendor has
// already spent them elsewhere the shortfall is logged for a manual look
// rather than undoing a plan they paid cash for.
async function retakeReleasedPoints(payment) {
  await runInTransaction(async (session) => {
    const business = await Business.findOneAndUpdate(
      { _id: payment.businessId, pointsBalance: { $gte: payment.pointsApplied } },
      { $inc: { pointsBalance: -payment.pointsApplied } },
      { new: true, session }
    );
    if (!business) {
      throw new MoneyRuleError("Not enough points left to take again for a late payment.");
    }
    await SubscriptionPayment.updateOne({ _id: payment._id }, { $set: { pointsReserved: true } }, { session });
    await PointsLedger.create(
      [
        {
          businessId: payment.businessId,
          type: "redeemed_subscription",
          points: -payment.pointsApplied,
          balanceAfter: business.pointsBalance,
          status: "n/a",
          subscriptionPaymentId: payment._id,
        },
      ],
      { session }
    );
  });
}

// Asks Paystack what really happened to one reference. Paystack, not our own
// record, is the source of truth for whether money arrived.
async function fetchPaystackTransaction(reference) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return null;
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  return { httpStatus: response.status, ok: response.ok, body };
}

const paystackSaysPaid = (result) => Boolean(result?.ok && result.body?.status && result.body.data?.status === "success");
// "Never going to succeed" - safe to release held points for. Anything else
// (still processing, Paystack down) is left alone and looked at again later.
const paystackSaysDead = (result) =>
  Boolean(result) &&
  (result.httpStatus === 404 || ["failed", "reversed", "abandoned"].includes(result.body?.data?.status));

// Before a business starts a new payment, settle its older unfinished ones with
// Paystack: really paid -> activate it; dead -> give its points back. This is
// what frees points held by a payment whose popup was simply closed.
export async function reconcilePendingPayments(businessId) {
  const settledBefore = new Date(Date.now() - 60 * 1000); // leave a payment being paid right now alone
  const pending = await SubscriptionPayment.find({
    businessId,
    status: "pending",
    createdAt: { $lt: settledBefore },
  })
    .sort({ createdAt: -1 })
    .limit(5);

  for (const payment of pending) {
    try {
      const result = await fetchPaystackTransaction(payment.paystackReference);
      if (!result) continue;
      if (paystackSaysPaid(result)) {
        if (paidEnough(payment, result.body.data)) {
          await markSubscriptionPaid(payment.paystackReference, result.body.data);
        } else {
          console.error(
            `UNDERPAID subscription payment ${payment.paystackReference}: Paystack took ${result.body.data?.amount} kobo, ` +
              `${Math.round((payment.amount - (payment.pointsApplied || 0)) * 100)} needed. Not activated, points released - refund the customer manually.`
          );
          await failPayment(payment._id);
        }
      } else if (paystackSaysDead(result)) {
        await failPayment(payment._id);
      }
    } catch (err) {
      console.error(`Could not settle pending subscription payment ${payment.paystackReference}:`, err);
    }
  }
}

// Wraps handleSubscriptionConversion so a referral/payout bug can never
// block or re-trigger-loop subscription activation. By the time this is
// called the payment has already been marked "success" and the business
// already activated — that must stand regardless of what happens here.
// Without this, an error here would bubble up, the webhook would return
// 500 and Paystack would retry, but markSubscriptionPaid short-circuits on
// an already-"success" payment — so the retry silently never re-attempts
// the conversion either. The marketer's payout would just vanish with no
// record and no error anywhere. Logging loudly here is the only safety net.
async function safeHandleSubscriptionConversion(details) {
  const { paymentId, ...conversionArgs } = details;
  try {
    await handleSubscriptionConversion({ ...conversionArgs, paymentId });
  } catch (err) {
    console.error(
      `Referral conversion failed for subscription payment ${paymentId} (business ${conversionArgs.businessId}, plan ${conversionArgs.planType}) — subscription is still active, but no marketer payout/points were recorded:`,
      err
    );
  }
}

// Starts the card payment on Paystack's side from the SERVER, restricted to
// card (a subscription must be a card payment so it can be renewed
// automatically), at exactly the amount still owed after points. Returns the
// access_code the browser's payment popup resumes - without it the popup has
// nothing to open.
async function initializeSubscriptionTransaction({ email, chargeAmount, reference, planType, businessId, paymentId }) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("Paystack secret key is not configured on the backend");
  }

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      amount: Math.round(Number(chargeAmount) * 100), // kobo
      currency: "NGN",
      reference,
      channels: ["card"],
      metadata: {
        kind: "subscription",
        businessId: String(businessId),
        paymentId: String(paymentId),
        planType,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.status || !data?.data?.access_code) {
    console.error("Paystack subscription initialize failed:", response.status, JSON.stringify(data));
    const err = new Error(data?.message || "Paystack could not start this payment");
    err.paystack = true;
    throw err;
  }
  return data.data.access_code;
}

// POST /api/subscriptions/initiate
// Creates the pending SubscriptionPayment record the frontend then charges
// against via the Paystack popup, mirroring orderController's createOrder.
// If the vendor applies enough points to cover the full plan price, no
// Paystack charge is needed at all - the subscription is activated here
// and the frontend skips the payment popup entirely.
//
// Any points being applied are taken off the balance right here, in the same
// transaction that creates the payment and its ledger line (see "Points held
// for a subscription payment" above), so they cannot be used twice.
export const initiateSubscription = async (req, res) => {
  try {
    const { businessId, planType, pointsToApply, autoRenew } = req.body;

    if (!businessId || !planType) {
      return res.status(400).json({ message: "businessId and planType are required" });
    }
    if (typeof businessId !== "string" || typeof planType !== "string" || !Object.hasOwn(PLAN_PRICES, planType)) {
      return res.status(400).json({ message: "Invalid planType" });
    }

    // Only the business's own owner (or an admin) can pay for its subscription
    const isOwner = req.user.businessId && req.user.businessId.toString() === businessId;
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Not authorized to pay for this business." });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Free up points held by this business's earlier payments that were never
    // finished, and activate any that actually were paid, before working out
    // how many points are available now.
    await reconcilePendingPayments(businessId);
    const fresh = await Business.findById(businessId).select("pointsBalance subscriptionExpiresAt hasPaidFirstSubscription name");
    if (!fresh) {
      return res.status(404).json({ message: "Business not found" });
    }

    const planPrice = PLAN_PRICES[planType];
    const pointsBalance = fresh.pointsBalance || 0;
    const appliedPoints = Math.min(
      Math.max(0, Math.floor(Number(pointsToApply) || 0)),
      pointsBalance,
      planPrice
    );
    const chargeAmount = planPrice - appliedPoints;
    if (autoRenew === true && chargeAmount <= 0) {
      return res.status(400).json({ message: "A card payment is required to enable automatic renewal." });
    }

    const isFirstPayment = !fresh.hasPaidFirstSubscription;
    // Unpredictable, so nobody can guess another business's payment reference.
    const reference = `oja247-sub-${crypto.randomBytes(9).toString("hex")}`;

    let payment;
    try {
      payment = await runInTransaction(async (session) => {
        let balanceAfter = 0;
        if (appliedPoints > 0) {
          // The balance check is part of the same database operation as the
          // subtraction, so two requests can never both spend the same points.
          const charged = await Business.findOneAndUpdate(
            { _id: businessId, pointsBalance: { $gte: appliedPoints } },
            { $inc: { pointsBalance: -appliedPoints } },
            { new: true, session }
          );
          if (!charged) {
            throw new MoneyRuleError("Your points balance changed. Please check it and try again.", 409);
          }
          balanceAfter = charged.pointsBalance;
        }

        const [created] = await SubscriptionPayment.create(
          [
            {
              businessId,
              planType,
              amount: planPrice, // always the full plan value, for accounting/marketer-payout accuracy
              pointsApplied: appliedPoints,
              pointsReserved: appliedPoints > 0,
              isFirstPayment,
              autoRenewRequested: autoRenew === true,
              paystackReference: reference,
              status: chargeAmount <= 0 ? "success" : "pending",
            },
          ],
          { session }
        );

        if (appliedPoints > 0) {
          await PointsLedger.create(
            [
              {
                businessId,
                type: "redeemed_subscription",
                points: -appliedPoints,
                balanceAfter,
                status: "n/a",
                subscriptionPaymentId: created._id,
              },
            ],
            { session }
          );
        }
        return created;
      });
    } catch (err) {
      if (err instanceof MoneyRuleError) return res.status(err.status).json({ message: err.message });
      throw err;
    }

    // Fully covered by points - activate immediately, no Paystack step.
    if (chargeAmount <= 0) {
      const { periodStart, periodEnd } = computePeriod(planType, periodStartFor(fresh.subscriptionExpiresAt));
      try {
        payment.periodStart = periodStart;
        payment.periodEnd = periodEnd;
        await payment.save();

        await Business.findByIdAndUpdate(businessId, {
          subscriptionStatus: "active",
          subscriptionExpiresAt: periodEnd,
          hasPaidFirstSubscription: true,
          subscriptionReminderSentAt: null,
          subscriptionExpiredEmailSentAt: null,
        });
      } catch (err) {
        // Nothing was activated: give the points back and don't leave a "success" record behind.
        console.error(`Points-only activation failed for payment ${payment._id}:`, err);
        await failPayment(payment._id, { from: ["success"] }).catch((refundErr) =>
          console.error(`MANUAL FIX NEEDED: points for failed payment ${payment._id} were not returned:`, refundErr)
        );
        throw err;
      }

      await bestEffort(`Receipt email for payment ${payment._id}`, async () =>
        sendSubscriptionReceiptEmail({
          to: await getOwnerEmail(businessId),
          businessName: fresh.name,
          planType,
          amountPaid: 0,
          planPrice: payment.amount,
          pointsApplied: payment.pointsApplied,
          paidAt: new Date(),
          reference: payment.paystackReference,
          expiresAt: periodEnd,
        })
      );

      await bestEffort(`Admin notification for points-only payment ${payment._id}`, () =>
        notifyAdmin({
          type: "subscription_paid",
          title: `Subscription paid: ${fresh.name}`,
          message: `${String(planType).replace("_", " ")} plan · paid fully with ${payment.pointsApplied} points (no cash).`,
          tab: "transactions",
          meta: { paymentId: String(payment._id), businessId: String(businessId), planType, cashCollected: 0 },
        })
      );

      // No Paystack cash was collected on this payment - it's covered
      // entirely by points, which are themselves money the platform already
      // paid out once (to whoever earned them). Awarding a marketer payout
      // or business referral points again here, off the nominal plan price,
      // would pay out twice against a single real inflow. So: activate the
      // subscription, but skip the referral conversion entirely.

      return res.status(201).json({
        message: "Subscription paid in full with points",
        fullyPaidWithPoints: true,
        pointsApplied: appliedPoints,
        paymentId: payment._id,
      });
    }

    // Card payment: have Paystack start it now and hand the browser the code to
    // open the popup with. If Paystack can't, the payment is closed again and
    // any points held for it go straight back.
    let accessCode;
    try {
      const email = await getOwnerEmail(businessId);
      if (!email) throw new Error("No login email on file for this business");
      accessCode = await initializeSubscriptionTransaction({
        email,
        chargeAmount,
        reference,
        planType,
        businessId,
        paymentId: payment._id,
      });
    } catch (initError) {
      console.error(`Could not start card payment ${reference}:`, initError.message);
      await failPayment(payment._id).catch((releaseError) =>
        console.error(`MANUAL FIX NEEDED: points for unstarted payment ${payment._id} were not returned:`, releaseError)
      );
      return res.status(initError.paystack ? 502 : 500).json({
        message: "We couldn't start the card payment. Please try again in a moment.",
      });
    }

    res.status(201).json({
      message: "Subscription payment initiated",
      reference,
      accessCode,
      amount: chargeAmount, // what Paystack should actually charge
      pointsApplied: appliedPoints,
      fullyPaidWithPoints: false,
      paymentId: payment._id,
    });
  } catch (error) {
    console.error("Initiate subscription error:", error);
    res.status(500).json({ message: "Error initiating subscription payment" });
  }
};

// Shared by /verify and the webhook — idempotent, safe to call twice for
// the same reference (e.g. if the user's browser confirms AND the webhook
// fires). Only ever processes a payment from pending -> success once.
async function markSubscriptionPaid(reference, paystackData = null) {
  // Claim the payment atomically. The browser's verify call and Paystack's
  // webhook usually arrive within milliseconds of each other; a plain
  // read-then-write let both see "pending" and both run the code below, which
  // double-deducted points, sent two receipts and could pay a marketer twice.
  // Only the caller whose update actually flips the status continues.
  const payment = await SubscriptionPayment.findOneAndUpdate(
    { paystackReference: reference, status: { $ne: "success" } },
    { status: "success" },
    { new: true }
  );
  if (!payment) {
    // Either no such payment (null) or another call already processed it.
    return SubscriptionPayment.findOne({ paystackReference: reference });
  }

  // Activation is the one step the vendor actually paid for. If it fails after
  // the payment was claimed, hand the payment back to "pending": the webhook
  // gets a 500, Paystack re-sends it, and the retry can run again. Without this
  // the payment would sit as "success" with no subscription, and every retry
  // would skip it as already done.
  let periodEnd;
  try {
    const currentBusiness = await Business.findById(payment.businessId).select("subscriptionExpiresAt");
    const period = computePeriod(payment.planType, periodStartFor(currentBusiness?.subscriptionExpiresAt));
    periodEnd = period.periodEnd;
    payment.periodStart = period.periodStart;
    payment.periodEnd = period.periodEnd;
    const authorization = paystackData?.authorization;
    const autoRenewActivated = Boolean(
      payment.autoRenewRequested &&
      authorization?.reusable === true &&
      authorization.authorization_code
    );
    payment.autoRenewActivated = autoRenewActivated;
    await payment.save();

    const businessUpdate = {
      subscriptionStatus: "active",
      subscriptionExpiresAt: periodEnd,
      hasPaidFirstSubscription: true,
      subscriptionReminderSentAt: null,
      subscriptionExpiredEmailSentAt: null,
    };
    if (autoRenewActivated) {
      Object.assign(businessUpdate, {
        subscriptionAutoRenew: true,
        subscriptionAutoRenewPlanType: payment.planType,
        subscriptionAutoRenewAmount: payment.amount,
        subscriptionAuthorizationCode: authorization.authorization_code,
        subscriptionCustomerCode: paystackData.customer?.customer_code || null,
        subscriptionCardBrand: authorization.brand || null,
        subscriptionCardLast4: authorization.last4 || null,
        subscriptionAutoRenewAttemptedFor: null,
      });
    } else if (payment.autoRenewRequested) {
      Object.assign(businessUpdate, {
        subscriptionAutoRenew: false,
        subscriptionAutoRenewPlanType: null,
        subscriptionAutoRenewAmount: null,
        subscriptionAuthorizationCode: null,
        subscriptionCustomerCode: null,
        subscriptionCardBrand: null,
        subscriptionCardLast4: null,
        subscriptionAutoRenewAttemptedFor: null,
      });
    }
    await Business.findByIdAndUpdate(payment.businessId, businessUpdate);
  } catch (err) {
    console.error(`Subscription activation failed for payment ${payment._id} (${reference}) — returning it to pending so it can be retried:`, err);
    try {
      await SubscriptionPayment.findByIdAndUpdate(payment._id, { status: "pending", periodStart: null, periodEnd: null });
    } catch (revertErr) {
      console.error(`MANUAL FIX NEEDED: payment ${payment._id} (${reference}) was paid but is stuck as "success" without an active subscription:`, revertErr);
    }
    throw err;
  }

  // The vendor is active from here on. The rest is bookkeeping and must not
  // undo or fail it. Points were already taken when the payment was started;
  // the only case left is a payment that was marked failed (points given back)
  // and then completed late by Paystack.
  if (payment.pointsApplied > 0 && !payment.pointsReserved) {
    await bestEffort(`Taking points again for late payment ${payment._id}`, () => retakeReleasedPoints(payment));
  }

  const cashCollected = payment.amount - (payment.pointsApplied || 0);

  await bestEffort(`Receipt email for payment ${payment._id}`, async () => {
    const business = await Business.findById(payment.businessId).select("name");
    return sendSubscriptionReceiptEmail({
      to: await getOwnerEmail(payment.businessId),
      businessName: business?.name || "",
      planType: payment.planType,
      amountPaid: cashCollected,
      planPrice: payment.amount,
      pointsApplied: payment.pointsApplied,
      paidAt: new Date(),
      reference: payment.paystackReference,
      expiresAt: periodEnd,
    });
  });

  await bestEffort(`Admin notification for payment ${payment._id}`, async () => {
    const business = await Business.findById(payment.businessId).select("name");
    return notifyAdmin({
      type: "subscription_paid",
      title: `Subscription paid: ${business?.name || "a business"}`,
      message: `${String(payment.planType).replace("_", " ")} plan · ₦${Number(cashCollected).toLocaleString()} cash${payment.pointsApplied ? ` + ${payment.pointsApplied} points` : ""}.`,
      tab: "transactions",
      meta: { paymentId: String(payment._id), businessId: String(payment.businessId), planType: payment.planType, cashCollected },
    });
  });

  // Conversion is based on cash actually collected on THIS payment
  // (plan price minus whatever was covered by points) — never the full
  // nominal plan price. See the points-only branch in initiateSubscription
  // for the full reasoning; this covers the partial-points-partial-cash case.
  if (cashCollected > 0) {
    await safeHandleSubscriptionConversion({
      paymentId: payment._id,
      paymentReference: payment.paystackReference,
      businessId: payment.businessId,
      amountPaid: cashCollected,
      planType: payment.planType,
    });
  }

  return payment;
}

// The Paystack popup is opened by the browser with an amount the browser
// chooses, so a "success" from Paystack only proves that SOME amount was paid.
// Make sure at least what this payment needs in cash (plan price minus points)
// came in, in naira, before activating anything.
function paidEnough(payment, paystackData) {
  const expectedKobo = Math.round(((payment.amount || 0) - (payment.pointsApplied || 0)) * 100);
  const paidKobo = Number(paystackData?.amount);
  const currencyOk = !paystackData?.currency || paystackData.currency === "NGN";
  return currencyOk && Number.isFinite(paidKobo) && paidKobo >= expectedKobo;
}

// POST /api/subscriptions/verify/:reference
export const verifySubscriptionPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) {
      return res.status(400).json({ message: "Payment reference is required" });
    }

    const payment = await SubscriptionPayment.findOne({ paystackReference: reference });
    if (!payment) {
      return res.status(404).json({ message: "Subscription payment not found" });
    }
    if (
      req.user.role !== "admin" &&
      req.user.businessId?.toString() !== payment.businessId.toString()
    ) {
      return res.status(403).json({ message: "Not authorized to verify this subscription payment." });
    }

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) {
      return res.status(500).json({ message: "Paystack secret key is not configured on the backend" });
    }

    const verificationResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    const verificationData = await verificationResponse.json();

    if (!verificationResponse.ok || !verificationData.status || verificationData.data?.status !== "success") {
      // Only a payment Paystack says has definitely failed is closed (and its
      // points returned). One that is merely still processing, or that Paystack
      // couldn't answer about, stays pending and is settled later.
      if (["failed", "reversed"].includes(verificationData?.data?.status)) {
        await failPayment(payment._id);
      }
      return res.status(400).json({ message: "Payment verification failed" });
    }

    if (payment.status !== "success" && !paidEnough(payment, verificationData.data)) {
      console.error(
        `Subscription verify: amount mismatch for ${reference} — paid ${verificationData.data?.amount} kobo ${verificationData.data?.currency || ""}, ` +
          `needed ${Math.round((payment.amount - (payment.pointsApplied || 0)) * 100)} kobo. Not activated.`
      );
      return res.status(400).json({ message: "The amount paid does not match this plan, so the subscription was not activated. Please contact support." });
    }

    const paidPayment = await markSubscriptionPaid(reference, verificationData.data);

    return res.json({
      message: "Subscription payment verified successfully",
      payment: paidPayment,
      autoRenewEnabled: Boolean(paidPayment?.autoRenewActivated),
    });
  } catch (error) {
    console.error("Verify subscription payment error:", error);
    return res.status(500).json({ message: "Error verifying subscription payment" });
  }
};

// POST /api/subscriptions/webhook
// Source of truth, independent of whether the browser stayed on the page —
// same signature-check pattern as orderController's Paystack webhook.
export const handleSubscriptionWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret || !signature || !req.rawBody) {
      return res.sendStatus(401);
    }

    const expectedSignature = crypto.createHmac("sha512", secret).update(req.rawBody).digest("hex");
    // Same timingSafeEqual fix as orderController's Paystack webhook — see
    // the comment there for why, and why the length check comes first.
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const actualBuffer = Buffer.from(signature, "hex");
    const signatureValid =
      expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    if (!signatureValid) {
      console.error("Subscription webhook: signature mismatch");
      return res.sendStatus(401);
    }

    const event = req.body;

    if (event.event === "charge.success" && event.data?.reference) {
      const pending = await SubscriptionPayment.findOne({ paystackReference: event.data.reference });
      if (pending && pending.status !== "success" && !paidEnough(pending, event.data)) {
        // Answer 200 so Paystack stops retrying, but never activate on a short payment.
        console.error(
          `Subscription webhook: amount mismatch for ${event.data.reference} — paid ${event.data.amount} kobo ${event.data.currency || ""}. Not activated.`
        );
        return res.sendStatus(200);
      }
      await markSubscriptionPaid(event.data.reference, event.data);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Subscription webhook error:", error.message);
    return res.sendStatus(500); // non-2xx so Paystack retries
  }
};

// Owners can stop future charges without losing the already-paid subscription period.
export const cancelSubscriptionAutoRenew = async (req, res) => {
  try {
    const { businessId } = req.body;
    if (!businessId) {
      return res.status(400).json({ message: "businessId is required" });
    }
    if (req.user.role !== "admin" && req.user.businessId?.toString() !== businessId) {
      return res.status(403).json({ message: "Not authorized to manage this subscription." });
    }

    const business = await Business.findByIdAndUpdate(
      businessId,
      {
        $set: { subscriptionAutoRenew: false },
        $unset: {
          subscriptionAutoRenewPlanType: "",
          subscriptionAutoRenewAmount: "",
          subscriptionAuthorizationCode: "",
          subscriptionCustomerCode: "",
          subscriptionCardBrand: "",
          subscriptionCardLast4: "",
          subscriptionAutoRenewAttemptedFor: "",
        },
      },
      { new: true }
    );
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    return res.json({ message: "Automatic renewal cancelled. Your current subscription remains active until it expires." });
  } catch (error) {
    console.error("Cancel subscription auto-renew error:", error);
    return res.status(500).json({ message: "Could not cancel automatic renewal" });
  }
};

// GET /api/cron/subscription-auto-renew
// Charges reusable card authorizations shortly before their selected plan term ends.
export const runSubscriptionAutoRenewal = async (req, res) => {
  try {
    const cronSecret = req.headers["authorization"];
    if (!isValidCronRequest(cronSecret)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return res.status(500).json({ message: "Paystack secret key is not configured on the backend" });
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dueBusinesses = await Business.find({
      subscriptionAutoRenew: true,
      subscriptionExpiresAt: { $lte: cutoff },
      subscriptionAuthorizationCode: { $exists: true, $ne: null },
    }).select(
      "name subscriptionExpiresAt subscriptionAutoRenewPlanType subscriptionAutoRenewAmount subscriptionAutoRenewAttemptedFor +subscriptionAuthorizationCode"
    );

    let renewed = 0;
    let failed = 0;
    for (const candidate of dueBusinesses) {
      const expiresAt = candidate.subscriptionExpiresAt;
      const business = await Business.findOneAndUpdate(
        {
          _id: candidate._id,
          subscriptionAutoRenew: true,
          subscriptionExpiresAt: expiresAt,
          $or: [
            { subscriptionAutoRenewAttemptedFor: null },
            { subscriptionAutoRenewAttemptedFor: { $ne: expiresAt } },
          ],
        },
        { $set: { subscriptionAutoRenewAttemptedFor: expiresAt } },
        { new: true }
      ).select(
        "name subscriptionExpiresAt subscriptionAutoRenewPlanType subscriptionAutoRenewAmount +subscriptionAuthorizationCode"
      );
      if (!business) continue;

      const planType = business.subscriptionAutoRenewPlanType;
      const amount = business.subscriptionAutoRenewAmount || PLAN_PRICES[planType];
      if (!PLAN_PRICES[planType] || !amount) {
        failed += 1;
        await Business.findByIdAndUpdate(business._id, {
          $set: { subscriptionAutoRenew: false },
          $unset: { subscriptionAuthorizationCode: "", subscriptionCustomerCode: "" },
        });
        continue;
      }

      const reference = `oja247-renew-${business._id}-${expiresAt.getTime()}`;
      let payment;
      try {
        payment = await SubscriptionPayment.findOneAndUpdate(
          { paystackReference: reference },
          {
            $setOnInsert: {
              businessId: business._id,
              planType,
              amount,
              pointsApplied: 0,
              isFirstPayment: false,
              autoRenewRequested: false,
              paystackReference: reference,
              status: "pending",
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (payment.status === "success") {
          renewed += 1;
          continue;
        }

        const email = await getOwnerEmail(business._id);
        const chargeResponse = await fetch("https://api.paystack.co/transaction/charge_authorization", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            authorization_code: business.subscriptionAuthorizationCode,
            email,
            amount: Math.round(amount * 100),
            currency: "NGN",
            reference,
          }),
        });
        const chargeResult = await chargeResponse.json();
        if (
          !chargeResponse.ok ||
          !chargeResult.status ||
          chargeResult.data?.status !== "success" ||
          !paidEnough(payment, chargeResult.data)
        ) {
          payment.status = "failed";
          await payment.save();
          failed += 1;
          await Business.findByIdAndUpdate(business._id, {
            $set: { subscriptionAutoRenew: false },
            $unset: {
              subscriptionAuthorizationCode: "",
              subscriptionCustomerCode: "",
              subscriptionCardBrand: "",
              subscriptionCardLast4: "",
            },
          });
          continue;
        }

        const paidPayment = await markSubscriptionPaid(reference, chargeResult.data);
        if (paidPayment?.status === "success") renewed += 1;
      } catch (error) {
        console.error(`Automatic renewal failed for business ${business._id}:`, error);
        if (payment?.status === "pending") {
          payment.status = "failed";
          await payment.save();
        }
        await Business.findByIdAndUpdate(business._id, {
          $set: { subscriptionAutoRenew: false },
          $unset: {
            subscriptionAuthorizationCode: "",
            subscriptionCustomerCode: "",
            subscriptionCardBrand: "",
            subscriptionCardLast4: "",
          },
        });
        failed += 1;
      }
    }

    return res.json({ success: true, renewed, failed });
  } catch (error) {
    console.error("Subscription auto-renew cron error:", error);
    return res.status(500).json({ message: "Subscription renewal processing failed" });
  }
};