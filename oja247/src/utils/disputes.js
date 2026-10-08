// Mirrors DISPUTE_WINDOW_DAYS / SELF_RESOLVE_WINDOW_DAYS in
// backend/src/models/Dispute.js. The backend is the source of truth and
// re-checks everything on filing — these only decide what the UI offers,
// so keep them in sync if the backend values change.
export const DISPUTE_WINDOW_DAYS = 5;
export const SELF_RESOLVE_WINDOW_DAYS = 7;
// Mirrors UNCONFIRMED_PAYMENT_DAYS in backend/src/models/Dispute.js.
export const UNCONFIRMED_PAYMENT_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// Vendors on this order the customer can still dispute: everyone except
// vendors that already have an active dispute (the API sends those ids as
// activeDisputeBusinessIds on my-orders and lookup).
export function getDisputableVendors(order) {
  const active = new Set(order?.activeDisputeBusinessIds || []);
  return (order?.vendors || []).filter((v) => v.businessId && !active.has(v.businessId));
}

// A bank-transfer order still waiting for the vendor to confirm the payment.
export function isAwaitingTransfer(order) {
  return order?.paymentMethod === "bank_transfer" && order?.status === "awaiting_confirmation";
}

// Whole days until the customer may dispute an unconfirmed transfer order
// (0 once they can). The wait restarts whenever a receipt is (re)uploaded.
export function daysUntilUnconfirmedDispute(order) {
  const lastReceiptAt = (order?.paymentReceipts || []).reduce(
    (latest, r) => Math.max(latest, new Date(r.uploadedAt || 0).getTime()),
    0
  );
  const waitingSince = Math.max(new Date(order?.createdAt).getTime(), lastReceiptAt);
  const msLeft = waitingSince + UNCONFIRMED_PAYMENT_DAYS * DAY_MS - Date.now();
  return Math.max(0, Math.ceil(msLeft / DAY_MS));
}

// Paid or disputed orders inside the window, with at least one vendor left
// to dispute (see fileDispute — an order flips to "disputed" after the first
// dispute, but the other vendors on it can still be disputed). A bank-transfer
// order the vendor has left unanswered for UNCONFIRMED_PAYMENT_DAYS can also be
// disputed, with no 5-day window.
export function getDisputeEligibility(order) {
  if (!order) return { eligible: false, daysLeft: 0 };

  if (isAwaitingTransfer(order)) {
    // A banned vendor can't answer, so there is no waiting period.
    const daysUntil = order.vendorSuspended ? 0 : daysUntilUnconfirmedDispute(order);
    return {
      eligible: daysUntil === 0 && getDisputableVendors(order).length > 0,
      daysLeft: 0,
      unconfirmed: true,
      daysUntil,
    };
  }

  const windowEnd = new Date(order.createdAt).getTime() + DISPUTE_WINDOW_DAYS * DAY_MS;
  const msLeft = windowEnd - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
  const statusOk = order.status === "paid" || order.status === "disputed";
  return { eligible: statusOk && msLeft > 0 && getDisputableVendors(order).length > 0, daysLeft };
}