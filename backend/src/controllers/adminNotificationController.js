import mongoose from "mongoose";
import AdminNotification from "../models/AdminNotification.js";

const fail = (res, error) => {
  console.error("Admin notifications error:", error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
};

// GET /api/admin/notifications?unread=true&limit=30
export const listNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const filter = req.query.unread === "true" ? { readAt: null } : {};
    const [items, unreadCount] = await Promise.all([
      AdminNotification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      AdminNotification.countDocuments({ readAt: null }),
    ]);
    res.json({ items, unreadCount });
  } catch (error) {
    fail(res, error);
  }
};

// GET /api/admin/notifications/unread-count — cheap, polled by the bell.
export const getUnreadCount = async (req, res) => {
  try {
    res.json({ unreadCount: await AdminNotification.countDocuments({ readAt: null }) });
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
    res.json({ unreadCount: await AdminNotification.countDocuments({ readAt: null }) });
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