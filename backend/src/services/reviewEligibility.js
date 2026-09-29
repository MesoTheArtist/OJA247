import Review from "../models/Review.js";

// Order statuses that prove the purchase actually went through — the
// verified-purchase gate. disputed/refunded still count: the vendor was
// paid (or was, before an off-platform refund), the customer really bought
// from them, and a dispute/refund doesn't erase that. "pending"/"failed"/
// "cancelled" never do.
export const REVIEWABLE_ORDER_STATUSES = ["paid", "disputed", "refunded"];

// Attaches reviewedBusinessIds (vendors on that order this customer has
// already reviewed) to each order, same pattern as
// disputeOrderStatus.withActiveDisputeVendors. The frontend uses it to only
// offer a "leave a review" button for vendors not yet reviewed on that order.
export async function withReviewedVendors(orders, customerId) {
  const plain = orders.map((o) => (typeof o.toObject === "function" ? o.toObject() : o));
  if (plain.length === 0) return plain;

  const reviewed = await Review.find({ orderId: { $in: plain.map((o) => o._id) }, customerId })
    .select("orderId businessId")
    .lean();

  const byOrder = new Map();
  for (const r of reviewed) {
    const key = r.orderId.toString();
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(r.businessId);
  }

  return plain.map((o) => ({ ...o, reviewedBusinessIds: byOrder.get(o._id.toString()) || [] }));
}