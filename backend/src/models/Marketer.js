import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MarketerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // No schema-level `required` here on purpose — a marketer who signs up
    // via Google never sets a password at all (see marketerAuthController.js
    // marketerGoogleAuth). Password-based registerMarketer already validates
    // presence explicitly in the controller before this ever gets saved, so
    // schema-level validation would only be redundant there and wrong here.
    // Mirrors the same pattern already used on User.js for customers/vendors.
    password: { type: String, minlength: 6 },
    authVersion: { type: Number, default: 1 },
    // Same reasoning as password: Google only hands us name + email, no
    // phone number. registerMarketer still requires it at the controller
    // level for the normal signup form; Google-created marketers start with
    // "" and are prompted to add it from their dashboard (payout requests
    // already require full payout details separately, so this doesn't
    // silently let an incomplete account get paid).
    phone: { type: String, default: "", trim: true },

    // Auto-generated on signup, shared as their referral link/code
    referralCode: { type: String, required: true, unique: true, uppercase: true },

    // Payout details — not required at signup, but required before a payout
    // can be released. Mirrors Vendor.js's payout fields for consistency.
    bankCode: { type: String, default: "" },
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    accountName: { type: String, default: "" }, // confirmed via Paystack resolve-account
    bankNameMatch: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    banned: { type: Boolean, default: false },
    // See the same field on User: opts out of admin announcements only.
    marketingOptOut: { type: Boolean, default: false },

    // Same pattern as User.js — only the SHA-256 hash is ever stored.
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

MarketerSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Returns false (never throws) for an account with no password set at all
// — a Google-only signup — so a stray password-login attempt against one
// fails cleanly instead of bcrypt erroring on an undefined hash. Mirrors
// User.js's comparePassword.
MarketerSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Checks before allowing a payout to be requested/batched
MarketerSchema.methods.hasPayoutDetails = function () {
  return Boolean(this.bankCode && this.accountNumber && this.accountName);
};

export default mongoose.model("Marketer", MarketerSchema);