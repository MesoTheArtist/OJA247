// Small formatting helpers shared by the referral and payout screens.

const PLAN_LABELS = {
  monthly: "Monthly plan",
  six_month: "6-month plan",
  yearly: "Yearly plan",
};

export const planLabel = (planType) => PLAN_LABELS[planType] || "";

export const naira = (amount) => `₦${Number(amount || 0).toLocaleString("en-NG")}`;

export const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "";

export const formatDateTime = (date) =>
  date
    ? new Date(date).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

// 0.5 -> "50%"
export const percent = (rate) => (rate === null || rate === undefined ? "" : `${Math.round(rate * 100)}%`);

const PAYOUT_STATUS_LABELS = {
  pending: "Waiting for the next payout",
  batched: "In this week's payout batch",
  paid: "Paid",
  failed: "Payout failed, we'll retry",
  rejected: "Not approved",
};

export const payoutStatusLabel = (status) => PAYOUT_STATUS_LABELS[status] || status;

// One plain-English sentence about what a referral has earned so far.
export function earningSummary(referral) {
  if (referral.status !== "converted") return "Hasn't subscribed yet, so nothing earned so far.";
  const earning = referral.earning;
  if (!earning) return "Subscribed. Your earning is being processed.";
  if (earning.kind === "points") return `Earned ${Number(earning.amount).toLocaleString()} points.`;
  const base = referral.amountPaid ? ` (${percent(earning.rate)} of ${naira(referral.amountPaid)})` : "";
  const state =
    earning.status === "paid"
      ? `Paid ${formatDate(earning.paidAt)}.`
      : earning.status === "rejected"
      ? "Not approved."
      : `${payoutStatusLabel(earning.status)}.`;
  return `Earned ${naira(earning.amount)}${base}. ${state}`;
}
