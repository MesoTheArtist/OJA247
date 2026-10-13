import Vendor, { VERIFICATION_REMINDER_INTERVAL_DAYS } from "../models/Vendor.js";
import User from "../models/User.js";
import { sendVerificationReminderEmail } from "../services/emailService.js";

import { isValidCronRequest } from "../utils/cronAuth.js";
async function getOwnerEmail(businessId) {
  const owner = await User.findOne({ businessId }).select("email");
  return owner?.email || null;
}

// GET /api/cron/verification-reminder
// Runs weekly (see vercel.json). Replaces the old 30-day auto-hide
// deadline — verification is nudged now, never enforced by hiding the
// storefront (see the full gap-closure plan doc's revised Phase 2).
// Reminds any vendor not yet at "verified" tier, spaced
// VERIFICATION_REMINDER_INTERVAL_DAYS apart per vendor so this job
// running weekly doesn't re-send weekly to everyone regardless of when
// they last got one — it only catches vendors whose last reminder (or
// signup, if they've never had one) is old enough.
export const runVerificationReminderCheck = async (req, res) => {
  // SECURITY: fail closed if CRON_SECRET is unset — see the matching fix
  // in disputeCronController.js for why the previous `process.env.CRON_SECRET && ...`
  // pattern was wrong (it fails open instead).
  const authHeader = req.headers.authorization;
  if (!isValidCronRequest(authHeader)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const cutoff = new Date(Date.now() - VERIFICATION_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

    const vendors = await Vendor.find({
      verificationTier: { $ne: "verified" },
      $or: [
        { lastVerificationReminderAt: null },
        { lastVerificationReminderAt: { $lte: cutoff } },
      ],
    });

    let sent = 0;
    for (const vendor of vendors) {
      const ownerEmail = await getOwnerEmail(vendor.businessId);
      if (!ownerEmail) continue;

      try {
        await sendVerificationReminderEmail({
          to: ownerEmail,
          businessName: vendor.businessName,
          verificationTier: vendor.verificationTier,
          dashboardUrl: `${process.env.SITE_URL || "https://oja247.store"}/business-dashboard`,
        });
        vendor.lastVerificationReminderAt = new Date();
        await vendor.save();
        sent += 1;
      } catch (err) {
        console.error(`Verification reminder email failed for vendor ${vendor._id}:`, err);
      }
    }

    res.json({ checked: vendors.length, sent });
  } catch (error) {
    console.error("Verification reminder cron error:", error);
    res.status(500).json({ message: "Error running verification reminder check" });
  }
};