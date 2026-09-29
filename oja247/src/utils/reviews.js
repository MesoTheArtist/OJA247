// Mirrors REVIEWABLE_ORDER_STATUSES in backend/src/services/reviewEligibility.js.
// The backend re-checks on submit — this only decides what the UI offers.
export const REVIEWABLE_ORDER_STATUSES = ["paid", "disputed", "refunded"];