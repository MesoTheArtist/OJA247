import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";

// Landing page for the link in the confirmation email. Works whether or not
// the person is signed in on this device — the token is the proof — and
// refreshes the signed-in user afterwards so the "confirm your email" banner
// goes away without a reload.
const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const { isCustomer, refreshUser } = useAuth();
  const [state, setState] = useState(token ? "loading" : "error"); // loading | success | error
  const [linkedOrders, setLinkedOrders] = useState(0);
  const [message, setMessage] = useState(token ? "" : "This confirmation link is missing its token.");
  const ranRef = useRef(false);

  useEffect(() => {
    document.title = "Confirm your email | OJA247";
  }, []);

  useEffect(() => {
    // The token is single-use, so guard against effects running twice
    // (React StrictMode in dev) — the second call would report "invalid".
    if (!token || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const res = await axiosInstance.post("/api/customer-auth/verify-email", { token });
        setLinkedOrders(res.data.linkedOrders || 0);
        setState("success");
        if (isCustomer) refreshUser();
      } catch (err) {
        setMessage(err.response?.data?.message || "Something went wrong confirming your email. Please try again.");
        setState("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-yellow-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-xl p-8 text-center">
        {state === "loading" && (
          <>
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Confirming your email…</p>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">Email confirmed</h1>
            <p className="text-gray-600 mb-6">
              {linkedOrders > 0
                ? `We've added ${linkedOrders} past order${linkedOrders === 1 ? "" : "s"} to your account.`
                : "Any orders you place with this email will show up in your account."}
            </p>
            <button
              onClick={() => navigate(isCustomer ? "/orders" : "/account?redirect=/orders")}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition"
            >
              {isCustomer ? "View my orders" : "Sign in to see your orders"}
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="mx-auto text-gray-400 mb-4" size={48} />
            <h1 className="text-2xl font-black text-gray-900 mb-2">Couldn't confirm your email</h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <p className="text-sm text-gray-500">
              Sign in and use <span className="font-semibold">Resend email</span> on your orders page to get a new
              link, or{" "}
              <Link to="/account?redirect=/orders" className="font-semibold text-green-600 hover:text-green-700">
                sign in
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;