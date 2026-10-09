import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    // No `required: true` here on purpose — a customer who signs up via
    // Google never sets a password at all (see customerAuthController.js).
    // Password-based flows (register, customerRegister) already validate
    // presence explicitly in the controller before this ever gets saved,
    // so schema-level validation would only be redundant there and wrong
    // here. minlength still applies to whatever IS provided.
    password: {
      type: String,
      minlength: 6
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: function () {
        return this.role === "owner"; // only owners need a business
      },
      default: null
    },
    role: {
      type: String,
      enum: ["owner", "admin", "customer"],
      default: "owner"
    },
    // Customer-only fields (owners/admins keep this info on the Business/
    // Vendor records instead). Both optional — a Google signup only has
    // fullName from the Google profile; phone gets added later if/when
    // they check out or fill it in, and also doubles as a secondary
    // signal for matching guest orders (email is the primary match).
    fullName: { type: String, default: "" },
    phone: { type: String, default: "" },
    // Which version of the Seller Terms this seller accepted, and when.
    // Empty until they accept; see config/sellerTerms.js.
    sellerTermsAcceptedAt: { type: Date, default: null },
    sellerTermsVersion: { type: String, default: "" },
    banned: {
      type: Boolean,
      default: false
    },
    // Set when the person clicks "unsubscribe" in an admin announcement.
    // Only stops announcements — order, security and account emails still
    // go out. See controllers/campaignController.js.
    marketingOptOut: { type: Boolean, default: false },
    // Customer email verification. True once the person proves they own the
    // address: Google sign-in (Google verified it), clicking the confirmation
    // email, or completing a password reset. Guest orders are only linked to
    // a verified account (see services/orderLinking.js). Only the SHA-256 hash
    // of the confirmation token is stored, same as the reset token below.
    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, default: null },
    emailVerifyExpires: { type: Date, default: null },
    lastVerificationEmailAt: { type: Date, default: null },
    // Set by forgotPassword, cleared by resetPassword or on expiry. Only the
    // SHA-256 hash is stored — the raw token only ever exists in the email
    // link and the reset request body, never in the database.
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // TOTP 2FA — mandatory for admin accounts only, never offered to
    // owners. totpSecret is written as soon as setup starts (unconfirmed);
    // totpEnabled only flips true once the admin has proven they can
    // generate a valid code with it (see authController.js setup-verify).
    totpSecret: { type: String, default: null, select: false },
    totpEnabled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords. Returns false (never throws) for an
// account with no password set at all — a Google-only signup — so a
// stray password-login attempt against one fails cleanly instead of
// bcrypt erroring on an undefined hash.
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", UserSchema);