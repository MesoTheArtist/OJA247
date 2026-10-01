import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import axiosInstance from "../services/api";
import StarRating from "./StarRating";

// Vendor's own reviews, with a one-time public reply per review. Reuses the
// public GET /api/reviews/business/:id list (same data a customer sees) —
// nothing here is vendor-private, this is just that same list with a reply
// box attached for the vendor's own storefront.
const VendorReviewsTab = ({ businessId }) => {
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyingId, setReplyingId] = useState(null);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get(`/api/reviews/business/${businessId}`, { params: { page, limit: 20 } });
        if (cancelled) return;
        setReviews((prev) => (page === 1 ? res.data.reviews : [...prev, ...res.data.reviews]));
        setPages(res.data.pages || 1);
      } catch (err) {
        console.error("Error fetching reviews:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId, page]);

  const submitReply = async (reviewId) => {
    const note = (replyDrafts[reviewId] || "").trim();
    if (!note) return;
    setReplyingId(reviewId);
    try {
      const res = await axiosInstance.patch(`/api/reviews/${reviewId}/reply`, { note });
      setReviews((prev) => prev.map((r) => (r._id === reviewId ? res.data.review : r)));
      setReplyDrafts((prev) => ({ ...prev, [reviewId]: "" }));
    } catch (err) {
      console.error("Error replying to review:", err);
    } finally {
      setReplyingId(null);
    }
  };

  if (loading && page === 1) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <Star className="mx-auto text-gray-300 mb-3" size={40} />
        <h3 className="text-lg font-medium text-gray-900">No reviews yet</h3>
        <p className="mt-1 text-sm text-gray-500">Reviews from customers who've bought from you show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <div key={review._id} className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm break-words">{review.customerName}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <StarRating rating={review.rating} size={13} />
                <span className="text-xs text-gray-400 break-all">
                  {new Date(review.createdAt).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · "}
                  {review.orderReference}
                </span>
              </div>
            </div>
          </div>
          {review.comment && <p className="text-sm text-gray-700 mt-3 break-words">{review.comment}</p>}

          {review.vendorReply?.note ? (
            <div className="mt-4 ml-2 sm:ml-4 pl-3 sm:pl-4 border-l-2 border-green-100">
              <p className="text-xs font-semibold text-green-700 mb-1">Your reply</p>
              <p className="text-sm text-gray-600 break-words">{review.vendorReply.note}</p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={replyDrafts[review._id] || ""}
                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [review._id]: e.target.value }))}
                placeholder="Reply publicly to this review…"
                maxLength={2000}
                className="w-full sm:flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                onClick={() => submitReply(review._id)}
                disabled={replyingId === review._id || !(replyDrafts[review._id] || "").trim()}
                className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl transition"
              >
                {replyingId === review._id ? "…" : "Reply"}
              </button>
            </div>
          )}
        </div>
      ))}

      {page < pages && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
        >
          Show more reviews
        </button>
      )}
    </div>
  );
};

export default VendorReviewsTab;