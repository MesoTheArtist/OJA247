import crypto from "crypto";
import Business from "../models/Business.js";
import User from "../models/User.js";
import SubscriptionPayment, { PLAN_PRICES } from "../models/SubscriptionPayment.js";
import PointsLedger from "../models/PointsLedger.js";
import { handleSubscriptionConversion } from "../services/referralService.js";
import {
  sendSubscriptionReceiptEmail,
  sendSubscriptionRenewalFailedEmail,
} from "../services/emailService.js";

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

// Deducts a payment's applied points from the business's balance and logs
// it, exactly once. Called only once a payment has actually succeeded
// (either fully via points, or after Paystack verification) — never at
// initiate time, so an abandoned/failed payment never costs the vendor points.
async function deductAppliedPoints(payment) {
  if (!payment.pointsApplied || payment.pointsApplied <= 0) return;

  // Safe to call once per payment: the points-only path in initiateSubscription
  // creates the payment already "success" (never re-entering this function),
  // and markSubscriptionPaid only reaches this line on the pending -> success
  // transition, which happens at most once per payment (idempotency guarded above).
  //
  // Atomic decrement (not read-then-write) — closes the same race window as
  // withdrawPoints in pointsController.js: two balance-affecting operations
  // firing near-simultaneously for the same business can no longer both act
  // on the same stale balance reading.
  let business = await Business.findOneAndUpdate(
    { _id: payment.businessId, pointsBalance: { $gte: payment.pointsApplied } },
    { $inc: { pointsBalance: -payment.pointsApplied } },
    { new: true }
  );

  if (!business) {
    // The balance check at initiate time is now stale (something else moved
    // the balance in between) and there isn't enough left to fully cover
    // this payment. The subscription is already active at this point — that
    // can't be undone — so floor at 0 and log loudly rather than silently
    // pretending the deduction happened as planned.
    console.error(
      `Points balance insufficient at deduction time for business ${payment.businessId} ` +
        `(payment ${payment._id}, expected to deduct ${payment.pointsApplied}). Flooring balance to 0.`
    );
    business = await Business.findByIdAndUpdate(
      payment.businessId,
      { pointsBalance: 0 },
      { new: true }
    );
    if (!business) return;
  }

  await PointsLedger.create({
    businessId: payment.businessId,
    type: "redeemed_subscription",
    points: -payment.pointsApplied,
    balanceAfter: business.pointsBalance,
    status: "n/a",
  });
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

// POST /api/subscriptions/initiate
// Creates the pending SubscriptionPayment record the frontend then charges
// against via the Paystack popup, mirroring orderController's createOrder.
// If the vendor applies enough points to cover the full plan price, no
// Paystack charge is needed at all — the subscription is activated here
// and the frontend skips the payment popup entirely.
// Starts the Paystack payment on the SERVER, restricted to card. Subscriptions
// are card-only (the card is what gets renewed automatically), and doing it
// here means the browser can't change the channel or the amount: it only gets
// an access code to finish the payment with.
async function initializeSubscriptionTransaction({ email, amountNaira, reference, businessId, planType }) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("Paystack secret key is not configured on the backend");

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      amount: Math.round(amountNaira * 100), // kobo
      currency: "NGN",
      reference,
      channels: ["card"],
      metadata: {
        custom_fields: [
          { display_name: "Business ID", variable_name: "business_id", value: String(businessId) },
          { display_name: "Plan", variable_name: "plan_type", value: planType },
        ],
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.status || !data?.data?.access_code) {
    console.error("Subscription initialize failed:", response.status, JSON.stringify(data));
    throw new Error(data?.message || "Paystack could not start this payment");
  }
  return data.data.access_code;
}

