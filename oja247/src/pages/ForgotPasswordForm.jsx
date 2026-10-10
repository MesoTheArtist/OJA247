import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import axiosInstance from "../services/api";
import Logo from "../assets/OJA247 VX1.png";

// Reused for all three account kinds — `type` picks the endpoint and the
// "back to login" link. Same shape as LoginPage.jsx / MarketerLoginPage.jsx
// / CustomerAuthPage.jsx so it looks native next to whichever one sent the
// user here.
const ENDPOINT_BY_TYPE = {
  marketer: "/api/marketers/forgot-password",
  customer: "/api/customer-auth/forgot-password",
  vendor: "/api/auth/forgot-password",
};
const LOGIN_PATH_BY_TYPE = {
  marketer: "/marketer-login",
  customer: "/account",
  vendor: "/login",
};

const ForgotPasswordForm = ({ type }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const endpoint = ENDPOINT_BY_TYPE[type] || ENDPOINT_BY_TYPE.vendor;
  const loginPath = LOGIN_PATH_BY_TYPE[type] || LOGIN_PATH_BY_TYPE.vendor;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await axiosInstance.post(endpoint, { email });
      setSubmitted(true); // always show success, whether or not the email exists
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-yellow-50 flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="backdrop-blur-xl bg-white/80 border border-gray-200/50 rounded-3xl shadow-2xl p-8">
          <div className="flex justify-center mb-8">
            <img src={Logo} alt="OJA247" className="w-32" />
          </div>

          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="text-green-600" size={28} />
              </div>
              <h1 className="text-2xl font-black text-gray-900 mb-2">Check your email</h1>
              <p className="text-gray-600 mb-6">
                If an account exists for <strong>{email}</strong>, a password reset link is on its way. The link
                expires in 1 hour.
              </p>
              <Link to={loginPath} className="text-green-600 font-semibold hover:text-green-700 inline-block min-h-11 py-3 -my-3">
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-black bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent mb-2">
                  Forgot your password?
                </h1>
                <p className="text-gray-600">Enter your email and we'll send you a reset link.</p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm text-center">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white font-bold py-3 rounded-xl hover:shadow-lg transition disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <Link
                to={loginPath}
                className="mt-6 flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 min-h-11 py-3 -my-3"
              >
                <ArrowLeft size={14} /> Back to login
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPasswordForm;