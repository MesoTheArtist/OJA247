import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    businessId: { type: String, default: null },
    name: { type: String, required: true },
    category: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: "" },
  },
  { _id: false }
);

const OrderVendorSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: null },
    businessName: { type: String, default: "" },
    itemsSubtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    // Delivery progress for THIS vendor's part of the order. One order can
    // span several vendors, and each ships separately, so it lives here and
    // not on the order. Orders created before this existed have no value;
    // treat a missing one as "processing".
    fulfillmentStatus: {
      type: String,
      enum: ["processing", "shipped", "received"],
      default: "processing",
    },
    shippedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    // True when the customer never confirmed and the daily job marked it.
    autoReceived: { type: Boolean, default: false },
    receiptReminderSentAt: { type: Date, default: null },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Null for a guest order. Set retroactively (not necessarily at order
    // time) if the same email later creates or logs into a customer
    // account — see linkGuestOrders in customerAuthController.js. Every
    // order is placed the same way (guest checkout, no account required),
    // this just gets backfilled after the fact.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    customer: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, default: "" },
      note: { type: String, default: "" },
    },
    items: [OrderItemSchema],
    vendors: [OrderVendorSchema],
    subtotal: { type: Number, required: true, min: 0 },
    serviceFee: { type: Number, required: true, min: 0, default: 0 },
    vat: { type: Number, required: true, min: 0, default: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    deliveryMethod: { type: String, default: "delivery" },
    status: {
      type: String,
      // disputed/refunded added alongside the Dispute model (see
      // Dispute.js) — previously an order just went dark after "paid"
      // with no way to reflect a dispute or an off-platform refund. The
      // platform doesn't process refunds itself (see the disputes phased
      // plan doc), so "refunded" here is a record-keeping label set by
      // whoever resolves the dispute, not a trigger for any payment action.
      // awaiting_confirmation / payment_rejected belong to bank-transfer
      // orders: the customer paid the vendor's own bank account and uploaded
      // a receipt, and the vendor has not yet confirmed (or has turned down)
      // that payment. Nothing downstream treats these as paid.
      enum: [
        "pending",
        "paid",
        "failed",
        "cancelled",
        "disputed",
        "refunded",
        "awaiting_confirmation",
        "payment_rejected",
      ],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled", "awaiting_confirmation", "payment_rejected"],
      default: "pending",
    },
    // "paystack" is every order placed before direct bank transfer existed.
    paymentMethod: {
      type: String,
      enum: ["paystack", "bank_transfer"],
      default: "paystack",
    },
    // Bank-transfer proof. Receipts are stored privately on Cloudinary
    // (authenticated delivery), so only a signed link works — never a public URL.
    paymentReceipts: [
      {
        publicId: { type: String, required: true },
        resourceType: { type: String, default: "image" },
        format: { type: String, default: "" },
        originalName: { type: String, default: "" },
        uploadedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    // Every time the vendor turned a payment down, newest last.
    paymentRejections: [
      {
        reason: { type: String, required: true },
        rejectedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    paymentConfirmedAt: { type: Date, default: null },
    // For the daily follow-up job on unconfirmed bank-transfer orders.
    lastVendorReminderAt: { type: Date, default: null },
    adminNonComplianceAlertedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Order", OrderSchema);