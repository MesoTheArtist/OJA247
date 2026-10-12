import crypto from "crypto";
import Business from "../models/Business.js";
import Marketer from "../models/Marketer.js";
import User from "../models/User.js";
import ReferralAttribution from "../models/ReferralAttribution.js";
import MarketerPayout from "../models/MarketerPayout.js";
import PointsLedger from "../models/PointsLedger.js";
import { sendMarketerConversionEmail, sendBusinessReferralConversionEmail } from "./emailService.js";
import { runInTransaction } from "../utils/transactions.js";

// Marketer payout rate is tiered by which plan the referral bought — the rate
// drops as the plan (and payout) grows, so acquisition cost doesn't scale
// linearly with the biggest deals. Keyed by SubscriptionPayment.planType.
const MARKETER_PAYOUT_RATE_BY_PLAN = {
  monthly: 0.5,   // ₦1,999 → ₦1,000
  six_month: 0.35, // ₦9,999 → ₦3,500
  yearly: 0.25,    // ₦17,999 → ₦4,500
};
const BUSINESS_REFERRAL_POINTS = 1000; // 1000 points = ₦1000, 1pt = ₦1 — flat regardless of plan

// --- Code generation -------------------------------------------------

function generateCode(prefix) {
  // 6 random hex chars, uppercase — short enough to share, long enough to
  // make guessing/collision practically impossible alongside the DB unique index
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// Vendor-facing codes are meant to be short, memorable, and eventually
// chosen by the vendor themselves (see updateBusinessReferralCode below),
// so the auto-assigned default at signup uses the same plain 7-char shape
// rather than a "BIZ-" prefixed code — nothing to explain, and it already
// fits the format they'll be picking a replacement in.
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids look-alike mixups
const REFERRAL_CODE_LENGTH = 7;

function generatePlainCode(length = REFERRAL_CODE_LENGTH) {
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  }
  return code;
}

export async function generateUniqueMarketerCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generateCode("MKT");
    exists = await Marketer.exists({ referralCode: code });
  }
  return code;
}

export async function generateUniqueBusinessReferralCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generatePlainCode();
    exists = await Business.exists({ referralCode: code });
  }
  return code;
}

// A vendor's own referral code, chosen by them: 7-8 characters, letters
// and numbers only. Validates format only — call isBusinessReferralCodeTaken
// separately to check uniqueness before saving.
export function isValidCustomReferralCode(code) {
  return typeof code === "string" && /^[A-Z0-9]{7,8}$/.test(code);
}

export async function isBusinessReferralCodeTaken(code, excludeBusinessId = null) {
  const query = { referralCode: code };
  if (excludeBusinessId) query._id = { $ne: excludeBusinessId };
  return Boolean(await Business.exists(query));
}

// Marketer's own referral code, editable the same way a vendor's is —
// same 7-8 char alphanumeric format (isValidCustomReferralCode above),
// just checked against Marketer instead of Business for uniqueness.
export async function isMarketerReferralCodeTaken(code, excludeMarketerId = null) {
  const query = { referralCode: code };
  if (excludeMarketerId) query._id = { $ne: excludeMarketerId };
  return Boolean(await Marketer.exists(query));
}

// --- Attribution -------------------------------------------------------

const normalizeEmail = (s) => String(s || "").toLowerCase().trim();
const normalizePhone = (s) => String(s || "").replace(/\D/g, "");

// Fraud guard: a referrer (marketer or business) gets paid/earns points for
// whatever business they refer, so nothing should stop them referring a
// business they themselves signed up under a second email — except this
// check. Compares the referrer's own contact details against the new
// business owner's, since that's all we have at signup time (no shared
// account link between the two record types).
function isSelfReferral({ referrerEmail, referrerPhone }, { ownerEmail, contact }) {
  const email = normalizeEmail(referrerEmail);
  if (email && ownerEmail && email === normalizeEmail(ownerEmail)) {
    return true;
  }

  const phone = normalizePhone(referrerPhone);
  const contactPhone = normalizePhone(contact);
  // Require a reasonably-full phone number match — short/partial digit
  // strings could coincidentally collide and wrongly block a legit referral.
  if (phone.length >= 7 && phone === contactPhone) {
    return true;
  }

  return false;
}

