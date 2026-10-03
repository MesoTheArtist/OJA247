import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, MailX } from "lucide-react";
import axiosInstance from "../services/api";

// Landing page for "Unsubscribe from announcements" in OJA247 broadcast
// emails. Looks the account up on load (read-only) and only changes
// anything when the person clicks the button, so link pre-fetching by mail
// scanners can't unsubscribe anyone by accident.
const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState(token ? "loading" : "error"); // loading | ready | submitting | done | error
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(token ? "" : "This link is missing its token.");

  useEffect(() => {
    document.title = "Unsubscribe | OJA247";
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await axiosInstance.get("/api/unsubscribe/info", { params: { token } });
        setEmail(res.data.email);
        setState(res.data.alreadyOptedOut ? "done" : "ready");
      } catch (err) {
        setMessage(err.response?.data?.message || "This link is invalid.");
        setState("error");
      }
    })();
  }, [token]);

  const submit = async () => {
    setState("submitting");
    try {
      await axiosInstance.post("/api/unsubscribe", { token });
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
            <p className="text-gray-600">One moment…</p>
          </>
        )}

        {(state === "ready" || state === "submitting") && (
          <>
            <MailX className="mx-auto text-gray-400 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">Unsubscribe from announcements?</h1>
            <p className="text-gray-600 mb-6 break-all">
              We'll stop sending announcements to <strong>{email}</strong>. You'll still get emails about
              your orders and your account.
            </p>
            <button
              onClick={submit}
              disabled={state === "submitting"}
              className="w-full px-6 py-3 bg-gray-900 hover:bg-black disabled:opacity-60 text-white font-semibold rounded-xl transition"
            >
              {state === "submitting" ? "Unsubscribing…" : "Yes, unsubscribe me"}
            </button>
          </>
        )}

        {state === "done" && (
          <>
            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">You're unsubscribed</h1>
            <p className="text-gray-600 mb-6">You won't get announcements from us any more. Order and account emails will still reach you.</p>
            <Link to="/" className="text-green-700 font-semibold">
              Back to OJA247
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="mx-auto text-red-400 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">That didn't work</h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <Link to="/" className="text-green-700 font-semibold">
              Back to OJA247
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default UnsubscribePage;