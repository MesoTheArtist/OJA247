import express from "express";
import {
  register,
  login,
  googleLogin,
  getMe,
  updatePassword,
  forgotPassword,
  resetPassword,
  totpSetupInit,
  totpSetupVerify,
  totpVerifyLogin,
  logout,
} from "../controllers/authController.js";
import { protect, requireTotpPendingToken } from "../middleware/authMiddleware.js";
import { authLimiter, totpLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// Public routes
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/google", authLimiter, googleLogin);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/logout", logout);

// TOTP steps — use the short-lived pre-auth token issued by /login, not a
// normal session token (see requireTotpPendingToken).
router.post("/totp/setup-init", requireTotpPendingToken, totpSetupInit);
router.post("/totp/setup-verify", totpLimiter, requireTotpPendingToken, totpSetupVerify);
router.post("/totp/verify", totpLimiter, requireTotpPendingToken, totpVerifyLogin);

// Protected routes (require authentication)
router.get("/me", protect, getMe);
router.put("/password", protect, updatePassword);

export default router;