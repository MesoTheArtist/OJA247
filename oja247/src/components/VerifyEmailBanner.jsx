import React, { useState } from "react";
import { MailCheck } from "lucide-react";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";

// Shown to a signed-in customer whose email isn't confirmed yet. Confirming
// is what attaches their past guest orders (see the backend's orderLinking
// service), so it says that rather than just "verify your email".
const VerifyEmailBanner = () => {
  const { isCustomer, user } = useAuth();
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  if (!isCustomer || !user || user.emailVerified) return null;

  const resend = async () => {
    setStatus("sending");
    setMessage("");
    try {
      await axiosInstance.post("/api/customer-auth/resend-verification");
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.message || "Couldn't send the email. Please try again.");
    }
  };

  return (
    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl flex items-start gap-3">
      <MailCheck className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">Confirm your email to see your past orders</p>
        <p className="text-sm text-gray-600 mt-0.5">
          {status === "sent"
            ? `We sent a new link to ${user.email}. Check your inbox and spam folder.`
            : `We emailed a link to ${user.email}. Orders you placed as a guest appear here once it's confirmed.`}
        </p>
        {status === "error" && <p className="text-sm text-red-600 mt-1">{message}</p>}
        {status !== "sent" && (
          <button
            onClick={resend}
            disabled={status === "sending"}
            className="mt-2 text-sm font-semibold text-green-700 hover:text-green-800 disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : "Resend email"}
          </button>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailBanner;