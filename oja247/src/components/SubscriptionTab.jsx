import React, { useEffect, useState } from "react";
import axiosInstance from "../services/api";

const STATUS_LABELS = {
  inactive: { text: "No active subscription", color: "text-gray-500" },
  active: { text: "Active", color: "text-green-600" },
  expired: { text: "Expired", color: "text-red-600" },
};

function SubscriptionTab({ businessId, business, email }) {
  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
  const [paystackReady, setPaystackReady] = useState(false);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [usePoints, setUsePoints] = useState(false);

  const pointsBalance = business?.pointsBalance || 0;

  useEffect(() => {
    axiosInstance.get("/api/subscriptions/plans")
      .then(({ data }) => setPlans(data.plans || []))
      .catch(() => setError("Subscription plans could not be loaded. Please refresh and try again."))
      .finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    const existingScript = document.querySelector("script[src='https://js.paystack.co/v1/inline.js']");
    if (existingScript) {
      if (window.PaystackPop) setPaystackReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackReady(true);
    script.onerror = () => setPaystackReady(false);
    document.body.appendChild(script);
  }, []);

  const currentPlan = plans.find((plan) => plan.key === selectedPlan) || { key: selectedPlan, price: 0, months: 1 };
  const appliedPoints = usePoints ? Math.min(pointsBalance, currentPlan.price) : 0;
  const amountDue = currentPlan.price - appliedPoints;
  const monthlyPrice = plans.find((plan) => plan.key === "monthly")?.price || 0;
  const bestValuePlanKey = plans.length
    ? plans.reduce((best, plan) => plan.price / plan.months < best.price / best.months ? plan : best).key
    : null;
  const planBlurb = (plan) => plan.months === 1
    ? "Billed every month"
    : `₦${(plan.price / plan.months).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month · save ${((1 - plan.price / (monthlyPrice * plan.months)) * 100).toFixed(1)}%`;

  const status = STATUS_LABELS[business?.subscriptionStatus] || STATUS_LABELS.inactive;
  const expiresAt = business?.subscriptionExpiresAt
    ? new Date(business.subscriptionExpiresAt).toLocaleDateString("en-NG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const handleSubscribe = async () => {
    if (plansLoading || !currentPlan.price) return;
    setError("");
    setLoading(true);

    let reference, amount, fullyPaidWithPoints;
    try {
      const { data } = await axiosInstance.post("/api/subscriptions/initiate", {
        businessId,
        planType: selectedPlan,
        pointsToApply: appliedPoints,
        autoRenew: amountDue > 0,
      });
      reference = data.reference;
      amount = data.amount;
      fullyPaidWithPoints = data.fullyPaidWithPoints;
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || "Could not start the subscription payment. Please try again.");
      return;
    }

    // Points covered the whole plan — nothing left to charge, subscription
    // is already active on the backend.
    if (fullyPaidWithPoints) {
      window.location.reload();
      return;
    }

    if (!paystackPublicKey) {
      setLoading(false);
      setError("Paystack public key is missing. Add VITE_PAYSTACK_PUBLIC_KEY to your .env file.");
      return;
    }
    if (!paystackReady || !window.PaystackPop) {
      setLoading(false);
      setError("Paystack is still loading. Please wait a moment and try again.");
      return;
    }

    const handler = window.PaystackPop.setup({
      key: paystackPublicKey,
      email,
      amount: Math.round(amount * 100), // kobo
      currency: "NGN",
      channels: ["card"],
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: "Business ID", variable_name: "business_id", value: businessId },
          { display_name: "Plan", variable_name: "plan_type", value: selectedPlan },
        ],
      },
      callback: function (response) {
        (async function () {
          try {
            const verification = await axiosInstance.post(
              `/api/subscriptions/verify/${response.reference}`
            );
            if (verification.data?.payment?.status === "success") {
              if (amountDue > 0 && !verification.data.autoRenewEnabled) {
                setNotice("Payment succeeded, but this card could not be enrolled for automatic renewal. Your subscription is active; auto-renew is off.");
                setLoading(false);
                return;
              }
              window.location.reload(); // simplest way to reflect the new subscriptionStatus/expiry
              return;
            }
          } catch (err) {
            console.error("Subscription verification error:", err);
          }
          setError("Payment could not be verified. If you were charged, contact support with your reference.");
          setLoading(false);
        })();
      },
      onClose: function () {
        setLoading(false);
      },
    });

    handler.openIframe();
  };

  const handleCancelAutoRenew = async () => {
    const confirmed = window.confirm(
      "Cancel automatic renewal? This stops future charges only. There is no refund, and your subscription stays active until its current expiry date."
    );
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      await axiosInstance.post("/api/subscriptions/auto-renew/cancel", { businessId });
      window.location.reload();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || "Could not cancel automatic renewal. Please try again.");
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Subscription Status</h3>
        <p className={`font-semibold ${status.color}`}>{status.text}</p>
        {expiresAt && (
          <p className="text-sm text-gray-500 mt-1">
            {business?.subscriptionStatus === "active" ? "Renews / expires" : "Expired"} on {expiresAt}
          </p>
        )}
        {business?.subscriptionStatus === "active" && business?.subscriptionAutoRenew && (
          <div className="mt-3 text-sm text-gray-600">
            <p>
              Auto-renew is on for the {plans.find((plan) => plan.key === business.subscriptionAutoRenewPlanType)?.label || "selected"} plan
              {business.subscriptionCardBrand && business.subscriptionCardLast4
                ? ` using ${business.subscriptionCardBrand} ending in ${business.subscriptionCardLast4}`
                : " using your saved card"}.
            </p>
            <button
              type="button"
              onClick={handleCancelAutoRenew}
              disabled={loading}
              className="mt-2 text-sm font-semibold text-red-700 underline disabled:opacity-50"
            >
              Cancel renewal
            </button>
            <p className="mt-1 text-xs text-gray-500">
              Cancels future card charges only. No refund; access continues until {expiresAt}.
            </p>
          </div>
        )}
      </div>

      {notice && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {plans.map((plan) => (
          <button
            key={plan.key}
            type="button"
            onClick={() => setSelectedPlan(plan.key)}
            className={`relative text-left p-4 rounded-xl border-2 transition-colors ${
              selectedPlan === plan.key
                ? "border-green-600 bg-green-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            {plan.key === bestValuePlanKey && (
              <span className="absolute -top-2 right-3 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                Best value
              </span>
            )}
            <p className="font-bold text-gray-900">{plan.label}</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">
              ₦{plan.price.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">{planBlurb(plan)}</p>
          </button>
        ))}
      </div>

      {pointsBalance > 0 && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usePoints}
              onChange={(e) => setUsePoints(e.target.checked)}
              className="mt-1 w-4 h-4 accent-green-600"
            />
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                Pay with my points ({pointsBalance.toLocaleString()} pts available)
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                1 point = ₦1. Points from referrals are applied first, and you only pay the rest.
              </p>
            </div>
          </label>

          {usePoints && (
            <div className="mt-3 pt-3 border-t border-green-200 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Plan price</span>
                <span>₦{currentPlan.price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-700 font-semibold">
                <span>Points applied</span>
                <span>-₦{appliedPoints.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-900 font-bold text-base pt-1">
                <span>{amountDue <= 0 ? "You pay" : "Amount due"}</span>
                <span>₦{amountDue.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-900">
        {amountDue > 0 ? (
          <p>
            Your card will be charged ₦{currentPlan.price.toLocaleString()} automatically every {currentPlan.key === "monthly" ? "month" : currentPlan.key === "yearly" ? "year" : "6 months"} to renew this plan. Cancel auto-renew any time; your current paid period remains active.
          </p>
        ) : (
          <p>This payment is covered by points, so no card is saved and this plan will not renew automatically.</p>
        )}
      </div>

      <button
        onClick={handleSubscribe}
        disabled={loading || plansLoading || !currentPlan.price}
        className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
          loading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
        } shadow-lg`}
      >
        {loading
          ? "Processing..."
          : plansLoading
          ? "Loading plans..."
          : amountDue <= 0
          ? "Pay with Points"
          : `Subscribe — ${currentPlan?.label}${appliedPoints > 0 ? ` (₦${amountDue.toLocaleString()} due)` : ""}`}
      </button>
    </div>
  );
}

export default SubscriptionTab;