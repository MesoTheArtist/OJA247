import Order from "../models/Order.js";
import Dispute from "../models/Dispute.js";
import { RETENTION } from "../config/retention.js";
import { deleteReceiptFile } from "./receiptStorage.js";

const DAY = 24 * 60 * 60 * 1000;

// Deletes receipt FILES that are past their retention period (see
// config/retention.js). Safe to run daily and to run twice: files already
// deleted are skipped, and a failed delete is left to try again tomorrow.
//
// Never touched: orders still waiting for the vendor, and any order with a
// dispute that is active or was touched within RETENTION.withDisputeDays.
export async function purgeExpiredReceipts(now = Date.now()) {
  const stats = { checked: 0, ordersPurged: 0, filesDeleted: 0, failed: 0 };

  // Only orders that still have at least one receipt file that hasn't been deleted.
  const hasLiveReceipt = { paymentReceipts: { $elemMatch: { purgedAt: null } } };

  const candidates = await Order.find({
    paymentMethod: "bank_transfer",
    ...hasLiveReceipt,
    $or: [
      {
        status: { $in: ["paid", "disputed", "refunded"] },
        paymentConfirmedAt: { $lte: new Date(now - RETENTION.confirmedReceiptDays * DAY) },
      },
      {
        status: { $in: ["payment_rejected", "cancelled"] },
        updatedAt: { $lte: new Date(now - RETENTION.unpaidReceiptDays * DAY) },
      },
    ],
  })
    .sort({ updatedAt: 1 })
    .limit(RETENTION.batchSize)
    .select("reference paymentReceipts");

  if (candidates.length === 0) return stats;
  stats.checked = candidates.length;

  // Hold back anything with a recent or active dispute.
  const disputes = await Dispute.find({ orderId: { $in: candidates.map((o) => o._id) } })
    .select("orderId status updatedAt")
    .lean();
  const held = new Set();
  for (const d of disputes) {
    const active = d.status === "open" || d.status === "escalated";
    const recent = new Date(d.updatedAt).getTime() > now - RETENTION.withDisputeDays * DAY;
    if (active || recent) held.add(String(d.orderId));
  }

  for (const order of candidates) {
    if (held.has(String(order._id))) continue;
    let deletedAny = false;
    for (const receipt of order.paymentReceipts) {
      if (receipt.purgedAt) continue;
      try {
        await deleteReceiptFile(receipt);
        await Order.updateOne(
          { _id: order._id },
          { $set: { "paymentReceipts.$[r].purgedAt": new Date(now) } },
          { arrayFilters: [{ "r.publicId": receipt.publicId }] }
        );
        stats.filesDeleted += 1;
        deletedAny = true;
      } catch (error) {
        stats.failed += 1;
        console.error(`Receipt purge failed for ${order.reference}:`, error?.message || error);
      }
    }
    if (deletedAny) stats.ordersPurged += 1;
  }

  return stats;
}