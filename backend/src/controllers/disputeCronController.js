import Dispute, { SELF_RESOLVE_WINDOW_DAYS } from "../models/Dispute.js";
import {
  sendDisputeEscalatedVendorEmail,
  sendDisputeEscalatedCustomerEmail,
  sendDisputeEscalatedAdminEmail,
} from "../services/emailService.js";
import { getOwnerEmail } from "./disputeController.js";

import { isValidCronRequest } from "../utils/cronAuth.js";
// GET /api/cron/dispute-escalation
// Runs daily (see vercel.json). Vendor self-resolve is a hard timeout, not
// a soft expectation — the platform has no way to compel a vendor to
// respond (see the disputes phased plan doc), so any "open" dispute past
// SELF_RESOLVE_WINDOW_DAYS moves itself to "escalated" here rather than
// waiting on someone to notice.
export const runDisputeEscalationCheck = async (req, res) => {
  // SECURITY: was `if (process.env.CRON_SECRET && authHeader !== ...)` —
  // that fails OPEN (skips the check entirely) if CRON_SECRET is ever
  // unset, unlike the safer pattern in payoutBatchController.js/
  // subscriptionExpiryCronController.js which fails CLOSED. Matching that
  // safer pattern here — if the secret is missing, this now always
  // rejects instead of becoming a public, unauthenticated endpoint.
  const authHeader = req.headers.authorization;
  if (!isValidCronRequest(authHeader)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const cutoff = new Date(Date.now() - SELF_RESOLVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const overdue = await Dispute.find({ status: "open", createdAt: { $lte: cutoff } });

    let escalated = 0;
    for (const dispute of overdue) {
      dispute.status = "escalated";
      dispute.escalatedAt = new Date();
      await dispute.save();
      escalated += 1;

      const vendorEmail = await getOwnerEmail(dispute.businessId);
      if (vendorEmail) {
        sendDisputeEscalatedVendorEmail({
          to: vendorEmail,
          businessName: dispute.businessName,
          orderReference: dispute.orderReference,
          reason: dispute.reason,
        }).catch((err) => console.error("Dispute-escalated vendor email failed:", err));
      }
      sendDisputeEscalatedCustomerEmail({
        to: dispute.customer.email,
        customerName: dispute.customer.fullName,
        businessName: dispute.businessName,
        orderReference: dispute.orderReference,
      }).catch((err) => console.error("Dispute-escalated customer email failed:", err));
      sendDisputeEscalatedAdminEmail({
        businessName: dispute.businessName,
        orderReference: dispute.orderReference,
        reason: dispute.reason,
        disputeId: dispute._id,
      }).catch((err) => console.error("Dispute-escalated admin email failed:", err));
    }

    res.json({ checked: overdue.length, escalated });
  } catch (error) {
    console.error("Dispute escalation cron error:", error);
    res.status(500).json({ message: "Error running dispute escalation check" });
  }
};