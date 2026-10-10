import mongoose from "mongoose";

const PLAN_PRICES = {
  monthly: 1999,
  six_month: 9999,
  yearly: 17999,
};

const SubscriptionPaymentSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    planType: { type: String, enum: ["monthly", "six_month", "yearly"], required: true },
    amount: { type: Number, required: true }, // set from PLAN_PRICES[planType] at creation — not hardcoded, plans can change price later without editing old records

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    paystackReference: { type: String, default: "" },

    // Points applied toward this plan's price (1 point = ₦1). "amount" above
    // always stays the full plan price for accounting/marketer-payout
    // purposes — this tracks how much of it was covered by points rather
    // than actually charged. Deducted from the business's balance only once
    // the payment (or the points-only path) actually succeeds.
    pointsApplied: { type: Number, default: 0 },
    autoRenewRequested: { type: Boolean, default: false },
    autoRenewActivated: { type: Boolean, default: false },

    // Critical for the marketer payout rule: the tiered payout % applies to
    // the referral's FIRST successful payment only, never on renewals.
    isFirstPayment: { type: Boolean, required: true },

    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
  },
  { timestamps: true }
);

SubscriptionPaymentSchema.index({ businessId: 1, createdAt: -1 });

export { PLAN_PRICES };

export default mongoose.model("SubscriptionPayment", SubscriptionPaymentSchema);
