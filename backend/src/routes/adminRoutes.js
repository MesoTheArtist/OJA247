import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import {
  getAllUsers,
  getStats,
  getAllOrders,
  getWaitingOrders,
  toggleFeatured,
  deleteBusiness,
  toggleUserBan,
  getAllVendors,
  reviewVendor,
  getPlatformSettings,
  setSubscriptionVisibilityEnforcement,
  getAllBusinessesAdmin,
  setBusinessVisibilityExempt,
  setBusinessGrandfatherExemption,
  getAllMarketersAdmin,
  getMarketerDetailAdmin,
  toggleMarketerBan,
  deleteMarketer,
  getTransactions,
  markPointsWithdrawalPaid,
  rejectPointsWithdrawal,
  getTaxLedger,
  markTaxRemitted,
  adminListDisputes,
  adminResolveDispute,
  getFlaggedVendors,
  getAllCustomersAdmin,
  getCustomerDetailAdmin,
  updateCustomerAdmin,
  deleteCustomerAdmin,
  adminVerifyCustomerEmail,
} from "../controllers/adminController.js";
import { getPayoutBatches, markPayoutBatchPaid, getPayouts, rejectMarketerPayouts, rejectSingleMarketerPayout } from "../controllers/payoutBatchController.js";
import {
  getAudienceCounts,
  sendTestCampaign,
  createCampaign,
  sendCampaignBatch,
  retryCampaign,
  listCampaigns,
  getCampaign,
} from "../controllers/campaignController.js";
import {
  getGrowthAnalytics,
  getSubscriptionBreakdown,
  getMarketerLeaderboard,
  getRecentActivity,
} from "../controllers/analyticsController.js";

const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(requireAdmin);

// Admin routes
router.get("/users", getAllUsers);
router.get("/waiting-orders", getWaitingOrders);

// Analytics tab (charts, subscription breakdown, leaderboard, activity feed)
router.get("/analytics/growth", getGrowthAnalytics);
router.get("/analytics/subscriptions", getSubscriptionBreakdown);
router.get("/analytics/marketer-leaderboard", getMarketerLeaderboard);
router.get("/analytics/recent-activity", getRecentActivity);

// Occasion emails to customers / vendors / marketers. Static paths first so
// "audience" and "test" aren't swallowed by /campaigns/:id.
router.get("/campaigns/audience", getAudienceCounts);
router.post("/campaigns/test", sendTestCampaign);
router.get("/campaigns", listCampaigns);
router.post("/campaigns", createCampaign);
router.get("/campaigns/:id", getCampaign);
router.post("/campaigns/:id/send-batch", sendCampaignBatch);
router.post("/campaigns/:id/retry", retryCampaign);

// Customers — separate from the generic /users list, with the counters
// (orders, spend, follows, reviews, disputes) an admin needs to manage a
// customer, not just see they exist. See getAllCustomersAdmin.
router.get("/customers", getAllCustomersAdmin);
router.get("/customers/:id", getCustomerDetailAdmin);
router.patch("/customers/:id", updateCustomerAdmin);
router.patch("/customers/:id/verify-email", adminVerifyCustomerEmail);
router.delete("/customers/:id", deleteCustomerAdmin);
router.get("/stats", getStats);
router.get("/orders", getAllOrders);
router.patch("/businesses/:id/featured", toggleFeatured);
router.delete("/businesses/:id", deleteBusiness);
router.patch("/users/:id/ban", toggleUserBan);
router.get("/vendors", getAllVendors);
router.patch("/vendors/:id/review", reviewVendor);

// Marketer payout batches (weekly, frozen by the cron job — see cronRoutes.js)
router.get("/payout-batches", getPayoutBatches);
router.post("/payout-batches/:marketerId/mark-paid", markPayoutBatchPaid);
router.post("/payout-batches/:marketerId/reject", rejectMarketerPayouts);
router.post("/marketer-payouts/:payoutId/reject", rejectSingleMarketerPayout);
// One list of everything to pay, marketers and vendors together (the Payouts tab)
router.get("/payouts", getPayouts);

// Platform settings (global kill switches)
router.get("/settings", getPlatformSettings);
router.patch("/settings/subscription-visibility", setSubscriptionVisibilityEnforcement);

// Unfiltered business list for admin management (see getAllBusinessesAdmin)
router.get("/businesses", getAllBusinessesAdmin);

// Kill-switch tab: per-business override (independent of the global toggle above)
router.patch("/businesses/:id/visibility-exempt", setBusinessVisibilityExempt);

// Grandfather-exemption tab: time-boxed per-business override
router.patch("/businesses/:id/grandfather-exemption", setBusinessGrandfatherExemption);

// Marketer management (mirrors business management)
router.get("/marketers", getAllMarketersAdmin);
router.get("/marketers/:id", getMarketerDetailAdmin);
router.patch("/marketers/:id/ban", toggleMarketerBan);
router.delete("/marketers/:id", deleteMarketer);

// Unified transactions feed (subscriptions + marketer payouts + points ledger)
router.get("/transactions", getTransactions);

// Business points withdrawal (cash-out) — the points-ledger equivalent of
// payout-batches/:marketerId/mark-paid above
router.patch("/points-withdrawals/:id/mark-paid", markPointsWithdrawalPaid);
router.patch("/points-withdrawals/:id/reject", rejectPointsWithdrawal);

// Tax Ledger tab (accrued per paid order — see orderController.js)
router.get("/tax-ledger", getTaxLedger);
router.patch("/tax-ledger/:id/mark-remitted", markTaxRemitted);

// Disputes — only escalated ones (Phase 2's vendor self-resolve view lives
// under /api/disputes, not here). See adminController.js for why
// resolution here is two independent levers (record-keeping status +
// the existing ban toggle above) rather than one flow.
router.get("/disputes", adminListDisputes);
router.get("/disputes/flagged-vendors", getFlaggedVendors);
router.patch("/disputes/:id/resolve", adminResolveDispute);

export default router;