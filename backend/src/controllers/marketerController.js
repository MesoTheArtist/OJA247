import axios from "axios";
import ReferralAttribution from "../models/ReferralAttribution.js";
import MarketerPayout from "../models/MarketerPayout.js";
import Marketer from "../models/Marketer.js";
import { isValidCustomReferralCode, isMarketerReferralCodeTaken } from "../services/referralService.js";
import { sendMarketerWithdrawalRequestEmail, sendMarketerReferralCodeChangedEmail, sendMarketerPayoutDetailsChangedEmail } from "../services/emailService.js";

const MIN_WITHDRAWAL_AMOUNT = 1000;

// GET /api/marketers/dashboard
// Everything the marketer dashboard needs in one call: their referral list
// with status, plus pending/paid payout totals.
export const getMarketerDashboard = async (req, res) => {
  try {
    const marketerId = req.marketer._id;

    const attributions = await ReferralAttribution.find({
      referrerType: "marketer",
      referrerId: marketerId,
    })
      .populate("referredBusinessId", "name createdAt")
      .sort({ createdAt: -1 });

    const referrals = attributions.map((a) => ({
      id: a._id,
      businessName: a.referredBusinessId?.name || "(business deleted)",
      status: a.status, // "pending" | "converted"
      referredAt: a.createdAt,
      convertedAt: a.convertedAt,
    }));

    const payouts = await MarketerPayout.find({ marketerId });

    const pendingTotal = payouts
      .filter((p) => p.status === "pending" || p.status === "batched")
      .reduce((sum, p) => sum + p.amount, 0);
    const paidTotal = payouts
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0);

    const totalConverted = referrals.filter((r) => r.status === "converted").length;
    const pendingReferralsCount = referrals.filter((r) => r.status === "pending").length;

    // Payout amount varies by which plan the referral eventually buys (see
    // MARKETER_PAYOUT_RATE_BY_PLAN in referralService.js), so there's no
    // single "amount per referral" to multiply by for a forecast. Instead,
    // estimate from this marketer's own historical average — paidTotal is
    // actual money already paid out, which only happens for converted
    // referrals, so dividing by totalConverted gives a real per-conversion
    // average specific to this marketer's typical referral mix.
    const avgPayoutPerConversion = totalConverted > 0 ? paidTotal / totalConverted : null;
    const payoutForecast =
      avgPayoutPerConversion !== null
        ? Math.round(avgPayoutPerConversion * pendingReferralsCount)
        : null; // no conversions yet — nothing to estimate from

    res.json({
      success: true,
      referralCode: req.marketer.referralCode,
      phone: req.marketer.phone || "",
      payoutDetails: {
        bankName: req.marketer.bankName || "",
        accountNumber: req.marketer.accountNumber || "",
        accountName: req.marketer.accountName || "",
        hasPayoutDetails: req.marketer.hasPayoutDetails(),
      },
      stats: {
        totalReferred: referrals.length,
        totalConverted,
        conversionRate: referrals.length > 0 ? totalConverted / referrals.length : 0,
        pendingPayoutTotal: pendingTotal, // owed, not yet paid out
        lifetimePaidTotal: paidTotal,
        payoutForecast, // null if no conversions yet to estimate from
      },
      referrals,
      payoutHistory: payouts
        .filter((p) => p.status === "paid")
        .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
        .map((p) => ({ id: p._id, amount: p.amount, paidAt: p.paidAt })),
      // Payouts an admin declined, with the reason, so earnings never just vanish
      rejectedPayouts: payouts
        .filter((p) => p.status === "rejected")
        .sort((a, b) => new Date(b.rejectedAt) - new Date(a.rejectedAt))
        .map((p) => ({ id: p._id, amount: p.amount, rejectedAt: p.rejectedAt, reason: p.rejectionReason })),
    });
  } catch (error) {
    console.error("Get marketer dashboard error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/marketers/withdraw
// On-demand version of the weekly batch job — pulls this marketer's
// "pending" payouts into a batch right now instead of waiting for Monday's
// cron, and emails an admin so it actually gets paid promptly. Still a
// manual bank transfer either way (payouts aren't automated yet) — this just
// skips the wait for the weekly sweep, it doesn't make the payment itself
// instant.
export const requestMarketerWithdrawal = async (req, res) => {
  try {
    const marketerId = req.marketer._id;

    if (!req.marketer.hasPayoutDetails()) {
      return res.status(400).json({
        message: "Add your payout bank details before requesting a withdrawal.",
      });
    }

    const pendingPayouts = await MarketerPayout.find({ marketerId, status: "pending" });
    const pendingTotal = pendingPayouts.reduce((sum, p) => sum + p.amount, 0);

    if (pendingTotal < MIN_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({
        message: `You need at least ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString()} pending to request a withdrawal (currently ₦${pendingTotal.toLocaleString()}).`,
      });
    }

    const payoutWeekStart = new Date();
    await MarketerPayout.updateMany(
      { marketerId, status: "pending" },
      { status: "batched", payoutWeekStart }
    );

    await sendMarketerWithdrawalRequestEmail({
      marketerName: req.marketer.name,
      marketerEmail: req.marketer.email,
      amount: pendingTotal,
    });

    res.json({
      success: true,
      message: "Withdrawal requested — an admin has been notified and will process it shortly.",
      amountRequested: pendingTotal,
    });
  } catch (error) {
    console.error("Request marketer withdrawal error:", error);
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/marketers/me/payout-details
// Lets a marketer add/update the bank account their weekly payouts get
// sent to. Resolves the account name via Paystack server-side (rather than
// trusting whatever the frontend sends) so bankNameMatch always reflects a
// real, verified lookup — same trust model as vendor onboarding.
export const updateMarketerPayoutDetails = async (req, res) => {
  try {
    const { bank_code, bank_name, account_number } = req.body;

    if (!bank_code || !bank_name || !account_number) {
      return res.status(400).json({
        message: "Bank, and account number are required.",
      });
    }

    let accountName;
    try {
      const response = await axios.get("https://api.paystack.co/bank/resolve", {
        params: { account_number, bank_code },
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      accountName = response.data.data.account_name;
    } catch (err) {
      console.error("Marketer account resolve failed:", err.response?.data || err.message);
      return res.status(400).json({
        message: "Could not verify this account number. Double-check it and try again.",
      });
    }

    const normalize = (s) => s.toLowerCase().replace(/[^a-z\s]/g, "").trim();
    const bankNameMatch =
      normalize(accountName).includes(normalize(req.marketer.name).split(" ")[0]) ||
      normalize(req.marketer.name).includes(normalize(accountName).split(" ")[0]);

    const updated = await Marketer.findByIdAndUpdate(
      req.marketer._id,
      {
        bankCode: bank_code,
        bankName: bank_name,
        accountNumber: account_number,
        accountName,
        bankNameMatch,
      },
      { new: true, runValidators: true }
    ).select("-password");

    // Security-relevant: this account is where future payouts go. Same
    // reasoning as sendBankDetailsUpdatedEmail on the vendor side.
    if (updated?.email) {
      sendMarketerPayoutDetailsChangedEmail({
        to: updated.email,
        name: updated.name,
        bankName: updated.bankName,
        accountNumber: updated.accountNumber,
        accountName: updated.accountName,
      });
    }

    res.json({
      success: true,
      message: "Payout details saved.",
      marketer: updated,
    });
  } catch (error) {
    console.error("Update marketer payout details error:", error);
    res.status(500).json({ message: error.message });
  }
};
// PATCH /api/marketers/me/phone — fills in the phone number for a marketer
// who signed up via Google (marketerGoogleAuth creates them with phone: "",
// since Google never provides one). Same "/me/..." convention as
// updateMarketerPayoutDetails/updateMarketerReferralCode above.
export const updateMarketerPhone = async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required." });
    }

    const updated = await Marketer.findByIdAndUpdate(
      req.marketer._id,
      { phone },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({ success: true, phone: updated.phone });
  } catch (error) {
    console.error("Update marketer phone error:", error);
    res.status(400).json({ message: error.message });
  }
};

// PATCH /api/marketers/me/referral-code — marketer picks their own code,
// same rules as a vendor's own code (updateBusinessReferralCode in
// businessController.js): 7-8 chars, letters/numbers, unique within its
// own collection (checked against Marketer here, not Business). Scoped to
// the authenticated marketer via req.marketer (protectMarketer), same
// "/me/..." convention as updateMarketerPayoutDetails above — no id needed
// from the client, no separate ownership check required.
export const updateMarketerReferralCode = async (req, res) => {
  try {
    const id = req.marketer._id;

    const raw = String(req.body.referralCode || "")
      .trim()
      .toUpperCase();

    if (!isValidCustomReferralCode(raw)) {
      return res.status(400).json({
        message: "Referral code must be 7-8 characters, letters and numbers only.",
      });
    }

    if (await isMarketerReferralCodeTaken(raw, id)) {
      return res.status(400).json({ message: "That referral code is already taken. Try another." });
    }

    const oldCode = req.marketer.referralCode;

    const updated = await Marketer.findByIdAndUpdate(
      id,
      { referralCode: raw },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) {
      return res.status(404).json({ message: "Marketer not found" });
    }

    if (oldCode && oldCode !== updated.referralCode) {
      sendMarketerReferralCodeChangedEmail({
        to: updated.email,
        name: updated.name,
        oldCode,
        newCode: updated.referralCode,
      });
    }

    res.json({ success: true, referralCode: updated.referralCode });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "That referral code is already taken. Try another." });
    }
    res.status(400).json({ message: error.message });
  }
};