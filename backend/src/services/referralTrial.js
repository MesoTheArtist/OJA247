import Business from "../models/Business.js";
import PlatformSettings from "../models/PlatformSettings.js";
import { emailKey, phoneKey } from "../utils/identityKeys.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Gives a newly registered vendor their referral free trial.
//
// Call this ONLY after attributeReferral() returned a real attribution (valid
// code, not a self-referral). It:
//  - does nothing when the admin has set the trial length to 0;
//  - gives at most one trial per business (the update only matches a business
//    that has never had a trial or a subscription);
//  - refuses a trial to anyone who already had one or already paid: another
//    business with the same phone number OR the same owner inbox (compared in
//    normalized form, so +234 vs 0, me+2@gmail.com and j.ohn@gmail.com all
//    count as the same person), so re-registering the same shop doesn't earn a
//    second free week;
//  - stores the end date in BOTH trialEndsAt and subscriptionExpiresAt, so the
//    existing visibility rule, expiry emails and "paid time starts after the
//    trial" logic all work with no special cases.
//
// Returns { days, endsAt } when a trial was granted, otherwise null. Never
// throws: a problem here must never block registration.
export async function grantReferralTrial({ businessId, contact, ownerEmail }) {
  try {
    const settings = await PlatformSettings.getSettings();
    const days = Number(settings.referralTrialDays ?? 7);
    if (!Number.isFinite(days) || days <= 0) return null;

    // Same person as someone who already had a trial or already paid?
    const sameAs = [];
    const pk = phoneKey(contact);
    const ek = emailKey(ownerEmail);
    if (pk) sameAs.push({ contactKey: pk });
    if (ek) sameAs.push({ ownerEmailKey: ek });
    if (sameAs.length) {
      const alreadyUsed = await Business.exists({
        _id: { $ne: businessId },
        $and: [{ $or: sameAs }, { $or: [{ trialEndsAt: { $ne: null } }, { hasPaidFirstSubscription: true }] }],
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
