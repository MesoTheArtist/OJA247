import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    orderReference: { type: String, required: true },

    // String, not an ObjectId ref — matches Order.items/vendors, which
    // already store businessId as a plain string (see Order.js), so this
    // stays consistent with the order data it's verified against.
    businessId: { type: String, required: true, index: true },
    businessName: { type: String, default: "" },

    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Denormalized at write time, same reasoning as Dispute.customer — this
    // is what the reviewer's name was when they wrote it, not a live join.
    customerName: { type: String, required: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 2000 },

    // Public reply from the vendor being reviewed. Nothing else can appear
    // more than once here — one reply per review, matching how storefront
    // reviews commonly work (customer says their piece, vendor gets the
    // last word once).
    vendorReply: {
      note: { type: String, default: "" },
      respondedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// One review per customer per vendor per order — verified-purchase gate
// (see createReview) plus this index is what makes a duplicate POST fail
// cleanly instead of piling up repeat reviews for the same purchase. No
// time limit on when it can be left, matching the disputes window's
// opposite: reviews were deliberately left open-ended.
ReviewSchema.index({ orderId: 1, businessId: 1, customerId: 1 }, { unique: true });
// Storefront review list, newest first.
ReviewSchema.index({ businessId: 1, createdAt: -1 });

export default mongoose.model("Review", ReviewSchema);