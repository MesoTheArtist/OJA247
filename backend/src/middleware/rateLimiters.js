import rateLimit from "express-rate-limit";

// SECURITY: the app had zero rate limiting anywhere before this — every
// login, password-reset, and TOTP-verify endpoint allowed unlimited
// attempts, which is a real brute-force risk (credential stuffing,
// password guessing, 2FA code guessing). These are shared across all the
// auth surfaces (business/admin, marketer, customer) rather than each
// route file rolling its own.

// Login/register/forgot-password — generous enough for a real person who
// mistypes their password a few times, tight enough to make brute-forcing
// impractical. Keyed by IP; a shared office/NAT IP hitting this legitimately
// is a rare edge case worth accepting over leaving this unlimited.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

// TOTP code verification — a 6-digit code has only 1,000,000 possibilities;
// tighter than the general auth limiter since this guards the admin
// account specifically.
export const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

// Image uploads — these endpoints can't require a login token at all (see
// uploadRoutes.js comment: BusinessForm.jsx uploads a logo/banner during
// signup, before an account exists yet), so rate limiting is the main
// abuse control available here, not a substitute for auth.
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many uploads. Please try again in a few minutes." },
});

// A loose baseline across the whole API — not meant to stop targeted
// abuse (the routes above handle that), just a backstop against runaway
// scripts/scrapers hitting any single IP unreasonably hard.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

// Bank details shown at checkout. Public by necessity (a guest has to see
// where to pay), so this just stops someone scraping every vendor's account.
export const paymentDetailsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again in a few minutes." },
});

// Placing a bank-transfer order or re-uploading a receipt.
export const directOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});