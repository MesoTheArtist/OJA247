import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import StarRating from "./StarRating";

// Public reviews list for a storefront, plus the "write a review" nudge —
// this is Phase 3's reviews wall-prompt. Leaving a review needs a specific
// paid order (verified-purchase gate on the backend), so unlike Follow this
// can't happen inline here: a guest is sent to sign in/create an account
// (same ?redirect pattern as Follow), and a signed-in customer is sent to
// their order history to pick which order to review from.
const ReviewsSection = ({ business }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isCustomer } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business?._id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get(`/api/reviews/business/${business._id}`, { params: { page } });
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
  }, [business?._id, page]);

  const handleWriteReview = () => {
    if (!isAuthenticated || !isCustomer) {
      navigate(`/account?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    navigate("/orders");
  };

  return (
    <section className="mt-14">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Reviews</h2>
          {typeof business.rating === "number" ? (
            <div className="flex items-center gap-2 mt-1">
              <StarRating rating={business.rating} />
              <span className="text-sm text-gray-500">
                {business.rating.toFixed(1)} · {business.reviewCount} review{business.reviewCount === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-1">No reviews yet</p>
          )}
        </div>
        <button
          onClick={handleWriteReview}
          className="flex items-center gap-1.5 px-4 py-2 min-h-11 text-sm font-semibold text-green-700 border border-green-200 rounded-xl hover:bg-green-50 transition"
        >
          <MessageSquare size={15} /> Write a review
        </button>
      </div>

      {loading && page === 1 ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          No reviews yet. Buyers can review this vendor after a purchase.
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review._id} className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{review.customerName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StarRating rating={review.rating} size={13} />
                    <span className="text-xs text-gray-400">
                      {new Date(review.createdAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>
              {review.comment && <p className="text-sm text-gray-700 mt-3">{review.comment}</p>}

              {review.vendorReply?.note && (
                <div className="mt-4 ml-4 pl-4 border-l-2 border-green-100">
                  <p className="text-xs font-semibold text-green-700 mb-1">Reply from {business.name}</p>
                  <p className="text-sm text-gray-600">{review.vendorReply.note}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && page < pages && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="mt-4 w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
        >
          Show more reviews
        </button>
      )}
    </section>
  );
};

export default ReviewsSection;