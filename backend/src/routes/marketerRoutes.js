import express from "express";
import {
  registerMarketer,
  loginMarketer,
  marketerGoogleAuth,
  getMarketerMe,
  forgotMarketerPassword,
  resetMarketerPassword,
} from "../controllers/marketerAuthController.js";
import {
  getMarketerDashboard,
  updateMarketerPayoutDetails,
  requestMarketerWithdrawal,
  updateMarketerReferralCode,
} from "../controllers/marketerController.js";
import { protectMarketer } from "../middleware/marketerAuthMiddleware.js";
import { authLimiter, withdrawalLimiter, bankChangeLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/register", authLimiter, registerMarketer);
router.post("/login", authLimiter, loginMarketer);
router.post("/google", authLimiter, marketerGoogleAuth);
router.post("/forgot-password", authLimiter, forgotMarketerPassword);
router.post("/reset-password", authLimiter, resetMarketerPassword);
router.get("/me", protectMarketer, getMarketerMe);
router.get("/dashboard", protectMarketer, getMarketerDashboard);
router.patch("/me/payout-details", protectMarketer, bankChangeLimiter, updateMarketerPayoutDetails);
router.post("/withdraw", protectMarketer, withdrawalLimiter, requestMarketerWithdrawal);
router.patch("/me/referral-code", protectMarketer, updateMarketerReferralCode);

export default router;