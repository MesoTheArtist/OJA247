import Business from "../models/Business.js";
import PlatformSettings from "../models/PlatformSettings.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Gives a newly registered vendor their referral free trial.
//
// Call this ONLY after attributeReferral() returned a real attribution (valid
// code, not a self-referral). It:
//  - does nothing when the admin has set the trial length to 0;
//  - gives at most one trial per business (the update only matches a business
//    that has never had a trial or a subscription);
//  - refuses a second trial for the same contact phone number, so re-registering
//    the same shop with a new email doesn't earn another free week;
//  - stores the end date in BOTH trialEndsAt and subscriptionExpiresAt, so the
//    existing visibility rule, expiry emails and "paid time starts after the
//    trial" logic all work with no special cases.
//
// Returns { days, endsAt } when a trial was granted, otherwise null. Never
// throws: a problem here must never block registration.
export async function grantReferralTrial({ businessId, contact }) {
  try {
    const settings = await PlatformSettings.getSettings();
    const days = Number(settings.referralTrialDays ?? 7);
    if (!Number.isFinite(days) || days <= 0) return null;

    const phone = String(contact || "").trim();
    if (phone) {
      const alreadyUsed = await Business.exists({
        _id: { $ne: businessId },
        contact: phone,
        trialEndsAt: { $ne: null },
      });
      if (alreadyUsed) return null;
    }

    const endsAt = new Date(Date.now() + days * DAY_MS);
    const granted = await Business.findOneAndUpdate(
      { _id: businessId, trialEndsAt: null, subscriptionExpiresAt: null },
      { $set: { trialEndsAt: endsAt, subscriptionExpiresAt: endsAt } },
      { new: true }
    ).select("_id");

    return granted ? { days, endsAt } : null;
  } catch (error) {
    console.error("Referral trial grant failed (registration continues):", error);
    return null;
  }
}

// True while a business is still on its referral free trial (not yet paid).
export function isOnTrial(business, now = Date.now()) {
  return Boolean(
    business?.trialEndsAt &&
      !business.hasPaidFirstSubscription &&
      new Date(business.trialEndsAt).getTime() > now
  );
}
