import mongoose from "mongoose";
import Business from "../models/Business.js";
import Order from "../models/Order.js";
import PlatformSettings from "../models/PlatformSettings.js";
import User from "../models/User.js";
import Follow from "../models/Follow.js";
import { isValidCustomReferralCode, isBusinessReferralCodeTaken } from "../services/referralService.js";
import { sendBusinessReferralCodeChangedEmail } from "../services/emailService.js";

// Looks up the business owner's login email — Business itself only stores
// a public contact phone, not an email. Same pattern as the identically-
// named helper in subscriptionController.js/subscriptionExpiryCronController.js.
async function getOwnerEmail(businessId) {
  const owner = await User.findOne({ businessId }).select("email");
  return owner?.email || null;
}

// Turns "Chioma Fashion & Co." into "chioma-fashion-co"
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // strip anything that isn't a letter, number, space, or hyphen
    .replace(/[\s_]+/g, "-") // spaces/underscores -> hyphen
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphen

// Generates a unique slug, appending -2, -3, etc. if the base slug is taken.
// excludeId lets an update skip colliding with the business's own current slug.
const generateUniqueSlug = async (name, excludeId = null) => {
  const base = slugify(name) || "store";
  let slug = base;
  let suffix = 2;

  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await Business.findOne(query);
    if (!existing) return slug;

    slug = `${base}-${suffix}`;
    suffix += 1;
  }
};

// GET all — excludes businesses an admin has hidden, and (only when the
// enforceSubscriptionVisibility kill switch is ON — see PlatformSettings.js
// and /api/admin/settings) businesses without a currently-active paid
// subscription (never subscribed, OR subscribed but subscriptionExpiresAt
// has passed). This is a live check, not cron-driven: the moment a vendor
// pays and subscriptionExpiresAt moves into the future, they reappear on
// the very next fetch — no separate "un-hide" step needed.
// The owner can still log in and use their dashboard either way — this only
// gates the public listing, not account access.
export const getBusinesses = async (req, res) => {
  try {
    const businesses = await Business.find({ isHidden: { $ne: true } }).lean();

    const settings = await PlatformSettings.getSettings();
    if (!settings.enforceSubscriptionVisibility) {
      return res.json(businesses); // kill switch is off — subscription status doesn't affect visibility
    }

    const now = Date.now();
    const visible = businesses.filter((b) => {
      // Kill-switch tab override — always shown regardless of subscription.
      if (b.visibilityExempt) return true;
      // Grandfather tab override — shown until the exemption date passes.
      if (b.grandfatherExemptUntil && now <= new Date(b.grandfatherExemptUntil).getTime()) {
        return true;
      }
      if (!b.subscriptionExpiresAt) return false;
      return now <= new Date(b.subscriptionExpiresAt).getTime();
    });

    res.json(visible);
  } catch (error) {
    res.status(500).json({ message: "Error fetching businesses" });
  }
};

// GET one — accepts either a Mongo ObjectId or a slug, so old links
// (/business/<id>) and new readable links (/business/<slug>) both work.
export const getBusiness = async (req, res) => {
  try {
    const { id } = req.params;

    const business = mongoose.Types.ObjectId.isValid(id)
      ? await Business.findById(id)
      : await Business.findOne({ slug: id });

    if (!business) return res.status(404).json({ message: "Not found" });

    // Follower count is public info (shown to guests too, same as any
    // other social-proof number) — this route stays unauthenticated on
    // purpose, so "am I following this" isn't answered here at all; the
    // frontend makes a separate, protected call to /api/follows/status
    // only when the viewer is actually a logged-in customer.
    const followerCount = await Follow.countDocuments({ businessId: business._id });

    // Platform-wide toggle, not business-specific data — safe on this public
    // route. The vendor dashboard uses this same endpoint to load its own
    // business, and needs to know whether subscription status currently
    // affects visibility at all before it nudges an unsubscribed vendor to
    // pay (see AccountAlertsPopup's "neverSubscribed" case) — no point
    // warning them about invisibility while the kill switch is off.
    const settings = await PlatformSettings.getSettings();

    res.json({
      ...business.toObject(),
      followerCount,
      enforceSubscriptionVisibility: settings.enforceSubscriptionVisibility,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching business" });
  }
};

// POST new
export const createBusiness = async (req, res) => {
  try {
    const slug = await generateUniqueSlug(req.body.name || "store");

    const newBusiness = new Business({ ...req.body, slug });
    const saved = await newBusiness.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: "Error creating business" });
  }
};

