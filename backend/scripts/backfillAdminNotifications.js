// One-time backfill: the admin notification center only records things from
// the day it went live, so earlier sign-ups, orders, disputes and subscription
// payments never made it in. This rebuilds the last 50 days of history from the
// records that already exist, so the Notifications tab isn't empty.
//
// Run from the backend folder (needs the same .env as the server):
//   node scripts/backfillAdminNotifications.js --dry      # just report what it would add
//   node scripts/backfillAdminNotifications.js            # add them
//   node scripts/backfillAdminNotifications.js --unread-days=5
//
// Safe to re-run: anything already in the notification center (live or from a
// previous run) is skipped, so nothing is ever added twice. Notifications
// from the last few days (default 2) are left unread so they show on the bell;
// older ones are marked read so the bell doesn't light up with a pile of
// history. Vendor verification submissions are not rebuilt, because there is
// no record of when they were sent.

import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../src/db.js";
import AdminNotification, { NOTIFICATION_HISTORY_DAYS } from "../src/models/AdminNotification.js";
import User from "../src/models/User.js";
import Business from "../src/models/Business.js";
import Marketer from "../src/models/Marketer.js";
import Order from "../src/models/Order.js";
import Dispute from "../src/models/Dispute.js";
import SubscriptionPayment from "../src/models/SubscriptionPayment.js";
import ReferralAttribution from "../src/models/ReferralAttribution.js";

const dryRun = process.argv.includes("--dry");
const unreadDaysArg = process.argv.find((a) => a.startsWith("--unread-days="));
const UNREAD_DAYS = unreadDaysArg ? Math.max(0, Number(unreadDaysArg.split("=")[1]) || 0) : 2;
const DAY = 24 * 60 * 60 * 1000;
const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
const PLAN = { monthly: "Monthly", six_month: "6-month", yearly: "Yearly" };

// Which meta field identifies the source record, per notification type.
const ID_FIELD = {
  signup_vendor: "businessId",
  signup_customer: "userId",
  signup_marketer: "marketerId",
  order_placed: "orderId",
  dispute_filed: "disputeId",
  subscription_paid: "paymentId",
};

