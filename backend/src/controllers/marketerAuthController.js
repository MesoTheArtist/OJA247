import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import Marketer from "../models/Marketer.js";
import { generateUniqueMarketerCode } from "../services/referralService.js";
import { sendMarketerWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from "../services/emailService.js";

const generateToken = (id) => {
  return jwt.sign({ id, type: "marketer" }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Register new marketer
export const registerMarketer = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        message: "Registration failed: name, email, password, and phone are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const exists = await Marketer.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(400).json({ message: "This email is already registered." });
    }

    const referralCode = await generateUniqueMarketerCode();

    const marketer = new Marketer({
      name: String(name).trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: String(phone).trim(),
      referralCode,
    });

    const saved = await marketer.save();
    const token = generateToken(saved._id);

    await sendMarketerWelcomeEmail({ to: saved.email, name: saved.name, referralCode: saved.referralCode });

    res.status(201).json({
      success: true,
      token,
      marketer: {
        id: saved._id,
        name: saved.name,
        email: saved.email,
        referralCode: saved.referralCode,
      },
    });
  } catch (error) {
    console.error("Marketer registration error:", error);

    let message = "Registration failed. Please review your details and try again.";
    if (error?.code === 11000) {
      message = "This email is already in use.";
    } else if (error?.name === "ValidationError") {
      message = `Registration failed: ${Object.values(error.errors)
        .map((item) => item.message)
        .join("; ")}`;
    }

    res.status(400).json({ message });
  }
};

// Login marketer
export const loginMarketer = async (req, res) => {
  try {
    const { email, password } = req.body;

    const marketer = await Marketer.findOne({ email: email?.toLowerCase().trim() });
    if (!marketer) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (marketer.banned || marketer.status === "suspended") {
      return res.status(403).json({ message: "This marketer account is not active." });
    }

    const isPasswordValid = await marketer.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(marketer._id);

    res.json({
      success: true,
      token,
      marketer: {
        id: marketer._id,
        name: marketer.name,
        email: marketer.email,
        referralCode: marketer.referralCode,
      },
    });
  } catch (error) {
    console.error("Marketer login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/marketers/google
// Unlike authController.js's vendor googleLogin (login-only, no
// auto-create), this follows customerAuthController.js's pattern —
// auto-creates a marketer account on first click, since forcing "register
// with a password first, then separately sign in with Google" defeats the
// point of offering Google as the low-friction option here too.
// Google only hands us name + email, never a phone number, so a
// Google-created marketer starts with phone: "" (see Marketer.js) and is
// prompted to add it from their dashboard before requesting a payout.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const marketerGoogleAuth = async (req, res) => {
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
    let marketer = await Marketer.findOne({ email: normalizedEmail });

    let isNewMarketer = false;
    if (!marketer) {
      const referralCode = await generateUniqueMarketerCode();
      marketer = await Marketer.create({
        name: payload.name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        referralCode,
      });
      isNewMarketer = true;
    }

    if (marketer.banned || marketer.status === "suspended") {
      return res.status(403).json({ message: "This marketer account is not active." });
    }

    if (isNewMarketer) {
      await sendMarketerWelcomeEmail({
        to: marketer.email,
        name: marketer.name,
        referralCode: marketer.referralCode,
      });
    }

    const token = generateToken(marketer._id);

    res.json({
      success: true,
      token,
      marketer: {
        id: marketer._id,
        name: marketer.name,
        email: marketer.email,
        referralCode: marketer.referralCode,
        phone: marketer.phone,
      },
    });
  } catch (error) {
    console.error("Marketer Google auth error:", error);
    res.status(500).json({ message: "Google sign-in failed. Please try again." });
  }
};

// Get current marketer
export const getMarketerMe = async (req, res) => {
  try {
    const marketer = await Marketer.findById(req.marketer.id).select("-password");
    res.json({ success: true, marketer });
  } catch (error) {
    console.error("Get marketer me error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/marketers/forgot-password — { email }
export const forgotMarketerPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const genericResponse = {
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    };

    if (!email) return res.json(genericResponse);

    const marketer = await Marketer.findOne({ email: email.toLowerCase().trim() });
    if (!marketer) return res.json(genericResponse);

    const rawToken = crypto.randomBytes(32).toString("hex");
    marketer.resetPasswordTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    marketer.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await marketer.save();

    const resetUrl = `${process.env.SITE_URL || "https://oja247.store"}/reset-password?token=${rawToken}&type=marketer`;
    await sendPasswordResetEmail({ to: marketer.email, name: marketer.name, resetUrl });

    res.json(genericResponse);
  } catch (error) {
    console.error("Marketer forgot password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/marketers/reset-password — { token, password }
export const resetMarketerPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const marketer = await Marketer.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!marketer) {
      return res.status(400).json({ message: "This reset link is invalid or has expired" });
    }

    marketer.password = password;
    marketer.resetPasswordTokenHash = null;
    marketer.resetPasswordExpires = null;
    await marketer.save();

    sendPasswordChangedEmail({ to: marketer.email, name: marketer.name }).catch((err) =>
      console.error("Password-changed email failed:", err)
    );

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Marketer reset password error:", error);
    res.status(500).json({ message: error.message });
  }
};