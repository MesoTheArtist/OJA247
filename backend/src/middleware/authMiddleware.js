import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { hasValidCsrfToken, readCookie, USER_SESSION_COOKIE } from "./sessionCookies.js";

export const protect = async (req, res, next) => {
  try {
    const bearerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    const cookieToken = readCookie(req, USER_SESSION_COOKIE);
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }
    if (!bearerToken && !hasValidCsrfToken(req)) {
      return res.status(403).json({ message: "CSRF token missing or invalid" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // A pre-auth token issued mid-way through admin TOTP login must never
    // work as a real session token — only requireTotpPendingToken accepts it.
    if (decoded.purpose === "totp_pending") {
      return res.status(401).json({ message: "2FA verification required" });
    }

    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (decoded.authVersion !== req.user.authVersion) {
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }

    if (req.user.banned) {
      return res.status(403).json({ message: "Account has been banned" });
    }

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

// Only accepts the short-lived pre-auth token issued after password
// verification but before TOTP is confirmed (see authController.js
// login/totpSetupInit/totpSetupVerify/totpVerifyLogin). Deliberately
// separate from protect() — a pre-auth token must never grant access to
// any normal route, only to finishing the TOTP step it was issued for.
export const requireTotpPendingToken = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.purpose !== "totp_pending") {
      return res.status(401).json({ message: "Invalid token for this step" });
    }

    req.user = await User.findById(decoded.id).select("+totpSecret");

    if (!req.user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (decoded.authVersion !== req.user.authVersion) {
      return res.status(401).json({ message: "Pre-auth session expired. Please sign in again." });
    }

    if (req.user.role !== "admin") {
      // TOTP is admin-only — nothing else should ever hold this token type.
      return res.status(403).json({ message: "Not authorized" });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: "2FA session expired, please log in again" });
  }
};

// Check if user owns the business
export const checkBusinessOwnership = async (req, res, next) => {
  try {
    // Admin can access/manage any business
    if (req.user.role === "admin") {
      return next();
    }

    const businessId = req.params.id;

    if (!req.user.businessId || req.user.businessId.toString() !== businessId) {
      return res.status(403).json({ message: "Not authorized to access this business" });
    }

    next();
  } catch (error) {
    console.error("Ownership check error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Gate for customer-only routes (order history, follow, reviews — Phase
// 2/4/5). protect() runs first and already rejects anything with no valid
// token; this just narrows it to customer-role accounts specifically, the
// same way requireAdmin narrows to admin.
export const requireCustomer = (req, res, next) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Customer account required" });
  }
  next();
};