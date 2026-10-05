import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Phone, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from '../assets/OJA247 VX1.png';
import { renderGoogleButton } from '../utils/googleButton';

// Combined sign-in/create-account page for buyers. Deliberately one page
// with a toggle rather than two separate routes — account creation here
// is meant to be as low-friction as possible (see the phased plan), and
// a single page with a mode switch keeps that fast.
//
// Accepts ?redirect=/some/path so a "create an account to see your order
// history / follow this vendor / leave a review" prompt elsewhere in the
// app can send someone here and land them back where they were, instead
// of just dumping them on their own account page after signing in.
const CustomerAuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const { customerRegister, customerLogin, customerGoogleLogin } = useAuth();

  // ?mode=signup and ?email= / ?fullName= / ?phone= let another page (e.g. the
  // post-payment prompt) open this straight into signup with the buyer's
  // checkout details filled in. Matching email or phone is what links their
  // guest orders to the new account, so prefilling them matters.
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'signin'); // 'signin' | 'signup'
  const [formData, setFormData] = useState({
    email: searchParams.get('email') || '',
    password: '',
    fullName: searchParams.get('fullName') || '',
    phone: searchParams.get('phone') || '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAuthResult = (result) => {
    if (result.success) {
      navigate(redirectTo);
    } else {
      setError(result.message);
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result =
      mode === 'signup'
        ? await customerRegister(formData.email, formData.password, formData.fullName, formData.phone)
        : await customerLogin(formData.email, formData.password);

    handleAuthResult(result);
  };

  const handleGoogleCredential = async (googleResponse) => {
    setError('');
    setLoading(true);
    const result = await customerGoogleLogin(googleResponse.credential);
    handleAuthResult(result);
  };

  // Same polling pattern as LoginPage.jsx — the Google script tag is
  // async/defer in index.html, so it's very likely not loaded yet on
  // first render.
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

      const btnContainer = document.getElementById('customer-google-signin-button');
      if (btnContainer) {
        stopButton = renderGoogleButton(btnContainer, {
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'continue_with',
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
  }, [mode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-yellow-50 flex items-center justify-center px-6 py-12">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute top-20 left-20 w-64 h-64 bg-green-200/30 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], rotate: [90, 0, 90] }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute bottom-20 right-20 w-64 h-64 bg-yellow-200/30 rounded-full blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="backdrop-blur-xl bg-white/80 border border-gray-200/50 rounded-3xl shadow-2xl p-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="flex justify-center mb-6"
          >
            <img src={Logo} alt="OJA247" className="w-28" />
          </motion.div>

          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            {['signin', 'signup'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === m ? 'bg-white shadow text-green-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-black bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent mb-1">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-gray-600 text-sm">
              {mode === 'signin'
                ? 'See your order history, follow vendors, and leave reviews.'
                : "Takes a few seconds — you'll be back to what you were doing right after."}
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Google first — the whole point of offering it is to skip the
              form below, so it leads rather than being an afterthought. */}
          <div id="customer-google-signin-button" className="flex justify-center mb-5" />

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'signup' && (
                <motion.div
                  key="signup-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        required
                        className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/50"
                        placeholder="Your name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Phone <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/50"
                        placeholder="080..."
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/50"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  className="w-full pl-11 pr-11 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {mode === 'signin' && (
              <div className="text-right -mt-1">
                <Link to="/customer-forgot-password" className="text-sm text-green-600 hover:text-green-700 font-medium">
                  Forgot password?
                </Link>
              </div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
              } shadow-lg hover:shadow-xl transition-all`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </>
              )}
            </motion.button>
          </form>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center">
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 transition">
              ← Continue browsing without an account
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default CustomerAuthPage;