const run = async () => {
  await connectDB();
  const now = Date.now();
  const cutoff = new Date(now - NOTIFICATION_HISTORY_DAYS * DAY);
  const unreadFrom = new Date(now - UNREAD_DAYS * DAY);
  console.log(`${dryRun ? "[DRY RUN] " : ""}Rebuilding notifications from ${cutoff.toDateString()} onwards...\n`);

  // What is already there (live ones and earlier backfills), so we never double up.
  const existing = await AdminNotification.find({ createdAt: { $gte: cutoff } }).select("type meta").lean();
  const seen = new Set();
  for (const n of existing) {
    const idField = ID_FIELD[n.type];
    if (idField && n.meta?.[idField]) seen.add(`${n.type}:${n.meta[idField]}`);
  }

  const candidates = [];
  const add = (type, sourceId, createdAt, title, message, tab, meta) => {
    if (seen.has(`${type}:${sourceId}`)) return;
    candidates.push({
      type,
      title: String(title).slice(0, 200),
      message: String(message).slice(0, 1000),
      tab,
      meta: { ...meta, [ID_FIELD[type]]: String(sourceId), backfilled: true },
      createdAt,
      updatedAt: createdAt,
      readAt: createdAt >= unreadFrom ? null : new Date(),
    });
  };

  // ── Vendors (with the referral code they used, from the saved attribution)
  const owners = await User.find({ role: "owner", createdAt: { $gte: cutoff }, businessId: { $ne: null } }).lean();
  const ownerBusinesses = await Business.find({ _id: { $in: owners.map((u) => u.businessId) } }).select("name category location").lean();
  const businessById = new Map(ownerBusinesses.map((b) => [String(b._id), b]));
  const attributions = await ReferralAttribution.find({ referredBusinessId: { $in: owners.map((u) => u.businessId) } }).lean();
  const attributionByBusiness = new Map(attributions.map((a) => [String(a.referredBusinessId), a]));
  const marketerNames = new Map(
    (await Marketer.find({ _id: { $in: attributions.filter((a) => a.referrerType === "marketer").map((a) => a.referrerId) } }).select("name").lean()).map((m) => [String(m._id), m.name])
  );
  const referrerBusinessNames = new Map(
    (await Business.find({ _id: { $in: attributions.filter((a) => a.referrerType === "business").map((a) => a.referrerId) } }).select("name").lean()).map((b) => [String(b._id), b.name])
  );
  for (const user of owners) {
    const business = businessById.get(String(user.businessId));
    if (!business) continue;
    const attribution = attributionByBusiness.get(String(user.businessId));
    let referral = "No referral code recorded.";
    if (attribution) {
      const ownerName =
        attribution.referrerType === "marketer"
          ? marketerNames.get(String(attribution.referrerId))
          : referrerBusinessNames.get(String(attribution.referrerId));
      referral = `Referral code: ${attribution.referralCode} (${attribution.referrerType} ${ownerName || "unknown"}).`;
    }
    add(
      "signup_vendor",
      business._id,
      user.createdAt,
      `New vendor: ${business.name}`,
      `${user.email} · ${business.category} · ${business.location}. ${referral}`,
      "businesses",
      { email: user.email, referralCodeUsed: attribution?.referralCode || null }
    );
  }

  // ── Customers
  const customers = await User.find({ role: "customer", createdAt: { $gte: cutoff } }).lean();
  for (const user of customers) {
    add("signup_customer", user._id, user.createdAt, `New customer: ${user.fullName || user.email}`, `${user.email} signed up.`, "customers", {
      email: user.email,
    });
  }

  // ── Marketers
  const marketers = await Marketer.find({ createdAt: { $gte: cutoff } }).lean();
  for (const m of marketers) {
    add("signup_marketer", m._id, m.createdAt, `New marketer: ${m.name}`, `${m.email} · ${m.phone}. Their referral code is ${m.referralCode}.`, "marketers", {
      email: m.email,
      referralCode: m.referralCode,
    });
  }

  // ── Bank-transfer orders
  const orders = await Order.find({ paymentMethod: "bank_transfer", createdAt: { $gte: cutoff } }).lean();
  const orderBusinessIds = [...new Set(orders.map((o) => o.businessId).filter((id) => id && /^[a-f0-9]{24}$/i.test(String(id))))];
  const orderBusinesses = new Map(
    (await Business.find({ _id: { $in: orderBusinessIds } }).select("name").lean()).map((b) => [String(b._id), b.name])
  );
  for (const o of orders) {
    const shop = orderBusinesses.get(String(o.businessId)) || "a store";
    add(
      "order_placed",
      o._id,
      o.createdAt,
      `New transfer order: ${shop}`,
      `${o.customer?.fullName || "A customer"} placed order ${o.reference} for ${naira(o.total)} (bank transfer).`,
      "waiting-orders",
      { reference: o.reference, businessId: String(o.businessId || ""), total: o.total }
    );
  }

  // ── Disputes
  const disputes = await Dispute.find({ createdAt: { $gte: cutoff } }).lean();
  for (const d of disputes) {
    add("dispute_filed", d._id, d.createdAt, `New dispute: ${d.businessName || "a store"}`, `Order ${d.orderReference}: ${d.reason}.`, "orders", {
      reference: d.orderReference,
      reason: d.reason,
    });
  }

  // ── Subscription payments that went through
  const payments = await SubscriptionPayment.find({ status: "success", updatedAt: { $gte: cutoff } }).lean();
  const paymentBusinesses = new Map(
    (await Business.find({ _id: { $in: payments.map((p) => p.businessId) } }).select("name").lean()).map((b) => [String(b._id), b.name])
  );
  for (const p of payments) {
    const name = paymentBusinesses.get(String(p.businessId)) || "a business";
    const points = p.pointsApplied ? ` + ${p.pointsApplied} points` : "";
    add(
      "subscription_paid",
      p._id,
      p.updatedAt,
      `Subscription paid: ${name}`,
      `${PLAN[p.planType] || p.planType} plan · ${naira(p.amount)} plan value${points}.`,
      "transactions",
      { businessId: String(p.businessId), planType: p.planType }
    );
  }

  // ── Report / write
  const counts = {};
  candidates.forEach((c) => (counts[c.type] = (counts[c.type] || 0) + 1));
  console.log(candidates.length ? "To add:" : "Nothing to add — history is already complete.");
  Object.entries(counts).forEach(([type, n]) => console.log(`  ${type}: ${n}`));
  const unread = candidates.filter((c) => !c.readAt).length;
  if (candidates.length) console.log(`\n${unread} of them will show as unread (last ${UNREAD_DAYS} days); the rest are marked read.`);

  if (!dryRun && candidates.length) {
    // Straight into the collection so each keeps its real event time.
    await AdminNotification.collection.insertMany(candidates);
    console.log(`\nAdded ${candidates.length} notifications.`);
  } else if (dryRun) {
    console.log("\nDry run: nothing was written.");
  }
  process.exit(0);
};

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
