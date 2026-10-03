import Order from "../models/Order.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import { REVIEWABLE_ORDER_STATUSES } from "../services/reviewEligibility.js";
import { recomputeBusinessRating } from "../services/businessRating.js";
import { sendNewReviewVendorEmail, sendReviewReplyCustomerEmail } from "../services/emailService.js";

async function getOwnerEmail(businessId) {
  const owner = await User.findOne({ businessId }).select("email");
  return owner?.email || null;
}

// POST /api/reviews
// body: { orderId, businessId, rating, comment }
// Verified-purchase gate: the order has to belong to this customer, actually
// include this vendor, and be in a status that proves the purchase went
// through (see REVIEWABLE_ORDER_STATUSES). No time limit on when this can be
// filed — unlike disputes, reviews don't expire.
export const createReview = async (req, res) => {
  try {
    const { orderId, businessId, rating, comment } = req.body;

    if (!orderId || !businessId || !rating) {
      return res.status(400).json({ message: "orderId, businessId, and rating are required" });
    }
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "rating must be a whole number from 1 to 5" });
    }

    const order = await Order.findById(orderId);
    if (!order || order.userId?.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: "No matching order found" });
    }

    if (!REVIEWABLE_ORDER_STATUSES.includes(order.status)) {
      return res.status(400).json({
        message: `This order can't be reviewed yet (status: ${order.status}).`,
      });
    }

    const vendorOnOrder = order.vendors.find((v) => v.businessId === businessId);
    if (!vendorOnOrder) {
      return res.status(400).json({ message: "That business wasn't part of this order" });
    }

    let review;
    try {
      review = await Review.create({
        orderId: order._id,
        orderReference: order.reference,
        businessId,
        businessName: vendorOnOrder.businessName || "",
        customerId: req.user._id,
        customerName: req.user.fullName || order.customer?.fullName || "A customer",
        rating: numericRating,
        comment: comment ? String(comment).trim().slice(0, 2000) : "",
      });
    } catch (error) {
      // Duplicate key = already reviewed this vendor for this order — one
      // review per purchase, not one review is a real 500.
      if (error.code === 11000) {
        return res.status(409).json({ message: "You've already reviewed this vendor for this order." });
      }
      throw error;
    }

    await recomputeBusinessRating(businessId);

    getOwnerEmail(businessId)
      .then((to) =>
        to
          ? sendNewReviewVendorEmail({
              to,
              businessName: vendorOnOrder.businessName || "your store",
              customerName: review.customerName,
              rating: numericRating,
              comment: review.comment,
            })
          : null
      )
      .catch((err) => console.error("New-review vendor email failed:", err));

    res.status(201).json({ review });
  } catch (error) {
    console.error("Create review error:", error);
    res.status(500).json({ message: "Error submitting review" });
  }
};

// GET /api/reviews/business/:businessId
// Public — reviews are storefront content, same visibility as the rating
// they roll up into. Simple offset pagination; review volume per vendor is
// small enough that this doesn't need cursor-based paging yet.
export const getBusinessReviews = async (req, res) => {
  try {
    const { businessId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const [reviews, total] = await Promise.all([
      Review.find({ businessId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Review.countDocuments({ businessId }),
    ]);

    res.json({ reviews, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error("Get business reviews error:", error);
    res.status(500).json({ message: "Error fetching reviews" });
  }
};

// PATCH /api/reviews/:id/reply
// body: { note }
// Vendor's one public reply to a review of their own business. Ownership
// checked inline (matches getDisputesByBusiness's pattern) since this route
// takes :id (the review), not :businessId.
export const replyToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: "note is required" });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (req.user.role !== "admin" && req.user.businessId?.toString() !== review.businessId) {
      return res.status(403).json({ message: "Not authorized to reply to this review" });
    }

    // Only the FIRST reply notifies the customer — editing a reply later
    // shouldn't re-email them every time.
    const isFirstReply = !review.vendorReply?.note;

    review.vendorReply = { note: String(note).trim().slice(0, 2000), respondedAt: new Date() };
    await review.save();

    if (isFirstReply) {
      User.findById(review.customerId)
        .select("email fullName")
        .then((customer) =>
          customer?.email
            ? sendReviewReplyCustomerEmail({
                to: customer.email,
                customerName: customer.fullName || review.customerName,
                businessName: review.businessName,
                note: review.vendorReply.note,
              })
            : null
        )
        .catch((err) => console.error("Review-reply customer email failed:", err));
    }

    res.json({ review });
  } catch (error) {
    console.error("Reply to review error:", error);
    res.status(500).json({ message: "Error saving reply" });
  }
};