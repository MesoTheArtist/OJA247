import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import axiosInstance from "../services/marketerApi";
import Logo from "../assets/OJA247 VX1.png";
import { renderGoogleButton } from '../utils/googleButton';

const MarketerRegisterForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleSuccess = (data) => {
    localStorage.setItem("marketerToken", data.token);
    navigate("/marketer-dashboard");
  };

  // Same endpoint as MarketerLoginPage.jsx — marketerGoogleAuth auto-creates
  // on first click, so "register" and "sign in" with Google are the same
  // call either way (see customerAuthController.js for the same pattern).
  const handleGoogleCredential = async (googleResponse) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await axiosInstance.post("/api/marketers/google", {
        credential: googleResponse.credential,
      });
      handleGoogleSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  // Same polling pattern as MarketerLoginPage.jsx.
  useEffect(() => {
    let intervalId;
    let stopButton = () => {};
    let attempts = 0;
    const maxAttempts = 40;

    const tryRender = () => {
      attempts += 1;
      if (!window.google?.accounts?.id) {
        if (attempts >= maxAttempts) clearInterval(intervalId);
        return;
      }
      clearInterval(intervalId);

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });

      const btnContainer = document.getElementById("marketer-register-google-signin-button");
      if (btnContainer) {
        stopButton = renderGoogleButton(btnContainer, {
          theme: "outline",
          size: "large",
          text: "signup_with",
        });
      }
    };

    tryRender();
    intervalId = setInterval(tryRender, 250);

    return () => {
      clearInterval(intervalId);
      stopButton();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match!");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters!");
      return;
    }

    setLoading(true);
    try {
      const response = await axiosInstance.post("/api/marketers/register", {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });

      const { token, marketer } = response.data;
      // Stored under a separate key from the business owner's "token" —
      // marketer sessions are a distinct account type (see marketerAuthMiddleware.js)
      localStorage.setItem("marketerToken", token);

      alert(`You're registered! Your referral code is ${marketer.referralCode}`);
      navigate("/marketer-dashboard");
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-8">
          <div className="flex justify-center mb-6">
            <img src={Logo} alt="OJA247" className="w-28" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2 bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent">
            Become a Marketer
          </h2>
          <p className="text-sm sm:text-base text-gray-600 mb-6">
            Share your referral code, earn from every business you bring on board.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Google first — same reasoning as CustomerAuthPage.jsx: the
              whole point of offering it is to skip the form below. */}
          <div id="marketer-register-google-signin-button" className="flex justify-center mb-5" />

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full p-3 pr-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm Password *
              </label>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
                loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              } shadow-lg`}
            >
              {loading ? "Registering..." : "Register as Marketer"}
            </button>

            <div className="text-center pt-4 border-t">
              <p className="text-xs sm:text-sm text-gray-600">
                Already a marketer?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/marketer-login")}
                  className="text-green-600 font-semibold hover:text-green-700"
                >
                  Log in
                </button>
              </p>
            </div>

            <div className="text-center pt-2">
              <p className="text-xs sm:text-sm text-gray-600">
                Registering a business instead?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/business-form")}
                  className="text-green-600 font-semibold hover:text-green-700"
                >
                  Register your business
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MarketerRegisterForm;