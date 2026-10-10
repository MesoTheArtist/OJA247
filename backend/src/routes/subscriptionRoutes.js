import express from "express";
import {
  getSubscriptionPlans,
  initiateSubscription,
  verifySubscriptionPayment,
  handleSubscriptionWebhook,
  cancelSubscriptionAutoRenew,
} from "../controllers/subscriptionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/plans", getSubscriptionPlans);
router.post("/initiate", protect, initiateSubscription);
router.post("/verify/:reference", protect, verifySubscriptionPayment);
router.post("/auto-renew/cancel", protect, cancelSubscriptionAutoRenew);
// Paystack calls this directly — no auth middleware, verified via signature instead
router.post("/webhook", handleSubscriptionWebhook);

export default router;
