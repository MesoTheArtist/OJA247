import Order from "../models/Order.js";
import User from "../models/User.js";
import {
  sendReceiptReminderEmail,
  sendOrderAutoReceivedCustomerEmail,
  sendOrderReceivedVendorEmail,
} from "../services/emailService.js";
import { transitionVendorFulfillment, receiptUrlFor } from "./fulfillmentController.js";

// How long after "sent out" before we nudge the customer, and before we
// mark it received on their behalf. Both adjustable from the environment.
const REMINDER_DAYS = Number(process.env.RECEIPT_REMINDER_DAYS) || 3;
const AUTO_RECEIVE_DAYS = Number(process.env.AUTO_RECEIVE_DAYS) || 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/cron/auto-receive   (daily — see vercel.json)
// 1. Reminds customers whose order was sent out REMINDER_DAYS ago and who
//    haven't confirmed.
// 2. Marks anything still unconfirmed after AUTO_RECEIVE_DAYS as received.
export const runAutoReceiveCheck = async (req, res) => {
  // Fails closed if CRON_SECRET is missing, same as the other cron jobs.
  const authHeader = req.headers.authorization;
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const now = Date.now();
    const reminderCutoff = new Date(now - REMINDER_DAYS * DAY_MS);
    const autoCutoff = new Date(now - AUTO_RECEIVE_DAYS * DAY_MS);

    const candidates = await Order.find({
      status: { $in: ["paid", "disputed"] },
      vendors: { $elemMatch: { fulfillmentStatus: "shipped", shippedAt: { $lte: reminderCutoff } } },
    });

    let reminded = 0;
    let autoReceived = 0;

    for (const order of candidates) {
      for (const vendor of order.vendors) {
        if (vendor.fulfillmentStatus !== "shipped" || !vendor.shippedAt) continue;

        // Past the auto-confirm point -> mark received.
        if (vendor.shippedAt <= autoCutoff) {
          const updated = await transitionVendorFulfillment(order._id, vendor.businessId, "shipped", {
            fulfillmentStatus: "received",
            receivedAt: new Date(),
            autoReceived: true,
          });
          if (!updated) continue; // customer confirmed in the meantime

          autoReceived += 1;
          sendOrderAutoReceivedCustomerEmail({
            to: order.customer.email,
            customerName: order.customer.fullName,
            businessName: vendor.businessName,
            orderReference: order.reference,
          }).catch((err) => console.error("Auto-received customer email failed:", err));

          const owner = await User.findOne({ businessId: vendor.businessId }).select("email");
          if (owner?.email) {
            sendOrderReceivedVendorEmail({
              to: owner.email,
              businessName: vendor.businessName,
              orderReference: order.reference,
              customerName: order.customer.fullName,
              auto: true,
            }).catch((err) => console.error("Auto-received vendor email failed:", err));
          }
          continue;
        }

        // Past the reminder point, not yet reminded -> one nudge.
        if (!vendor.receiptReminderSentAt) {
          const claimed = await Order.updateOne(
            {
              _id: order._id,
              vendors: { $elemMatch: { businessId: vendor.businessId, receiptReminderSentAt: null } },
            },
            { $set: { "vendors.$[v].receiptReminderSentAt": new Date() } },
            { arrayFilters: [{ "v.businessId": vendor.businessId }] }
          );
          if (claimed.modifiedCount === 0) continue; // another run already sent it

          reminded += 1;
          const elapsedDays = Math.floor((now - vendor.shippedAt.getTime()) / DAY_MS);
          sendReceiptReminderEmail({
            to: order.customer.email,
            customerName: order.customer.fullName,
            businessName: vendor.businessName,
            orderReference: order.reference,
            confirmUrl: receiptUrlFor(order.reference, vendor.businessId),
            daysUntilAuto: Math.max(1, AUTO_RECEIVE_DAYS - elapsedDays),
          }).catch((err) => console.error("Receipt reminder email failed:", err));
        }
      }
    }

    res.json({ success: true, reminded, autoReceived });
  } catch (error) {
    console.error("Auto-receive cron error:", error);
    res.status(500).json({ message: error.message });
  }
};