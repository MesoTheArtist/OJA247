import express from "express";
import { createReview, getBusinessReviews, replyToReview } from "../controllers/reviewController.js";
import { protect, requireCustomer } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public — reviews are storefront content.
router.get("/business/:businessId", getBusinessReviews);

router.post("/", protect, requireCustomer, createReview);

// Vendor (or admin) reply — ownership checked inline in the controller,
// same pattern as disputeRoutes.js's resolve endpoint.
router.patch("/:id/reply", protect, replyToReview);

export default router;