/**
 * Call this right after a new Business is created, if a referral code was
 * captured at signup (URL param or manual entry field).
 * Silently no-ops on an invalid/unknown code rather than failing signup.
 * ownerEmail/contact are the new business's own owner email + contact —
 * passed in so a marketer can't cash in on referring themselves.
 */
export async function attributeReferral({ businessId, referralCodeUsed, ownerEmail, contact }) {
  if (!referralCodeUsed) return null;

  const code = String(referralCodeUsed).trim().toUpperCase();

  const marketer = await Marketer.findOne({ referralCode: code, banned: false });
  const referringBusiness = marketer ? null : await Business.findOne({ referralCode: code });

  if (!marketer && !referringBusiness) return null; // unknown code — ignore, don't block signup

  if (
    marketer &&
    isSelfReferral({ referrerEmail: marketer.email, referrerPhone: marketer.phone }, { ownerEmail, contact })
  ) {
    console.warn(
      `Blocked self-referral attempt: marketer ${marketer._id} (${marketer.email}) tried to refer business ${businessId} using their own code ${code}`
    );
    return null;
  }

  if (referringBusiness) {
    // Business owner's email lives on User, not Business — look it up for the check.
    const referringOwner = await User.findOne({ businessId: referringBusiness._id }).select("email");
    if (
      isSelfReferral(
        { referrerEmail: referringOwner?.email, referrerPhone: referringBusiness.contact },
        { ownerEmail, contact }
      )
    ) {
      console.warn(
        `Blocked self-referral attempt: business ${referringBusiness._id} tried to refer new business ${businessId} using its own code ${code}`
      );
      return null;
    }
  }

  try {
    const attribution = await ReferralAttribution.create({
      referrerType: marketer ? "marketer" : "business",
      referrerId: marketer ? marketer._id : referringBusiness._id,
      referrerModel: marketer ? "Marketer" : "Business",
      referralCode: code,
      referredBusinessId: businessId,
    });

    await Business.findByIdAndUpdate(businessId, { referredByCode: code });
    return attribution;
  } catch (err) {
    // Unique index on referredBusinessId — a business can only be attributed once.
    if (err?.code === 11000) return null;
    throw err;
  }
}

// --- Conversion (call this from the subscription payment success handler) --

// A referral only pays out once the referred business has paid at least this
// much REAL money (plan price minus any points used). It keeps the reward
// below what actually came in: a business paying N1 in cash and the rest in
// points would otherwise trigger a full reward. Below this the referral just
// stays "pending" and converts on a later payment with real cash.
const MIN_CASH_FOR_REFERRAL_CONVERSION = 1000;

/**
 * Fires when a SubscriptionPayment transitions to "success" and real cash
 * was actually collected (see subscriptionController.js: the points-only
 * path never calls this at all).
 *
 * Gated purely on the ReferralAttribution still being "pending" - NOT on
 * payment.isFirstPayment / business.hasPaidFirstSubscription. Those flip to
 * true on ANY successful payment, including one fully covered by points,
 * which set the business's "first payment" as done well before any real
 * cash was ever collected on a referred business.
 *
 * Safe against double payment and against losing a reward:
 *  - the referral is CLAIMED with one atomic update (pending -> converted), so
 *    two overlapping calls can't both pay it;
 *  - the reward (marketer payout row, or business points + ledger line) is
 *    written next. The payout row has a unique index per referral, and the
 *    points credit is a single transaction, so it can't be half-recorded;
 *  - if recording the reward fails, the referral is put back to "pending" so
 *    it isn't silently lost, and the error is thrown for the caller to log.
 */
