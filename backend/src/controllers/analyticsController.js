import User from "../models/User.js";
import Business from "../models/Business.js";
import Order from "../models/Order.js";
import Marketer from "../models/Marketer.js";
import MarketerPayout from "../models/MarketerPayout.js";
import ReferralAttribution from "../models/ReferralAttribution.js";

// Groups a model's documents into daily buckets over the last `days` days,
// filling in 0 for any day with no activity so charts don't have gaps.
async function dailyCounts(Model, dateField, days, matchExtra = {}, sumField = null) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const pipeline = [
    { $match: { [dateField]: { $gte: since }, ...matchExtra } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } },
        count: sumField ? { $sum: `$${sumField}` } : { $sum: 1 },
      },
    },
  ];

  const results = await Model.aggregate(pipeline);
  const byDate = Object.fromEntries(results.map((r) => [r._id, r.count]));

  const series = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, count: byDate[key] || 0 });
  }
  return series;
}

// GET /api/admin/analytics/growth?days=30
export const getGrowthAnalytics = async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);

    const [userGrowth, businessGrowth, revenueGrowth, conversionGrowth] = await Promise.all([
      dailyCounts(User, "createdAt", days),
      dailyCounts(Business, "createdAt", days),
      dailyCounts(Order, "createdAt", days, { paymentStatus: "paid" }, "total"),
      dailyCounts(ReferralAttribution, "convertedAt", days, { status: "converted" }),
    ]);

    res.json({ days, userGrowth, businessGrowth, revenueGrowth, conversionGrowth });
  } catch (error) {
    console.error("Get growth analytics error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/analytics/subscriptions
// Live breakdown, same "active means subscriptionExpiresAt is in the
// future" rule used by businessController.getBusinesses.
export const getSubscriptionBreakdown = async (req, res) => {
  try {
    const now = new Date();
    const [active, expired, neverSubscribed] = await Promise.all([
      Business.countDocuments({ subscriptionExpiresAt: { $gt: now } }),
      Business.countDocuments({ subscriptionExpiresAt: { $lte: now, $ne: null } }),
      Business.countDocuments({ subscriptionExpiresAt: null }),
    ]);

    res.json({ active, expired, neverSubscribed });
  } catch (error) {
    console.error("Get subscription breakdown error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/analytics/marketer-leaderboard
export const getMarketerLeaderboard = async (req, res) => {
  try {
    const earnedStatuses = ["pending", "batched", "paid"];
    const payoutAgg = await MarketerPayout.aggregate([
      {
        $group: {
          _id: "$marketerId",
          totalEarned: {
            $sum: { $cond: [{ $in: ["$status", earnedStatuses] }, "$amount", 0] },
          },
          paidOut: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
          outstanding: {
            $sum: { $cond: [{ $in: ["$status", ["pending", "batched"]] }, "$amount", 0] },
          },
          rejectedPayouts: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        },
      },
      { $sort: { totalEarned: -1 } },
      { $limit: 10 },
    ]);

    if (payoutAgg.length === 0) {
      return res.json({ leaderboard: [] });
    }

    const marketerIds = payoutAgg.map((p) => p._id);
    const [marketers, referredCounts] = await Promise.all([
      Marketer.find({ _id: { $in: marketerIds } }).select("name referralCode"),
      ReferralAttribution.aggregate([
        { $match: { referrerType: "marketer", referrerId: { $in: marketerIds } } },
        {
          $group: {
            _id: "$referrerId",
            totalReferred: { $sum: 1 },
            totalConversions: { $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const marketerMap = Object.fromEntries(marketers.map((m) => [m._id.toString(), m]));
    const referredMap = Object.fromEntries(referredCounts.map((r) => [r._id.toString(), r.totalReferred]));

    const leaderboard = payoutAgg.map((p) => {
      const key = p._id.toString();
      const marketer = marketerMap[key];
      return {
        marketerId: p._id,
        name: marketer?.name || "(deleted marketer)",
        referralCode: marketer?.referralCode || "",
        totalEarned: p.totalEarned,
        totalConversions: referredMap[key]?.totalConversions || 0,
        totalReferred: referredMap[key]?.totalReferred || 0,
        paidOut: p.paidOut,
        outstanding: p.outstanding,
        rejectedPayouts: p.rejectedPayouts,
      };
    });

    res.json({ leaderboard });
  } catch (error) {
    console.error("Get marketer leaderboard error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/analytics/recent-activity
// Merges the latest signups and orders into one feed, newest first.
export const getRecentActivity = async (req, res) => {
  try {
    const [users, businesses, orders] = await Promise.all([
      User.find().sort({ createdAt: -1 }).limit(10).select("email createdAt"),
      Business.find().sort({ createdAt: -1 }).limit(10).select("name createdAt"),
      Order.find().sort({ createdAt: -1 }).limit(10).select("total customer createdAt"),
    ]);

    const events = [
      ...users.map((u) => ({
        type: "user_signup",
        label: `${u.email} signed up`,
        timestamp: u.createdAt,
      })),
      ...businesses.map((b) => ({
        type: "business_signup",
        label: `${b.name} joined as a business`,
        timestamp: b.createdAt,
      })),
      ...orders.map((o) => ({
        type: "order",
        label: `New order from ${o.customer?.fullName || "a customer"} — ₦${(o.total || 0).toLocaleString()}`,
        timestamp: o.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 15);

    res.json({ events });
  } catch (error) {
    console.error("Get recent activity error:", error);
    res.status(500).json({ message: error.message });
  }
};