import jwt from "jsonwebtoken";

// Signed, expiring tokens for the "I've received it" link in delivery emails.
// Guest checkout means many customers have no account to log in with, so the
// emailed link IS their proof. The claim names (ref/bid/p) deliberately avoid
// `id`, which is what the login middleware reads — so one of these can never
// be mistaken for a login token.
const RECEIPT_TOKEN_DAYS = 90;

export function signReceiptToken(orderReference, businessId) {
  return jwt.sign({ p: "receipt", ref: String(orderReference), bid: String(businessId) }, process.env.JWT_SECRET, {
    expiresIn: `${RECEIPT_TOKEN_DAYS}d`,
  });
}

export function verifyReceiptToken(token) {
  try {
    const decoded = jwt.verify(String(token || ""), process.env.JWT_SECRET);
    if (decoded.p !== "receipt" || !decoded.ref || !decoded.bid) return null;
    return { orderReference: decoded.ref, businessId: decoded.bid };
  } catch {
    return null;
  }
}