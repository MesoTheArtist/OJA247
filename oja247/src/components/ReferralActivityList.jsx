import React, { useState } from "react";
import { Users } from "lucide-react";

// Shared by the marketer and business referral dashboards — a referral
// timeline with status badges, days-since, and an empty state with a CTA
// instead of a blank table.
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
            <div key={r.id} className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
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
          ))}
        </div>
      )}
    </div>
  );
}

export default ReferralActivityList;