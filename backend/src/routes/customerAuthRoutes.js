import express from "express";
import {
  customerRegister,
  customerLogin,
  customerGoogleAuth,
  customerForgotPassword,
  customerResetPassword,
  customerVerifyEmail,
  customerResendVerification,
  getCustomerMe,
} from "../controllers/customerAuthController.js";
import { protect, requireCustomer } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/register", authLimiter, customerRegister);
router.post("/login", authLimiter, customerLogin);
router.post("/google", authLimiter, customerGoogleAuth);
router.post("/forgot-password", authLimiter, customerForgotPassword);
router.post("/reset-password", authLimiter, customerResetPassword);
router.post("/verify-email", authLimiter, customerVerifyEmail);
router.post("/resend-verification", authLimiter, protect, requireCustomer, customerResendVerification);

router.get("/me", protect, requireCustomer, getCustomerMe);

export default router;