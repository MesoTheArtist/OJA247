import Business from "../models/Business.js";
import Vendor from "../models/Vendor.js";
import ReferralAttribution from "../models/ReferralAttribution.js";
import PointsLedger from "../models/PointsLedger.js";
import { sendBusinessPointsWithdrawalRequestEmail } from "../services/emailService.js";

// GET /api/businesses/:id/points
export const getPointsDashboard = async (req, res) => {
  try {
    const businessId = req.params.id;

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const attributions = await ReferralAttribution.find({
      referrerType: "business",
      referrerId: businessId,
    })
      .populate("referredBusinessId", "name createdAt")
      .sort({ createdAt: -1 });

    const referrals = attributions.map((a) => ({
      id: a._id,
      businessName: a.referredBusinessId?.name || "(business deleted)",
      status: a.status,
      referredAt: a.createdAt,
      convertedAt: a.convertedAt,
    }));

    const ledger = await PointsLedger.find({ businessId }).sort({ createdAt: -1 }).limit(50);

    const totalConverted = referrals.filter((r) => r.status === "converted").length;

    // Progress toward being able to redeem points for a subscription.
    // Points are a flat 1pt = ₦1 (see BUSINESS_REFERRAL_POINTS in
    // referralService.js), so the target is just the cheapest plan's price
    // — the monthly plan — since that's the earliest milestone reachable,
    // even though points can be applied toward any plan at checkout.
    const MONTHLY_PLAN_PRICE = 1999;
    const pointsBalance = business.pointsBalance || 0;
    const nextRedemption = {
      targetLabel: "Monthly plan",
      targetAmount: MONTHLY_PLAN_PRICE,
      progress: Math.min(1, pointsBalance / MONTHLY_PLAN_PRICE),
      remainingPoints: Math.max(0, MONTHLY_PLAN_PRICE - pointsBalance),
      canRedeemNow: pointsBalance >= MONTHLY_PLAN_PRICE,
    };

    res.json({
      success: true,
      referralCode: business.referralCode,
      pointsBalance,
      stats: {
        totalReferred: referrals.length,
        totalConverted,
        conversionRate: referrals.length > 0 ? totalConverted / referrals.length : 0,
      },
      nextRedemption,
      referrals,
      ledger: ledger.map((entry) => ({
        id: entry._id,
        type: entry.type,
        points: entry.points,
        balanceAfter: entry.balanceAfter,
        status: entry.status,
        createdAt: entry.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get points dashboard error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/businesses/:id/points/withdraw
// Cash withdrawal, no minimum threshold per spec. Requires the business to
// already have verified bank details on file (via Vendor onboarding) —
// reuses the same payout account rather than collecting a second one.
export const withdrawPoints = async (req, res) => {
  try {
    const businessId = req.params.id;
    const { amount } = req.body;

    const requestedAmount = Number(amount);
    // Whole points only: 1 point = N1, and fractions (0.5, 0.001...) would let
    // someone fill the admin inbox with tiny requests and muddy the ledger.
    if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ message: "Enter a whole number of points to withdraw" });
    }

    const vendor = await Vendor.findOne({ businessId });
    if (!vendor || !vendor.accountNumber || !vendor.bankCode) {
      return res.status(400).json({
        message: "Complete your vendor payout details (bank account) before withdrawing points.",
      });
    }

    // Atomic check-and-decrement: the pointsBalance >= requestedAmount filter
    // is enforced by MongoDB as part of the same operation as the $inc, not
    // as a separate read beforehand. Two simultaneous withdrawal requests
    // can no longer both pass a balance check based on the same stale
    // reading — only one can match the filter and succeed if the balance
    // wouldn't cover both.
    const business = await Business.findOneAndUpdate(
      { _id: businessId, pointsBalance: { $gte: requestedAmount } },
      { $inc: { pointsBalance: -requestedAmount } },
      { new: true }
    );

    if (!business) {
      // Either the business doesn't exist, or the balance check failed —
      // distinguish the two for a clearer error message.
      const exists = await Business.exists({ _id: businessId });
      if (!exists) {
        return res.status(404).json({ message: "Business not found" });
      }
      return res.status(400).json({ message: "Withdrawal amount exceeds your points balance" });
    }

    const entry = await PointsLedger.create({
      businessId,
      type: "withdrawn_cash",
      points: -requestedAmount,
      balanceAfter: business.pointsBalance,
      status: "pending",
    });

    await sendBusinessPointsWithdrawalRequestEmail({
      businessName: business.name,
      businessEmail: vendor.contactEmail || "",
      amount: requestedAmount,
    });

    res.json({
      success: true,
      message: "Withdrawal requested — it will be processed shortly.",
      entry,
      pointsBalance: business.pointsBalance,
    });
  } catch (error) {
    console.error("Withdraw points error:", error);
    res.status(500).json({ message: error.message });
  }
};