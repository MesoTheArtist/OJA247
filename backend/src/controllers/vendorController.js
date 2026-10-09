import axios from "axios";
import cloudinary from "../config/cloudinaryConfig.js";
import Vendor from "../models/Vendor.js";
import User from "../models/User.js";
import { SELLER_TERMS_VERSION } from "../config/sellerTerms.js";
import Business from "../models/Business.js";
import { sendPayoutHoldEmail, sendBankDetailsUpdatedEmail } from "../services/emailService.js";
import { verifyNin, ninNameMatchesAccount } from "../services/ninVerificationService.js";

// Simple in-memory cache — bank list changes rarely, no need to hit
// Paystack on every page load. Swap for Redis if you're running multiple
// backend instances.
let cachedBanks = null;
let cachedAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// GET /api/vendors/banks
export const getBanks = async (req, res) => {
  try {
    const isFresh = cachedBanks && Date.now() - cachedAt < CACHE_TTL_MS;

    if (isFresh) {
      return res.json({ status: true, data: cachedBanks });
    }

    const response = await axios.get("https://api.paystack.co/bank", {
      params: { country: "nigeria", currency: "NGN" },
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    // Trim to just what the frontend dropdown needs
    const banks = response.data.data.map((bank) => ({
      name: bank.name,
      code: bank.code,
      slug: bank.slug,
    }));

    cachedBanks = banks;
    cachedAt = Date.now();

    return res.json({ status: true, data: banks });
  } catch (error) {
    console.error("Failed to fetch banks from Paystack:", error.response?.data || error.message);

    // Fall back to stale cache rather than failing the whole form if
    // Paystack is briefly down
    if (cachedBanks) {
      return res.json({ status: true, data: cachedBanks, stale: true });
    }

    return res.status(502).json({
      status: false,
      message: "Could not load bank list. Please try again shortly.",
    });
  }
};

// GET /api/vendors/resolve-account?account_number=...&bank_code=...
// Used by the frontend to auto-fill the account name once the vendor
// enters their account number, so they can confirm it's correct before
// submitting.
export const resolveAccount = async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res.status(400).json({
      status: false,
      message: "account_number and bank_code are required",
    });
  }

  try {
    const response = await axios.get("https://api.paystack.co/bank/resolve", {
      params: { account_number, bank_code },
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    return res.json({
      status: true,
      data: { account_name: response.data.data.account_name },
    });
  } catch (error) {
    console.error("Account resolve failed:", error.response?.data || error.message);
    return res.status(400).json({
      status: false,
      message: "Could not verify this account number. Double-check it and try again.",
    });
  }
};

// Basic tier fields are required. Verified tier fields (CAC, address proof,
// selfie) are optional at submission — vendor can upgrade later.
function determineTier({ nin, bankNameMatch, hasCacDocument, hasAddressProof, hasSelfie }) {
  const hasBasic = Boolean(nin) && bankNameMatch;
  const hasVerified = hasBasic && hasCacDocument && hasAddressProof && hasSelfie;
  if (hasVerified) return "verified";
  if (hasBasic) return "basic";
  return "incomplete";
}

async function createPaystackSubaccount({ businessName, bankCode, accountNumber }) {
  // Platform's default split percentage — adjust to your actual PSS rate.
  // This is the *default*; per-transaction splits can still override it.
  const PLATFORM_PERCENTAGE_CHARGE = process.env.PLATFORM_PERCENTAGE_CHARGE || 10;

  const response = await axios.post(
    "https://api.paystack.co/subaccount",
    {
      business_name: businessName,
      bank_code: bankCode,
      account_number: accountNumber,
      percentage_charge: PLATFORM_PERCENTAGE_CHARGE,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.data; // includes subaccount_code
}

// Repoints an existing Paystack subaccount at a new bank/account — called
// whenever a vendor changes their payout bank so live checkout splits
// actually follow the change, instead of silently continuing to pay out to
// whatever bank was on file when the subaccount was first created.
async function updatePaystackSubaccount(subaccountCode, { businessName, bankCode, accountNumber }) {
  const response = await axios.put(
    `https://api.paystack.co/subaccount/${subaccountCode}`,
    {
      business_name: businessName,
      bank_code: bankCode,
      account_number: accountNumber,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.data;
}

function uploadBufferToCloudinary(fileBuffer, filename, resourceType = "auto") {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "oja247/vendor-docs",
        resource_type: resourceType, // "auto" handles both images and PDFs; selfies are forced to "image"
        public_id: `${Date.now()}-${filename.split(".")[0]}`,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

// POST /api/vendors
// Handles the combined onboarding form: payout info + KYC docs together.
// Also handles re-submission — a vendor on Basic tier can come back within
// their 30-day window and add CAC/address proof to move up to Verified,
// without a new Paystack subaccount being created.
export const onboardVendor = async (req, res) => {
  try {
    const {
      business_id,
      business_name,
      contact_email,
      contact_phone,
      contact_whatsapp,
      bank_code,
      bank_name,
      account_number,
      account_name, // returned by the resolve-account step, confirms bank-name-match
      nin,
    } = req.body;

    // --- Required (Basic tier) field validation ---
    const missing = [];
    if (!business_id) missing.push("business_id");
    if (!business_name) missing.push("business_name");
    if (!contact_email) missing.push("contact_email");
    if (!contact_phone) missing.push("contact_phone");
    if (!bank_code) missing.push("bank_code");
    if (!account_number) missing.push("account_number");
    if (!account_name) missing.push("account_name");
    if (!nin) missing.push("nin");

    if (missing.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    // Format check only — Paystack has no NIN lookup, and NIMC (Nigeria's
    // identity authority) restricts real NIN verification to licensed KYC
    // providers (e.g. Prembly, QoreID, Youverify, Smile Identity, VerifyMe).
    // Wire one of those in here if/when you have a provider account.
    if (!/^\d{11}$/.test(nin)) {
      return res.status(400).json({
        status: false,
        message: "NIN must be exactly 11 digits.",
      });
    }

    // Only the business's own owner (or an admin) can submit onboarding for it
    const isOwner = req.user.businessId && req.user.businessId.toString() === business_id;
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ status: false, message: "Not authorized to onboard this business." });
    }

    const business = await Business.findById(business_id);
    if (!business) {
      return res.status(404).json({ status: false, message: "Business not found." });
    }

    // bank-name-match check: does the account_name resolved from Paystack
    // reasonably match the business/contact name they entered?
    // (Simple normalized-substring check — tune to taste.)
    const normalize = (s) => s.toLowerCase().replace(/[^a-z\s]/g, "").trim();
    const bankNameMatch =
      normalize(account_name).includes(normalize(business_name).split(" ")[0]) ||
      normalize(business_name).includes(normalize(account_name).split(" ")[0]);

    const existingVendor = await Vendor.findOne({ businessId: business_id });

    // Customers pay the account saved here, so changing it is the most
    // sensitive thing a vendor can do. Ask for the password again, so a stolen
    // or left-open login can't quietly redirect money. (Admins editing on a
    // vendor's behalf are exempt, and so is any account with no password at
    // all, which can't be asked for one; the alert email still goes out.)
    const changingBankNow =
      Boolean(existingVendor) &&
      (existingVendor.bankCode !== bank_code || existingVendor.accountNumber !== account_number);
    if (changingBankNow && req.user.role !== "admin") {
      const userWithPassword = await User.findById(req.user.id).select("+password");
      if (userWithPassword?.password) {
        const supplied = String(req.body.current_password || "");
        if (!supplied) {
          return res.status(403).json({
            status: false,
            code: "PASSWORD_REQUIRED",
            message: "For your security, enter your password to change your bank details.",
          });
        }
        if (!(await userWithPassword.comparePassword(supplied))) {
          return res.status(403).json({
            status: false,
            code: "PASSWORD_INCORRECT",
            message: "That password isn't right, so your bank details were not changed.",
          });
        }
      }
    }

    // NIN existence check via Dojah. Done before any uploads or Paystack
    // calls so a bad NIN costs nothing. Only runs when the NIN is new or
    // hasn't been verified yet — resubmissions that just add a document
    // don't pay for another lookup.
    let ninVerified = existingVendor?.ninVerified === true && existingVendor.nin === nin;
    let ninHolderName = ninVerified ? existingVendor.ninHolderName : "";
    let ninNameMatch = ninVerified ? existingVendor.ninNameMatch : null;

    if (!ninVerified) {
      const ninResult = await verifyNin(nin);
      if (ninResult.status === "not_found") {
        return res.status(400).json({
          status: false,
          message: "We couldn't find this NIN. Please check the number and try again.",
        });
      }
      if (ninResult.status === "verified") {
        ninVerified = true;
        ninHolderName = [ninResult.firstName, ninResult.middleName, ninResult.lastName].filter(Boolean).join(" ");
        ninNameMatch = ninNameMatchesAccount(ninResult, account_name);
      }
      // "skipped" / "unavailable": carry on as before; ninVerified stays
      // false so it's retried next time and the admin sees "not checked".
    }

    const cacFile = req.files?.cac_document?.[0];
    const addressProofFile = req.files?.address_proof?.[0];
    const selfieFile = req.files?.selfie?.[0];

    const [cacUpload, addressProofUpload, selfieUpload] = await Promise.all([
      cacFile ? uploadBufferToCloudinary(cacFile.buffer, cacFile.originalname) : Promise.resolve(null),
      addressProofFile
        ? uploadBufferToCloudinary(addressProofFile.buffer, addressProofFile.originalname)
        : Promise.resolve(null),
      selfieFile
        ? uploadBufferToCloudinary(selfieFile.buffer, selfieFile.originalname, "image")
        : Promise.resolve(null),
    ]);

    // Keep whatever was uploaded on a previous submission if this one didn't replace it
    const cacDocumentUrl = cacUpload?.secure_url || existingVendor?.cacDocumentUrl || null;
    const addressProofUrl = addressProofUpload?.secure_url || existingVendor?.addressProofUrl || null;
    const selfieUrl = selfieUpload?.secure_url || existingVendor?.selfieUrl || null;

    const tier = determineTier({
      nin,
      bankNameMatch,
      hasCacDocument: Boolean(cacDocumentUrl),
      hasAddressProof: Boolean(addressProofUrl),
      hasSelfie: Boolean(selfieUrl),
    });

    // Reuse the existing subaccount rather than creating a new one on re-submission
    let subaccountCode = existingVendor?.subaccountCode;
    let subaccountId = existingVendor?.subaccountId;

    // Did the payout bank actually change? (vs. e.g. just adding a CAC doc)
    const bankChanged =
      Boolean(existingVendor) &&
      (existingVendor.bankCode !== bank_code || existingVendor.accountNumber !== account_number);

    // Orders are paid straight to the vendor's own bank account now, so no
    // Paystack subaccount is created (or repointed) any more. Vendors who
    // already have one keep the stored code; it is simply unused.

    // Auto re-verification on bank change: a changed bank account only
    // keeps receiving live payouts if the new account name still matches
    // the vendor's name. A failed match holds payouts until an admin
    // reviews and approves it (see reviewVendor) — this is the main
    // account-takeover guard on the payout path.
    const payoutHold = bankChanged && !bankNameMatch;
    const payoutHoldReason = payoutHold
      ? "Bank account was changed and the new account name doesn't match the vendor's name — pending admin review."
      : "";

    // --- Persist vendor record (create or update) ---
    const vendor = await Vendor.findOneAndUpdate(
      { businessId: business_id },
      {
        businessId: business_id,
        businessName: business_name,
        contactEmail: contact_email,
        contactPhone: contact_phone,
        contactWhatsapp: contact_whatsapp || contact_phone,
        bankCode: bank_code,
        bankName: bank_name,
        accountNumber: account_number,
        accountName: account_name,
        bankNameMatch,
        nin,
        ninVerified,
        ninHolderName,
        ninNameMatch,
        cacDocumentUrl,
        addressProofUrl,
        selfieUrl,
        verificationTier: tier,
        subaccountCode,
        subaccountId,
        ...(bankChanged ? { payoutHold, payoutHoldReason } : {}),
        // Any (re)submission needs a fresh admin look, since the vendor may
        // have changed the very details that were previously reviewed.
        reviewStatus: "pending",
        reviewNotes: "",
        notificationSeen: true,
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    if (payoutHold) {
      await sendPayoutHoldEmail({
        to: vendor.contactEmail,
        businessName: vendor.businessName,
        reason: payoutHoldReason,
      });
    } else if (bankChanged) {
      // Name matched, so the change went through with no hold — vendor still
      // gets zero confirmation otherwise, which is a bad experience for
      // something touching where their money goes.
      await sendBankDetailsUpdatedEmail({
        to: vendor.contactEmail,
        businessName: vendor.businessName,
        bankName: vendor.bankName,
        accountNumberLast4: String(vendor.accountNumber).slice(-4),
      });
    }

    return res.status(201).json({
      status: true,
      message: "Vendor onboarded successfully.",
      data: {
        verificationTier: vendor.verificationTier,
        subaccountCode: vendor.subaccountCode,
        payoutHold: vendor.payoutHold,
        payoutHoldReason: vendor.payoutHoldReason,
      },
    });
  } catch (error) {
    console.error("Vendor onboarding failed:", error.response?.data || error.message);

    if (error.code === 11000) {
      return res.status(400).json({
        status: false,
        message: "A vendor with these details already exists.",
      });
    }

    return res.status(500).json({
      status: false,
      message: "Something went wrong creating your vendor account. Please try again.",
    });
  }
};

// GET /api/vendors/me
// Lets the logged-in vendor check their own verification review status
// (pending/approved/rejected) and any feedback left by an admin.
export const getMyVendor = async (req, res) => {
  try {
    if (!req.user.businessId) {
      return res.status(404).json({ status: false, message: "No business linked to this account." });
    }

    const vendor = await Vendor.findOne({ businessId: req.user.businessId });
    if (!vendor) {
      return res.status(404).json({ status: false, message: "You haven't submitted vendor onboarding yet." });
    }

    return res.json({ status: true, data: vendor });
  } catch (error) {
    console.error("Get vendor status failed:", error.message);
    return res.status(500).json({ status: false, message: "Could not load your verification status." });
  }
};

// PATCH /api/vendors/me/seen
// Marks the latest admin review decision as seen, so the notification
// banner doesn't keep showing up on every login.
export const acknowledgeVendorNotification = async (req, res) => {
  try {
    const vendor = await Vendor.findOneAndUpdate(
      { businessId: req.user.businessId },
      { notificationSeen: true },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ status: false, message: "Vendor profile not found." });
    }

    return res.json({ status: true });
  } catch (error) {
    console.error("Acknowledge vendor notification failed:", error.message);
    return res.status(500).json({ status: false, message: "Could not update notification." });
  }
};

// POST /api/vendors/me/blocked-customers   body: { email }
// DELETE /api/vendors/me/blocked-customers body: { email }
// The vendor stops (or resumes) taking orders from one customer email. Only
// affects NEW orders: anything already placed is untouched.
const MAX_BLOCKED_CUSTOMERS = 500;
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const blockCustomer = async (req, res) => {
  try {
    if (!req.user.businessId) {
      return res.status(404).json({ status: false, message: "No business linked to this account." });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!SIMPLE_EMAIL.test(email)) {
      return res.status(400).json({ status: false, message: "That doesn't look like a valid email address." });
    }

    const vendor = await Vendor.findOne({ businessId: req.user.businessId }).select("blockedCustomerEmails");
    if (!vendor) {
      return res.status(404).json({ status: false, message: "You haven't set up your store yet." });
    }
    if ((vendor.blockedCustomerEmails || []).length >= MAX_BLOCKED_CUSTOMERS) {
      return res.status(400).json({ status: false, message: "Your block list is full. Unblock someone first." });
    }

    const updated = await Vendor.findOneAndUpdate(
      { businessId: req.user.businessId },
      { $addToSet: { blockedCustomerEmails: email } },
      { new: true }
    ).select("blockedCustomerEmails");
    return res.json({ status: true, data: { blockedCustomerEmails: updated.blockedCustomerEmails } });
  } catch (error) {
    console.error("Block customer failed:", error.message);
    return res.status(500).json({ status: false, message: "Could not block that customer." });
  }
};

export const unblockCustomer = async (req, res) => {
  try {
    if (!req.user.businessId) {
      return res.status(404).json({ status: false, message: "No business linked to this account." });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ status: false, message: "Email is required." });
    }
    const updated = await Vendor.findOneAndUpdate(
      { businessId: req.user.businessId },
      { $pull: { blockedCustomerEmails: email } },
      { new: true }
    ).select("blockedCustomerEmails");
    if (!updated) {
      return res.status(404).json({ status: false, message: "You haven't set up your store yet." });
    }
    return res.json({ status: true, data: { blockedCustomerEmails: updated.blockedCustomerEmails } });
  } catch (error) {
    console.error("Unblock customer failed:", error.message);
    return res.status(500).json({ status: false, message: "Could not unblock that customer." });
  }
};

// GET /api/vendors/me/terms
// Has this seller accepted the CURRENT version of the Seller Terms? Anyone who
// isn't a seller (admins) is never asked.
export const getSellerTermsStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("role sellerTermsVersion sellerTermsAcceptedAt");
    if (!user) return res.status(404).json({ status: false, message: "Account not found." });
    const accepted = user.role !== "owner" || user.sellerTermsVersion === SELLER_TERMS_VERSION;
    return res.json({
      status: true,
      data: { accepted, acceptedVersion: user.sellerTermsVersion || "", currentVersion: SELLER_TERMS_VERSION },
    });
  } catch (error) {
    console.error("Seller terms status failed:", error.message);
    return res.status(500).json({ status: false, message: "Could not check the Seller Terms." });
  }
};

// POST /api/vendors/me/terms/accept
// Records that this seller accepted the current Seller Terms, with the date.
export const acceptSellerTerms = async (req, res) => {
  try {
    if (req.body?.accepted !== true) {
      return res.status(400).json({ status: false, message: "Please confirm that you accept the Seller Terms." });
    }
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, role: "owner" },
      { sellerTermsAcceptedAt: new Date(), sellerTermsVersion: SELLER_TERMS_VERSION },
      { new: true }
    ).select("sellerTermsVersion");
    if (!user) return res.status(404).json({ status: false, message: "Seller account not found." });
    return res.json({ status: true, data: { accepted: true, acceptedVersion: user.sellerTermsVersion } });
  } catch (error) {
    console.error("Accept seller terms failed:", error.message);
    return res.status(500).json({ status: false, message: "Could not save your acceptance." });
  }
};