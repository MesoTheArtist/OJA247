import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from '../assets/OJA247 VX1.png';
import { renderGoogleButton } from '../utils/googleButton';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, googleLogin, getTotpSetupQr, completeTotpSetup, verifyTotpLogin } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // TOTP step — null means still on the normal email/password form.
  // 'setup' = first-ever admin login, needs to scan a QR code.
  // 'verify' = admin already has 2FA enabled, just needs a code.
  const [totpStep, setTotpStep] = useState(null);
  const [preAuthToken, setPreAuthToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [manualEntryKey, setManualEntryKey] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState('');

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // Shared by both password login (handleSubmit) and Google Sign-In
  // (handleGoogleCredential) — same TOTP branching, same navigation.
  const handleLoginResult = async (result) => {
    if (result.success) {
      if (result.requiresTotpSetup) {
        setPreAuthToken(result.preAuthToken);
        setLoading(false);
        const qr = await getTotpSetupQr(result.preAuthToken);
        if (qr.success) {
          setQrCodeDataUrl(qr.qrCodeDataUrl);
          setManualEntryKey(qr.manualEntryKey);
          setTotpStep('setup');
        } else {
          setError(qr.message);
        }
        return;
      }
      if (result.requiresTotpCode) {
        setPreAuthToken(result.preAuthToken);
        setTotpStep('verify');
        setLoading(false);
        return;
      }
      if (result.user?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate(`/dashboard/${result.business._id}`);
      }
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(formData.email, formData.password);
    await handleLoginResult(result);
  };

  // Called by Google's SDK with { credential: <ID token JWT> } once the
  // person picks an account in the Google popup/One Tap prompt.
  const handleGoogleCredential = async (googleResponse) => {
    setError('');
    setLoading(true);
    const result = await googleLogin(googleResponse.credential);
    await handleLoginResult(result);
  };

  useEffect(() => {
    // The script tag in index.html is async/defer, so it's very likely
    // NOT loaded yet by the time this effect first runs on mount — a
    // single check-and-bail (the previous version of this code) would
    // silently never render the button in that common case. Poll briefly
    // instead, stop as soon as it's ready.
    let intervalId;
    let stopButton = () => {};
    let attempts = 0;
    const maxAttempts = 40; // ~10s at 250ms — generous for a slow connection

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

      const btnContainer = document.getElementById('google-signin-button');
      if (btnContainer) {
        stopButton = renderGoogleButton(btnContainer, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
        });
      }
    };

    tryRender(); // in case it's already loaded (e.g. fast connection, cached script)
    intervalId = setInterval(tryRender, 250);

    return () => {
      clearInterval(intervalId);
      stopButton();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTotpSubmit = async (e) => {
    e.preventDefault();
    setTotpError('');
    setTotpLoading(true);

    const result =
      totpStep === 'setup'
        ? await completeTotpSetup(preAuthToken, totpCode)
        : await verifyTotpLogin(preAuthToken, totpCode);

    if (result.success) {
      navigate('/admin');
    } else {
      setTotpError(result.message);
    }

    setTotpLoading(false);
  };

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
            className="flex justify-center mb-8"
          >
            <img src={Logo} alt="OJA247" className="w-32" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-8"
          >
            {totpStep ? (
              <>
                <h1 className="text-3xl font-black bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent mb-2">
                  {totpStep === 'setup' ? 'Set up 2FA' : 'Enter your code'}
                </h1>
                <p className="text-gray-600">
                  {totpStep === 'setup'
                    ? 'Admin accounts require an authenticator app — scan the code below to get started.'
                    : 'Open your authenticator app and enter the 6-digit code.'}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-black bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent mb-2">
                  Welcome Back!
                </h1>
                <p className="text-gray-600">Login to manage your business</p>
              </>
            )}
          </motion.div>

          {totpStep ? (
            <>
              {totpError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm"
                >
                  {totpError}
                </motion.div>
              )}

              <form onSubmit={handleTotpSubmit} className="space-y-6">
                {totpStep === 'setup' && (
                  <div className="flex flex-col items-center gap-3">
                    {qrCodeDataUrl && (
                      <img
                        src={qrCodeDataUrl}
                        alt="Scan with your authenticator app"
                        className="w-48 h-48 rounded-xl border border-gray-200 p-2 bg-white"
                      />
                    )}
                    <p className="text-xs text-gray-500 text-center">
                      Can't scan? Enter this key manually in your authenticator app:
                    </p>
                    <code className="text-xs font-mono bg-gray-100 px-3 py-1.5 rounded-lg break-all text-center">
                      {manualEntryKey}
                    </code>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    6-digit code
                  </label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      required
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/50 backdrop-blur-sm tracking-[0.3em] text-center font-mono text-lg"
                      placeholder="000000"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={totpLoading || totpCode.length !== 6}
                  className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 ${
                    totpLoading || totpCode.length !== 6
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
                  } shadow-lg hover:shadow-xl transition-all`}
                >
                  {totpLoading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck size={20} />
                      {totpStep === 'setup' ? 'Confirm & finish setup' : 'Verify'}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTotpStep(null);
                    setTotpCode('');
                    setTotpError('');
                  }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 transition"
                >
                  ← Back to login
                </button>
              </form>
            </>
          ) : (
            <>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/50 backdrop-blur-sm"
                  placeholder="your@email.com"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/50 backdrop-blur-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </motion.div>

            <div className="text-right -mt-2">
              <Link to="/forgot-password" className="text-sm text-green-600 hover:text-green-700 font-medium">
                Forgot password?
              </Link>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
              } shadow-lg hover:shadow-xl transition-all`}
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  Login to Dashboard
                </>
              )}
            </motion.button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Google renders its own button into this container once the
              SDK script loads (see the useEffect above) — it's not a
              regular React-controlled button, Google owns its DOM/styling. */}
          <div id="google-signin-button" className="flex justify-center" />
            </>

          )}

          {!totpStep && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-6 text-center"
              >
                <p className="text-gray-600">
                  Don't have an account?{' '}
                  <Link
                    to="/business-form"
                    className="text-green-600 font-semibold hover:text-green-700 transition"
                  >
                    Register your business
                  </Link>
                  {' '}or{' '}
                  <Link
                    to="/register-marketer"
                    className="text-green-600 font-semibold hover:text-green-700 transition"
                  >
                    register as a marketer
                  </Link>
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-4 text-center"
              >
                <Link
                  to="/"
                  className="text-sm text-gray-500 hover:text-gray-700 transition"
                >
                  ← Back to Home
                </Link>
              </motion.div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;