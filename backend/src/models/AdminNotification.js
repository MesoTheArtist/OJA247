import mongoose from "mongoose";

// One row per thing the admin should know about (a sign-up, a new transfer
// order, a dispute, ...). Shared by every admin: "read" is a single flag, not
// one per admin, which is fine while there is one person running the site.
// How far back the admin can read notification history. Anything older is
// hidden by every read; the database's own cleanup (below) removes it later.
export const NOTIFICATION_HISTORY_DAYS = 50;

export const ADMIN_NOTIFICATION_TYPES = [
  "signup_vendor",
  "signup_customer",
  "signup_marketer",
  "order_placed",
  "dispute_filed",
  "dispute_escalated",
  "verification_submitted",
  "subscription_paid",
];

const AdminNotificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ADMIN_NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, default: "", maxlength: 1000 },
    // Admin dashboard tab to open when the notification is clicked.
    tab: { type: String, default: "overview" },
    // Small bag of facts for display (never secrets): referral code, reference, ...
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

AdminNotificationSchema.index({ createdAt: -1 });
// Old notifications clean themselves up after 90 days.
AdminNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("AdminNotification", AdminNotificationSchema);