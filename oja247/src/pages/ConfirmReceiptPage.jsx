import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, PackageCheck } from "lucide-react";
import axiosInstance from "../services/api";

// Landing page for the "I've received it" button in delivery emails. Guest
// checkout means many customers have no login, so the signed token in the
// link is the proof. The page only LOOKS at the order on load and waits for
// a click to confirm — mail scanners that pre-open links can't confirm
// delivery by accident.
const ConfirmReceiptPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState(token ? "loading" : "error"); // loading | ready | submitting | done | error
  const [info, setInfo] = useState(null);
  const [message, setMessage] = useState(token ? "" : "This link is missing its token.");

  useEffect(() => {
    document.title = "Confirm delivery | OJA247";
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await axiosInstance.get("/api/orders/receipt-info", { params: { token } });
        setInfo(res.data);
        setState(res.data.status === "received" ? "done" : "ready");
      } catch (err) {
        setMessage(err.response?.data?.message || "This link is invalid or has expired.");
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    try {
      await axiosInstance.post("/api/orders/confirm-receipt", { token });
      setState("done");
    } catch (err) {
      setMessage(err.response?.data?.message || "Something went wrong. Please try again.");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-yellow-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-xl p-6 sm:p-8 text-center">
        {state === "loading" && (
          <>
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Loading your order…</p>
          </>
        )}

        {(state === "ready" || state === "submitting") && info && (
          <>
            <PackageCheck className="mx-auto text-green-500 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">Did your order arrive?</h1>
            <p className="text-gray-600 mb-6 break-words">
              Order <strong>{info.orderReference}</strong> from <strong>{info.businessName}</strong>.
              Confirm once it's with you.
            </p>
            <button
              onClick={confirm}
              disabled={state === "submitting"}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl transition"
            >
              {state === "submitting" ? "Confirming…" : "Yes, I've received it"}
            </button>
            <p className="text-sm text-gray-500 mt-5">
              Something wrong with it?{" "}
              <Link to={`/report-problem?reference=${encodeURIComponent(info.orderReference)}`} className="text-green-700 font-semibold">
                Report a problem
              </Link>
            </p>
          </>
        )}

        {state === "done" && (
          <>
            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">Thanks, that's confirmed</h1>
            <p className="text-gray-600 mb-6">The order is marked as received.</p>
            <Link to="/explore" className="inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition">
              Keep shopping
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="mx-auto text-red-400 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">We couldn't confirm that</h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <Link to="/orders" className="text-green-700 font-semibold">
              Go to my orders
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default ConfirmReceiptPage;