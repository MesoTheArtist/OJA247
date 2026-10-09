import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  Users,
  CheckCircle2,
  Wallet,
  TrendingUp,
  Landmark,
  Pencil,
  Percent,
  Target,
} from "lucide-react";
import marketerApi from "../services/marketerApi";
import Loader from "../components/Loader";
import ShareButtons from "../components/ShareButtons";
import ReferralActivityList from "../components/ReferralActivityList";
import Logo from "../assets/OJA247 VX1.png";

const MarketerDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Payout details form
  const [editingPayout, setEditingPayout] = useState(false);
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedAccountName, setResolvedAccountName] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState("");
  const [withdrawError, setWithdrawError] = useState("");

  // Referral code editing
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");

  // Phone completion (Google sign-ups start with no phone on file)
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");

  const MIN_WITHDRAWAL = 1000;

  const handleWithdraw = async () => {
    setWithdrawing(true);
    setWithdrawError("");
    setWithdrawMessage("");
    try {
      const res = await marketerApi.post("/api/marketers/withdraw");
      setWithdrawMessage(res.data.message);
      loadDashboard();
    } catch (err) {
      setWithdrawError(err.response?.data?.message || "Could not request withdrawal.");
    }
    setWithdrawing(false);
  };

  const startEditingCode = () => {
    setCodeInput(data.referralCode);
    setCodeMessage("");
    setEditingCode(true);
  };

  const handleSaveCode = async (e) => {
    e.preventDefault();
    setCodeMessage("");
    const raw = codeInput.trim().toUpperCase();

    if (!/^[A-Z0-9]{7,8}$/.test(raw)) {
      setCodeMessage("Code must be 7-8 characters, letters and numbers only.");
      return;
    }

    setSavingCode(true);
    try {
      await marketerApi.patch("/api/marketers/me/referral-code", { referralCode: raw });
      setEditingCode(false);
      loadDashboard();
    } catch (err) {
      setCodeMessage(err.response?.data?.message || "Could not save that code. Please try again.");
    } finally {
      setSavingCode(false);
    }
  };

  const loadDashboard = () => {
    marketerApi
      .get("/api/marketers/dashboard")
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem("marketerToken");
          navigate("/marketer-login");
          return;
        }
        setError(err.response?.data?.message || "Could not load your dashboard.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const token = localStorage.getItem("marketerToken");
    if (!token) {
      navigate("/marketer-login");
      return;
    }
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Load banks the first time the payout form is opened
  useEffect(() => {
    if (!editingPayout || banks.length > 0) return;
    setBanksLoading(true);
    marketerApi
      .get("/api/vendors/banks")
      .then(({ data: res }) => {
        if (res.status) setBanks(res.data);
      })
      .catch(() => {})
      .finally(() => setBanksLoading(false));
  }, [editingPayout, banks.length]);

  // Debounced auto-resolve once bank + 10-digit account number are entered
  useEffect(() => {
    setResolvedAccountName("");
    setResolveError("");
    if (!bankCode || accountNumber.length !== 10) return;

    let cancelled = false;
    setResolving(true);
    const timeout = setTimeout(() => {
      marketerApi
        .get("/api/vendors/resolve-account", {
          params: { account_number: accountNumber, bank_code: bankCode },
        })
        .then(({ data: res }) => {
          if (cancelled) return;
          if (res.status) setResolvedAccountName(res.data.account_name);
          else setResolveError(res.message || "Could not verify this account.");
        })
        .catch(() => {
          if (!cancelled) setResolveError("Could not verify this account.");
        })
        .finally(() => {
          if (!cancelled) setResolving(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [bankCode, accountNumber]);

  const handleLogout = () => {
    localStorage.removeItem("marketerToken");
    navigate("/marketer-login");
  };

  const referralLink = data
    ? `${window.location.origin}/business-form?ref=${data.referralCode}`
    : "";

  const handleSavePayout = async (e) => {
    e.preventDefault();
    setPayoutMessage("");

    if (!bankCode || !resolvedAccountName) {
      setPayoutMessage("Select your bank and enter a valid account number first.");
      return;
    }

    const selectedBank = banks.find((b) => b.code === bankCode);
    setSavingPayout(true);
    try {
      await marketerApi.patch("/api/marketers/me/payout-details", {
        bank_code: bankCode,
        bank_name: selectedBank?.name || "",
        account_number: accountNumber,
      });
      setEditingPayout(false);
      loadDashboard();
    } catch (err) {
      setPayoutMessage(err.response?.data?.message || "Could not save your payout details.");
    } finally {
      setSavingPayout(false);
    }
  };

  const handleSavePhone = async (e) => {
    e.preventDefault();
    setPhoneMessage("");

    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setPhoneMessage("Enter a phone number.");
      return;
    }

    setSavingPhone(true);
    try {
      await marketerApi.patch("/api/marketers/me/phone", { phone: trimmed });
      loadDashboard();
    } catch (err) {
      setPhoneMessage(err.response?.data?.message || "Could not save your phone number.");
    } finally {
      setSavingPhone(false);
    }
  };

  if (loading) return <Loader />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={Logo} alt="OJA247" className="w-10 h-10 rounded-lg bg-white/90 p-1 object-contain" />
            <div>
              <p className="text-white font-black text-lg leading-tight">Marketer Dashboard</p>
              <p className="text-green-50 text-xs">Earn cash by referring businesses to OJA247</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-white/90 hover:text-white font-semibold bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg transition"
          >
            <LogOut size={16} /> Log Out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Phone completion prompt — only shown for accounts with no phone
            on file (Google sign-ups skip this at signup since Google never
            provides one; see marketerGoogleAuth on the backend). */}
        {!data.phone && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 mb-6">
            <p className="text-amber-700 font-semibold mb-1">Add your phone number</p>
            <p className="text-sm text-amber-700/80 mb-4">
              We don't have a phone number on file for your account yet. Add one so we can reach
              you about your referrals and payouts.
            </p>
            <form onSubmit={handleSavePhone} className="flex items-center gap-2">
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="e.g. 08012345678"
                className="flex-1 p-3 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
              <button
                type="submit"
                disabled={savingPhone}
                className="px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm disabled:bg-gray-400"
              >
                {savingPhone ? "Saving..." : "Save"}
              </button>
            </form>
            {phoneMessage && <p className="text-xs text-red-600 mt-2">{phoneMessage}</p>}
          </div>
        )}

        {/* Referral code + link */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <p className="text-sm font-semibold text-gray-500 mb-1">Your Referral Code</p>

          {editingCode ? (
            <form onSubmit={handleSaveCode} className="mb-4">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="e.g. CHIOMA1"
                  className="flex-1 p-3 border border-gray-300 rounded-lg text-lg font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-green-500"
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
            <div className="flex items-center gap-2 mb-4">
              <p className="text-2xl font-extrabold text-gray-900">{data.referralCode}</p>
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
              className="flex-1 p-3 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-600"
            />
          </div>
          <ShareButtons
            link={referralLink}
            message="Get your business online with OJA247 — sign up with my link:"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-2">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-green-600" />
              <p className="text-xs text-gray-500 font-semibold">Total Referred</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{data.stats.totalReferred}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-green-600" />
              <p className="text-xs text-gray-500 font-semibold">Converted</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{data.stats.totalConverted}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent size={14} className="text-green-600" />
              <p className="text-xs text-gray-500 font-semibold">Conversion Rate</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">
              {Math.round(data.stats.conversionRate * 100)}%
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={14} className="text-green-600" />
              <p className="text-xs text-gray-500 font-semibold">Pending Payout</p>
            </div>
            <p className="text-2xl font-extrabold text-green-700">
              ₦{data.stats.pendingPayoutTotal.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target size={14} className="text-green-600" />
              <p className="text-xs text-gray-500 font-semibold">If Pending Convert</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">
              {data.stats.payoutForecast !== null
                ? `~₦${data.stats.payoutForecast.toLocaleString()}`
                : "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-green-600" />
              <p className="text-xs text-gray-500 font-semibold">Lifetime Paid</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">
              ₦{data.stats.lifetimePaidTotal.toLocaleString()}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Converted = the business has paid their subscription. "If Pending Convert" is an estimate based on
          your own average payout per conversion — actual amounts depend on which plan each referral buys.
          Request a withdrawal any time you have at least ₦{MIN_WITHDRAWAL.toLocaleString()} pending — an
          admin is notified right away to process it.
        </p>

        <div className="mb-6">
          <button
            onClick={handleWithdraw}
            disabled={withdrawing || data.stats.pendingPayoutTotal < MIN_WITHDRAWAL}
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl shadow hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {withdrawing ? "Requesting..." : `Withdraw ₦${data.stats.pendingPayoutTotal.toLocaleString()}`}
          </button>
          {data.stats.pendingPayoutTotal < MIN_WITHDRAWAL && (
            <p className="text-xs text-gray-400 mt-2">
              Need at least ₦{MIN_WITHDRAWAL.toLocaleString()} pending to withdraw.
            </p>
          )}
          {withdrawMessage && <p className="text-sm text-green-700 mt-2">{withdrawMessage}</p>}
          {withdrawError && <p className="text-sm text-red-600 mt-2">{withdrawError}</p>}
        </div>

        {/* Payout details */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Landmark size={18} className="text-green-600" />
              <h3 className="font-bold text-gray-900">Payout Details</h3>
            </div>
            {!editingPayout && (
              <button
                onClick={() => {
                  setBankCode("");
                  setAccountNumber("");
                  setPayoutMessage("");
                  setEditingPayout(true);
                }}
                className="flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700"
              >
                <Pencil size={12} /> {data.payoutDetails.hasPayoutDetails ? "Update" : "Add details"}
              </button>
            )}
          </div>

          {!editingPayout ? (
            data.payoutDetails.hasPayoutDetails ? (
              <div className="mt-3 text-sm text-gray-700 space-y-0.5">
                <p>
                  <span className="text-gray-500">Bank:</span> {data.payoutDetails.bankName}
                </p>
                <p>
                  <span className="text-gray-500">Account:</span> {data.payoutDetails.accountNumber} —{" "}
                  {data.payoutDetails.accountName}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                Add your bank account so your weekly payouts have somewhere to go.
              </p>
            )
          ) : (
            <form onSubmit={handleSavePayout} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Bank</label>
                <select
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                >
                  <option value="">{banksLoading ? "Loading banks..." : "Select your bank"}</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="0123456789"
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                {resolving && <p className="text-xs text-gray-400 mt-1">Verifying account...</p>}
                {resolvedAccountName && (
                  <p className="text-xs text-green-700 font-semibold mt-1">{resolvedAccountName}</p>
                )}
                {resolveError && <p className="text-xs text-red-600 mt-1">{resolveError}</p>}
              </div>

              {payoutMessage && <p className="text-xs text-red-600">{payoutMessage}</p>}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingPayout || !resolvedAccountName}
                  className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold text-sm shadow disabled:opacity-50"
                >
                  {savingPayout ? "Saving..." : "Save Payout Details"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPayout(false)}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Referral list */}
        <div className="mb-6">
          <ReferralActivityList
            referrals={data.referrals}
            title="Your Referrals"
            emptyCta="Share your link above to get your first referral."
          />
        </div>

        {/* Payout history */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="font-bold text-gray-900">Payout History</h3>
          </div>
          {data.payoutHistory.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No payouts released yet.</p>
          ) : (
            <div className="divide-y">
              {data.payoutHistory.map((p) => (
                <div key={p.id} className="px-6 py-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {new Date(p.paidAt).toLocaleDateString("en-NG")}
                  </p>
                  <p className="font-bold text-gray-900">₦{p.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payouts an admin declined, with the reason, so earnings never just vanish */}
        {data.rejectedPayouts?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-red-100 bg-red-50">
              <h3 className="font-bold text-red-700">Payouts not approved</h3>
            </div>
            <div className="divide-y">
              {data.rejectedPayouts.map((p) => (
                <div key={p.id} className="px-6 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600">{new Date(p.rejectedAt).toLocaleDateString("en-NG")}</p>
                    {p.reason && <p className="text-sm text-gray-700 mt-1 break-words">Reason: {p.reason}</p>}
                  </div>
                  <p className="font-bold text-gray-900 shrink-0">₦{p.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <p className="px-6 py-3 text-xs text-gray-500 border-t">
              Think this is a mistake? Reply to the email we sent you and we'll look into it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketerDashboard;