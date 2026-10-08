import mongoose from "mongoose";

const BusinessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    category: String,
    location: String,
    contact: String,
    images: [String],
    logo: String,
    banner: String,
    themeColor: String,
    socialLinks: {
      facebook: String,
      instagram: String,
      twitter: String,
      website: String
    },
    highlights: [String],
    deliveryFeeInState: { type: Number, default: 0 },
    deliveryFeeOutState: { type: Number, default: 0 },
    isHidden: { type: Boolean, default: false }, // hides this business from public listings
    featured: { type: Boolean, default: false }, // admin-only — was previously used but missing from schema
    verified: { type: Boolean, default: false }, // admin-only — shown as a trust badge on the storefront

    // Denormalized off Review — recomputed by reviewController whenever a
    // review is created (see recomputeBusinessRating), not read live from
    // Review on every storefront view. rating is null (not 0) until the
    // first review exists, so the frontend's `typeof business.rating ===
    // "number"` check correctly hides the rating row for a business with
    // no reviews yet instead of showing a misleading 0.0.
    rating: { type: Number, default: null, min: 1, max: 5 },
    reviewCount: { type: Number, default: 0 },
    slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true }, // vendor-editable, readable store URL (e.g. "chioma-fashion")
    // Admin-controlled vendor verification countdown. Null = not started yet,
    // so the business is never auto-hidden regardless of verification tier.
    verificationDeadline: { type: Date, default: null },

    // Kill-switch tab: per-business override, independent of the global
    // enforceSubscriptionVisibility flag (see PlatformSettings.js). When
    // true, this business is ALWAYS shown in public listings regardless of
    // subscription status — an admin exempts specific businesses one at a
    // time rather than only flipping the global switch.
    visibilityExempt: { type: Boolean, default: false },

    // Grandfather-period tab: separate mechanism from visibilityExempt
    // above. When set to a future date, this business is shown in public
    // listings (regardless of subscription status) until that date, then
    // reverts to being governed by the normal rule. Null = no grandfather
    // period active. Kept distinct from visibilityExempt because this one
    // is time-boxed and meant for "give existing vendors N months to pay",
    // not a permanent exemption.
    grandfatherExemptUntil: { type: Date, default: null },
    // Set when the "your free visibility ends soon" email goes out; reset to
    // null whenever an admin sets or changes the exemption date, so each
    // exemption is reminded about once.
    grandfatherReminderSentAt: { type: Date, default: null },

    // --- Subscription (new) ---
    subscriptionStatus: {
      type: String,
      enum: ["inactive", "active", "expired"],
      default: "inactive",
    },
    subscriptionExpiresAt: { type: Date, default: null },
    hasPaidFirstSubscription: { type: Boolean, default: false }, // gates the marketer payout rule

    // Tracks which subscription-expiry emails have already gone out for the
    // CURRENT subscriptionExpiresAt value, so the daily cron doesn't re-send
    // the same reminder every day it runs. Both reset to null on the next
    // successful subscription payment (see subscriptionController.js).
    subscriptionReminderSentAt: { type: Date, default: null },
    subscriptionExpiredEmailSentAt: { type: Date, default: null },
    // Separate from the two above: those only fire for a business that HAD
    // a subscription (subscriptionExpiresAt set). A business that's never
    // subscribed at all falls through both — see
    // subscriptionExpiryCronController's third pass, and
    // NEVER_SUBSCRIBED_REMINDER_INTERVAL_DAYS there for the re-nag cadence.
    neverSubscribedReminderSentAt: { type: Date, default: null },

    // --- Referral (new) ---
    // This business's OWN code, for referring other businesses (business-owner track)
    referralCode: { type: String, unique: true, sparse: true, uppercase: true },
    // The code THIS business signed up with, if any — captured once, permanent
    referredByCode: { type: String, default: null },
    // Denormalized running total — PointsLedger is the source of truth,
    // this is kept in sync for fast dashboard reads
    pointsBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Business", BusinessSchema);