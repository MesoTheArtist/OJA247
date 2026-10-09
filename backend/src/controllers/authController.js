import { SELLER_TERMS_VERSION } from "../config/sellerTerms.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import Business from "../models/Business.js";
import {
  generateUniqueBusinessReferralCode,
  attributeReferral,
} from "../services/referralService.js";
import { sendVendorWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from "../services/emailService.js";
import { sanitizeSocialLinks, sanitizeHighlights } from "../services/businessProfile.js";

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d"
  });
};

// Short-lived token issued after password verification but before TOTP is
// confirmed — only usable against the TOTP setup/verify endpoints (see
// requireTotpPendingToken in authMiddleware.js), never a real session.
const generatePreAuthToken = (id) => {
  return jwt.sign({ id, purpose: "totp_pending" }, process.env.JWT_SECRET, {
    expiresIn: "10m"
  });
};

// Register new business owner
export const register = async (req, res) => {
  try {
    // Never log the whole body: it contains the password.
    console.log("Register request received for:", req.body?.email);

    const { email, password, businessData, referralCodeUsed, acceptedSellerTerms } = req.body;

    if (!email || !password || !businessData) {
      return res.status(400).json({
        message: "Registration failed: email, password, and business details are required."
      });
    }

    if (!businessData.name || !businessData.category || !businessData.location || !businessData.contact) {
      return res.status(400).json({
        message: "Registration failed: business name, category, location, and contact are required."
      });
    }

    // Sellers must agree to the Seller Terms (and the prohibited items list)
    // to open a store. The acceptance and its version are saved on the user.
    if (acceptedSellerTerms !== true) {
      return res.status(400).json({
        message: "Registration failed: please accept the Seller Terms to open a store.",
      });
    }

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ message: "Registration failed: this email is already registered." });
    }

    // Same cleaning as profile edits: links must be plain web addresses.
    const cleanLinks = sanitizeSocialLinks(businessData.socialLinks);
    if (cleanLinks.error) {
      return res.status(400).json({ message: `Registration failed: ${cleanLinks.error}` });
    }
    const cleanHighlights = sanitizeHighlights(
      Array.isArray(businessData.highlights) ? businessData.highlights : []
    );

    const normalizedBusinessData = {
      ...businessData,
      name: String(businessData.name).trim(),
      description: businessData.description ? String(businessData.description).trim() : "",
      category: String(businessData.category).trim(),
      location: String(businessData.location).trim(),
      contact: String(businessData.contact).trim(),
      logo: businessData.logo || "",
      banner: businessData.banner || "",
      socialLinks: cleanLinks.value,
      highlights: cleanHighlights.value
    };

    console.log("Creating business...");
    // Every business gets its own referral code (business-owner referral track)
    normalizedBusinessData.referralCode = await generateUniqueBusinessReferralCode();
    const business = new Business(normalizedBusinessData);
    const savedBusiness = await business.save();
    console.log("Business created:", savedBusiness._id);

    // If they signed up via someone else's referral link/code, attribute it.
    // Silently no-ops on an invalid code so it never blocks registration.
    if (referralCodeUsed) {
      await attributeReferral({
        businessId: savedBusiness._id,
        referralCodeUsed,
        ownerEmail: email,
        contact: normalizedBusinessData.contact,
      });
    }

    console.log("Creating user...");
    const user = new User({
      email: email.toLowerCase().trim(),
      password,
      businessId: savedBusiness._id,
      sellerTermsAcceptedAt: new Date(),
      sellerTermsVersion: SELLER_TERMS_VERSION,
    });

    const savedUser = await user.save();
    console.log("User created:", savedUser._id);

    // Fire-and-forget — a mail server hiccup should never block registration.
    await sendVendorWelcomeEmail({ to: savedUser.email, businessName: savedBusiness.name });

    const token = generateToken(savedUser._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: savedUser._id,
        email: savedUser.email,
        businessId: savedBusiness._id,
        role: savedUser.role
      },
      business: savedBusiness
    });
  } catch (error) {
    console.error("Registration error:", error);

    let message = "Registration failed. Please review your details and try again.";
    if (error?.code === 11000) {
      message = "Registration failed: this email is already in use.";
    } else if (error?.name === "ValidationError") {
      message = `Registration failed: ${Object.values(error.errors)
        .map((item) => item.message)
        .join("; ")}`;
    } else if (error?.message) {
      message = `Registration failed: ${error.message}`;
    }

    res.status(400).json({
      message,
      details: error?.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Login business owner
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // SECURITY: without this type check, a request body like
    // {"email": {"$regex": "..."}, "password": "..."} would pass `email`
    // as a raw object straight into the query below — classic NoSQL
    // operator injection, letting an attacker manipulate which user the
    // query matches. Rejecting non-strings outright closes that off.
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() }).populate("businessId");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // TOTP is mandatory for admin accounts only — owners skip straight to
    // a normal token below. An admin who hasn't set up TOTP yet is routed
    // to setup instead of being let in; one who has must supply a code.
    if (user.role === "admin") {
      const preAuthToken = generatePreAuthToken(user._id);
      if (!user.totpEnabled) {
        return res.json({ success: true, requiresTotpSetup: true, preAuthToken });
      }
      return res.json({ success: true, requiresTotpCode: true, preAuthToken });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        businessId: user.businessId?._id || null,
        role: user.role
      },
      business: user.businessId || null
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/google — login (not signup) via Google. The frontend
// sends the ID token credential from Google Identity Services; we verify
// its signature/audience with Google directly (never trust a client-sent
// email on its own), then match it against an EXISTING account by email.
// No account is created here — if nobody with that email has registered
// through the normal flow, we tell them to sign up first. Deliberately
// mirrors login()'s response shapes (including the admin TOTP gate) so
// the frontend can treat both paths identically after this point.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Missing Google credential" });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      return res.status(401).json({ message: "Invalid Google credential" });
    }

    if (!payload?.email_verified) {
      return res.status(401).json({ message: "Google account email is not verified" });
    }

    const user = await User.findOne({ email: payload.email.toLowerCase() }).populate("businessId");

    if (!user) {
      return res.status(404).json({
        message: "No OJA247 account found for this Google email. Sign up first.",
      });
    }

    // Same TOTP gate as password login — Google sign-in doesn't bypass 2FA.
    if (user.role === "admin") {
      const preAuthToken = generatePreAuthToken(user._id);
      if (!user.totpEnabled) {
        return res.json({ success: true, requiresTotpSetup: true, preAuthToken });
      }
      return res.json({ success: true, requiresTotpCode: true, preAuthToken });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        businessId: user.businessId?._id || null,
        role: user.role,
      },
      business: user.businessId || null,
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/totp/setup-init — first login for an admin with TOTP not
// yet enabled. Generates a secret (or reuses one already in progress, so
// refreshing the setup screen doesn't invalidate a code the admin already
// scanned) and returns a QR code to scan into their authenticator app.
export const totpSetupInit = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+totpSecret");

    if (user.totpEnabled) {
      return res.status(400).json({ message: "2FA is already set up on this account" });
    }

    if (!user.totpSecret) {
      user.totpSecret = authenticator.generateSecret();
      await user.save();
    }

    const otpauthUrl = authenticator.keyuri(user.email, "OJA247 Admin", user.totpSecret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({ success: true, qrCodeDataUrl, manualEntryKey: user.totpSecret });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/totp/setup-verify — admin submits the 6-digit code from
// their authenticator app to confirm they actually scanned it correctly.
// Only on success does totpEnabled flip true and a real session start.
export const totpSetupVerify = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id).select("+totpSecret");

    if (user.totpEnabled) {
      return res.status(400).json({ message: "2FA is already set up on this account" });
    }
    if (!user.totpSecret) {
      return res.status(400).json({ message: "No 2FA setup in progress — call setup-init first" });
    }

    const isValid = authenticator.verify({ token: String(code || ""), secret: user.totpSecret });
    if (!isValid) {
      return res.status(401).json({ message: "Invalid code — check your authenticator app and try again" });
    }

    user.totpEnabled = true;
    await user.save();

    const token = generateToken(user._id);
    res.json({
      success: true,
      token,
      user: { id: user._id, email: user.email, businessId: null, role: user.role },
      business: null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/totp/verify — normal login step for an admin who already
// has TOTP enabled from a previous session.
export const totpVerifyLogin = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id).select("+totpSecret");

    if (!user.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ message: "2FA is not set up on this account" });
    }

    const isValid = authenticator.verify({ token: String(code || ""), secret: user.totpSecret });
    if (!isValid) {
      return res.status(401).json({ message: "Invalid or expired code" });
    }

    const token = generateToken(user._id);
    res.json({
      success: true,
      token,
      user: { id: user._id, email: user.email, businessId: null, role: user.role },
      business: null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get current user
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("businessId");

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        businessId: user.businessId?._id || null,
        role: user.role
      },
      business: user.businessId || null
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update password
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);

    // Check current password
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Update password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/forgot-password — { email }
// Always responds with the same generic message whether or not the email
// exists, so this endpoint can't be used to check who's registered.
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const genericResponse = {
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    };

    if (!email) return res.json(genericResponse);

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json(genericResponse); // don't reveal whether the email exists

    // Raw token goes in the email link; only its hash is stored, same
    // reasoning as never storing plaintext passwords.
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${process.env.SITE_URL || "https://oja247.store"}/reset-password?token=${rawToken}&type=vendor`;
    const result = await sendPasswordResetEmail({ to: user.email, name: "", resetUrl });
    // The client always gets the same generic response regardless (see
    // genericResponse above — don't leak account existence), but a failed
    // send here means this user has no way to reset their password until
    // it's fixed, so it needs to be loud in server logs even though the
    // response to them can't say so.
    if (!result.sent) {
      console.error(`Password reset email did not send for ${user.email}:`, result.error || "(no transporter configured)");
    }

    res.json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/reset-password — { token, password }
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "This reset link is invalid or has expired" });
    }

    user.password = password; // pre-save hook hashes it
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    sendPasswordChangedEmail({ to: user.email, name: "" }).catch((err) =>
      console.error("Password-changed email failed:", err)
    );

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: error.message });
  }
};