export async function handleSubscriptionConversion({ businessId, amountPaid, planType, paymentId, paymentReference }) {
  if (!(Number(amountPaid) >= MIN_CASH_FOR_REFERRAL_CONVERSION)) return null;

  const attribution = await ReferralAttribution.findOneAndUpdate(
    { referredBusinessId: businessId, status: "pending" },
    {
      $set: {
        status: "converted",
        convertedAt: new Date(),
        conversionBaseAmount: amountPaid,
        conversionPlanType: planType,
        conversionPaymentId: paymentId || null,
        conversionPaymentReference: paymentReference || "",
      },
    },
    { new: true }
  );
  if (!attribution) return null; // this business wasn't referred, or already converted

  let marketerPayoutAmount = null;
  let newPointsBalance = null;

  try {
    if (attribution.referrerType === "marketer") {
      const rate = MARKETER_PAYOUT_RATE_BY_PLAN[planType];
      if (rate === undefined) {
        throw new Error(`Unknown planType "${planType}" - cannot determine marketer payout rate`);
      }

      marketerPayoutAmount = Math.round(amountPaid * rate);
      try {
        await MarketerPayout.create({
          marketerId: attribution.referrerId,
          referralAttributionId: attribution._id,
          amount: marketerPayoutAmount,
          planType,
          conversionAmount: amountPaid,
          commissionRate: rate,
          paymentReference: paymentReference || "",
          subscriptionPaymentId: paymentId || null,
        });
      } catch (err) {
        // Unique index: a payout already exists for this referral, so it has
        // been paid for already - nothing more to record.
        if (err?.code !== 11000) throw err;
        marketerPayoutAmount = null;
      }
    } else {
      newPointsBalance = await runInTransaction(async (session) => {
        const credited = await Business.findByIdAndUpdate(
          attribution.referrerId,
          { $inc: { pointsBalance: BUSINESS_REFERRAL_POINTS } },
          { new: true, session }
        );
        if (!credited) throw new Error("Referring business no longer exists");
        // Unique index on referralAttributionId: a second credit for the same
        // referral fails here and the transaction (including the $inc above)
        // is undone.
        await PointsLedger.create(
          [
            {
              businessId: attribution.referrerId,
              type: "earned",
              points: BUSINESS_REFERRAL_POINTS,
              balanceAfter: credited.pointsBalance,
              referralAttributionId: attribution._id,
            },
          ],
          { session }
        );
        return credited.pointsBalance;
      });
    }
  } catch (err) {
    if (attribution.referrerType === "business" && err?.code === 11000) {
      // Points for this referral were already credited once.
      return attribution;
    }
    // The reward was NOT recorded: give the referral back so a later paid
    // renewal (or a re-run) can still pay it, rather than losing it.
    await ReferralAttribution.updateOne(
      { _id: attribution._id, status: "converted" },
      {
        $set: { status: "pending", convertedAt: null, conversionBaseAmount: null, conversionPlanType: null, conversionPaymentId: null, conversionPaymentReference: "" },
      }
    ).catch((revertErr) =>
      console.error(`MANUAL FIX NEEDED: referral ${attribution._id} is marked converted but its reward was not recorded:`, revertErr)
    );
    throw err;
  }

  // Notifications are best effort: the reward is already safely recorded.
  try {
    if (attribution.referrerType === "marketer") {
      if (marketerPayoutAmount !== null) {
        const marketer = await Marketer.findById(attribution.referrerId).select("email name");
        const business = await Business.findById(businessId).select("name");
        if (marketer) {
          await sendMarketerConversionEmail({
            to: marketer.email,
            name: marketer.name,
            businessName: business?.name || "a business",
            payoutAmount: marketerPayoutAmount,
          });
        }
      }
    } else {
      const referringBusiness = await Business.findById(attribution.referrerId).select("name");
      const referringOwner = await User.findOne({ businessId: attribution.referrerId }).select("email");
      const referredBusiness = await Business.findById(businessId).select("name");
      if (referringOwner) {
        await sendBusinessReferralConversionEmail({
          to: referringOwner.email,
          businessName: referringBusiness?.name || "your store",
          referredBusinessName: referredBusiness?.name || "a business",
          points: BUSINESS_REFERRAL_POINTS,
          newBalance: newPointsBalance,
        });
      }
    }
  } catch (err) {
    console.error(`Referral reward recorded for ${attribution._id}, but its email failed:`, err);
  }

  return attribution;
} 