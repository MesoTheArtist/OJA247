import mongoose from "mongoose";

const MarketerPayoutSchema = new mongoose.Schema(
  {
    marketerId: { type: mongoose.Schema.Types.ObjectId, ref: "Marketer", required: true },
    referralAttributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReferralAttribution",
      required: true,
      unique: true, // one payout per conversion — hard stop against double-paying
    },
    amount: { type: Number, required: true }, // Plan-tiered commission on eligible subscription cash
    planType: { type: String, enum: ["monthly", "six_month", "yearly"], default: null },
    conversionAmount: { type: Number, default: null },
    commissionRate: { type: Number, default: null },
    paymentReference: { type: String, default: "" },
    subscriptionPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPayment", default: null },

    status: {
      type: String,
      enum: ["pending", "batched", "paid", "failed", "rejected"],
      default: "pending",
    },
    // Set when the weekly batch job picks this up
    payoutWeekStart: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    // Filled in once the transfer mechanism (Paystack transfers vs. other) is decided
    transferReference: { type: String, default: "" },
    failureReason: { type: String, default: "" },
    // Set when an admin declines the payout (e.g. suspected self-referral or
    // fraud). The row is kept, so the one-payout-per-referral rule still holds
    // and the marketer can see what happened and why.
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

MarketerPayoutSchema.index({ marketerId: 1, status: 1 });

export default mongoose.model("MarketerPayout", MarketerPayoutSchema);