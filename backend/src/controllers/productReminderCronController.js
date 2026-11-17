import Business from "../models/Business.js";
import PlatformSettings from "../models/PlatformSettings.js";
import User from "../models/User.js";
import { sendAddProductsReminderEmail, sendKeepStoreFreshEmail } from "../services/emailService.js";
import {
  FEATURE_TARGET_PRODUCTS,
  REMINDER_INTERVAL_DAYS_AT_TARGET,
  REMINDER_INTERVAL_DAYS_BELOW_TARGET,
  countProductsByBusiness,
} from "../services/listingRules.js";
import { isBusinessPubliclyVisible } from "./businessController.js";
import { isValidCronRequest } from "../utils/cronAuth.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// A 6 hour tolerance so a weekly job that runs a few seconds earlier than last
// time does not push a store's reminder back a whole week.
const TOLERANCE_MS = 6 * 60 * 60 * 1000;

// One short tip per email, rotating by week so consecutive emails differ.
const TIPS = [
  "Clear photos in good natural light make products far more likely to sell. Take them against a plain background.",
  "Write a short description for every product and always show the price in naira. Buyers skip listings that leave questions unanswered.",
  "Share your store link on your WhatsApp status and Instagram. Your own customers are your best first visitors.",
  "Add products that are in demand right now and restock the ones you already sell. Active stores earn more trust.",
];

const weekNumber = () => Math.floor(Date.now() / (7 * DAY_MS));

const isDue = (lastSentAt, intervalDays) =>
  !lastSentAt || Date.now() - new Date(lastSentAt).getTime() >= intervalDays * DAY_MS - TOLERANCE_MS;

async function getOwnerEmail(businessId) {
  const owner = await User.findOne({ businessId }).select("email");
  return owner?.email || null;
}

// GET /api/cron/product-reminder
// Runs weekly (see vercel.json). Marketing nudges for live stores:
//   - below FEATURE_TARGET_PRODUCTS products: about every 14 days (twice a month)
//   - at or above it: a lighter nudge about every 30 days
// Each store is only emailed when its last reminder is old enough, tracked with
// Business.lastProductReminderAt. Hidden stores and stores with no owner email
// are skipped. Nothing is hidden or changed on the store itself.
export const runProductReminderCheck = async (req, res) => {
  if (!isValidCronRequest(req.headers.authorization)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const settings = await PlatformSettings.getSettings();
    const businesses = await Business.find({ isHidden: { $ne: true } });

    const live = businesses.filter((b) => isBusinessPubliclyVisible(b, settings));
    const counts = await countProductsByBusiness(live.map((b) => b._id));
    const tip = TIPS[weekNumber() % TIPS.length];

    let sent = 0;
    for (const business of live) {
      const productCount = counts.get(String(business._id)) || 0;
      const atTarget = productCount >= FEATURE_TARGET_PRODUCTS;
      const interval = atTarget ? REMINDER_INTERVAL_DAYS_AT_TARGET : REMINDER_INTERVAL_DAYS_BELOW_TARGET;
      if (!isDue(business.lastProductReminderAt, interval)) continue;

      const ownerEmail = await getOwnerEmail(business._id);
      if (!ownerEmail) continue;

      const dashboardUrl = `${process.env.SITE_URL || "https://oja247.store"}/business-dashboard`;
      try {
        if (atTarget) {
          await sendKeepStoreFreshEmail({
            to: ownerEmail,
            businessName: business.name,
            productCount,
            dashboardUrl,
          });
        } else {
          await sendAddProductsReminderEmail({
            to: ownerEmail,
            businessName: business.name,
            productCount,
            targetProducts: FEATURE_TARGET_PRODUCTS,
            tip,
            dashboardUrl,
          });
        }
        business.lastProductReminderAt = new Date();
        await business.save();
        sent += 1;
      } catch (err) {
        console.error(`Product reminder email failed for business ${business._id}:`, err);
      }
    }

    res.json({ checked: live.length, sent });
  } catch (error) {
    console.error("Product reminder cron error:", error);
    res.status(500).json({ message: "Error running product reminder check" });
  }
};