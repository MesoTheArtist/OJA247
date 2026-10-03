import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { sendPasswordResetEmail, sendCustomerVerificationEmail, sendPasswordChangedEmail } from "../services/emailService.js";
import { linkGuestOrders } from "../services/orderLinking.js";

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

// Guest-order linking lives in services/orderLinking.js and only links for a
// verified email — see the security note there.

const VERIFY_LINK_TTL_MS = 48 * 60 * 60 * 1000;
const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

// Generates a fresh confirmation token (replacing any earlier one), stores
// only its hash, and emails the link. Never throws — a broken mail server
// must not fail signup; the person can resend from their order history.
async function sendVerificationLink(user) {
  try {
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.emailVerifyTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.emailVerifyExpires = new Date(Date.now() + VERIFY_LINK_TTL_MS);
    user.lastVerificationEmailAt = new Date();
    await user.save();

    const verifyUrl = `${process.env.SITE_URL || "https://oja247.store"}/verify-email?token=${rawToken}`;
    const result = await sendCustomerVerificationEmail({ to: user.email, name: user.fullName, verifyUrl });
    if (!result.sent) {
      console.error(`Customer verification email did not send for ${user.email}:`, result.error || "(no transporter configured)");
    }
    return Boolean(result.sent);
  } catch (error) {
    console.error(`Customer verification email failed for ${user.email}:`, error.message);
    return false;
  }
}

// Marks the account's email as proven and clears any pending confirmation token.
function markEmailVerified(user) {
  user.emailVerified = true;
  user.emailVerifyTokenHash = null;
  user.emailVerifyExpires = null;
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerified === true,
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

    // No guest-order linking here: the email isn't verified yet. The account
    // works straight away (low friction); past guest orders attach once the
    // person confirms the email — see customerVerifyEmail.
    await sendVerificationLink(user);

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
        emailVerified: true, // Google already verified this email (checked above)
        // No password field at all — comparePassword and customerLogin
        // both handle that (see their comments).
      });
    } else if (user.emailVerified !== true) {
      // Google just proved this person owns the email. If the account was
      // created earlier through password signup and never confirmed, that
      // password may have been set by someone else who typed this address
      // (pre-hijacking) — so drop it and any pending tokens. The real owner
      // keeps access through Google.
      if (user.password) {
        user.password = undefined;
        user.resetPasswordTokenHash = null;
        user.resetPasswordExpires = null;
      }
      markEmailVerified(user);
      await user.save();
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
    // The reset link only reaches the email's owner, so using it proves
    // ownership just as the confirmation link does.
    markEmailVerified(user);
    await user.save();
    await linkGuestOrders(user);

    sendPasswordChangedEmail({ to: user.email, name: user.fullName }).catch((err) =>
      console.error("Password-changed email failed:", err)
    );

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

// POST /api/customer-auth/verify-email
// body: { token } — from the link in the confirmation email. Public: the
// token itself is the proof, and the person may open the email on a device
// where they aren't signed in.
export const customerVerifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const user = await User.findOne({
      role: "customer",
      emailVerifyTokenHash: tokenHash,
      emailVerifyExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "This confirmation link is invalid or has expired." });
    }

    markEmailVerified(user);
    await user.save();
    const linkedOrders = await linkGuestOrders(user);

    res.json({ success: true, linkedOrders });
  } catch (error) {
    console.error("Customer verify email error:", error);
    res.status(500).json({ message: "Couldn't confirm your email. Please try again." });
  }
};

// POST /api/customer-auth/resend-verification
// Signed-in customers only; one email per minute per account on top of the
// route's IP rate limit.
export const customerResendVerification = async (req, res) => {
  try {
    const user = req.user;

    if (user.emailVerified === true) {
      return res.json({ success: true, alreadyVerified: true });
    }

    if (
      user.lastVerificationEmailAt &&
      Date.now() - new Date(user.lastVerificationEmailAt).getTime() < VERIFY_RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({ message: "We just sent one. Give it a minute, then try again." });
    }

    const sent = await sendVerificationLink(user);
    if (!sent) {
      return res.status(502).json({ message: "We couldn't send the email right now. Please try again shortly." });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Customer resend verification error:", error);
    res.status(500).json({ message: "Couldn't send the confirmation email. Please try again." });
  }
};