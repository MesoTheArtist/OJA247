import jwt from "jsonwebtoken";
import Marketer from "../models/Marketer.js";
import { hasValidCsrfToken, readCookie, MARKETER_SESSION_COOKIE } from "./sessionCookies.js";

export const protectMarketer = async (req, res, next) => {
  try {
    const bearerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    const cookieToken = readCookie(req, MARKETER_SESSION_COOKIE);
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }
    if (!bearerToken && !hasValidCsrfToken(req)) {
      return res.status(403).json({ message: "CSRF token missing or invalid" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "marketer") {
      return res.status(401).json({ message: "Not authorized for marketer routes" });
    }

    req.marketer = await Marketer.findById(decoded.id).select("-password");

    if (!req.marketer) {
      return res.status(401).json({ message: "Marketer not found" });
    }
    if (decoded.authVersion !== req.marketer.authVersion) {
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }

    if (req.marketer.banned || req.marketer.status === "suspended") {
      return res.status(403).json({ message: "Account is not active" });
    }

    next();
  } catch (error) {
    console.error("Marketer auth middleware error:", error);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};