// PUT update
export const updateBusiness = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      "name",
      "description",
      "category",
      "location",
      "contact",
      "logo",
      "banner",
      "themeColor",
      "socialLinks",
      "highlights",
      "deliveryFeeInState",
      "deliveryFeeOutState",
      "slug",
      // Note: "featured" and "verified" are deliberately excluded — those
      // are admin-only and set through /api/admin/businesses/:id/featured
      // and /api/admin/businesses/:id/verified instead.
    ];

    const sanitizedUpdates = {};
    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    });

    // If the vendor supplied a custom slug, normalize + guarantee it's unique
    // (excluding their own current business from the collision check).
    if (sanitizedUpdates.slug !== undefined) {
      const cleanSlug = slugify(sanitizedUpdates.slug);
      if (!cleanSlug) {
        return res.status(400).json({ message: "Store link can't be empty." });
      }

      const existing = await Business.findOne({ slug: cleanSlug, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ message: "That store link is already taken. Try another." });
      }

      sanitizedUpdates.slug = cleanSlug;
    }

    const updatedBusiness = await Business.findByIdAndUpdate(id, sanitizedUpdates, {
      new: true,
      runValidators: true,
    });

    if (!updatedBusiness) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json(updatedBusiness);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "That store link is already taken. Try another." });
    }
    res.status(400).json({ message: error.message });
  }
};

// PATCH /api/businesses/:id/referral-code
// Lets a vendor pick their own short referral code (7-8 letters/numbers)
// in place of the random one assigned at signup — mirrors the custom
// store-slug pattern in updateBusiness above.
// GET /api/businesses/:id/earnings-summary
// Read-only aggregation — no money moves or is held here. Combines order
// earnings (already settled to the vendor's own bank via Paystack Split —
// this is just a summary of past payments, not a balance we control),
// referral points balance, and subscription status into one view so the
// vendor doesn't have to piece it together from three different tabs.
export const getEarningsSummary = async (req, res) => {
  try {
    const businessId = req.params.id;

    const business = await Business.findById(businessId).select(
      "pointsBalance subscriptionStatus subscriptionExpiresAt"
    );
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const [orderStats] = await Order.aggregate([
      { $match: { status: "paid", "vendors.businessId": business._id } },
      { $unwind: "$vendors" },
      { $match: { "vendors.businessId": business._id } },
      {
        $group: {
          _id: null,
          totalEarned: { $sum: { $add: ["$vendors.itemsSubtotal", "$vendors.deliveryFee"] } },
          ordersCount: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      totalEarned: orderStats?.totalEarned || 0,
      ordersCount: orderStats?.ordersCount || 0,
      pointsBalance: business.pointsBalance || 0,
      subscriptionStatus: business.subscriptionStatus,
      subscriptionExpiresAt: business.subscriptionExpiresAt,
    });
  } catch (error) {
    console.error("Get earnings summary error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const updateBusinessReferralCode = async (req, res) => {
  try {
    const { id } = req.params;
    const raw = String(req.body.referralCode || "")
      .trim()
      .toUpperCase();

    if (!isValidCustomReferralCode(raw)) {
      return res.status(400).json({
        message: "Referral code must be 7-8 characters, letters and numbers only.",
      });
    }

    if (await isBusinessReferralCodeTaken(raw, id)) {
      return res.status(400).json({ message: "That referral code is already taken. Try another." });
    }

    const before = await Business.findById(id).select("referralCode");
    const oldCode = before?.referralCode;

    const updated = await Business.findByIdAndUpdate(
      id,
      { referralCode: raw },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Business not found" });
    }

    if (oldCode && oldCode !== updated.referralCode) {
      const to = await getOwnerEmail(id);
      if (to) {
        sendBusinessReferralCodeChangedEmail({
          to,
          businessName: updated.name,
          oldCode,
          newCode: updated.referralCode,
        });
      }
    }

    res.json({ success: true, referralCode: updated.referralCode });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "That referral code is already taken. Try another." });
    }
    res.status(400).json({ message: error.message });
  }
};