import mongoose from "mongoose";

// How long after an order a customer can still raise a dispute against it.
// Baseline is the order's createdAt (paid ~= created for these purposes —
// there's no separate "delivered" timestamp yet). Revisit once Order gets
// a real delivered status; a window from delivery would be more accurate
// than one from order date.
export const DISPUTE_WINDOW_DAYS = 5;

// A bank-transfer order the vendor has left unanswered this long can be
// disputed by the customer (reason "payment_not_confirmed"), and the admin is
// emailed at the same point. Also mirrored in oja247/src/utils/disputes.js.
export const UNCONFIRMED_PAYMENT_DAYS = 3;

// How long a vendor gets to resolve a dispute directly with the customer
// before it's eligible to auto-escalate to admin. This is a hard timeout,
// not a soft expectation — the platform has no way to compel a vendor to
// respond, so waiting indefinitely isn't an option (see the phased plan
// doc's note on the platform having no operational control over vendors).
export const SELF_RESOLVE_WINDOW_DAYS = 7;

// Phase 5 — auto-flag thresholds. A vendor needs at least FLAG_MIN_ORDERS
// completed orders in the window before their rate counts for anything
// (1 dispute out of 1 order is noise, not a pattern). Flagging only
// surfaces the vendor as a ban candidate for admin (see adminController.js
// getFlaggedVendors) — it doesn't do anything on its own, since the
// platform has no lever between "visible to admin" and "ban" (no way to
// compel a vendor to improve).
export const FLAG_WINDOW_DAYS = 90;
export const FLAG_MIN_ORDERS = 5;
export const FLAG_DISPUTE_RATE_THRESHOLD = 0.2;

const DisputeEvidenceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    uploadedBy: { type: String, enum: ["customer", "vendor"], required: true },
  },
  { _id: false }
);

const DisputeSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    orderReference: { type: String, required: true },

    // String, not an ObjectId ref — matches how Order.items/vendors already
    // store businessId as a plain string (see Order.js), so this stays
    // consistent with the rest of the order data it's attached to.
    businessId: { type: String, required: true },
    businessName: { type: String, default: "" },

    // Empty array = whole-order dispute. Non-empty = only these items are
    // in dispute — supports partial disputes without a second model.
    // productId values match Order.items[].productId (also a plain string).
    itemIds: { type: [String], default: [] },

    // Denormalized off the order at filing time rather than populated live
    // — this is a record of what the customer said when they filed, and
    // account-linking doesn't exist yet (no customer account system), so
    // there's nothing else to point this at.
    customer: {
      fullName: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },

    reason: {
      type: String,
      enum: ["item_not_received", "wrong_item", "damaged", "not_as_described", "payment_not_confirmed", "other"],
      required: true,
    },
    description: { type: String, required: true },
    evidence: { type: [DisputeEvidenceSchema], default: [] },

    // open -> escalated -> resolved | unresolved
    // No resolved_refunded/resolved_denied split — the platform doesn't
    // process the refund itself (see phased plan doc), so this only
    // tracks whether the dispute got sorted out, not how.
    status: {
      type: String,
      enum: ["open", "escalated", "resolved", "unresolved"],
      default: "open",
    },

    // Filled in by the vendor self-resolve endpoint (Phase 2 — not built
    // yet in this pass, but the field lives here now so Phase 2 doesn't
    // need a schema migration).
    vendorResponse: {
      note: { type: String, default: "" },
      respondedAt: { type: Date, default: null },
    },

    // Filled in by admin resolution (Phase 3 — same note as above).
    adminResolution: {
      note: { type: String, default: "" },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      resolvedAt: { type: Date, default: null },
    },

    escalatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DisputeSchema.index({ businessId: 1, status: 1 });
DisputeSchema.index({ status: 1, createdAt: -1 });
DisputeSchema.index({ orderId: 1 });

export default mongoose.model("Dispute", DisputeSchema);