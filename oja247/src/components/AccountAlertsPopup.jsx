import React, { useEffect, useState } from "react";
import { AlertTriangle, FileWarning, X } from "lucide-react";

// Shows at most one popup at a time, once per login session (sessionStorage —
// clears when the tab/browser closes, so it resurfaces on the next login
// rather than nagging every page load). Priority: subscription issues first
// (they affect whether customers can find the store at all), then the
// documents reminder. Dismissing one lets the other show right after, if it
// also applies.
function AccountAlertsPopup({
  businessId,
  needsVerification,
  subExpired,
  subExpiringSoon,
  neverSubscribed,
  daysUntilSubExpiry,
  onGoToVerification,
  onGoToSubscription,
}) {
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const shownKey = (type) => `oja247_alert_shown_${businessId}_${type}`;
    const next = [];

    if ((subExpired || subExpiringSoon || neverSubscribed) && !sessionStorage.getItem(shownKey("subscription"))) {
      next.push("subscription");
    }
    if (needsVerification && !sessionStorage.getItem(shownKey("docs"))) {
      next.push("docs");
    }

    setQueue(next);
    setActive(next[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, needsVerification, subExpired, subExpiringSoon, neverSubscribed]);

  const dismiss = () => {
    if (!active) return;
    sessionStorage.setItem(`oja247_alert_shown_${businessId}_${active}`, "1");
    const rest = queue.slice(1);
    setQueue(rest);
    setActive(rest[0] || null);
  };

  if (!active) return null;

  const isSubscription = active === "subscription";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 relative">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <X size={20} />
        </button>

        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
            isSubscription
              ? subExpired || neverSubscribed
                ? "bg-red-100 text-red-600"
                : "bg-yellow-100 text-yellow-700"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {isSubscription ? <AlertTriangle size={24} /> : <FileWarning size={24} />}
        </div>

        {isSubscription ? (
          <>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {neverSubscribed
                ? "Your store isn't visible to customers yet"
                : subExpired
                ? "Your subscription has expired"
                : "Your subscription is expiring soon"}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {neverSubscribed
                ? "Subscribing is what puts your store in customer search and on the Explore page. Right now it's set up but hidden — subscribe to go live."
                : subExpired
                ? "Your store is currently hidden from customer search because your subscription period has ended. Renew now to bring it back — it goes live again immediately after payment."
                : `Your subscription expires in ${daysUntilSubExpiry} day${daysUntilSubExpiry === 1 ? "" : "s"}. Renew before then so your store stays visible to customers without interruption.`}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  onGoToSubscription();
                }}
                className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 transition"
              >
                {neverSubscribed ? "Subscribe now" : subExpired ? "Renew now" : "Renew subscription"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2.5 text-gray-500 font-medium hover:text-gray-700"
              >
                Later
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Finish setting up your documents</h3>
            <p className="text-sm text-gray-600 mb-6">
              Your vendor verification documents aren't fully uploaded yet. Complete them to get your verified badge
              and build customer trust.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  onGoToVerification();
                }}
                className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 transition"
              >
                Complete now
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2.5 text-gray-500 font-medium hover:text-gray-700"
              >
                Later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AccountAlertsPopup;