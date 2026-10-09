import React, { useEffect, useState } from "react";
import axiosInstance from "../services/api";

// Shown over the seller dashboard when this seller hasn't accepted the CURRENT
// version of the Seller Terms yet (everyone who registered before the terms
// existed, and everyone again whenever the version in backend
// config/sellerTerms.js is bumped). It stays until they accept. If the status
// check fails for any reason it stays hidden, so a hiccup can't lock anyone out.
const SellerTermsPrompt = () => {
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/api/vendors/me/terms")
      .then((res) => {
        if (!cancelled && res.data?.data?.accepted === false) setNeedsAcceptance(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needsAcceptance) return null;

  const accept = async () => {
    setSaving(true);
    setError("");
    try {
      await axiosInstance.post("/api/vendors/me/terms/accept", { accepted: true });
      setNeedsAcceptance(false);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save your acceptance. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Please review our Seller Terms</h2>
        <p className="mt-2 text-sm text-gray-600">
          We have written down how selling on OJA247 works: customers pay your own bank account directly, you confirm
          each payment, and what may not be sold. Please read them and accept to keep using your dashboard.
        </p>

        <p className="mt-3 text-sm">
          <a href="/vendor-terms" target="_blank" rel="noopener noreferrer" className="text-green-700 underline font-medium">
            Read the Seller Terms
          </a>
          {" · "}
          <a href="/prohibited-items" target="_blank" rel="noopener noreferrer" className="text-green-700 underline font-medium">
            Read the Prohibited Items list
          </a>
        </p>

        <label className="mt-4 flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => setTicked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <span>I have read and accept the Seller Terms and the Prohibited Items list.</span>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={accept}
          disabled={!ticked || saving}
          className="mt-5 w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Accept and continue"}
        </button>
      </div>
    </div>
  );
};

export default SellerTermsPrompt;