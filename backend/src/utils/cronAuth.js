import crypto from "crypto";

// True only if the request carries "Authorization: Bearer <CRON_SECRET>".
// Fails closed when CRON_SECRET is not set. Compares in constant time so the
// secret can't be worked out by timing how fast wrong guesses are rejected.
export function isValidCronRequest(headerValue) {
  const secret = process.env.CRON_SECRET;
  if (!secret || typeof headerValue !== "string") return false;
  const given = crypto.createHash("sha256").update(headerValue).digest();
  const expected = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  return crypto.timingSafeEqual(given, expected);
}