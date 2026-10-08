import mongoose from "mongoose";

// 1 point = ₦1 throughout, per the finalized spec (1000 points earned per
// successful referral = ₦1000).
const PointsLedgerSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },

    type: {
      type: String,
      // "withdrawal_refunded" puts a rejected withdrawal's points back (positive points)
      enum: ["earned", "redeemed_subscription", "withdrawn_cash", "withdrawal_refunded"],
      required: true,
    },
    points: { type: Number, required: true }, // positive for "earned", negative for redeem/withdraw
    balanceAfter: { type: Number, required: true }, // running balance, denormalized for fast display

    // Present only on "earned" entries
    referralAttributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReferralAttribution",
      default: null,
    },

    // Present only on "withdrawn_cash" entries — no minimum threshold per spec,
    // but still tracked through a status so payouts can be batched/audited.
    status: {
      type: String,
      enum: ["n/a", "pending", "paid", "failed", "rejected"],
      default: "n/a",
    },
    transferReference: { type: String, default: "" },
    // Set on a rejected withdrawal (shown to the vendor), and on the matching
    // "withdrawal_refunded" entry that points back at the withdrawal it undoes.
    rejectionReason: { type: String, default: "" },
    refundOfEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "PointsLedger", default: null },
  },
  { timestamps: true }
);

PointsLedgerSchema.index({ businessId: 1, createdAt: -1 });
// An "earned" entry can only be recorded once per conversion
PointsLedgerSchema.index(
  { referralAttributionId: 1 },
  { unique: true, partialFilterExpression: { referralAttributionId: { $type: "objectId" } } }
);

export default mongoose.model("PointsLedger", PointsLedgerSchema);