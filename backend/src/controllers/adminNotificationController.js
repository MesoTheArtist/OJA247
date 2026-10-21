import mongoose from "mongoose";
import AdminNotification, { ADMIN_NOTIFICATION_TYPES, NOTIFICATION_HISTORY_DAYS } from "../models/AdminNotification.js";

const historyCutoff = () => new Date(Date.now() - NOTIFICATION_HISTORY_DAYS * 24 * 60 * 60 * 1000);

const fail = (res, error) => {
  console.error("Admin notifications error:", error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
};

// GET /api/admin/notifications?unread=true&type=order_placed&limit=30&before=<ISO date>
// Newest first, only from the last NOTIFICATION_HISTORY_DAYS days. "before" is
// the createdAt of the last item already shown, to load the next page.
export const listNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const cutoff = historyCutoff();
    const createdAt = { $gte: cutoff };
    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) createdAt.$lt = before;
    }
    const filter = { createdAt };
    if (req.query.unread === "true") filter.readAt = null;
    if (ADMIN_NOTIFICATION_TYPES.includes(req.query.type)) filter.type = req.query.type;

    const [rows, unreadCount] = await Promise.all([
      AdminNotification.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean(),
      AdminNotification.countDocuments({ readAt: null, createdAt: { $gte: cutoff } }),
    ]);
    const hasMore = rows.length > limit;
    res.json({ items: hasMore ? rows.slice(0, limit) : rows, unreadCount, hasMore, historyDays: NOTIFICATION_HISTORY_DAYS });
  } catch (error) {
    fail(res, error);
  }
};

// GET /api/admin/notifications/unread-count — cheap, polled by the bell.
export const getUnreadCount = async (req, res) => {
  try {
    res.json({ unreadCount: await AdminNotification.countDocuments({ readAt: null, createdAt: { $gte: historyCutoff() } }) });
  } catch (error) {
    fail(res, error);
  }
};

// PATCH /api/admin/notifications/:id/read
export const markNotificationRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }
    await AdminNotification.updateOne({ _id: req.params.id, readAt: null }, { readAt: new Date() });
    res.json({ unreadCount: await AdminNotification.countDocuments({ readAt: null, createdAt: { $gte: historyCutoff() } }) });
  } catch (error) {
    fail(res, error);
  }
};

// PATCH /api/admin/notifications/read-all
export const markAllNotificationsRead = async (req, res) => {
  try {
    await AdminNotification.updateMany({ readAt: null }, { readAt: new Date() });
    res.json({ unreadCount: 0 });
  } catch (error) {
    fail(res, error);
  }
};