// Mirrors DISPUTE_WINDOW_DAYS / SELF_RESOLVE_WINDOW_DAYS in
// backend/src/models/Dispute.js. The backend is the source of truth and
// re-checks everything on filing — these only decide what the UI offers,
// so keep them in sync if the backend values change.
export const DISPUTE_WINDOW_DAYS = 5;
export const SELF_RESOLVE_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// Vendors on this order the customer can still dispute: everyone except
// vendors that already have an active dispute (the API sends those ids as
// activeDisputeBusinessIds on my-orders and lookup).
export function getDisputableVendors(order) {
  const active = new Set(order?.activeDisputeBusinessIds || []);
  return (order?.vendors || []).filter((v) => v.businessId && !active.has(v.businessId));
}

// Paid or disputed orders inside the window, with at least one vendor left
// to dispute (see fileDispute — an order flips to "disputed" after the first
// dispute, but the other vendors on it can still be disputed).
export function getDisputeEligibility(order) {
  if (!order) return { eligible: false, daysLeft: 0 };
  const windowEnd = new Date(order.createdAt).getTime() + DISPUTE_WINDOW_DAYS * DAY_MS;
  const msLeft = windowEnd - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
  const statusOk = order.status === "paid" || order.status === "disputed";
  return { eligible: statusOk && msLeft > 0 && getDisputableVendors(order).length > 0, daysLeft };
}