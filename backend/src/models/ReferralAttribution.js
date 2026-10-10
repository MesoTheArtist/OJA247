import mongoose from "mongoose";

const ReferralAttributionSchema = new mongoose.Schema(
  {
    // Who gets credit
    referrerType: { type: String, enum: ["marketer", "business"], required: true },
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "referrerModel",
    },
    // Stored (not virtual) so refPath can resolve it during populate.
    // Set from referrerType when the document is created — see referralService.js.
    referrerModel: { type: String, enum: ["Marketer", "Business"], required: true },
    referralCode: { type: String, required: true, uppercase: true }, // denormalized for audit

    // Who was referred — currently only Business signups trigger a payout,
    // since the conversion rule is tied to the subscription fee payment.
    referredBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "converted"],
      default: "pending",
    },
    convertedAt: { type: Date, default: null },
    // Amount the payout/points calculation was based on (the subscription
    // payment amount), captured at conversion time for an accurate audit trail
    // even if the subscription fee changes later.
    conversionBaseAmount: { type: Number, default: null },
    conversionPlanType: { type: String, enum: ["monthly", "six_month", "yearly"], default: null },
    conversionPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPayment", default: null },
    conversionPaymentReference: { type: String, default: "" },
  },
  { timestamps: true }
);

// A business can only ever be attributed to one referrer — this is the core
// fraud guard: prevents a business signup being (re)attributed or double-counted.
ReferralAttributionSchema.index({ referredBusinessId: 1 }, { unique: true });

export default mongoose.model("ReferralAttribution", ReferralAttributionSchema);
