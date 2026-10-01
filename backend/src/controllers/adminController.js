import User from "../models/User.js";
import Business from "../models/Business.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Vendor from "../models/Vendor.js";
import PlatformSettings from "../models/PlatformSettings.js";
import Marketer from "../models/Marketer.js";
import MarketerPayout from "../models/MarketerPayout.js";
import ReferralAttribution from "../models/ReferralAttribution.js";
import SubscriptionPayment from "../models/SubscriptionPayment.js";
import PointsLedger from "../models/PointsLedger.js";
import TaxLedger from "../models/TaxLedger.js";
import { settleOrderAfterResolution } from "../services/disputeOrderStatus.js";
import Dispute, { FLAG_WINDOW_DAYS, FLAG_MIN_ORDERS, FLAG_DISPUTE_RATE_THRESHOLD } from "../models/Dispute.js";
import Follow from "../models/Follow.js";
import Review from "../models/Review.js";
import { sendVerificationReviewedEmail, sendAccountBanStatusEmail } from "../services/emailService.js";
import { linkGuestOrders } from "../services/orderLinking.js";

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("businessId", "name category")
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get platform statistics
export const getStats = async (req, res) => {
  try {
    const [
      totalBusinesses,
      totalProducts,
      totalUsers,
      totalOrders,
      totalRevenue,
      businessesByCategory,
    ] = await Promise.all([
      Business.countDocuments(),
      Product.countDocuments(),
      User.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Business.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const revenue = totalRevenue[0]?.total || 0;

    res.json({
      totalBusinesses,
      totalProducts,
      totalUsers,
      totalOrders,
      totalRevenue: revenue,
      businessesByCategory,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle featured status
export const toggleFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    const business = await Business.findByIdAndUpdate(
      id,
      { featured },
      { new: true }
    );

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete any business (admin only)
export const deleteBusiness = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete all products for this business
    await Product.deleteMany({ businessId: id });

    // Delete the business
    const business = await Business.findByIdAndDelete(id);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Delete the user account
    await User.findOneAndDelete({ businessId: id });

    res.json({ message: "Business and related data deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Ban/unban a user
export const toggleUserBan = async (req, res) => {
  try {
    const { id } = req.params;
    const { banned } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { banned },
      { new: true }
    )
      .select("-password")
      .populate("businessId", "name");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Banning previously only blocked login (see authMiddleware.js) — the
    // storefront itself stayed publicly listed and orderable, which made
    // the ban lever mostly toothless for the actual problem it's meant to
    // solve (see the disputes phased plan doc). isHidden currently has no
    // other writer anywhere in the codebase, so this simple two-way
    // toggle is safe for now; if a second reason to hide a business shows
    // up later (e.g. the 30-day verification deadline), this will need a
    // reason flag instead of a bare boolean so the two don't stomp on
    // each other.
    if (user.businessId) {
      await Business.findByIdAndUpdate(user.businessId._id || user.businessId, {
        isHidden: Boolean(banned),
      });
    }

    // User has no name field of its own — fall back to their business name,
    // then plain email, so the greeting isn't blank for admin accounts
    // (role: "admin" has no businessId) or edge cases.
    sendAccountBanStatusEmail({
      to: user.email,
      name: user.businessId?.name || user.email,
      banned: user.banned,
      dashboardUrl: `${process.env.SITE_URL || "https://oja247.store"}/business-dashboard`,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// All vendor onboarding submissions, for manual verification review
export const getAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find()
      .populate("businessId", "name category location")
      .sort({ createdAt: -1 });

    res.json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Approve or reject a vendor's verification submission
export const reviewVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, notes } = req.body;

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      id,
      {
        reviewStatus: decision,
        reviewNotes: notes || "",
        reviewedAt: new Date(),
        reviewedBy: req.user._id,
        notificationSeen: false, // vendor sees this next time they check their status
        // Approval is the manual review that a bank-change hold is waiting
        // on — clear it so their subaccount can receive payouts again.
        ...(decision === "approved" ? { payoutHold: false, payoutHoldReason: "" } : {}),
      },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Admin approval is what actually grants the "Verified" trust badge on
    // the storefront — this was never wired up anywhere before, so
    // approving a vendor had no visible effect on their business record.
    // Rejecting does NOT un-verify a business that was already verified
    // from a past approval — only an explicit approval sets this.
    let businessCategory = "";
    if (decision === "approved") {
      const updatedBusiness = await Business.findByIdAndUpdate(
        vendor.businessId,
        { verified: true },
        { new: true }
      ).select("category");
      businessCategory = updatedBusiness?.category || "";
    }

    await sendVerificationReviewedEmail({
      to: vendor.contactEmail,
      businessName: vendor.businessName,
      businessCategory,
      decision,
      reviewNotes: notes || "",
    });

    res.json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/settings
export const getPlatformSettings = async (req, res) => {
  try {
    const settings = await PlatformSettings.getSettings();
    res.json({ enforceSubscriptionVisibility: settings.enforceSubscriptionVisibility });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/settings/subscription-visibility
// Admin kill switch (see PlatformSettings.js + businessController.getBusinesses).
// Turning this ON hides any business without a currently active subscription
// from public listings — only flip it on once vendors have had a fair
// chance to actually pay via the new subscription system.
export const setSubscriptionVisibilityEnforcement = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "'enabled' must be true or false" });
    }

    const settings = await PlatformSettings.getSettings();
    settings.enforceSubscriptionVisibility = enabled;
    await settings.save();

    res.json({ enforceSubscriptionVisibility: settings.enforceSubscriptionVisibility });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/businesses — ALL businesses, unfiltered by the public
// subscription-visibility rules (unlike GET /api/businesses, which is the
// public-facing, filtered list). Admin needs to see and manage exactly the
// businesses that visibility rules would otherwise hide.
export const getAllBusinessesAdmin = async (req, res) => {
  try {
    const businesses = await Business.find().sort({ createdAt: -1 }).lean();
    res.json(businesses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Kill-switch tab: per-business override (separate side tab from the
// global toggle above). Independent of the grandfather exemption below —
// this one is meant as a permanent "always show this business" flag.
// PATCH /api/admin/businesses/:id/visibility-exempt
export const setBusinessVisibilityExempt = async (req, res) => {
  try {
    const { id } = req.params;
    const { exempt } = req.body;
    if (typeof exempt !== "boolean") {
      return res.status(400).json({ message: "'exempt' must be true or false" });
    }

    const business = await Business.findByIdAndUpdate(
      id,
      { visibilityExempt: exempt },
      { new: true }
    );
    if (!business) return res.status(404).json({ message: "Business not found" });

    res.json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Grandfather-exemption tab: time-boxed override, separate side tab from
// the kill-switch tab above. Pass an ISO date string to exempt the
// business until that date, or null to clear the exemption.
// PATCH /api/admin/businesses/:id/grandfather-exemption
export const setBusinessGrandfatherExemption = async (req, res) => {
  try {
    const { id } = req.params;
    const { exemptUntil } = req.body;

    const business = await Business.findByIdAndUpdate(
      id,
      { grandfatherExemptUntil: exemptUntil ? new Date(exemptUntil) : null },
      { new: true }
    );
    if (!business) return res.status(404).json({ message: "Business not found" });

    res.json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Marketer management (mirrors the existing business management section).
// GET /api/admin/marketers — list view: one row per marketer with
// referral/payout totals, so admin doesn't have to open each one to see
// whether they're worth reviewing.
export const getAllMarketersAdmin = async (req, res) => {
  try {
    const marketers = await Marketer.find().select("-password").sort({ createdAt: -1 }).lean();

    const payouts = await MarketerPayout.aggregate([
      {
        $group: {
          _id: "$marketerId",
          pendingTotal: {
            $sum: { $cond: [{ $in: ["$status", ["pending", "batched"]] }, "$amount", 0] },
          },
          paidTotal: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
        },
      },
    ]);
    const payoutMap = new Map(payouts.map((p) => [String(p._id), p]));

    const attributionCounts = await ReferralAttribution.aggregate([
      { $match: { referrerType: "marketer" } },
      {
        $group: {
          _id: "$referrerId",
          totalReferred: { $sum: 1 },
          totalConverted: { $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] } },
        },
      },
    ]);
    const attributionMap = new Map(attributionCounts.map((a) => [String(a._id), a]));

    const result = marketers.map((m) => {
      const payout = payoutMap.get(String(m._id)) || { pendingTotal: 0, paidTotal: 0 };
      const attribution = attributionMap.get(String(m._id)) || { totalReferred: 0, totalConverted: 0 };
      return {
        ...m,
        totalReferred: attribution.totalReferred,
        totalConverted: attribution.totalConverted,
        pendingPayoutTotal: payout.pendingTotal,
        lifetimePaidTotal: payout.paidTotal,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/marketers/:id — drill-in detail: referral list + full
// payout history for one marketer. Reuses the same shape as the
// marketer's own dashboard (getMarketerDashboard in marketerController.js)
// so the admin view and the marketer's self-view stay consistent.
export const getMarketerDetailAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const marketer = await Marketer.findById(id).select("-password");
    if (!marketer) return res.status(404).json({ message: "Marketer not found" });

    const attributions = await ReferralAttribution.find({
      referrerType: "marketer",
      referrerId: id,
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

    const payouts = await MarketerPayout.find({ marketerId: id }).sort({ createdAt: -1 });

    res.json({
      marketer,
      referrals,
      payouts,
      stats: {
        totalReferred: referrals.length,
        totalConverted: referrals.filter((r) => r.status === "converted").length,
        pendingPayoutTotal: payouts
          .filter((p) => p.status === "pending" || p.status === "batched")
          .reduce((sum, p) => sum + p.amount, 0),
        lifetimePaidTotal: payouts
          .filter((p) => p.status === "paid")
          .reduce((sum, p) => sum + p.amount, 0),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/marketers/:id/ban — same pattern as toggleUserBan above.
export const toggleMarketerBan = async (req, res) => {
  try {
    const { id } = req.params;
    const { banned } = req.body;

    const marketer = await Marketer.findByIdAndUpdate(id, { banned }, { new: true }).select("-password");
    if (!marketer) return res.status(404).json({ message: "Marketer not found" });

    sendAccountBanStatusEmail({
      to: marketer.email,
      name: marketer.name,
      banned: marketer.banned,
      dashboardUrl: `${process.env.SITE_URL || "https://oja247.store"}/marketer-dashboard`,
    });

    res.json(marketer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/admin/marketers/:id — mirrors deleteBusiness's pattern.
// Also removes their payout records; referral attributions that named them
// as the referrer are left as-is (same tradeoff deleteBusiness makes with
// old orders) — historical record of the referral stays, just with a
// referrer that no longer resolves on populate.
export const deleteMarketer = async (req, res) => {
  try {
    const { id } = req.params;

    await MarketerPayout.deleteMany({ marketerId: id });

    const marketer = await Marketer.findByIdAndDelete(id);
    if (!marketer) return res.status(404).json({ message: "Marketer not found" });

    res.json({ message: "Marketer and their payout records deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Unified transactions tab: one feed combining subscription payments,
// marketer payouts, and points-ledger activity, each tagged with a "kind"
// so the frontend can filter by type without hitting three endpoints.
// GET /api/admin/transactions?type=subscription|marketer_payout|points&status=&limit=
export const getTransactions = async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    const cap = Math.min(parseInt(limit, 10) || 200, 500);

    const wantSubscriptions = !type || type === "subscription";
    const wantPayouts = !type || type === "marketer_payout";
    const wantPoints = !type || type === "points";

    const [subs, payouts, points] = await Promise.all([
      wantSubscriptions
        ? SubscriptionPayment.find(status ? { status } : {})
            .populate("businessId", "name")
            .sort({ createdAt: -1 })
            .limit(cap)
            .lean()
        : [],
      wantPayouts
        ? MarketerPayout.find(status ? { status } : {})
            .populate("marketerId", "name email")
            .sort({ createdAt: -1 })
            .limit(cap)
            .lean()
        : [],
      wantPoints
        ? PointsLedger.find(status ? { status } : {})
            .populate("businessId", "name")
            .sort({ createdAt: -1 })
            .limit(cap)
            .lean()
        : [],
    ]);

    const transactions = [
      ...subs.map((s) => ({
        kind: "subscription",
        id: s._id,
        date: s.createdAt,
        amount: s.amount,
        status: s.status,
        planType: s.planType,
        pointsApplied: s.pointsApplied,
        party: s.businessId?.name || "(business deleted)",
        reference: s.paystackReference,
      })),
      ...payouts.map((p) => ({
        kind: "marketer_payout",
        id: p._id,
        date: p.createdAt,
        amount: p.amount,
        status: p.status,
        party: p.marketerId?.name || "(marketer deleted)",
        reference: p.transferReference,
      })),
      ...points.map((pt) => ({
        kind: "points",
        id: pt._id,
        date: pt.createdAt,
        amount: pt.points,
        status: pt.status,
        pointsType: pt.type,
        party: pt.businessId?.name || "(business deleted)",
        reference: pt.transferReference,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ transactions: transactions.slice(0, cap) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/points-withdrawals/:id/mark-paid — the business-points
// equivalent of markPayoutBatchPaid (payoutBatchController.js). A
// "withdrawn_cash" PointsLedger entry sits at status "pending" until an
// admin actually sends the bank transfer, then marks it here.
export const markPointsWithdrawalPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { transferReference } = req.body;

    const entry = await PointsLedger.findOneAndUpdate(
      { _id: id, type: "withdrawn_cash", status: "pending" },
      { status: "paid", transferReference: transferReference || "" },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ message: "Pending points withdrawal not found." });
    }

    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tax Ledger admin section — "file them there" instead of building out a
// full remittance/batching pipeline. One row per paid order (see
// orderController.js:markOrderPaid), each independently markable as
// remitted with a free-text note (filing period, receipt number, whatever
// the admin wants to record — no fixed format imposed since there's no
// live remittance integration to validate against).

// GET /api/admin/tax-ledger?status=accrued|remitted
export const getTaxLedger = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { taxStatus: status } : {};

    const entries = await TaxLedger.find(query).sort({ createdAt: -1 }).limit(500).lean();

    const totals = await TaxLedger.aggregate([
      { $group: { _id: "$taxStatus", total: { $sum: "$taxAmount" }, count: { $sum: 1 } } },
    ]);
    const totalsByStatus = { accrued: { total: 0, count: 0 }, remitted: { total: 0, count: 0 } };
    totals.forEach((t) => {
      totalsByStatus[t._id] = { total: t.total, count: t.count };
    });

    res.json({ entries, totals: totalsByStatus });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/tax-ledger/:id/mark-remitted
export const markTaxRemitted = async (req, res) => {
  try {
    const { id } = req.params;
    const { remittanceNote } = req.body;

    const entry = await TaxLedger.findOneAndUpdate(
      { _id: id, taxStatus: "accrued" },
      { taxStatus: "remitted", remittedAt: new Date(), remittanceNote: remittanceNote || "" },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ message: "Accrued tax ledger entry not found." });
    }

    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Disputes admin section — only escalated disputes land here (Phase 2's
// vendor self-resolve handles "open" ones). Admin has two independent
// levers, not one resolution flow: mark the dispute resolved/unresolved
// (record-keeping only — the platform doesn't process refunds itself,
// see the disputes phased plan doc) and separately, ban the vendor via
// the existing toggleUserBan above if the pattern warrants it.

// GET /api/admin/disputes?status=escalated
export const adminListDisputes = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : { status: "escalated" };

    const disputes = await Dispute.find(query).sort({ createdAt: -1 }).limit(200);
    res.json({ disputes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/disputes/:id/resolve
// body: { outcome: "resolved" | "unresolved", note, refunded? }
export const adminResolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, note, refunded } = req.body;

    if (!["resolved", "unresolved"].includes(outcome)) {
      return res.status(400).json({ message: "outcome must be 'resolved' or 'unresolved'" });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }
    if (dispute.status !== "escalated") {
      return res.status(400).json({
        message: `Only escalated disputes can be resolved here (this one is ${dispute.status}).`,
      });
    }

    dispute.status = outcome;
    dispute.adminResolution = { note: note || "", resolvedBy: req.user._id, resolvedAt: new Date() };
    await dispute.save();

    await settleOrderAfterResolution(dispute.orderId, refunded);

    res.json({ dispute });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/disputes/flagged-vendors
// Phase 5: surfaces vendors whose dispute rate is high enough to be worth
// a look — not an automatic action, since there's nothing between
// "visible to admin" and the ban toggle above. Dispute count and order
// count are both scoped to the same rolling window (FLAG_WINDOW_DAYS) so
// a vendor's ancient history doesn't drag their current standing around.
// GET /api/admin/customers
// List of customer accounts with the counters an admin actually needs to
// see at a glance — order volume/spend, engagement, and account state.
// Aggregated in bulk rather than N+1 queries per customer.
export const getAllCustomersAdmin = async (req, res) => {
  try {
    const customers = await User.find({ role: "customer" }).select("-password").sort({ createdAt: -1 });
    if (customers.length === 0) return res.json({ customers: [] });

    const ids = customers.map((c) => c._id);
    // Case-insensitive: order/dispute emails are stored as typed at
    // checkout, account emails are lowercase (see services/orderLinking.js
    // for the same reasoning applied to guest-order linking).
    const emails = customers.map((c) => c.email);

    const [orderAgg, followCounts, reviewCounts, disputeCounts] = await Promise.all([
      Order.aggregate([
        { $match: { userId: { $in: ids }, status: { $in: ["paid", "disputed", "refunded"] } } },
        { $group: { _id: "$userId", orderCount: { $sum: 1 }, totalSpent: { $sum: "$total" } } },
      ]),
      Follow.aggregate([
        { $match: { customerId: { $in: ids } } },
        { $group: { _id: "$customerId", count: { $sum: 1 } } },
      ]),
      Review.aggregate([
        { $match: { customerId: { $in: ids } } },
        { $group: { _id: "$customerId", count: { $sum: 1 } } },
      ]),
      Dispute.aggregate([
        { $addFields: { emailLower: { $toLower: "$customer.email" } } },
        { $match: { emailLower: { $in: emails } } },
        { $group: { _id: "$emailLower", count: { $sum: 1 } } },
      ]),
    ]);

    const orderById = new Map(orderAgg.map((o) => [o._id.toString(), o]));
    const followById = new Map(followCounts.map((f) => [f._id.toString(), f.count]));
    const reviewById = new Map(reviewCounts.map((r) => [r._id.toString(), r.count]));
    const disputeByEmail = new Map(disputeCounts.map((d) => [d._id, d.count]));

    const result = customers.map((c) => {
      const orders = orderById.get(c._id.toString());
      return {
        ...c.toObject(),
        orderCount: orders?.orderCount || 0,
        totalSpent: orders?.totalSpent || 0,
        followingCount: followById.get(c._id.toString()) || 0,
        reviewCount: reviewById.get(c._id.toString()) || 0,
        disputeCount: disputeByEmail.get(c.email.toLowerCase()) || 0,
      };
    });

    res.json({ customers: result });
  } catch (error) {
    console.error("Get all customers error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/customers/:id — full drill-in for one customer: their
// order history, disputes, reviews, and who they follow, plus the same
// counters as the list for consistency.
export const getCustomerDetailAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await User.findOne({ _id: id, role: "customer" }).select("-password");
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const [orders, disputes, reviews, follows] = await Promise.all([
      Order.find({ userId: id }).sort({ createdAt: -1 }),
      // Disputes have no userId link (filed before an account may have
      // existed — see Dispute.js) so they're matched by email, case-
      // insensitively via collation — same approach as guest-order linking
      // in services/orderLinking.js.
      Dispute.find({ "customer.email": customer.email })
        .collation({ locale: "en", strength: 2 })
        .sort({ createdAt: -1 }),
      Review.find({ customerId: id }).sort({ createdAt: -1 }),
      Follow.find({ customerId: id }).populate("businessId", "name storeUrl").sort({ createdAt: -1 }),
    ]);

    const paidOrders = orders.filter((o) => ["paid", "disputed", "refunded"].includes(o.status));

    res.json({
      customer,
      orders,
      disputes,
      reviews,
      follows,
      stats: {
        orderCount: paidOrders.length,
        totalSpent: paidOrders.reduce((sum, o) => sum + (o.total || 0), 0),
        disputeCount: disputes.length,
        reviewCount: reviews.length,
        followingCount: follows.length,
      },
    });
  } catch (error) {
    console.error("Get customer detail error:", error);
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/customers/:id
// Support edit — correcting a typo'd name or phone number. Email is
// deliberately not editable here: it's the identity key used to link guest
// orders (see services/orderLinking.js) and is proven via the verification
// flow, so changing it needs its own re-verification step, not a plain edit.
export const updateCustomerAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone } = req.body;

    const customer = await User.findOne({ _id: id, role: "customer" });
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    if (fullName !== undefined) customer.fullName = String(fullName).trim();
    if (phone !== undefined) customer.phone = String(phone).trim();
    await customer.save();

    res.json({ success: true, customer: publicAdminCustomer(customer) });
  } catch (error) {
    console.error("Update customer error:", error);
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/customers/:id/verify-email
// Manual override for support cases — a delivery problem with the
// confirmation email, a customer who proved ownership some other way
// (phone call, ID at pickup), etc. Also links their guest orders on the
// spot, same as the customer's own verify-email flow.
export const adminVerifyCustomerEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await User.findOne({ _id: id, role: "customer" });
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    customer.emailVerified = true;
    customer.emailVerifyTokenHash = null;
    customer.emailVerifyExpires = null;
    await customer.save();

    const linkedOrders = await linkGuestOrders(customer);

    res.json({ success: true, linkedOrders, customer: publicAdminCustomer(customer) });
  } catch (error) {
    console.error("Admin verify customer email error:", error);
    res.status(500).json({ message: error.message });
  }
};

function publicAdminCustomer(user) {
  return {
    _id: user._id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    emailVerified: user.emailVerified === true,
    banned: user.banned,
  };
}

export const getFlaggedVendors = async (req, res) => {
  try {
    const windowStart = new Date(Date.now() - FLAG_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [disputeCounts, orderCounts] = await Promise.all([
      Dispute.aggregate([
        { $match: { createdAt: { $gte: windowStart } } },
        { $group: { _id: "$businessId", disputeCount: { $sum: 1 } } },
      ]),
      // Any order that actually went through payment counts toward the
      // denominator, whether or not it later ended up disputed/refunded —
      // "disputed"/"refunded" are still real orders, just ones that had a
      // problem. Multi-vendor orders unwind so each vendor only gets
      // credited for their own share of the order.
      Order.aggregate([
        { $match: { status: { $in: ["paid", "disputed", "refunded"] }, createdAt: { $gte: windowStart } } },
        { $unwind: "$vendors" },
        { $group: { _id: "$vendors.businessId", orderCount: { $sum: 1 } } },
      ]),
    ]);

    const orderCountByBusiness = new Map(orderCounts.map((o) => [String(o._id), o.orderCount]));

    const candidates = disputeCounts
      .map((d) => {
        const businessId = String(d._id);
        const orderCount = orderCountByBusiness.get(businessId) || 0;
        const rate = orderCount > 0 ? d.disputeCount / orderCount : 0;
        return { businessId, disputeCount: d.disputeCount, orderCount, rate };
      })
      .filter((c) => c.orderCount >= FLAG_MIN_ORDERS && c.rate >= FLAG_DISPUTE_RATE_THRESHOLD)
      .sort((a, b) => b.rate - a.rate);

    const businesses = await Business.find({ _id: { $in: candidates.map((c) => c.businessId) } })
      .select("name")
      .lean();
    const nameByBusiness = new Map(businesses.map((b) => [String(b._id), b.name]));

    const flagged = candidates.map((c) => ({
      ...c,
      businessName: nameByBusiness.get(c.businessId) || "Unknown business",
    }));

    res.json({
      windowDays: FLAG_WINDOW_DAYS,
      minOrders: FLAG_MIN_ORDERS,
      threshold: FLAG_DISPUTE_RATE_THRESHOLD,
      flagged,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};