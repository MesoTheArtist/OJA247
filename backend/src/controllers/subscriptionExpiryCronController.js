import User from "../models/User.js";
import Business from "../models/Business.js";
import PlatformSettings from "../models/PlatformSettings.js";
import {
  sendSubscriptionExpiringEmail,
  sendSubscriptionExpiredEmail,
  sendNeverSubscribedReminderEmail,
} from "../services/emailService.js";

const REMINDER_WINDOW_DAYS = 4; // matches the in-dashboard popup's warning window
// Re-nag cadence for pass 3 below — this cron runs daily, but emailing a
// never-subscribed vendor every single day would be spammy for something
// that isn't urgent/time-boxed the way an expiring subscription is. Matches
// the weekly cadence verificationReminderCronController.js already uses for
// the same kind of ongoing, non-urgent nudge.
const NEVER_SUBSCRIBED_REMINDER_INTERVAL_DAYS = 7;

async function getOwnerEmail(businessId) {
  const owner = await User.findOne({ businessId }).select("email");
  return owner?.email || null;
}

// GET /api/cron/subscription-expiry  (called daily by Vercel Cron — see vercel.json)
// Two passes: businesses with 0-4 days left get a reminder (once per
// subscription period — see subscriptionReminderSentAt), and businesses
// already past subscriptionExpiresAt get an "expired" notice (once per
// period — subscriptionExpiredEmailSentAt). Both flags reset to null the
// next time a subscription payment succeeds (subscriptionController.js),
// so a renewed business can be reminded again on its next cycle.
export const runSubscriptionExpiryCheck = async (req, res) => {
  try {
    const cronSecret = req.headers["authorization"];
    if (!process.env.CRON_SECRET || cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const now = new Date();
    const reminderCutoff = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // --- Pass 1: expiring soon (0-4 days left, not yet reminded) ---
    const expiringSoon = await Business.find({
      subscriptionExpiresAt: { $gte: now, $lte: reminderCutoff },
      subscriptionReminderSentAt: null,
    }).select("name subscriptionExpiresAt");

    for (const business of expiringSoon) {
      const daysLeft = Math.ceil((business.subscriptionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const to = await getOwnerEmail(business._id);
      if (to) {
        try {
          await sendSubscriptionExpiringEmail({
            to,
            businessName: business.name,
            daysLeft,
            expiresAt: business.subscriptionExpiresAt,
          });
        } catch (err) {
          // One bad send shouldn't abort the whole cron run and skip every
          // other vendor still waiting on today's reminder — log and move on.
          console.error(`Expiring-soon reminder failed for business ${business._id}:`, err);
          continue; // don't mark as sent if it didn't actually send
        }
      }
      business.subscriptionReminderSentAt = now;
      await business.save();
    }

    // --- Pass 2: already expired (not yet notified) ---
    const expired = await Business.find({
      subscriptionExpiresAt: { $lt: now },
      subscriptionExpiredEmailSentAt: null,
    }).select("name");

    for (const business of expired) {
      const to = await getOwnerEmail(business._id);
      if (to) {
        try {
          await sendSubscriptionExpiredEmail({ to, businessName: business.name });
        } catch (err) {
          console.error(`Expired-subscription notice failed for business ${business._id}:`, err);
          continue;
        }
      }
      business.subscriptionExpiredEmailSentAt = now;
      await business.save();
    }

    // --- Pass 3: never subscribed at all (periodic nag, kill-switch gated) ---
    // Only relevant once enforceSubscriptionVisibility is actually on — no
    // point nagging a vendor about invisibility that isn't happening yet.
    // A business the admin has exempted (visibilityExempt) or grandfathered
    // is visible without subscribing, so it's excluded here too — nagging
    // them to subscribe would be misleading, same override logic the public
    // listing and the in-dashboard popup both use.
    let neverSubscribedNotified = 0;
    const settings = await PlatformSettings.getSettings();
    if (settings.enforceSubscriptionVisibility) {
      const cutoff = new Date(now.getTime() - NEVER_SUBSCRIBED_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
      const neverSubscribed = await Business.find({
        subscriptionExpiresAt: null,
        isHidden: { $ne: true },
        visibilityExempt: { $ne: true },
        $or: [{ grandfatherExemptUntil: null }, { grandfatherExemptUntil: { $lte: now } }],
        $and: [
          { $or: [{ neverSubscribedReminderSentAt: null }, { neverSubscribedReminderSentAt: { $lte: cutoff } }] },
        ],
      }).select("name");

      for (const business of neverSubscribed) {
        const to = await getOwnerEmail(business._id);
        if (to) {
          try {
            await sendNeverSubscribedReminderEmail({ to, businessName: business.name });
            neverSubscribedNotified += 1;
          } catch (err) {
            console.error(`Never-subscribed reminder failed for business ${business._id}:`, err);
            continue; // don't mark as sent if it didn't actually send
          }
        }
        business.neverSubscribedReminderSentAt = now;
        await business.save();
      }
    }

    res.json({
      success: true,
      remindersSent: expiringSoon.length,
      expiredNoticesSent: expired.length,
      neverSubscribedNotified,
    });
  } catch (error) {
    console.error("Subscription expiry check error:", error);
    res.status(500).json({ message: error.message });
  }
};