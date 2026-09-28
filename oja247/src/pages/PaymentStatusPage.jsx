import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import axiosInstance from "../services/api";
import Loader from "../components/Loader";
import useMinimumLoadingTime from "../hooks/useMinimumLoadingTime";
import Logo from "../assets/OJA247 VX1.png";
import { useAuth } from "../context/AuthContext";

function PaymentStatusPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hidePrompt, setHidePrompt] = useState(false);
  const { isCustomer, loading: authLoading } = useAuth();

  const showLoader = useMinimumLoadingTime(loading);

  const status = searchParams.get("status");
  const reference = searchParams.get("reference");

  useEffect(() => {
    const fetchOrder = async () => {
      if (!reference) {
        setLoading(false);
        return;
      }

      try {
        const response = await axiosInstance.get(`/api/orders/reference/${reference}`);
        setOrder(response.data.order);
      } catch (error) {
        console.error("Error fetching order status", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [reference]);

  const isSuccess = status === "success";

  // Guests (and anyone not signed in as a customer) get offered an account
  // right after paying — the moment they're most likely to want to track the
  // order. Their guest orders link up automatically on signup by matching
  // email/phone, so the checkout details are passed along as prefill.
  const showAccountPrompt = isSuccess && order && !authLoading && !isCustomer && !hidePrompt;
  const signupParams = new URLSearchParams({
    mode: "signup",
    redirect: "/orders",
    email: order?.customer?.email || "",
    fullName: order?.customer?.fullName || "",
    phone: order?.customer?.phone || "",
  }).toString();

  if (showLoader) {
    return <Loader text="Checking your payment status..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-xl w-full"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center mb-6"
        >
          <img src={Logo} alt="OJA247" className="w-24 object-contain" />
        </motion.div>

        <div className="relative bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
          {/* Top accent bar — brand gradient, solid on success, muted on failure */}
          <div
            className={`h-1.5 w-full ${
              isSuccess
                ? "bg-gradient-to-r from-green-600 to-yellow-400"
                : "bg-gray-200"
            }`}
          />

          <div className="p-8 sm:p-10 text-center">
            {/* Status icon with signature ripple motif */}
            <div className="relative flex items-center justify-center h-28 mb-6">
              {isSuccess && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="absolute rounded-full border-2"
                      style={{
                        borderColor: i % 2 === 0 ? "#facc15" : "#16a34a",
                      }}
                      initial={{ width: 0, height: 0, opacity: 0.6 }}
                      animate={{ width: 160, height: 160, opacity: 0 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: 0.6 + i * 0.5,
                      }}
                    />
                  ))}
                </div>
              )}

              <motion.div
                initial={{ scale: 0 }}
                animate={
                  isSuccess
                    ? { scale: 1 }
                    : { scale: 1, x: [0, -6, 6, -4, 4, 0] }
                }
                transition={
                  isSuccess
                    ? { type: "spring", stiffness: 200, damping: 14, delay: 0.2 }
                    : { duration: 0.5, delay: 0.2 }
                }
                className={`relative flex h-20 w-20 items-center justify-center rounded-full ${
                  isSuccess
                    ? "bg-gradient-to-br from-green-500 to-green-600"
                    : "bg-gray-100"
                }`}
              >
                {isSuccess ? (
                  <svg
                    className="w-10 h-10 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <motion.path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-9 h-9 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </motion.div>
            </div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-2xl sm:text-3xl font-black text-gray-900 mb-2"
            >
              {isSuccess ? "Payment received" : "Payment didn't go through"}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-gray-500 mb-6 max-w-sm mx-auto"
            >
              {isSuccess
                ? "Your order is confirmed and the vendor has been notified."
                : "No charge was made. You can try again, or reach out if this keeps happening."}
            </motion.p>

            {reference && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="inline-flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-full px-4 py-2 mb-6"
              >
                <span>Reference</span>
                <span className="font-mono font-semibold text-gray-700">{reference}</span>
              </motion.div>
            )}

            {order && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="rounded-2xl bg-gray-50 border border-gray-100 p-5 text-left mb-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                      Order status
                    </p>
                    <p className="font-bold text-gray-900 capitalize mt-0.5">
                      {order.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                      Total
                    </p>
                    <p className="font-black text-gray-900 mt-0.5">
                      ₦{Number(order.total || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {showAccountPrompt && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="relative rounded-2xl bg-green-50 border border-green-100 p-5 text-left mb-6"
              >
                <button
                  onClick={() => setHidePrompt(true)}
                  aria-label="Dismiss"
                  className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
                <p className="font-bold text-gray-900 mb-1">Save this order to an account</p>
                <p className="text-sm text-gray-600 mb-4 pr-4">
                  Track it and see all your orders in one place. Continue with Google to see this order straight
                  away, or sign up with email and confirm it from your inbox.
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => navigate(`/account?${signupParams}`)}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Create free account
                  </button>
                  <button
                    onClick={() => navigate("/account?redirect=/orders")}
                    className="text-sm font-semibold text-green-700 hover:text-green-800"
                  >
                    Sign in instead
                  </button>
                </div>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate("/products")}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-lg transition-shadow"
              >
                Continue shopping
              </motion.button>

              {!isSuccess && (
                <motion.button
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate("/cart")}
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  Back to cart
                </motion.button>
              )}
            </motion.div>

            {(order?.status === "paid" || order?.status === "disputed") && (
              <p className="text-center text-sm text-gray-500 mt-5">
                Problem with this order?{" "}
                <button
                  onClick={() => navigate(`/report-problem?reference=${encodeURIComponent(order.reference)}`)}
                  className="font-semibold text-green-600 hover:text-green-700"
                >
                  Report it
                </button>
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default PaymentStatusPage;