import express from "express";
import {
  customerRegister,
  customerLogin,
  customerGoogleAuth,
  customerForgotPassword,
  customerResetPassword,
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

router.get("/me", protect, requireCustomer, getCustomerMe);

export default router;