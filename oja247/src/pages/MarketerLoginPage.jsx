import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import marketerApi from "../services/marketerApi";
import Logo from "../assets/OJA247 VX1.png";
import { renderGoogleButton } from '../utils/googleButton';

const MarketerLoginPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleLoginSuccess = (data) => {
    localStorage.setItem("marketerToken", data.token);
    navigate("/marketer-dashboard");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await marketerApi.post("/api/marketers/login", formData);
      handleLoginSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please check your details.");
    } finally {
      setLoading(false);
    }
  };

  // Called by Google's SDK with { credential: <ID token JWT> } once the
  // person picks an account in the Google popup/One Tap prompt. Auto-creates
  // a marketer account on first click (see backend marketerGoogleAuth).
  const handleGoogleCredential = async (googleResponse) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await marketerApi.post("/api/marketers/google", {
        credential: googleResponse.credential,
      });
      handleLoginSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  // Same polling pattern as LoginPage.jsx / CustomerAuthPage.jsx — the
  // Google script tag is async/defer in index.html, so it's very likely not
  // loaded yet on first render.
  useEffect(() => {
    let intervalId;
    let stopButton = () => {};
    let attempts = 0;
    const maxAttempts = 40; // ~10s at 250ms

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

      const btnContainer = document.getElementById("marketer-google-signin-button");
      if (btnContainer) {
        stopButton = renderGoogleButton(btnContainer, {
          theme: "outline",
          size: "large",
          text: "continue_with",
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

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-8">
          <div className="flex justify-center mb-6">
            <img src={Logo} alt="OJA247" className="w-28" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent">
            Marketer Login
          </h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Google renders its own button into this container once the SDK
              script loads (see the useEffect above) — it's not a regular
              React-controlled button, Google owns its DOM/styling. */}
          <div id="marketer-google-signin-button" className="flex justify-center mb-5" />

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full p-3 pr-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-11 min-h-11 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="text-right mt-2">
                <Link to="/marketer-forgot-password" className="text-sm text-green-600 hover:text-green-700 font-medium inline-block min-h-11 py-3 -my-3">
                  Forgot password?
                </Link>
              </div>
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
              {loading ? "Logging in..." : "Log In"}
            </button>

            <div className="text-center pt-4 border-t">
              <p className="text-xs sm:text-sm text-gray-600">
                Not a marketer yet?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/register-marketer")}
                  className="min-h-11 -my-3 text-green-600 font-semibold hover:text-green-700"
                >
                  Register here
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MarketerLoginPage;