import Order from "../models/Order.js";
import Dispute from "../models/Dispute.js";
import User from "../models/User.js";

// A dispute is "active" while it's still being worked — open (vendor's
// self-resolve window) or escalated (with admin). resolved/unresolved are
// finished.
export const ACTIVE_DISPUTE_STATUSES = ["open", "escalated"];

// Order.status is one flag for the whole order, but an order can span
// several vendors, each with their own dispute. Resolving one vendor's
// dispute must therefore not flip the order out of "disputed" while another
// vendor's dispute is still active. Called by both the vendor and admin
// resolve endpoints, after the dispute itself has been saved.
//
// Known limit: when the last active dispute closes, `refunded` reflects that
// dispute only. Dispute has no per-dispute refunded field, so a multi-vendor
// order where an earlier dispute was refunded and the last wasn't goes back
// to "paid". Add Dispute.refunded if that distinction ever matters.
export async function settleOrderAfterResolution(orderId, refunded) {
  const order = await Order.findById(orderId);
  if (!order || order.status !== "disputed") return;

  const stillActive = await Dispute.exists({
    orderId,
    status: { $in: ACTIVE_DISPUTE_STATUSES },
  });
  if (stillActive) return;

  order.status = refunded ? "refunded" : "paid";
  await order.save();
}

// Returns plain order objects with activeDisputeBusinessIds attached — the
// vendors on that order that already have an active dispute. The UI uses it
// to offer only the vendors a customer can still dispute (see fileDispute).
export async function withActiveDisputeVendors(orders) {
  const plain = orders.map((o) => (typeof o.toObject === "function" ? o.toObject() : o));
  if (plain.length === 0) return plain;

  const active = await Dispute.find({
    orderId: { $in: plain.map((o) => o._id) },
    status: { $in: ACTIVE_DISPUTE_STATUSES },
  })
    .select("orderId businessId")
    .lean();

  const byOrder = new Map();
  for (const d of active) {
    const key = d.orderId.toString();
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(d.businessId);
  }

  // Bank-transfer orders still waiting on a vendor who has since been banned:
  // the customer can dispute at once instead of waiting out the usual days.
  const waiting = plain.filter(
    (o) => o.paymentMethod === "bank_transfer" && o.status === "awaiting_confirmation"
  );
  let bannedBusinessIds = new Set();
  if (waiting.length > 0) {
    const ids = [...new Set(waiting.flatMap((o) => (o.vendors || []).map((v) => String(v.businessId))))];
    const bannedOwners = await User.find({ businessId: { $in: ids }, banned: true })
      .select("businessId")
      .lean();
    bannedBusinessIds = new Set(bannedOwners.map((u) => String(u.businessId)));
  }

  return plain.map((o) => ({
    ...o,
    activeDisputeBusinessIds: byOrder.get(o._id.toString()) || [],
    vendorSuspended:
      o.paymentMethod === "bank_transfer" &&
      o.status === "awaiting_confirmation" &&
      (o.vendors || []).some((v) => bannedBusinessIds.has(String(v.businessId))),
  }));
}