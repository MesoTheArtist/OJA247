import Business from "../models/Business.js";
import Follow from "../models/Follow.js";
import User from "../models/User.js";
import { cleanProfileUpdates } from "../services/customerProfileRules.js";

// Same shape as getCustomerMe in customerAuthController.js, so the app can
// treat the reply of a profile change exactly like a fresh "who am I" call.
function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerified === true,
  };
}

// PATCH /api/customer-auth/me
// body: { fullName?, phone? } - a signed-in shopper changes their own name
// and/or phone number. The email is deliberately not editable here: it is
// what the account, guest-order linking and sign-in are tied to.
export const updateCustomerProfile = async (req, res) => {
  try {
    const { updates, error } = cleanProfileUpdates(req.body);
    if (error) return res.status(400).json({ message: error });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "Account not found" });

    res.json(publicUser(user));
  } catch (err) {
    console.error("Update customer profile error:", err);
    res.status(500).json({ message: "Could not save your details. Please try again." });
  }
};

// GET /api/follows
// The stores the signed-in shopper follows, newest follow first. A store
// that has since been hidden from public listings is left out.
export const listFollowedBusinesses = async (req, res) => {
  try {
    const follows = await Follow.find({ customerId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .select("businessId");

    const businesses = await Business.find({
      _id: { $in: follows.map((follow) => follow.businessId) },
      isHidden: { $ne: true },
    }).select("name logo category location slug verified rating");

    const byId = new Map(businesses.map((business) => [String(business._id), business]));
    const stores = follows
      .map((follow) => byId.get(String(follow.businessId)))
      .filter(Boolean)
      .map((business) => ({
        _id: business._id,
        name: business.name,
        logo: business.logo || "",
        category: business.category || "",
        location: business.location || "",
        slug: business.slug || "",
        verified: business.verified === true,
        rating: typeof business.rating === "number" ? business.rating : null,
      }));

    res.json({ stores });
  } catch (err) {
    console.error("List followed businesses error:", err);
    res.status(500).json({ message: "Could not load the stores you follow." });
  }
};