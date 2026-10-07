import mongoose from "mongoose";

// How often (in days) a vendor stuck below Verified tier gets a reminder
// email. This replaced the old 30-day auto-hide deadline — verification
// is nudged now, never enforced by hiding the storefront.
export const VERIFICATION_REMINDER_INTERVAL_DAYS = 7;

const VendorSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, unique: true },

    businessName: { type: String, required: true },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true },
    contactWhatsapp: { type: String, default: "" },

    // payout details
    bankCode: { type: String, required: true },
    bankName: { type: String, default: "" },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true }, // confirmed via Paystack's resolve-account endpoint
    bankNameMatch: { type: Boolean, default: false },
    // Legacy: Paystack subaccounts were used for checkout splits before
    // orders moved to direct bank transfer. New vendors do not get one.
    subaccountCode: { type: String, default: "" },
    subaccountId: { type: String, default: "" },

    // Set automatically when a bank-detail change fails the name-match
    // check (see onboardVendor) — blocks the vendor's subaccount from
    // receiving checkout payouts until an admin clears it via reviewVendor.
    payoutHold: { type: Boolean, default: false },
    payoutHoldReason: { type: String, default: "" },

    // KYC
    nin: { type: String, required: true },
    // Result of the provider (Dojah) NIN lookup. ninVerified stays false when
    // the check was skipped or the provider was unavailable, so the next
    // submission retries it. Only the holder's name is kept, not photo/DOB.
    ninVerified: { type: Boolean, default: false },
    ninHolderName: { type: String, default: "" },
    // Does the NIN holder's name appear in the payout account name? null =
    // not checked. A mismatch isn't a rejection (business accounts won't
    // match a person's name) — it's surfaced to the admin reviewer.
    ninNameMatch: { type: Boolean, default: null },
    cacDocumentUrl: { type: String, default: null },
    addressProofUrl: { type: String, default: null },
    selfieUrl: { type: String, default: null },
    verificationTier: {
      type: String,
      enum: ["incomplete", "basic", "verified"],
      default: "incomplete",
    },
    // When the last "complete your verification" reminder email went out —
    // lets the cron space reminders VERIFICATION_REMINDER_INTERVAL_DAYS
    // apart instead of re-sending every time the job runs.
    lastVerificationReminderAt: { type: Date, default: null },

    // Manual admin review — automatic verificationTier only reflects which
    // documents were submitted, not whether an admin has confirmed them.
    reviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewNotes: { type: String, default: "" }, // shown to the vendor, e.g. reason for rejection
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Flips to false when an admin makes a decision, true once the vendor has seen it
    notificationSeen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Vendor", VendorSchema);