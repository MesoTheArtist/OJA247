import mongoose from "mongoose";
import MarketerPayout from "../models/MarketerPayout.js";
import Marketer from "../models/Marketer.js";
import PointsLedger from "../models/PointsLedger.js";
import Vendor from "../models/Vendor.js";
import Business from "../models/Business.js";
import ReferralAttribution from "../models/ReferralAttribution.js";
import { sendMarketerPayoutPaidEmail, sendMarketerPayoutRejectedEmail } from "../services/emailService.js";

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

// GET /api/admin/payouts?type=all|marketer|vendor&status=to_pay|paid|rejected
// One list of "transfers to send" for BOTH kinds of payout, so an admin has a
// single place to work from. Each row is one transfer:
//  - a marketer row is everything owed to that marketer (their frozen weekly
//    payouts added together), or for history one payment / one rejection;
//  - a vendor row is one points-withdrawal request.
// Every row carries the bank account to pay. The underlying data stays where it
// was (MarketerPayout / PointsLedger); this only reads and reshapes it.
export const getPayouts = async (req, res) => {
  try {
    const type = ["marketer", "vendor"].includes(req.query.type) ? req.query.type : "all";
    const status = ["to_pay", "paid", "rejected"].includes(req.query.status) ? req.query.status : "to_pay";
    const HISTORY_CAP = 150;

    const marketerStatus = { to_pay: "batched", paid: "paid", rejected: "rejected" }[status];
    const vendorStatus = { to_pay: "pending", paid: "paid", rejected: "rejected" }[status];
    const rows = [];

    if (type !== "vendor") {
      const query = MarketerPayout.find({ status: marketerStatus })
        .sort({ updatedAt: -1 })
        .populate("marketerId", "name email phone bankCode bankName accountNumber accountName")
        .populate({
          path: "referralAttributionId",
          select: "referredBusinessId referralCode status convertedAt conversionBaseAmount conversionPlanType conversionPaymentId conversionPaymentReference",
          populate: { path: "referredBusinessId", select: "name" },
        });
      if (status !== "to_pay") query.limit(HISTORY_CAP * 5);
      const payouts = await query;

      const groups = new Map();
      const marketerIds = [...new Set(payouts.map((pay) => pay.marketerId?._id?.toString()).filter(Boolean))]
        .map((id) => new mongoose.Types.ObjectId(id));
      const referralCounts = marketerIds.length
        ? await ReferralAttribution.aggregate([
            { $match: { referrerType: "marketer", referrerId: { $in: marketerIds } } },
            {
              $group: {
                _id: "$referrerId",
                totalReferrals: { $sum: 1 },
                convertedReferrals: { $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] } },
              },
            },
          ])
        : [];
      const referralCountByMarketer = new Map(referralCounts.map((entry) => [String(entry._id), entry]));

      for (const pay of payouts) {
        const m = pay.marketerId;
        if (!m) continue;
        // Paid / rejected payouts of one action share the same timestamp, so
        // they group into one row; unpaid ones group per marketer.
        const when = status === "paid" ? pay.paidAt : status === "rejected" ? pay.rejectedAt : null;
        const key = `${m._id}|${when ? new Date(when).getTime() : "open"}`;
        if (!groups.has(key)) {
          groups.set(key, {
            rowId: `marketer:${key}`,
            kind: "marketer",
            marketerId: m._id,
            party: m.name,
            email: m.email,
            bank: { bankName: m.bankName, accountNumber: m.accountNumber, accountName: m.accountName },
            hasBank: Boolean(m.bankCode && m.accountNumber),
            amount: 0,
            count: 0,
            totalReferrals: referralCountByMarketer.get(String(m._id))?.totalReferrals || 0,
            convertedReferrals: referralCountByMarketer.get(String(m._id))?.convertedReferrals || 0,
            status,
            date: when || pay.updatedAt,
            reference: status === "paid" ? pay.transferReference : "",
            reason: status === "rejected" ? pay.rejectionReason : "",
            payouts: [],
          });
        }
        const g = groups.get(key);
        g.amount += pay.amount;
        g.count += 1;
        const attribution = pay.referralAttributionId;
        const referredBusiness = attribution?.referredBusinessId;
        const conversionAmount = pay.conversionAmount ?? attribution?.conversionBaseAmount ?? null;
        const storedRate = pay.commissionRate;
        g.payouts.push({
          id: pay._id,
          businessId: referredBusiness?._id || referredBusiness || null,
          businessName: referredBusiness?.name || "(business unavailable)",
          referralCode: attribution?.referralCode || "",
          referralStatus: attribution?.status || "unknown",
          planType: pay.planType || attribution?.conversionPlanType || null,
          conversionAmount,
          commissionRate: storedRate ?? (conversionAmount ? pay.amount / conversionAmount : null),
          amount: pay.amount,
          paymentReference: pay.paymentReference || attribution?.conversionPaymentReference || "",
          subscriptionPaymentId: pay.subscriptionPaymentId || attribution?.conversionPaymentId || null,
          status: pay.status,
          date: pay.createdAt || pay.updatedAt,
        });
      }
      rows.push(...groups.values());
    }

    if (type !== "marketer") {
      const entryQuery = PointsLedger.find({ type: "withdrawn_cash", status: vendorStatus }).sort({ updatedAt: -1 });
      if (status !== "to_pay") entryQuery.limit(HISTORY_CAP);
      const entries = await entryQuery.lean();

      const businessIds = [...new Set(entries.map((e) => String(e.businessId)))];
      const [businesses, vendors] = await Promise.all([
        Business.find({ _id: { $in: businessIds } }).select("name").lean(),
        Vendor.find({ businessId: { $in: businessIds } }).select("businessId bankCode bankName accountNumber accountName contactEmail").lean(),
      ]);
      const nameById = new Map(businesses.map((b) => [String(b._id), b.name]));
      const vendorById = new Map(vendors.map((v) => [String(v.businessId), v]));

      for (const e of entries) {
        const v = vendorById.get(String(e.businessId));
        rows.push({
          rowId: `vendor:${e._id}`,
          kind: "vendor",
          entryId: e._id,
          businessId: e.businessId,
          party: nameById.get(String(e.businessId)) || "(business deleted)",
          email: v?.contactEmail || "",
          bank: { bankName: v?.bankName, accountNumber: v?.accountNumber, accountName: v?.accountName },
          hasBank: Boolean(v?.bankCode && v?.accountNumber),
          amount: Math.abs(e.points), // 1 point = ₦1
          count: 1,
          status,
          date: status === "to_pay" ? e.createdAt : e.updatedAt,
          reference: status === "paid" ? e.transferReference : "",
          reason: status === "rejected" ? e.rejectionReason : "",
        });
      }
    }

    // Money to send: oldest request first. History: newest first.
    rows.sort((a, b) => (status === "to_pay" ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date)));

    // Always report what is waiting to be paid, whatever list is shown, so the
    // header can say "₦X to send" on every filter.
    const [batched, pendingWithdrawals] = await Promise.all([
      MarketerPayout.find({ status: "batched" }).select("marketerId amount").lean(),
      PointsLedger.find({ type: "withdrawn_cash", status: "pending" }).select("points").lean(),
    ]);
    const toPay = {
      count: new Set(batched.map((b) => String(b.marketerId))).size + pendingWithdrawals.length,
      total: batched.reduce((n, b) => n + b.amount, 0) + pendingWithdrawals.reduce((n, e) => n + Math.abs(e.points), 0),
    };

    res.json({ success: true, rows: rows.slice(0, status === "to_pay" ? rows.length : HISTORY_CAP), toPay });
  } catch (error) {
    console.error("Get payouts error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Tell a marketer that a payout (or a group of them) was declined. Never throws.
async function emailMarketerRejection(marketerId, amount, reason) {
  try {
    const marketer = await Marketer.findById(marketerId).select("email name");
    if (marketer?.email) {
      await sendMarketerPayoutRejectedEmail({ to: marketer.email, name: marketer.name, amount, reason });
    }
  } catch (err) {
    console.error("Marketer payout-rejected email failed:", err);
  }
}

// POST /api/admin/marketer-payouts/:payoutId/reject   Body: { reason }
// Decline ONE referral payout that is waiting to be paid, leaving the same
// marketer's other payouts alone. Same rules as rejecting a whole marketer:
// reason required and emailed, row kept as "rejected" so the referral can never
// create a second payout, and the status flip is atomic so a double click or a
// Mark paid racing it can't count the payout twice.
export const rejectSingleMarketerPayout = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!mongoose.Types.ObjectId.isValid(payoutId)) {
      return res.status(404).json({ message: "Payout not found." });
    }
    if (!reason) {
      return res.status(400).json({ message: "A reason is required — the marketer will see it." });
    }

    const payout = await MarketerPayout.findOneAndUpdate(
      { _id: payoutId, status: "batched" },
      { status: "rejected", rejectedAt: new Date(), rejectionReason: reason },
      { new: true }
    );
    if (!payout) {
      return res.status(404).json({ message: "That payout isn't waiting to be paid (it may already be paid or rejected)." });
    }

    emailMarketerRejection(payout.marketerId, payout.amount, reason);

    res.json({ success: true, amount: payout.amount, message: `Rejected a ₦${payout.amount.toLocaleString()} payout` });
  } catch (error) {
    console.error("Reject single marketer payout error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/admin/payout-batches/:marketerId/reject   Body: { reason }
// Decline everything currently waiting to be paid to this marketer (e.g. a
// suspected self-referral). The payout rows are kept with status "rejected",
// so the one-payout-per-referral rule still stops them being recreated, and the
// marketer sees what happened and why. The reason is required and is emailed.
export const rejectMarketerPayouts = async (req, res) => {
  try {
    const { marketerId } = req.params;
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!reason) {
      return res.status(400).json({ message: "A reason is required — the marketer will see it." });
    }

    const waiting = await MarketerPayout.find({ marketerId, status: "batched" }).select("_id");
    if (waiting.length === 0) {
      return res.status(404).json({ message: "Nothing is waiting to be paid to this marketer." });
    }

    // Claim each payout individually and atomically: a document is only
    // returned to the caller whose update actually flipped it from "batched".
    // If two clicks race (or a payout is marked paid in the meantime), each
    // payout is counted by exactly one of them and nothing is counted twice.
    const rejectedAt = new Date();
    const claimed = [];
    for (const { _id } of waiting) {
      const done = await MarketerPayout.findOneAndUpdate(
        { _id, status: "batched" },
        { status: "rejected", rejectedAt, rejectionReason: reason },
        { new: true }
      );
      if (done) claimed.push(done);
    }
    if (claimed.length === 0) {
      return res.status(404).json({ message: "Those payouts were already handled." });
    }
    const total = claimed.reduce((sum, p) => sum + p.amount, 0);

    emailMarketerRejection(marketerId, total, reason);

    res.json({ success: true, message: `Rejected ${claimed.length} payout(s) totalling ₦${total.toLocaleString()}`, total });
  } catch (error) {
    console.error("Reject marketer payouts error:", error);
    res.status(500).json({ message: error.message });
  }
};