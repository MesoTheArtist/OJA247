import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, ChevronRight, ShoppingBag, LifeBuoy, Star } from "lucide-react";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import DisputeModal from "../components/DisputeModal";
import ReviewModal from "../components/ReviewModal";
import VerifyEmailBanner from "../components/VerifyEmailBanner";
import { getDisputeEligibility } from "../utils/disputes";
import { getReviewableVendors } from "../components/ReviewForm";
import { REVIEWABLE_ORDER_STATUSES } from "../utils/reviews";

const STATUS_STYLES = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
  disputed: "bg-orange-100 text-orange-700",
  refunded: "bg-blue-100 text-blue-700",
};

const STATUS_LABELS = {
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
  cancelled: "Cancelled",
  disputed: "Under review",
  refunded: "Refunded",
};

// Order history for a logged-in customer. requireCustomer on the route
// (see App.jsx) already gates this — no separate "is a customer" check
// needed here, just redirect to sign-in if somehow not authenticated at
// all (e.g. token expired while this tab was open).
const OrderHistoryPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isCustomer, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disputeOrder, setDisputeOrder] = useState(null);
  const [reviewOrder, setReviewOrder] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !isCustomer) {
      navigate("/account?redirect=/orders");
      return;
    }
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, isCustomer]);

  const fetchOrders = async () => {
    try {
      const res = await axiosInstance.get("/api/orders/my-orders");
      setOrders(res.data || []);
    } catch (err) {
      console.error("Failed to load order history", err);
      setError("Couldn't load your orders. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // filed=true means a dispute went through. Refetch rather than patch the
  // order locally: which vendors are still disputable changes too.
  const handleDisputeClose = (filed) => {
    setDisputeOrder(null);
    if (filed) fetchOrders();
  };

  const handleReviewClose = (posted) => {
    setReviewOrder(null);
    if (posted) fetchOrders();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white px-4 sm:px-6 pt-28 pb-16">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">My Orders</h1>
          <p className="text-gray-600">Every order you've placed while signed in — or that matches this email.</p>
        </motion.div>

        <VerifyEmailBanner />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
        )}

        {!error && orders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 backdrop-blur-xl bg-white/70 border border-gray-200/50 rounded-3xl"
          >
            <ShoppingBag className="mx-auto text-gray-300 mb-4" size={48} />
            <h2 className="text-xl font-bold text-gray-900 mb-2">No orders yet</h2>
            <p className="text-gray-500 mb-6">
              Orders you place — including ones from before you signed up, once your email is confirmed — will show
              up here.
            </p>
            <button
              onClick={() => navigate("/explore")}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition"
            >
              Start shopping
            </button>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, i) => {
              const vendorNames = (order.vendors || []).map((v) => v.businessName).filter(Boolean).join(", ");
              const itemCount = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

              return (
                <motion.div
                  key={order._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="backdrop-blur-xl bg-white/70 border border-gray-200/50 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-yellow-100 flex items-center justify-center flex-shrink-0">
                        <Package className="text-green-600" size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{vendorNames || "OJA247 order"}</p>
                        <p className="text-sm text-gray-500">
                          {itemCount} item{itemCount === 1 ? "" : "s"} · {order.reference}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(order.createdAt).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                          STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="font-black text-gray-900">
                        ₦{Number(order.total || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <button
                      onClick={() => navigate(`/payment-status?reference=${order.reference}`)}
                      className="flex items-center gap-1 text-sm font-semibold text-green-600 hover:text-green-700 transition"
                    >
                      View details <ChevronRight size={16} />
                    </button>
                    <div className="flex items-center gap-4">
                      {REVIEWABLE_ORDER_STATUSES.includes(order.status) &&
                        getReviewableVendors(order).length > 0 && (
                          <button
                            onClick={() => setReviewOrder(order)}
                            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-green-600 transition"
                          >
                            <Star size={15} /> Leave a review
                          </button>
                        )}
                      {getDisputeEligibility(order).eligible && (
                        <button
                          onClick={() => setDisputeOrder(order)}
                          className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-orange-600 transition"
                        >
                          <LifeBuoy size={15} /> Report a problem
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {disputeOrder && (
        <DisputeModal order={disputeOrder} email={disputeOrder.customer?.email} onClose={handleDisputeClose} />
      )}
      {reviewOrder && <ReviewModal order={reviewOrder} onClose={handleReviewClose} />}
    </div>
  );
};

export default OrderHistoryPage;