import Order from "../models/Order.js";
import { UNCONFIRMED_PAYMENT_DAYS } from "../models/Dispute.js";
import { purgeExpiredReceipts } from "../services/receiptRetention.js";
import User from "../models/User.js";
import {
  sendVendorTransferReminderEmail,
  sendAdminUnconfirmedTransferEmail,
} from "../services/emailService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Days a vendor can leave a bank-transfer order unanswered before the admin
// is told (and the customer can dispute). Bank-transfer orders never expire;
// this only raises a flag. Shared with disputeController via Dispute.js.
const ADMIN_ALERT_AFTER_DAYS = UNCONFIRMED_PAYMENT_DAYS;
// The first vendor email goes out when the order is placed, so the first
// reminder waits roughly a day. A little under 24h so a daily cron that fires
// slightly early or late still reminds every day.
const REMINDER_GAP_MS = 20 * 60 * 60 * 1000;

const SITE_URL = process.env.SITE_URL || "https://oja247.store";

// GET /api/cron/transfer-follow-up
// Runs daily (see vercel.json). For every bank-transfer order still waiting
// on the vendor: remind the vendor once a day, and after ADMIN_ALERT_AFTER_DAYS
// email the admin once. Orders the vendor rejected are NOT chased — those
// are waiting on the customer to upload a new receipt.
export const runTransferFollowUpCheck = async (req, res) => {
  // Fails CLOSED if CRON_SECRET is missing, like the other cron jobs.
  const authHeader = req.headers.authorization;
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const now = Date.now();
    const waiting = await Order.find({
      paymentMethod: "bank_transfer",
      status: "awaiting_confirmation",
    });

    let reminded = 0;
    let adminAlerted = 0;

    for (const order of waiting) {
      try {
        const businessId =
          order.vendors?.[0]?.businessId || order.items?.[0]?.businessId || null;
        if (!businessId) continue;

        const owner = await User.findOne({ businessId }).select("email banned");

        // A banned vendor can't log in to answer, so reminding them is pointless
        // and the admin was already sent the list of open orders when they were
        // banned. Customers can dispute straight away (see disputeController).
        if (owner?.banned) continue;
        const businessName = order.vendors?.[0]?.businessName || "your store";

        // A new waiting period starts whenever a receipt is (re)uploaded.
        const lastReceiptAt = (order.paymentReceipts || []).reduce(
          (latest, r) => Math.max(latest, new Date(r.uploadedAt || 0).getTime()),
          0
        );
        const waitingSince = Math.max(new Date(order.createdAt).getTime(), lastReceiptAt);
        const daysWaiting = Math.floor((now - waitingSince) / DAY_MS);

        // 1) Daily vendor reminder.
        const lastTouch = Math.max(
          waitingSince,
          order.lastVendorReminderAt ? new Date(order.lastVendorReminderAt).getTime() : 0
        );
        if (owner?.email && now - lastTouch >= REMINDER_GAP_MS) {
          await sendVendorTransferReminderEmail({
            to: owner.email,
            businessName,
            reference: order.reference,
            total: order.total,
            daysWaiting,
            dashboardUrl: `${SITE_URL}/dashboard/${businessId}`,
          });
          await Order.updateOne({ _id: order._id }, { lastVendorReminderAt: new Date(now) });
          reminded += 1;
        }

        // 2) One admin alert per waiting period.
        const alreadyAlerted =
          order.adminNonComplianceAlertedAt &&
          new Date(order.adminNonComplianceAlertedAt).getTime() >= waitingSince;
        if (daysWaiting >= ADMIN_ALERT_AFTER_DAYS && !alreadyAlerted) {
          await sendAdminUnconfirmedTransferEmail({
            businessName,
            vendorEmail: owner?.email,
            reference: order.reference,
            total: order.total,
            daysWaiting,
            customerName: order.customer?.fullName,
            customerEmail: order.customer?.email,
          });
          await Order.updateOne(
            { _id: order._id },
            { adminNonComplianceAlertedAt: new Date(now) }
          );
          adminAlerted += 1;
        }
      } catch (orderError) {
        // One bad order or failed email must not stop the rest of the run.
        console.error(`Transfer follow-up failed for ${order.reference}:`, orderError);
      }
    }

    // Daily housekeeping in the same run (one scheduled job, not two): delete
    // receipt files past their retention period. A failure here must not hide
    // the reminder results above.
    let receipts = null;
    try {
      receipts = await purgeExpiredReceipts();
    } catch (purgeError) {
      console.error("Receipt retention run failed:", purgeError);
    }

    res.json({ checked: waiting.length, reminded, adminAlerted, receipts });
  } catch (error) {
    console.error("Transfer follow-up cron error:", error);
    res.status(500).json({ message: "Error running transfer follow-up check" });
  }
};