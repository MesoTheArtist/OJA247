import mongoose from "mongoose";

// Singleton: exactly one document ever exists for this collection. Add more
// global on/off switches here as flat booleans rather than creating a new
// model per switch.
const PlatformSettingsSchema = new mongoose.Schema(
  {
    // When true, getBusinesses() hides any business without a currently
    // active subscription (see businessController.js). Defaults to false —
    // OFF — so existing pre-subscription businesses aren't suddenly hidden
    // the moment this collection is created; an admin turns it on
    // deliberately once vendors have had a fair chance to actually pay.
    enforceSubscriptionVisibility: { type: Boolean, default: false },

    // Master switch for Google AdSense ads on the public site. Defaults to
    // true so ads show as soon as AdSense is approved and configured; an admin
    // can turn them off instantly without redeploying. The frontend reads it
    // from GET /api/settings/public.
    adsEnabled: { type: Boolean, default: true },

    // Free days a new vendor gets when they sign up with a valid referral code
    // (marketer code or another vendor's code). 0 turns the free trial off.
    // Admin-editable so it can be run as a promo (e.g. 14 days in December).
    referralTrialDays: { type: Number, default: 7, min: 0, max: 60 },
  },
  { timestamps: true }
);

const PlatformSettings = mongoose.model("PlatformSettings", PlatformSettingsSchema);

// There is only ever one settings document — this creates it with defaults
// on first access if it doesn't exist yet, and returns it either way.
PlatformSettings.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default PlatformSettings;