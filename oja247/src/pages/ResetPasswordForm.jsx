import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, CheckCircle } from "lucide-react";
import axiosInstance from "../services/api";
import Logo from "../assets/OJA247 VX1.png";

const ENDPOINT_BY_TYPE = {
  marketer: "/api/marketers/reset-password",
  customer: "/api/customer-auth/reset-password",
  vendor: "/api/auth/reset-password",
};
const LOGIN_PATH_BY_TYPE = {
  marketer: "/marketer-login",
  customer: "/account",
  vendor: "/login",
};

const ResetPasswordForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const typeParam = searchParams.get("type");
  const type = ["marketer", "customer"].includes(typeParam) ? typeParam : "vendor";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const endpoint = ENDPOINT_BY_TYPE[type];
  const loginPath = LOGIN_PATH_BY_TYPE[type];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("This reset link is missing its token — please use the link from your email.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await axiosInstance.post(endpoint, { token, password });
      setSuccess(true);
      setTimeout(() => navigate(loginPath), 2000);
    } catch (err) {
      setError(err.response?.data?.message || "This reset link is invalid or has expired.");
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

          {success ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="text-green-600" size={28} />
              </div>
              <h1 className="text-2xl font-black text-gray-900 mb-2">Password reset!</h1>
              <p className="text-gray-600">Taking you to login...</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-black bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent mb-2">
                  Set a new password
                </h1>
                <p className="text-gray-600">Choose a new password for your account.</p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm text-center">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full pl-11 pr-11 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-gray-400"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white font-bold py-3 rounded-xl hover:shadow-lg transition disabled:opacity-60"
                >
                  {loading ? "Resetting..." : "Reset password"}
                </button>
              </form>

              <Link
                to={loginPath}
                className="mt-6 block text-center text-sm text-gray-500 hover:text-gray-700 py-2 -my-2"
              >
                Back to login
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPasswordForm;