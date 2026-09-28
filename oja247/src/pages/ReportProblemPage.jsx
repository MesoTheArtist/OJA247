import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LifeBuoy } from "lucide-react";
import axiosInstance from "../services/api";
import DisputeForm from "../components/DisputeForm";
import { getDisputeEligibility, DISPUTE_WINDOW_DAYS } from "../utils/disputes";

// Guest route for filing a dispute. The bare-reference order endpoint is
// deliberately not enough to act on an order, so this asks for the order
// reference AND the email used at checkout (verified server-side by
// GET /api/orders/lookup) before showing anything. ?reference= prefills
// the first field, e.g. when linked from the payment status page.
const ReportProblemPage = () => {
  const [searchParams] = useSearchParams();
  const [reference, setReference] = useState(searchParams.get("reference") || "");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    document.title = "Report a problem | OJA247";
  }, []);

  const handleLookup = async (e) => {
    e.preventDefault();
    setError("");
    setLooking(true);
    try {
      const res = await axiosInstance.get("/api/orders/lookup", {
        params: { reference: reference.trim(), email: email.trim() },
      });
      setOrder(res.data.order);
    } catch (err) {
      setError(
        err.response?.status === 404
          ? "We couldn't find an order with that reference and email. Check both and try again."
          : "Something went wrong looking up your order. Please try again."
      );
    } finally {
      setLooking(false);
    }
  };

  const eligibility = getDisputeEligibility(order);

  let body;
  if (finished) {
    body = (
      <div className="text-center py-10">
        <p className="text-gray-700 mb-6">You can close this page. We'll email you as your dispute moves along.</p>
        <Link to="/explore" className="text-green-600 font-semibold hover:text-green-700">
          Back to shopping
        </Link>
      </div>
    );
  } else if (!order) {
    body = (
      <form onSubmit={handleLookup} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
        )}
        <div>
          <label htmlFor="rp-ref" className="block text-sm font-semibold text-gray-800 mb-1.5">
            Order reference
          </label>
          <input
            id="rp-ref"
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="rp-email" className="block text-sm font-semibold text-gray-800 mb-1.5">
            Email you used at checkout
          </label>
          <input
            id="rp-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={looking}
          className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl transition"
        >
          {looking ? "Finding your order…" : "Find my order"}
        </button>
      </form>
    );
  } else if (!eligibility.eligible) {
    const windowPassed = Date.now() > new Date(order.createdAt).getTime() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let message;
    if (order.status !== "paid" && order.status !== "disputed") {
      message = `Order ${order.reference} can't be disputed${order.status === "refunded" ? " — it's already marked refunded" : ""}.`;
    } else if (windowPassed) {
      message = `The ${DISPUTE_WINDOW_DAYS}-day window to dispute order ${order.reference} has passed. You can still contact the vendor directly.`;
    } else {
      message = `There's already an open dispute with every vendor on order ${order.reference}. We'll email you as it moves along.`;
    }
    body = <p className="text-gray-700">{message}</p>;
  } else {
    body = (
      <>
        <p className="text-sm text-gray-500 mb-5">
          Order {order.reference} · {eligibility.daysLeft} day{eligibility.daysLeft === 1 ? "" : "s"} left to dispute
        </p>
        <DisputeForm order={order} email={email.trim()} onDone={(filed) => (filed ? setFinished(true) : setOrder(null))} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white px-4 sm:px-6 pt-28 pb-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <LifeBuoy className="text-green-600" size={28} />
          <h1 className="text-3xl font-black text-gray-900">Report a problem</h1>
        </div>
        <p className="text-gray-600 mb-8">
          Something wrong with an order? File a dispute and the vendor gets the first chance to fix it.
        </p>
        <div className="backdrop-blur-xl bg-white/70 border border-gray-200/50 rounded-3xl p-6 shadow-sm">{body}</div>
      </motion.div>
    </div>
  );
};

export default ReportProblemPage;