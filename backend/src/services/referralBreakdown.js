// Turns raw referral / payout / points records into the detailed rows the
// marketer, vendor and admin screens show: who was referred, when, which plan
// they bought, how much they paid, and what that earned (money for marketers,
// points for vendors). Pure functions, no database calls, so they are easy to
// test and the three screens can't drift apart.

const idOf = (value) => String(value?._id || value || "");

// What the referred business did, taken from the attribution record.
function conversionOf(attribution) {
  return {
    planType: attribution.conversionPlanType || null,
    amountPaid: attribution.conversionBaseAmount ?? null,
    paymentReference: attribution.conversionPaymentReference || "",
  };
}

function baseReferral(attribution) {
  return {
    id: attribution._id,
    businessName: attribution.referredBusinessId?.name || "(business deleted)",
    status: attribution.status, // "pending" | "converted"
    referredAt: attribution.createdAt,
    convertedAt: attribution.convertedAt,
    ...conversionOf(attribution),
  };
}

// Marketer view: attach the cash commission each conversion earned.
export function buildMarketerReferrals(attributions, payouts) {
  const payoutByAttribution = new Map(payouts.map((p) => [idOf(p.referralAttributionId), p]));
  return attributions.map((attribution) => {
    const payout = payoutByAttribution.get(idOf(attribution._id));
    return {
      ...baseReferral(attribution),
      earning: payout
        ? {
            kind: "cash",
            amount: payout.amount,
            rate: payout.commissionRate ?? null,
            status: payout.status, // pending | batched | paid | failed | rejected
            paidAt: payout.paidAt || null,
            rejectionReason: payout.rejectionReason || "",
          }
        : null,
    };
  });
}

// Vendor view: attach the points each conversion earned.
export function buildBusinessReferrals(attributions, earnedLedgerEntries) {
  const entryByAttribution = new Map(
    earnedLedgerEntries
      .filter((entry) => entry.referralAttributionId)
      .map((entry) => [idOf(entry.referralAttributionId), entry])
  );
  return attributions.map((attribution) => {
    const entry = entryByAttribution.get(idOf(attribution._id));
    return {
      ...baseReferral(attribution),
      earning: entry ? { kind: "points", amount: entry.points, earnedAt: entry.createdAt } : null,
    };
  });
}

// A payout row that says where the money came from.
export function describePayout(payout, attributions) {
  const attribution = attributions.find((a) => idOf(a._id) === idOf(payout.referralAttributionId));
  return {
    id: payout._id,
    amount: payout.amount,
    status: payout.status,
    paidAt: payout.paidAt || null,
    rejectedAt: payout.rejectedAt || null,
    reason: payout.rejectionReason || "",
    transferReference: payout.transferReference || "",
    rate: payout.commissionRate ?? null,
    planType: payout.planType || attribution?.conversionPlanType || null,
    amountPaid: payout.conversionAmount ?? attribution?.conversionBaseAmount ?? null,
    paymentReference: payout.paymentReference || attribution?.conversionPaymentReference || "",
    businessName: attribution?.referredBusinessId?.name || "(business deleted)",
    referredAt: attribution?.createdAt || null,
    convertedAt: attribution?.convertedAt || null,
  };
}

// A points-history row that says why points were earned or spent.
export function describeLedgerEntry(entry, attributions, subscriptionPaymentsById) {
  const row = {
    id: entry._id,
    type: entry.type,
    points: entry.points,
    balanceAfter: entry.balanceAfter,
    status: entry.status,
    createdAt: entry.createdAt,
    detail: null,
  };

  if (entry.type === "earned" && entry.referralAttributionId) {
    const attribution = attributions.find((a) => idOf(a._id) === idOf(entry.referralAttributionId));
    if (attribution) {
      row.detail = {
        businessName: attribution.referredBusinessId?.name || "(business deleted)",
        referredAt: attribution.createdAt,
        convertedAt: attribution.convertedAt,
        planType: attribution.conversionPlanType || null,
        amountPaid: attribution.conversionBaseAmount ?? null,
      };
    }
  } else if (entry.type === "redeemed_subscription" && entry.subscriptionPaymentId) {
    const payment = subscriptionPaymentsById.get(idOf(entry.subscriptionPaymentId));
    if (payment) row.detail = { planType: payment.planType || null, planPrice: payment.amount ?? null };
  }
  return row;
}