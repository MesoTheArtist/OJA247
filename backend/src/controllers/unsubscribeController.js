import User from "../models/User.js";
import Marketer from "../models/Marketer.js";
import { verifyUnsubscribeToken } from "../services/unsubscribeTokens.js";

const maskEmail = (email = "") => {
  const [local, domain] = String(email).split("@");
  if (!domain) return "";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
};

const modelFor = (kind) => (kind === "marketer" ? Marketer : User);

// GET /api/unsubscribe/info?token=...  — read-only, so link pre-fetching by
// mail scanners can't unsubscribe anyone by accident.
export const getUnsubscribeInfo = async (req, res) => {
  try {
    const parsed = verifyUnsubscribeToken(req.query.token);
    if (!parsed) return res.status(400).json({ message: "This link is invalid." });

    const account = await modelFor(parsed.kind).findById(parsed.uid).select("email marketingOptOut");
    if (!account) return res.status(404).json({ message: "Account not found." });

    res.json({ email: maskEmail(account.email), alreadyOptedOut: account.marketingOptOut === true });
  } catch (error) {
    console.error("Unsubscribe info error:", error);
    res.status(500).json({ message: "Something went wrong." });
  }
};

// POST /api/unsubscribe   body: { token }
export const unsubscribe = async (req, res) => {
  try {
    const parsed = verifyUnsubscribeToken(req.body?.token);
    if (!parsed) return res.status(400).json({ message: "This link is invalid." });

    const account = await modelFor(parsed.kind).findByIdAndUpdate(parsed.uid, { marketingOptOut: true });
    if (!account) return res.status(404).json({ message: "Account not found." });

    res.json({ success: true });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    res.status(500).json({ message: "Something went wrong." });
  }
};