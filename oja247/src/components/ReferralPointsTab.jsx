import React, { useEffect, useState } from "react";
import { Pencil, Percent, Gift } from "lucide-react";
import axiosInstance from "../services/api";
import ShareButtons from "./ShareButtons";
import ReferralActivityList from "./ReferralActivityList";

function ReferralPointsTab({ businessId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState("");

  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");

  const loadDashboard = () => {
    setLoading(true);
    axiosInstance
      .get(`/api/businesses/${businessId}/points`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || "Could not load referral data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const referralLink = data ? `${window.location.origin}/business-form?ref=${data.referralCode}` : "";

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setWithdrawMessage("");
    const amount = Number(withdrawAmount);

    if (!amount || amount <= 0) {
      setWithdrawMessage("Enter a valid amount.");
      return;
    }
    if (amount > data.pointsBalance) {
      setWithdrawMessage("That's more than your current balance.");
      return;
    }

    setWithdrawing(true);
    try {
      await axiosInstance.post(`/api/businesses/${businessId}/points/withdraw`, { amount });
      setWithdrawAmount("");
      setWithdrawMessage("Withdrawal requested — it will be processed shortly.");
      loadDashboard();
    } catch (err) {
      setWithdrawMessage(err.response?.data?.message || "Withdrawal failed. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  };

  const startEditingCode = () => {
    setCodeInput(data.referralCode || "");
    setCodeMessage("");
    setEditingCode(true);
  };

  const handleSaveCode = async (e) => {
    e.preventDefault();
    setCodeMessage("");
    const clean = codeInput.trim().toUpperCase();

    if (!/^[A-Z0-9]{7,8}$/.test(clean)) {
      setCodeMessage("Must be 7-8 characters, letters and numbers only.");
      return;
    }

    setSavingCode(true);
    try {
      await axiosInstance.patch(`/api/businesses/${businessId}/referral-code`, {
        referralCode: clean,
      });
      setEditingCode(false);
      loadDashboard();
    } catch (err) {
      setCodeMessage(err.response?.data?.message || "Could not save that code. Please try again.");
    } finally {
      setSavingCode(false);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Balance + withdraw */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <p className="text-sm font-semibold text-gray-500 mb-1">Points Balance</p>
        <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4 break-words">
          {data.pointsBalance.toLocaleString()} pts{" "}
          <span className="text-lg text-gray-400">(₦{data.pointsBalance.toLocaleString()})</span>
        </p>

        <form onSubmit={handleWithdraw} className="flex flex-col sm:flex-row gap-2">
          <input
            type="number"
            min="1"
            placeholder="Amount to withdraw"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="w-full sm:flex-1 min-w-0 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
          />
          <button
            type="submit"
            disabled={withdrawing}
            className="px-5 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm disabled:bg-gray-400"
          >
            {withdrawing ? "Processing..." : "Withdraw"}
          </button>
        </form>
        {withdrawMessage && <p className="text-sm text-gray-600 mt-2">{withdrawMessage}</p>}
        <p className="text-xs text-gray-400 mt-2">
          No minimum — but your vendor payout bank details must be on file first.
        </p>
      </div>

      {/* Progress toward next redemption + conversion rate */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Gift size={16} className="text-green-600" />
          <p className="text-sm font-semibold text-gray-700">
            {data.nextRedemption.canRedeemNow
              ? `You can redeem points for your ${data.nextRedemption.targetLabel.toLowerCase()} right now`
              : `${data.nextRedemption.remainingPoints.toLocaleString()} pts to redeem your ${data.nextRedemption.targetLabel.toLowerCase()}`}
          </p>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
            style={{ width: `${Math.round(data.nextRedemption.progress * 100)}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 border-t">
          <Percent size={14} className="text-green-600" />
          <p className="text-xs text-gray-500 font-semibold">Conversion Rate</p>
          <p className="ml-auto text-sm font-extrabold text-gray-900">
            {Math.round(data.stats.conversionRate * 100)}%
          </p>
          <p className="text-xs text-gray-400">
            ({data.stats.totalConverted}/{data.stats.totalReferred} referred)
          </p>
        </div>
      </div>

      {/* Referral link */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <p className="text-sm font-semibold text-gray-500 mb-1">Your Referral Code</p>

        {editingCode ? (
          <form onSubmit={handleSaveCode} className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="e.g. CHIOMA1"
                className="w-full sm:flex-1 min-w-0 p-3 border border-gray-300 rounded-lg text-lg font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                disabled={savingCode}
                className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm disabled:bg-gray-400"
              >
                {savingCode ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditingCode(false)}
                className="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">7-8 characters, letters and numbers only.</p>
            {codeMessage && <p className="text-xs text-red-600 mt-1">{codeMessage}</p>}
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <p className="text-xl font-extrabold text-gray-900 break-all">{data.referralCode}</p>
            <button
              onClick={startEditingCode}
              className="flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700"
            >
              <Pencil size={12} /> Customize
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <input
            readOnly
            value={referralLink}
            className="flex-1 min-w-0 p-3 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-600 truncate"
          />
        </div>
        <ShareButtons
          link={referralLink}
          message="Get your business online with OJA247 — sign up with my link:"
        />
        <p className="text-xs text-gray-400 mt-2">
          Earn 1,000 points (₦1,000) each time a business you refer pays their subscription. Use your
          points to pay for your own subscription from the Subscription tab, or withdraw as cash below.
        </p>
      </div>

      {/* Referral list */}
      <ReferralActivityList
        referrals={data.referrals}
        title="Businesses You've Referred"
        emptyCta="Share your link above to get your first referral."
      />

      {/* Ledger */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b">
          <h3 className="font-bold text-gray-900">Points History</h3>
        </div>
        {data.ledger.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No activity yet.</p>
        ) : (
          <div className="divide-y">
            {data.ledger.map((entry) => (
              <div key={entry.id} className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 capitalize">
                    {entry.type.replace("_", " ")}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(entry.createdAt).toLocaleDateString("en-NG")}
                    {entry.status !== "n/a" && ` · ${entry.status}`}
                  </p>
                </div>
                <p
                  className={`font-bold shrink-0 ${
                    entry.points > 0 ? "text-green-700" : "text-gray-900"
                  }`}
                >
                  {entry.points > 0 ? "+" : ""}
                  {entry.points.toLocaleString()} pts
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReferralPointsTab;