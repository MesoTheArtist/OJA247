import dns from "node:dns";
import dotenv from "dotenv";
dotenv.config();

if (process.env.NODE_ENV !== "production") {
  // Local networks sometimes fail to resolve MongoDB Atlas's SRV records —
  // not needed (and can add latency) on Vercel's own network, so this only
  // runs in local dev.
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./src/db.js";
import businessRoutes from "./src/routes/businessRoutes.js";
import productRoutes from "./src/routes/productRoutes.js";
import uploadRoutes from "./src/routes/uploadRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import orderRoutes from "./src/routes/orderRoutes.js";
import vendorRoutes from "./src/routes/vendorRoutes.js";
import marketerRoutes from "./src/routes/marketerRoutes.js";
import subscriptionRoutes from "./src/routes/subscriptionRoutes.js";
import cronRoutes from "./src/routes/cronRoutes.js";
import unsubscribeRoutes from "./src/routes/unsubscribeRoutes.js";
import disputeRoutes from "./src/routes/disputeRoutes.js";
import customerAuthRoutes from "./src/routes/customerAuthRoutes.js";
import followRoutes from "./src/routes/followRoutes.js";
import reviewRoutes from "./src/routes/reviewRoutes.js";
import { verifyEmailTransporter } from "./src/services/emailService.js";
import { generalLimiter } from "./src/middleware/rateLimiters.js";
import { addCsrfResponseHeader } from "./src/middleware/sessionCookies.js";

console.log("=== Environment Variables Check ===");
console.log("CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME);
console.log(
  "CLOUDINARY_API_SECRET:",
  process.env.CLOUDINARY_API_SECRET ? "EXISTS" : "MISSING"
);
console.log("===================================");

const app = express();

// Vercel puts one proxy in front of the app. Without this, Express sees every
// visitor as the same address (the proxy's), so every rate limiter would share
// ONE bucket across all customers, and express-rate-limit logs the
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning. Trusting exactly one hop makes
// req.ip the real visitor's IP, from the X-Forwarded-For header Vercel sets.
app.set("trust proxy", 1);

// SECURITY: sets standard protective headers (X-Content-Type-Options,
// X-Frame-Options, a conservative default CSP, etc.) — the app had none
// of this before. crossOriginResourcePolicy is relaxed to "cross-origin"
// since images/assets here are legitimately loaded from other origins
// (the frontend on a different domain, Cloudinary-hosted images).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS configuration for production
const configuredFrontendOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedFrontendOrigins = new Set([
  "https://oja247.store",
  "https://www.oja247.store",
  "https://oja247.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...configuredFrontendOrigins,
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedFrontendOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ["X-CSRF-Token"],
  })
);

app.use((req, res, next) => {
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const origin = req.headers.origin;
  if (unsafeMethod && origin && !allowedFrontendOrigins.has(origin)) {
    console.warn(`Blocked request from unconfigured frontend origin: ${origin}`);
    return res.status(403).json({ message: `Origin is not allowed: ${origin}` });
  }
  return next();
});
app.use(addCsrfResponseHeader);

// Increased body size limit (default is 100kb, bumped up for image/file payloads)
// The `verify` callback stashes the raw bytes on req.rawBody — needed to check
// Paystack's webhook signature, since HMAC must run over the exact raw body,
// not the parsed/re-stringified JSON.
app.use(
  express.json({
    limit: "25mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// SECURITY: loose baseline rate limit across the whole API — not meant to
// stop targeted abuse (specific routes like login/upload have their own
// tighter limiters for that), just a backstop against a runaway script or
// scraper hitting any single IP unreasonably hard. 500 req/15min is well
// above legitimate Paystack webhook or Vercel Cron traffic.
app.use(generalLimiter);

// Health check route
app.get("/", (req, res) => {
  res.json({
    message: "OJA247 API is running",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/businesses", businessRoutes);
app.use("/api/products", productRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/marketers", marketerRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/unsubscribe", unsubscribeRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/customer-auth", customerAuthRoutes);
app.use("/api/follows", followRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/reviews", reviewRoutes);

// Awaited at module load — on a cold start this holds the response until
// Mongo is ready instead of letting requests race ahead of the connection.
// Cached in db.js, so warm invocations skip straight past this.
await connectDB();

// Not awaited — this only logs (see verifyEmailTransporter's comment for
// why it exists), so it shouldn't hold up request handling the way Mongo
// readiness does above.
verifyEmailTransporter();

// Only run server locally
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export for Vercel
export default app;