import User from "../models/User.js";
import Business from "../models/Business.js";
import PlatformSettings from "../models/PlatformSettings.js";
import {
  sendSubscriptionExpiringEmail,
  sendSubscriptionExpiredEmail,
  sendNeverSubscribedReminderEmail,
  sendExemptionEndingEmail,
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

// Sends one reminder and says whether the business can be marked "done".
// Returns { settled, sent }:
//  - no owner email on file  -> settled (nothing to retry, so we don't look it
//    up again every day), but not counted as sent
//  - email went out          -> settled and sent
//  - email did NOT go out    -> not settled, so tomorrow's run tries again.
// emailService's sendEmail never throws: it returns { sent: false } when SMTP is
// down, rate-limited or unconfigured. Without checking that value, a failed send
// was marked as done and the vendor never got the reminder.
async function deliver(label, businessId, to, send) {
  if (!to) return { settled: true, sent: false };
  try {
    const result = await send();
    if (result && result.sent === false) {
      console.error(`${label} not sent for business ${businessId} (mail service reported failure) — will retry on the next run.`);
      return { settled: false, sent: false };
    }
    return { settled: true, sent: true };
  } catch (err) {
    console.error(`${label} failed for business ${businessId}:`, err);
    return { settled: false, sent: false };
  }
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

    // All three reminders are about being hidden from customers (or not),
    // which only happens while the visibility kill switch is on. With it off
    // nobody is hidden, so telling a vendor "your store is hidden" would be
    // untrue. Vendors whose subscription ran out in the meantime get their
    // notice on the first run after the switch is turned on.
    const settings = await PlatformSettings.getSettings();
    if (!settings.enforceSubscriptionVisibility) {
      return res.json({
        success: true,
        skipped: "subscription visibility is not being enforced",
        remindersSent: 0,
        expiredNoticesSent: 0,
        neverSubscribedNotified: 0,
        exemptionEndingNotified: 0,
      });
    }

    const now = new Date();
    // Stores an admin has exempted (permanently, or until a future date) stay
    // visible whatever their subscription says, so they are never told otherwise.
    const notExempt = {
      isHidden: { $ne: true },
      visibilityExempt: { $ne: true },
      $or: [{ grandfatherExemptUntil: null }, { grandfatherExemptUntil: { $lte: now } }],
    };
    const reminderCutoff = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // --- Pass 1: expiring soon (0-4 days left, not yet reminded) ---
    const expiringSoon = await Business.find({
      subscriptionExpiresAt: { $gte: now, $lte: reminderCutoff },
      subscriptionReminderSentAt: null,
      ...notExempt,
    }).select("name subscriptionExpiresAt");

    let remindersSent = 0;
    for (const business of expiringSoon) {
      const daysLeft = Math.ceil((business.subscriptionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const to = await getOwnerEmail(business._id);
      // One bad send shouldn't abort the whole run and skip every other vendor
      // still waiting on today's reminder, so a failure just moves on.
      const { settled, sent } = await deliver("Expiring-soon reminder", business._id, to, () =>
        sendSubscriptionExpiringEmail({
          to,
          businessName: business.name,
          daysLeft,
          expiresAt: business.subscriptionExpiresAt,
        })
      );
      if (!settled) continue; // didn't send: leave unmarked so it is retried
      if (sent) remindersSent += 1;
      business.subscriptionReminderSentAt = now;
      await business.save();
    }

    // --- Pass 2: already expired (not yet notified) ---
    const expired = await Business.find({
      subscriptionExpiresAt: { $lt: now },
      subscriptionExpiredEmailSentAt: null,
      ...notExempt,
    }).select("name");

    let expiredNoticesSent = 0;
    for (const business of expired) {
      const to = await getOwnerEmail(business._id);
      const { settled, sent } = await deliver("Expired-subscription notice", business._id, to, () =>
        sendSubscriptionExpiredEmail({ to, businessName: business.name })
      );
      if (!settled) continue;
      if (sent) expiredNoticesSent += 1;
      business.subscriptionExpiredEmailSentAt = now;
      await business.save();
    }

    // --- Pass 3: never subscribed at all (periodic nag, kill-switch gated) ---
    // Exempt and grandfathered stores are excluded (see notExempt above), same
    // override logic the public listing and the in-dashboard popup use.
    let neverSubscribedNotified = 0;
    {
      const cutoff = new Date(now.getTime() - NEVER_SUBSCRIBED_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
      const neverSubscribed = await Business.find({
        subscriptionExpiresAt: null,
        ...notExempt,
        $and: [
          { $or: [{ neverSubscribedReminderSentAt: null }, { neverSubscribedReminderSentAt: { $lte: cutoff } }] },
        ],
      }).select("name");

      for (const business of neverSubscribed) {
        const to = await getOwnerEmail(business._id);
        const { settled, sent } = await deliver("Never-subscribed reminder", business._id, to, () =>
          sendNeverSubscribedReminderEmail({ to, businessName: business.name })
        );
        if (!settled) continue;
        if (sent) neverSubscribedNotified += 1;
        business.neverSubscribedReminderSentAt = now;
        await business.save();
      }
    }

    // --- Pass 4: free exemption ending soon (once per exemption) ---
    // Only stores an exemption is currently carrying: its end is within the
    // reminder window, they were not reminded yet for this date, and no paid
    // subscription already runs past it (those vendors have nothing to do).
    // visibilityExempt is permanent so it never ends; hidden stores are skipped.
    let exemptionEndingNotified = 0;
    {
      const endingSoon = await Business.find({
        isHidden: { $ne: true },
        visibilityExempt: { $ne: true },
        grandfatherExemptUntil: { $gte: now, $lte: reminderCutoff },
        grandfatherReminderSentAt: null,
        $expr: { $lt: [{ $ifNull: ["$subscriptionExpiresAt", new Date(0)] }, "$grandfatherExemptUntil"] },
      }).select("name grandfatherExemptUntil");

      for (const business of endingSoon) {
        const daysLeft = Math.max(
          1,
          Math.ceil((business.grandfatherExemptUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );
        const to = await getOwnerEmail(business._id);
        const { settled, sent } = await deliver("Exemption-ending reminder", business._id, to, () =>
          sendExemptionEndingEmail({
            to,
            businessName: business.name,
            exemptUntil: business.grandfatherExemptUntil,
            daysLeft,
          })
        );
        if (!settled) continue;
        if (sent) exemptionEndingNotified += 1;
        business.grandfatherReminderSentAt = now;
        await business.save();
      }
    }

    res.json({
      success: true,
      remindersSent,
      expiredNoticesSent,
      neverSubscribedNotified,
      exemptionEndingNotified,
    });
  } catch (error) {
    console.error("Subscription expiry check error:", error);
    res.status(500).json({ message: error.message });
  }
};