export const initiateSubscription = async (req, res) => {
  try {
    const { businessId, planType, pointsToApply, autoRenew } = req.body;

    if (!businessId || !planType) {
      return res.status(400).json({ message: "businessId and planType are required" });
    }
    if (!PLAN_PRICES[planType]) {
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

    const planPrice = PLAN_PRICES[planType];
    const pointsBalance = business.pointsBalance || 0;
    const appliedPoints = Math.min(
      Math.max(0, Math.floor(Number(pointsToApply) || 0)),
      pointsBalance,
      planPrice
    );
    const chargeAmount = planPrice - appliedPoints;
    if (autoRenew === true && chargeAmount <= 0) {
      return res.status(400).json({ message: "A card payment is required to enable automatic renewal." });
    }

    const isFirstPayment = !business.hasPaidFirstSubscription;
    const reference = `oja247-sub-${Date.now()}`;

    const payment = await SubscriptionPayment.create({
      businessId,
      planType,
      amount: planPrice, // always the full plan value, for accounting/marketer-payout accuracy
      pointsApplied: appliedPoints,
      isFirstPayment,
      autoRenewRequested: autoRenew === true,
      paystackReference: reference,
      status: chargeAmount <= 0 ? "success" : "pending",
    });

    // Fully covered by points — activate immediately, no Paystack step.
    if (chargeAmount <= 0) {
      const { periodStart, periodEnd } = computePeriod(planType, periodStartFor(business.subscriptionExpiresAt));
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
        // Nothing was charged and nothing was activated: don't leave a "success" record behind.
        console.error(`Points-only activation failed for payment ${payment._id}:`, err);
        await SubscriptionPayment.findByIdAndUpdate(payment._id, { status: "failed" }).catch(() => {});
        throw err;
      }

      await bestEffort(`Points deduction for payment ${payment._id}`, () => deductAppliedPoints(payment));

      await bestEffort(`Receipt email for payment ${payment._id}`, async () =>
        sendSubscriptionReceiptEmail({
          to: await getOwnerEmail(businessId),
          businessName: business.name,
          planType,
          amountPaid: 0,
          planPrice: payment.amount,
          pointsApplied: payment.pointsApplied,
          paidAt: new Date(),
          reference: payment.paystackReference,
          expiresAt: periodEnd,
        })
      );

      // No Paystack cash was collected on this payment — it's covered
      // entirely by points, which are themselves money the platform already
      // paid out once (to whoever earned them). Awarding a marketer payout
      // or business referral points again here, off the nominal plan price,
      // would pay out twice against a single real inflow. So: activate the
      // subscription, but skip the referral conversion entirely — the
      // referring marketer/business simply doesn't get paid on this
      // particular payment. (Their ReferralAttribution stays "pending"
      // rather than flipping to "converted" — it will still convert on a
      // later payment for this business that does involve real cash.)

      return res.status(201).json({
        message: "Subscription paid in full with points",
        fullyPaidWithPoints: true,
        pointsApplied: appliedPoints,
        paymentId: payment._id,
      });
    }

    const ownerEmail = await getOwnerEmail(businessId);
    let accessCode;
    try {
      if (!ownerEmail) throw new Error("No login email found for this business");
      accessCode = await initializeSubscriptionTransaction({
        email: ownerEmail,
        amountNaira: chargeAmount,
        reference,
        businessId,
        planType,
      });
    } catch (initError) {
      await SubscriptionPayment.findByIdAndUpdate(payment._id, { status: "failed" }).catch(() => {});
      return res.status(502).json({
        message: "We couldn't start the card payment just now. Please try again in a moment.",
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
      // A successful payment (a renewal or a card paid by hand) clears any
      // failed-renewal state, so the retries and the grace period end here.
      subscriptionRenewalFailures: 0,
      subscriptionRenewalNextRetryAt: null,
      subscriptionGraceUntil: null,
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
  // undo or fail it.
  await bestEffort(`Points deduction for payment ${payment._id}`, () => deductAppliedPoints(payment));

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
      await SubscriptionPayment.findOneAndUpdate(
        { _id: payment._id, status: "pending" },
        { $set: { status: "failed" } }
      );
      return res.status(400).json({ message: "Payment verification failed", verification: verificationData });
    }

    // Card only. The payment is started on the server restricted to card, so
    // anything else means the request was tampered with: don't activate it.
    if (payment.status !== "success" && verificationData.data?.channel && verificationData.data.channel !== "card") {
      console.error(
        `Subscription verify: ${reference} was paid by "${verificationData.data.channel}", not card. Not activated; needs a manual look.`
      );
      return res.status(400).json({
        message: "Subscriptions are paid by card only, so this payment was not applied. If you were charged, please contact support with your reference.",
      });
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
      if (pending && pending.status !== "success" && event.data.channel && event.data.channel !== "card") {
        console.error(
          `Subscription webhook: ${event.data.reference} was paid by "${event.data.channel}", not card. Not activated; needs a manual look.`
        );
        return res.sendStatus(200);
      }
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
        // Cancelling also stops any retries in progress and the grace period.
        $set: {
          subscriptionAutoRenew: false,
          subscriptionRenewalFailures: 0,
          subscriptionRenewalNextRetryAt: null,
          subscriptionGraceUntil: null,
        },
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

// How the daily renewal job treats a declined card: it tries again instead of
// giving up at once. Attempt 1 is the day before the plan ends. The retries
// come this many days AFTER the plan ends. The store stays visible (grace)
// until the last retry has had its chance, and the card is only forgotten
// after the last one fails.
const RENEWAL_RETRY_DAYS_AFTER_EXPIRY = [1, 3];
const MAX_RENEWAL_ATTEMPTS = 1 + RENEWAL_RETRY_DAYS_AFTER_EXPIRY.length;
const SUBSCRIPTION_GRACE_DAYS = RENEWAL_RETRY_DAYS_AFTER_EXPIRY[RENEWAL_RETRY_DAYS_AFTER_EXPIRY.length - 1] + 2;
const RENEWAL_LEASE_MS = 6 * 60 * 60 * 1000; // a run "holds" a business this long, so two runs never charge it at once
const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/cron/subscription-auto-renew   (daily)
// Charges saved cards for plans that end within a day, and retries declined
// renewals. The reference is fixed per attempt, so a repeated run can't charge
// the same attempt twice.
export const runSubscriptionAutoRenewal = async (req, res) => {
  try {
    const cronSecret = req.headers["authorization"];
    if (!process.env.CRON_SECRET || cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return res.status(500).json({ message: "Paystack secret key is not configured on the backend" });
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() + DAY_MS);
    const SELECT =
      "name subscriptionExpiresAt subscriptionAutoRenewPlanType subscriptionAutoRenewAmount subscriptionAutoRenewAttemptedFor " +
      "subscriptionRenewalFailures subscriptionRenewalNextRetryAt subscriptionCardBrand subscriptionCardLast4 +subscriptionAuthorizationCode";

    const due = await Business.find({
      subscriptionAutoRenew: true,
      subscriptionAuthorizationCode: { $exists: true, $ne: null },
      $or: [
        // First attempt: the plan ends within a day.
        { subscriptionRenewalFailures: { $in: [0, null] }, subscriptionExpiresAt: { $lte: cutoff } },
        // A retry that has come due.
        { subscriptionRenewalFailures: { $gt: 0 }, subscriptionRenewalNextRetryAt: { $lte: now } },
      ],
    }).select(SELECT);

    let renewed = 0;
    let declined = 0;
    let retriesScheduled = 0;
    let gaveUp = 0;
    let skipped = 0;

    for (const candidate of due) {
      const expiresAt = candidate.subscriptionExpiresAt;
      const priorFailures = candidate.subscriptionRenewalFailures || 0;
      const isRetry = priorFailures > 0;
      const attemptNumber = priorFailures + 1;
      // Remember what these fields held BEFORE the claim, to put back if the
      // attempt can't be made.
      const priorAttemptedFor = candidate.subscriptionAutoRenewAttemptedFor || null;
      const priorNextRetryAt = candidate.subscriptionRenewalNextRetryAt || null;

      // Claim this business for this attempt. Only the run that wins the claim goes on.
      const claim = await Business.findOneAndUpdate(
        isRetry
          ? {
              _id: candidate._id,
              subscriptionAutoRenew: true,
              subscriptionRenewalFailures: priorFailures,
              subscriptionRenewalNextRetryAt: candidate.subscriptionRenewalNextRetryAt,
            }
          : {
              _id: candidate._id,
              subscriptionAutoRenew: true,
              subscriptionExpiresAt: expiresAt,
              subscriptionRenewalFailures: { $in: [0, null] },
              $or: [
                { subscriptionAutoRenewAttemptedFor: null },
                { subscriptionAutoRenewAttemptedFor: { $ne: expiresAt } },
              ],
            },
        {
          $set: isRetry
            ? { subscriptionRenewalNextRetryAt: new Date(now.getTime() + RENEWAL_LEASE_MS) }
            : {
                subscriptionAutoRenewAttemptedFor: expiresAt,
                subscriptionRenewalNextRetryAt: new Date(now.getTime() + RENEWAL_LEASE_MS),
              },
        },
        { new: true }
      ).select(SELECT);
      if (!claim) continue;
      const business = claim;

      // Undo the claim if the attempt couldn't be made (network or Paystack down),
      // so tomorrow's run tries again and it doesn't count as a decline.
      const releaseClaim = () =>
        Business.findByIdAndUpdate(business._id, {
          $set: {
            subscriptionAutoRenewAttemptedFor: priorAttemptedFor,
            subscriptionRenewalNextRetryAt: priorNextRetryAt,
          },
        }).catch((err) => console.error("Could not release renewal claim:", err));

      const planType = business.subscriptionAutoRenewPlanType;
      const amount = business.subscriptionAutoRenewAmount || PLAN_PRICES[planType];
      if (!PLAN_PRICES[planType] || !amount) {
        // A plan that no longer exists: nothing sensible to charge. Stop auto-renew.
        await Business.findByIdAndUpdate(business._id, {
          $set: { subscriptionAutoRenew: false, subscriptionRenewalFailures: 0, subscriptionRenewalNextRetryAt: null, subscriptionGraceUntil: null },
          $unset: { subscriptionAuthorizationCode: "", subscriptionCustomerCode: "" },
        });
        skipped += 1;
        continue;
      }

      const reference =
        attemptNumber === 1
          ? `oja247-renew-${business._id}-${expiresAt.getTime()}`
          : `oja247-renew-${business._id}-${expiresAt.getTime()}-r${attemptNumber}`;

      let charged = false;
      try {
        const payment = await SubscriptionPayment.findOneAndUpdate(
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

        let chargeResponse;
        try {
          chargeResponse = await fetch("https://api.paystack.co/transaction/charge_authorization", {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              authorization_code: business.subscriptionAuthorizationCode,
              email,
              amount: Math.round(amount * 100),
              currency: "NGN",
              reference,
            }),
          });
        } catch (networkError) {
          console.error(`Renewal charge could not reach Paystack for ${business._id}:`, networkError.message);
          await releaseClaim();
          skipped += 1;
          continue;
        }
        if (chargeResponse.status >= 500) {
          console.error(`Renewal charge: Paystack answered ${chargeResponse.status} for ${business._id}. Will try again next run.`);
          await releaseClaim();
          skipped += 1;
          continue;
        }

        const chargeResult = await chargeResponse.json().catch(() => ({}));
        const paid =
          chargeResponse.ok &&
          chargeResult.status &&
          chargeResult.data?.status === "success" &&
          paidEnough(payment, chargeResult.data);

        if (!paid) {
          // The bank declined it (or it needs the customer to authorise it). Count it,
          // keep the card, and try again later, or give up after the last attempt.
          payment.status = "failed";
          await payment.save();
          declined += 1;

          const ownerTo = email;
          const cardInfo = { cardBrand: business.subscriptionCardBrand, cardLast4: business.subscriptionCardLast4 };

          if (attemptNumber < MAX_RENEWAL_ATTEMPTS) {
            const retryDelayDays = RENEWAL_RETRY_DAYS_AFTER_EXPIRY[attemptNumber - 1];
            const nextRetryAt = new Date(expiresAt.getTime() + retryDelayDays * DAY_MS);
            const graceUntil = new Date(
              Math.max(expiresAt.getTime() + SUBSCRIPTION_GRACE_DAYS * DAY_MS, nextRetryAt.getTime() + DAY_MS)
            );
            await Business.findByIdAndUpdate(business._id, {
              $set: {
                subscriptionRenewalFailures: attemptNumber,
                subscriptionRenewalNextRetryAt: nextRetryAt,
                subscriptionGraceUntil: graceUntil,
              },
            });
            retriesScheduled += 1;
            await bestEffort(`Renewal-failed email for ${business._id}`, () =>
              sendSubscriptionRenewalFailedEmail({
                to: ownerTo, businessName: business.name, planType, amount, ...cardInfo,
                retryDate: nextRetryAt, graceUntil, final: false,
              })
            );
          } else {
            await Business.findByIdAndUpdate(business._id, {
              $set: {
                subscriptionAutoRenew: false,
                subscriptionRenewalFailures: 0,
                subscriptionRenewalNextRetryAt: null,
                subscriptionGraceUntil: null,
                // This email replaces the generic "subscription expired" one.
                subscriptionExpiredEmailSentAt: now,
              },
              $unset: {
                subscriptionAuthorizationCode: "",
                subscriptionCustomerCode: "",
                subscriptionCardBrand: "",
                subscriptionCardLast4: "",
              },
            });
            gaveUp += 1;
            await bestEffort(`Final renewal-failed email for ${business._id}`, () =>
              sendSubscriptionRenewalFailedEmail({
                to: ownerTo, businessName: business.name, planType, amount, ...cardInfo,
                retryDate: null, graceUntil: null, final: true,
              })
            );
          }
          continue;
        }

        // The card was charged. From here on never charge this attempt again,
        // whatever happens while activating (the webhook finishes it if this fails).
        charged = true;
        const paidPayment = await markSubscriptionPaid(reference, chargeResult.data);
        if (paidPayment?.status === "success") renewed += 1;
      } catch (error) {
        console.error(`Automatic renewal failed unexpectedly for business ${business._id}:`, error);
        if (charged) {
          console.error(
            `MONEY WAS TAKEN for ${reference} but activation failed. The charge.success webhook should finish it; check the payment if the plan has not extended.`
          );
        } else {
          await releaseClaim();
        }
        skipped += 1;
      }
    }

    return res.json({ success: true, renewed, declined, retriesScheduled, gaveUp, skipped });
  } catch (error) {
    console.error("Subscription auto-renew cron error:", error);
    return res.status(500).json({ message: "Subscription renewal processing failed" });
  }
};