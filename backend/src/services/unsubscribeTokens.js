import jwt from "jsonwebtoken";

// Token inside the "Unsubscribe from announcements" link. It identifies the
// account (kind = which collection) and nothing else, and no expiry: someone
// opening an old announcement a year later should still be able to opt out.
// Claim names avoid `id` so it can never pass as a login token.
export function signUnsubscribeToken(kind, uid) {
  return jwt.sign({ p: "unsub", k: kind, uid: String(uid) }, process.env.JWT_SECRET);
}

export function verifyUnsubscribeToken(token) {
  try {
    const decoded = jwt.verify(String(token || ""), process.env.JWT_SECRET);
    if (decoded.p !== "unsub" || !["user", "marketer"].includes(decoded.k) || !decoded.uid) return null;
    return { kind: decoded.k, uid: decoded.uid };
  } catch {
    return null;
  }
}