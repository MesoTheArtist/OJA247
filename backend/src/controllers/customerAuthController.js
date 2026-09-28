import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

// Deliberately a separate controller from authController.js rather than
// extending register/login/googleLogin there — customer accounts skip
// everything business/TOTP-specific in that file, and the Google flow
// needs to auto-create on first click (vendor/admin Google login
// explicitly does NOT — see authController.js's googleLogin comment).
// Mixing the two would mean threading a "is this a customer request"
// branch through logic that was written to not need one.

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// Backfills userId on any of this email's past guest orders that aren't
// linked yet. Runs after every successful register/login/google — not
// just once at signup — so it also catches guest orders placed with the
// same email AFTER the account already existed (different browser, forgot
// they were logged out, etc.), not only the ones that existed before
// signup. Cheap and idempotent either way (updateMany only touches
// unlinked rows), so running it every time costs nothing when there's
// nothing new to link.
async function linkGuestOrders(user) {
  try {
    // Account emails are stored lowercase, but order emails are stored as
    // typed at checkout ("John@Gmail.com"). The case-insensitive collation
    // (strength 2) makes the match ignore case so those still link.
    await Order.updateMany(
      { "customer.email": user.email, userId: null },
      { userId: user._id },
      { collation: { locale: "en", strength: 2 } }
    );
  } catch (error) {
    // Never let a linking hiccup block login/signup itself — the account
    // still works fine, order history just won't show the older orders
    // until the next successful auth retries this.
    console.error(`Guest-order linking failed for ${user.email}:`, error.message);
  }
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
  };
}

// POST /api/customer-auth/register
export const customerRegister = async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ message: "email, password, and fullName are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ message: "An account already exists for this email" });
    }

    const user = await User.create({
      email: normalizedEmail,
      password,
      fullName: String(fullName).trim(),
      phone: phone ? String(phone).trim() : "",
      role: "customer",
    });

    await linkGuestOrders(user);

    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Customer register error:", error);
    const message =
      error?.code === 11000
        ? "An account already exists for this email"
        : error?.name === "ValidationError"
        ? Object.values(error.errors).map((e) => e.message).join("; ")
        : "Registration failed. Please try again.";
    res.status(400).json({ message });
  }
};

// POST /api/customer-auth/login
export const customerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), role: "customer" });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.password) {
      // Signed up via Google — comparePassword would just return false
      // for this anyway, but a specific message here is more useful than
      // the generic "invalid email or password".
      return res.status(401).json({ message: "This account uses Google sign-in — continue with Google instead." });
    }

    const validPassword = await user.comparePassword(password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.banned) {
      return res.status(403).json({ message: "Account has been banned" });
    }

    await linkGuestOrders(user);

    res.json({
      success: true,
      token: generateToken(user._id),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Customer login error:", error);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
};

// POST /api/customer-auth/google
// Unlike authController.js's googleLogin, this auto-creates an account on
// first click — customers don't go through a separate signup step first,
// since forcing "sign up, then separately sign in with Google" defeats
// the point of offering Google as the low-friction option.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const customerGoogleAuth = async (req, res) => {
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

    const normalizedEmail = payload.email.toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (user && user.role !== "customer") {
      // Same email already has a vendor/admin account — don't silently
      // create a second, conflicting account under the same address.
      return res.status(400).json({
        message: "This email is already registered as a vendor/admin account. Use that login instead.",
      });
    }

    if (!user) {
      user = await User.create({
        email: normalizedEmail,
        fullName: payload.name || "",
        role: "customer",
        // No password field at all — comparePassword and customerLogin
        // both handle that (see their comments).
      });
    }

    if (user.banned) {
      return res.status(403).json({ message: "Account has been banned" });
    }

    await linkGuestOrders(user);

    res.json({
      success: true,
      token: generateToken(user._id),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Customer Google auth error:", error);
    res.status(500).json({ message: "Google sign-in failed. Please try again." });
  }
};

// POST /api/customer-auth/forgot-password
export const customerForgotPassword = async (req, res) => {
  const genericResponse = {
    success: true,
    message: "If an account exists for that email, a reset link has been sent.",
  };
  try {
    const { email } = req.body;
    if (!email) return res.json(genericResponse);

    const user = await User.findOne({ email: email.toLowerCase().trim(), role: "customer" });
    if (!user) return res.json(genericResponse);

    if (!user.password) {
      // Google-only account — there's no password to reset. Still the
      // generic response either way (don't reveal account existence or
      // signup method), but nothing to email here.
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetUrl = `${process.env.SITE_URL || "https://oja247.store"}/reset-password?token=${rawToken}&type=customer`;
    const result = await sendPasswordResetEmail({ to: user.email, name: user.fullName, resetUrl });
    if (!result.sent) {
      console.error(`Customer password reset email did not send for ${user.email}:`, result.error || "(no transporter configured)");
    }

    res.json(genericResponse);
  } catch (error) {
    console.error("Customer forgot password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/customer-auth/reset-password
export const customerResetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      role: "customer",
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "This reset link is invalid or has expired" });
    }

    user.password = password;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Customer reset password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/customer-auth/me
export const getCustomerMe = async (req, res) => {
  res.json(publicUser(req.user));
};