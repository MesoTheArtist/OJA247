import MarketerPayout from "../models/MarketerPayout.js";
import Marketer from "../models/Marketer.js";
import { sendMarketerPayoutPaidEmail } from "../services/emailService.js";

// GET /api/cron/payout-batch  (called weekly by Vercel Cron — see vercel.json)
// Groups every "pending" MarketerPayout row into this week's batch.
// Deliberately does NOT move money: payouts are paid by hand for now. This
// just freezes the list + totals so an admin can review and pay manually
// (bank transfer or Paystack dashboard) via /api/admin/payout-batches, then
// confirm with markPayoutBatchPaid below. The Paystack account is now fully
// approved, so the manual "mark paid" step can later be swapped for an
// automatic Paystack Transfer call — the batching logic itself
// doesn't need to change.
export const runWeeklyPayoutBatch = async (req, res) => {
  try {
    const cronSecret = req.headers["authorization"];
    if (!process.env.CRON_SECRET || cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const weekStart = new Date();
    const result = await MarketerPayout.updateMany(
      { status: "pending" },
      { status: "batched", payoutWeekStart: weekStart }
    );

    res.json({
      success: true,
      message: `Batched ${result.modifiedCount} pending payout(s)`,
      payoutWeekStart: weekStart,
    });
  } catch (error) {
    console.error("Weekly payout batch error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/payout-batches
// Admin view: every "batched" (frozen, awaiting manual payment) payout,
// grouped by marketer with bank details and a total, so an admin can
// actually go pay them.
export const getPayoutBatches = async (req, res) => {
  try {
    const payouts = await MarketerPayout.find({ status: "batched" }).populate(
      "marketerId",
      "name email phone bankCode bankName accountNumber accountName"
    );

    const byMarketer = {};
    for (const p of payouts) {
      const marketer = p.marketerId;
      if (!marketer) continue;
      const key = marketer._id.toString();

      if (!byMarketer[key]) {
        byMarketer[key] = {
          marketerId: marketer._id,
          name: marketer.name,
          email: marketer.email,
          phone: marketer.phone,
          bankName: marketer.bankName,
          accountNumber: marketer.accountNumber,
          accountName: marketer.accountName,
          hasPayoutDetails: Boolean(marketer.bankCode && marketer.accountNumber),
          total: 0,
          payoutIds: [],
        };
      }
      byMarketer[key].total += p.amount;
      byMarketer[key].payoutIds.push(p._id);
    }

    res.json({ success: true, batches: Object.values(byMarketer) });
  } catch (error) {
    console.error("Get payout batches error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/admin/payout-batches/:marketerId/mark-paid
// Admin confirms they've actually sent the money (manually, for now).
export const markPayoutBatchPaid = async (req, res) => {
  try {
    const { marketerId } = req.params;
    const { transferReference } = req.body;

    // Grab the amount being paid out before the update, for the email —
    // updateMany only returns a modified count, not the documents.
    const payoutsBeingPaid = await MarketerPayout.find({ marketerId, status: "batched" }).select("amount");
    const totalAmount = payoutsBeingPaid.reduce((sum, p) => sum + p.amount, 0);

    const result = await MarketerPayout.updateMany(
      { marketerId, status: "batched" },
      { status: "paid", paidAt: new Date(), transferReference: transferReference || "" }
    );

    if (totalAmount > 0) {
      const marketer = await Marketer.findById(marketerId).select("email name");
      if (marketer) {
        await sendMarketerPayoutPaidEmail({ to: marketer.email, name: marketer.name, amount: totalAmount });
      }
    }

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} payout(s) as paid`,
    });
  } catch (error) {
    console.error("Mark payout batch paid error:", error);
    res.status(500).json({ message: error.message });
  }
};