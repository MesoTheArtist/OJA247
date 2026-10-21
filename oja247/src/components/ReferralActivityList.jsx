import React, { useState } from "react";
import { Users } from "lucide-react";
import { planLabel, naira, formatDate, formatDateTime, percent, payoutStatusLabel, earningSummary } from "../utils/referralFormat";

// Shared by the marketer and business referral dashboards — a referral
// timeline with status badges, an earnings summary line, and a "details"
// breakdown (who, when, which plan, how much they paid, what it earned).
function ReferralActivityList({ referrals, title = "Your Referrals", emptyCta }) {
  // Date.now() is impure to call during render — compute it once via
  // useState's lazy initializer (React's documented escape hatch for a
  // one-time impure value) instead of calling it fresh on every render.
  const [now] = useState(() => Date.now());

  const daysSince = (date) => {
    const days = Math.floor((now - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  };

  const rows = (referral) => {
    const earning = referral.earning;
    const list = [
      ["Referred", formatDateTime(referral.referredAt)],
      referral.status === "converted" ? ["Subscribed", formatDateTime(referral.convertedAt)] : null,
      referral.planType ? ["Plan bought", planLabel(referral.planType)] : null,
      referral.amountPaid ? ["They paid", naira(referral.amountPaid)] : null,
      referral.paymentReference ? ["Payment reference", referral.paymentReference] : null,
      earning?.kind === "cash" && earning.rate !== null ? ["Commission rate", percent(earning.rate)] : null,
      earning ? ["You earned", earning.kind === "points" ? `${Number(earning.amount).toLocaleString()} points` : naira(earning.amount)] : null,
      earning?.kind === "cash" ? ["Payout status", payoutStatusLabel(earning.status)] : null,
      earning?.kind === "cash" && earning.status === "paid" && earning.paidAt ? ["Paid on", formatDate(earning.paidAt)] : null,
      earning?.kind === "cash" && earning.status === "rejected" && earning.rejectionReason ? ["Reason", earning.rejectionReason] : null,
    ];
    return list.filter(Boolean);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b">
        <h3 className="font-bold text-gray-900">{title}</h3>
      </div>
      {referrals.length === 0 ? (
        <div className="p-8 text-center">
          <Users size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 mb-1">No referrals yet.</p>
          {emptyCta && <p className="text-xs text-gray-400">{emptyCta}</p>}
        </div>
      ) : (
        <div className="divide-y">
          {referrals.map((r) => (
            <div key={r.id} className="px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 break-words">{r.businessName}</p>
                  <p className="text-xs text-gray-400">
                    Referred {new Date(r.referredAt).toLocaleDateString("en-NG")} ·{" "}
                    {r.status === "converted" && r.convertedAt
                      ? `Converted ${daysSince(r.convertedAt)}`
                      : daysSince(r.referredAt)}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${
                    r.status === "converted"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {r.status === "converted" ? "Converted" : "Pending"}
                </span>
              </div>

              <p className="text-sm text-gray-600 mt-2">
                {r.status === "converted" && r.planType ? `${planLabel(r.planType)}. ` : ""}
                {earningSummary(r)}
              </p>

              <details className="mt-2 group">
                <summary className="text-xs font-semibold text-green-700 cursor-pointer select-none">
                  View full breakdown
                </summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs bg-gray-50 border border-gray-100 rounded-xl p-3">
                  {rows(r).map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="text-gray-900 font-medium break-words">{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReferralActivityList;
