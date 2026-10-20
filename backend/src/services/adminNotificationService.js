import AdminNotification from "../models/AdminNotification.js";
import Marketer from "../models/Marketer.js";
import Business from "../models/Business.js";
import { sendAdminActivityEmail } from "./emailService.js";

// Records something in the admin notification center. Fire-and-forget by
// design: it NEVER throws and callers should not await it in a way that can
// change their own result — a notification problem must never break a
// sign-up, an order, or a payment.
//
//   notifyAdmin({ type, title, message, tab, meta, emailAdmin })
//
// emailAdmin: true also sends the admin a short email (used sparingly, for
// things worth interrupting for, like a new vendor).
export async function notifyAdmin({ type, title, message = "", tab = "overview", meta = {}, emailAdmin = false }) {
  try {
    await AdminNotification.create({
      type,
      title: String(title).slice(0, 200),
      message: String(message).slice(0, 1000),
      tab,
      meta,
    });
  } catch (err) {
    console.error(`Admin notification (${type}) could not be saved:`, err.message);
  }

  if (emailAdmin) {
    try {
      await sendAdminActivityEmail({ title, message, tab });
    } catch (err) {
      console.error(`Admin notification email (${type}) failed:`, err.message);
    }
  }
}

// Turns the referral code someone typed at sign-up into something readable
// for the admin: who owns it, or that it matched nobody. Reports the code
// exactly as typed even when it is wrong, since "they tried code X" is still
// useful to see. Never throws.
export async function describeReferralCode(codeUsed) {
  const typed = String(codeUsed || "").trim();
  if (!typed) return { code: null, valid: false, ownerType: null, ownerName: null };
  const code = typed.toUpperCase();
  try {
    const marketer = await Marketer.findOne({ referralCode: code }).select("name");
    if (marketer) return { code, valid: true, ownerType: "marketer", ownerName: marketer.name };
    const business = await Business.findOne({ referralCode: code }).select("name");
    if (business) return { code, valid: true, ownerType: "business", ownerName: business.name };
  } catch (err) {
    console.error("Referral code lookup for admin notification failed:", err.message);
  }
  return { code, valid: false, ownerType: null, ownerName: null };
}

// One line for the notification text, e.g. "Referral code: MKT-AB12CD (marketer Ada Obi)".
export function referralLine(info) {
  if (!info?.code) return "No referral code used.";
  if (!info.valid) return `Referral code typed: ${info.code} (no match, so no referral was recorded).`;
  return `Referral code: ${info.code} (${info.ownerType} ${info.ownerName}).`;
}