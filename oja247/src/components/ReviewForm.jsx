import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import axiosInstance from "../services/api";
import StarRating from "./StarRating";

// Vendors on this order the customer can still review — everyone except
// vendors they've already reviewed (order.reviewedBusinessIds, attached by
// getMyOrders — see services/reviewEligibility.js on the backend).
export function getReviewableVendors(order) {
  const reviewed = new Set(order?.reviewedBusinessIds || []);
  return (order?.vendors || []).filter((v) => v.businessId && !reviewed.has(v.businessId));
}

// Leaves a review for one vendor on one paid order. The backend re-checks
// ownership, order status, and duplicates — this only decides what to offer.
const ReviewForm = ({ order, onDone }) => {
  const vendors = getReviewableVendors(order);
  const [businessId, setBusinessId] = useState(vendors[0]?.businessId || "");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const vendorName = vendors.find((v) => v.businessId === businessId)?.businessName || "the vendor";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!rating) return setError("Tap a star to rate your purchase.");

    setSubmitting(true);
    try {
      await axiosInstance.post("/api/reviews", {
        orderId: order._id,
        businessId,
        rating,
        comment: comment.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't submit your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="mx-auto text-green-500 mb-3" size={44} />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Review posted</h3>
        <p className="text-sm text-gray-600 mb-6">Thanks for letting other buyers know how it went.</p>
        <button
          onClick={() => onDone(true)}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition"
        >
          Done
        </button>
      </div>
    );
  }

  if (vendors.length === 0) {
    return <p className="text-sm text-gray-600">You've already reviewed every vendor on this order.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {vendors.length > 1 && (
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">Which vendor?</label>
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {vendors.map((v) => (
              <option key={v.businessId} value={v.businessId}>
                {v.businessName || "Vendor"}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-2">How was your purchase from {vendorName}?</label>
        <StarRating rating={rating} size={32} interactive onChange={setRating} />
      </div>

      <div>
        <label htmlFor="review-comment" className="block text-sm font-semibold text-gray-800 mb-1.5">
          Add a comment <span className="font-normal text-gray-500">Optional.</span>
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What stood out — quality, delivery, communication?"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
        />
      </div>

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => onDone(false)}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl transition"
        >
          {submitting ? "Posting…" : "Post review"}
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;