import crypto from "crypto";
import mongoose from "mongoose";
import multer from "multer";
import Order from "../models/Order.js";
import Dispute from "../models/Dispute.js";
import Vendor from "../models/Vendor.js";
import Business from "../models/Business.js";
import Product from "../models/Product.js";
import { markOrderPaid } from "./orderController.js";
import { MAX_RECEIPT_BYTES, sniffReceiptType, uploadReceipt } from "../services/receiptStorage.js";
import {
  sendVendorTransferOrderEmail,
  sendCustomerTransferOrderReceivedEmail,
  sendPaymentRejectedCustomerEmail,
  sendVendorOrderCancelledEmail,
  sendCustomerOrderCancelledEmail,
} from "../services/emailService.js";
import { reduceStockForOrder } from "../services/stock.js";
import { sendVendorNewOrderWhatsApp } from "../services/whatsappService.js";

const SITE_URL = process.env.SITE_URL || "https://oja247.store";

// Memory storage, one file, 4 MB. The type is checked from the file's bytes
// in the handlers below, not here, because the mimetype a browser sends can
// be anything.
export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
}).single("receipt");

// Wraps multer so its errors (file too big, etc.) become a normal 400.
export function handleReceiptUpload(req, res, next) {
  receiptUpload(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too big. Please upload a receipt under 4 MB."
        : "We couldn't read that upload. Please try again.";
    return res.status(400).json({ message });
  });
}

const REFERENCE_PATTERN = /^oja247-[a-z0-9]{8,24}$/i;
const sameEmail = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// The vendor's bank details, only if this store can take orders right now.
// Anti-junk limits for bank-transfer orders. Receipts are compulsory, so
// someone can attach any image to spam a vendor; these keep that in check.
const DAILY_TRANSFER_ORDER_CAP = 5; // new orders per email per 24 hours
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const emailMatcher = (email) => new RegExp(`^${escapeRegex(String(email).trim())}$`, "i");
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// Does this exact receipt file already sit on a different order?
async function findDuplicateReceipt(fileHash, reference) {
  const other = await Order.findOne({
    "paymentReceipts.fileHash": fileHash,
    reference: { $ne: reference },
  }).select("reference");
  return other?.reference || "";
}

async function loadPayableVendor(businessId) {
  if (!mongoose.isValidObjectId(businessId)) return { error: "Store not found.", status: 404 };

  const business = await Business.findById(businessId);
  if (!business || business.isHidden) return { error: "Store not found.", status: 404 };

  const vendor = await Vendor.findOne({ businessId });
  if (!vendor || !vendor.accountNumber || !vendor.bankName || vendor.payoutHold) {
    return { error: "This store can't take orders right now. Please try again later.", status: 409 };
  }
  return { business, vendor };
}

// GET /api/orders/payment-details/:businessId  (public)
// What a customer needs to make the transfer. Only the account name, bank and
// number, never anything else on the vendor record.
export const getPaymentDetails = async (req, res) => {
  try {
    const result = await loadPayableVendor(req.params.businessId);
    if (result.error) return res.status(result.status).json({ message: result.error });

    const { business, vendor } = result;
    res.json({
      businessName: business.name,
      bankName: vendor.bankName,
      accountName: vendor.accountName,
      accountNumber: vendor.accountNumber,
    });
  } catch (error) {
    console.error("Get payment details error:", error);
    res.status(500).json({ message: "Error loading payment details" });
  }
};

// POST /api/orders/direct  (public, multipart: `receipt` file + `payload` JSON)
// Creates an order that has been paid by bank transfer to the vendor and is
// waiting for the vendor to confirm. Prices, delivery and the total are all
// worked out here from the database, never trusted from the browser.
export const createDirectOrder = async (req, res) => {
  // Which step we were on, so a failure can say exactly where it happened.
  let stage = "reading_request";
  try {
    let payload;
    try {
      payload = JSON.parse(req.body?.payload || "{}");
    } catch {
      return res.status(400).json({ message: "Your order details were not readable. Please try again." });
    }

    const { reference, customer, items, deliveryMethod, expectedTotal } = payload;

    if (!reference || !REFERENCE_PATTERN.test(reference)) {
      return res.status(400).json({ message: "Invalid order reference. Please refresh and try again." });
    }
    if (!customer?.fullName || !customer?.phone || !customer?.email || !customer?.address || !customer?.city) {
      return res.status(400).json({ message: "Please fill in all your details." });
    }
    const method = deliveryMethod === "pickup" ? "pickup" : "delivery";
    if (method === "delivery" && !String(customer.state || "").trim()) {
      return res.status(400).json({ message: "Please enter your state so we can work out delivery." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Your cart is empty." });
    }

    // The receipt is compulsory, and must really be a JPG, PNG, WEBP or PDF.
    if (!req.file) {
      return res.status(400).json({ message: "Please upload your payment receipt (JPG, PNG or PDF)." });
    }
    const fileType = sniffReceiptType(req.file.buffer);
    if (!fileType) {
      return res.status(400).json({ message: "The receipt must be a JPG, PNG, WEBP or PDF file." });
    }

    // Rebuild the items from the database.
    stage = "checking_products";
    const wanted = new Map();
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!mongoose.isValidObjectId(item.productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ message: "Something in your cart is not valid. Please refresh and try again." });
      }
      wanted.set(String(item.productId), (wanted.get(String(item.productId)) || 0) + quantity);
    }

    const products = await Product.find({ _id: { $in: [...wanted.keys()] } });
    if (products.length !== wanted.size) {
      return res.status(400).json({ message: "One of the products in your cart is no longer available." });
    }

    const storeIds = new Set(products.map((pr) => String(pr.businessId)));
    if (storeIds.size > 1) {
      return res.status(400).json({
        message: "An order can only include items from one store. Please check out one store at a time.",
      });
    }
    const businessId = [...storeIds][0];

    const outOfStock = products.find((pr) => pr.inStock === false);
    if (outOfStock) {
      return res.status(400).json({ message: `${outOfStock.name} is out of stock.` });
    }

    // Stock only comes off when the vendor confirms (so unpaid orders can't
    // lock it), but an order for more than is left is turned away up front.
    // A product with no count (stock 0 but still listed) is left alone.
    const overOrdered = products.find((pr) => pr.stock > 0 && wanted.get(String(pr._id)) > pr.stock);
    if (overOrdered) {
      return res.status(400).json({
        message: `Only ${overOrdered.stock} left of ${overOrdered.name}. Please lower the quantity and try again.`,
      });
    }

    const result = await loadPayableVendor(businessId);
    if (result.error) return res.status(result.status).json({ message: result.error });
    const { business, vendor } = result;

    // This store may have blocked this customer.
    const customerEmail = String(customer.email).trim();
    if ((vendor.blockedCustomerEmails || []).includes(customerEmail.toLowerCase())) {
      return res.status(403).json({ message: "This store can't take your order right now." });
    }

    // Junk limits: one unconfirmed order per customer per store at a time, and
    // a daily cap on new transfer orders per email.
    const [waitingWithStore, ordersToday] = await Promise.all([
      Order.exists({
        paymentMethod: "bank_transfer",
        status: "awaiting_confirmation",
        "customer.email": emailMatcher(customerEmail),
        "vendors.businessId": businessId,
      }),
      Order.countDocuments({
        paymentMethod: "bank_transfer",
        "customer.email": emailMatcher(customerEmail),
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);
    if (waitingWithStore) {
      return res.status(409).json({
        message: `You already have an order waiting for ${business.name} to confirm your payment. Please wait for their answer, or message them, before placing another.`,
      });
    }
    if (ordersToday >= DAILY_TRANSFER_ORDER_CAP) {
      return res.status(429).json({
        message: "You've placed several orders today. Please try again tomorrow, or contact the stores directly.",
      });
    }

    const orderItems = products.map((pr) => ({
      productId: String(pr._id),
      businessId,
      name: pr.name,
      category: pr.category || "",
      quantity: wanted.get(String(pr._id)),
      price: Number(pr.price),
      image: pr.images?.[0] || "",
    }));
    const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    let deliveryFee = 0;
    if (method === "delivery") {
      const buyerState = String(customer.state || "").trim().toLowerCase();
      const vendorState = String(business.location || "").trim().toLowerCase();
      const fee = buyerState === vendorState ? business.deliveryFeeInState : business.deliveryFeeOutState;
      deliveryFee = Number(fee) || 0;
    }
    const total = subtotal + deliveryFee;

    // If a price or delivery fee changed since the customer saw the total,
    // stop before they send money for the wrong amount.
    if (expectedTotal !== undefined && Math.round(Number(expectedTotal)) !== Math.round(total)) {
      return res.status(409).json({
        message: `The total for this order is now ₦${total.toLocaleString("en-NG")}. Please check the amount and try again.`,
        total,
      });
    }

    if (await Order.exists({ reference })) {
      return res.status(409).json({ message: "This order was already placed." });
    }

    // Upload first, on its own, so a Cloudinary problem is logged with its
    // real cause (missing keys, rejected options) instead of the generic
    // "could not place your order" message. No order exists yet, so nothing
    // is left half-created.
    stage = "uploading_receipt";
    let receipt;
    try {
      receipt = await uploadReceipt(req.file.buffer, req.file.originalname);
    } catch (uploadError) {
      // Cloudinary sometimes throws a plain string (e.g. "Must supply api_key"),
      // so fall back to the value itself when there is no .message.
      console.error("Receipt upload failed:", {
        message: uploadError?.message ?? String(uploadError),
        http_code: uploadError?.http_code,
        hasCloudName: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
        hasApiKey: Boolean(process.env.CLOUDINARY_API_KEY),
        hasApiSecret: Boolean(process.env.CLOUDINARY_API_SECRET),
      });
      return res.status(502).json({
        code: "RECEIPT_UPLOAD_FAILED",
        message: "We couldn't save your receipt (storage error). Please try again in a moment.",
      });
    }

    // Fingerprint the receipt and flag it if the identical file is already on
    // another order. This only warns the vendor; it never blocks the order.
    const fileHash = sha256(req.file.buffer);
    receipt.fileHash = fileHash;
    const duplicateReceiptOf = await findDuplicateReceipt(fileHash, reference);

    stage = "saving_order";
    const order = await Order.create({
      reference,
      customer: {
        fullName: String(customer.fullName).trim(),
        phone: String(customer.phone).trim(),
        email: String(customer.email).trim(),
        address: String(customer.address).trim(),
        city: String(customer.city).trim(),
        state: String(customer.state || "").trim(),
        note: String(customer.note || "").trim(),
      },
      items: orderItems,
      vendors: [
        {
          businessId,
          businessName: business.name,
          itemsSubtotal: subtotal,
          deliveryFee,
        },
      ],
      subtotal,
      serviceFee: 0,
      vat: 0,
      deliveryFee,
      total,
      deliveryMethod: method,
      status: "awaiting_confirmation",
      paymentStatus: "awaiting_confirmation",
      paymentMethod: "bank_transfer",
      paymentReceipts: [receipt],
      duplicateReceiptOf,
      paymentInstructions: {
        bankName: vendor.bankName,
        accountName: vendor.accountName || "",
        accountNumber: vendor.accountNumber,
      },
    });

    const dashboardUrl = `${SITE_URL}/dashboard/${businessId}`;
    const statusUrl = `${SITE_URL}/payment-status?status=awaiting&reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(order.customer.email)}`;

    stage = "sending_notifications";
    // Notifications are best-effort. The order is already saved, so a mail
    // hiccup must not make the customer think it failed and pay twice.
    await Promise.allSettled([
      sendVendorTransferOrderEmail({
        to: vendor.contactEmail,
        businessName: business.name,
        customerName: order.customer.fullName,
        reference,
        items: order.items,
        total,
        dashboardUrl,
      }),
      sendCustomerTransferOrderReceivedEmail({
        to: order.customer.email,
        customerName: order.customer.fullName,
        businessName: business.name,
        reference,
        total,
        statusUrl,
      }),
      vendor.contactWhatsapp
        ? sendVendorNewOrderWhatsApp({
            to: vendor.contactWhatsapp,
            orderReference: reference,
            customerName: order.customer.fullName,
            customerPhone: order.customer.phone,
            itemsSummary: order.items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
            total: subtotal,
            dashboardUrl,
          })
        : Promise.resolve(null),
    ]);

    res.status(201).json({
      message: "Order placed. Waiting for the seller to confirm your payment.",
      order: { reference: order.reference, status: order.status, total: order.total },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "This order was already placed." });
    }
    console.error("Create direct order error:", { stage, name: error?.name, message: error?.message });
    res.status(500).json({
      code: `ORDER_FAILED_${stage.toUpperCase()}`,
      message: `We could not place your order (problem while ${stage.replace(/_/g, " ")}). Please try again.`,
    });
  }
};

// Same ownership rule everywhere below: the vendor of this order, or an admin.
function canActOnOrder(user, order) {
  if (user.role === "admin") return true;
  const mine = user.businessId?.toString();
  return Boolean(mine) && order.vendors.some((v) => String(v.businessId) === mine);
}

// PATCH /api/orders/:reference/payment/confirm  (vendor / admin)
export const confirmTransferPayment = async (req, res) => {
  try {
    const order = await Order.findOne({ reference: req.params.reference });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canActOnOrder(req.user, order)) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.paymentMethod !== "bank_transfer") {
      return res.status(400).json({ message: "This order was not paid by bank transfer." });
    }
    if (order.status === "paid") {
      return res.status(200).json({ message: "Payment was already confirmed.", order });
    }
    if (!["awaiting_confirmation", "payment_rejected"].includes(order.status)) {
      return res.status(400).json({ message: `This order can't be confirmed (it is ${order.status}).` });
    }

    await Order.updateOne({ _id: order._id }, { paymentConfirmedAt: new Date() });
    // The vendor was already emailed when the order was placed, so only the
    // customer's confirmation goes out here.
    const paid = await markOrderPaid(order.reference, { notifyVendors: false });

    // If the customer had already disputed "payment not confirmed", the
    // vendor answering it settles that dispute.
    await Dispute.updateMany(
      { orderId: order._id, reason: "payment_not_confirmed", status: { $in: ["open", "escalated"] } },
      {
        status: "resolved",
        "adminResolution.note": "The vendor confirmed the payment.",
        "adminResolution.resolvedAt": new Date(),
      }
    ).catch((err) => console.error("Auto-resolve payment dispute failed:", err));

    // Take the quantities off stock, once. The flag is claimed atomically, so
    // a double tap or two admins confirming at once can't take it off twice.
    let stockWarnings = [];
    try {
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, stockAdjustedAt: null },
        { stockAdjustedAt: new Date() }
      );
      if (claimed) stockWarnings = await reduceStockForOrder(order);
    } catch (stockError) {
      console.error("Stock adjustment failed:", stockError);
    }

    res.json({ message: "Payment confirmed.", order: paid, stockWarnings });
  } catch (error) {
    console.error("Confirm transfer payment error:", error);
    res.status(500).json({ message: "Error confirming payment" });
  }
};

// PATCH /api/orders/:reference/payment/reject  (vendor / admin)  body: { reason }
export const rejectTransferPayment = async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5) {
      return res.status(400).json({ message: "Please tell the customer why you are rejecting this payment." });
    }
    if (reason.length > 500) {
      return res.status(400).json({ message: "Please keep the reason under 500 characters." });
    }

    const order = await Order.findOne({ reference: req.params.reference });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canActOnOrder(req.user, order)) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.paymentMethod !== "bank_transfer") {
      return res.status(400).json({ message: "This order was not paid by bank transfer." });
    }
    if (order.status !== "awaiting_confirmation") {
      return res.status(400).json({ message: `This order can't be rejected (it is ${order.status}).` });
    }

    // Only moves if it is still awaiting, so two quick taps can't reject twice.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "awaiting_confirmation" },
      {
        status: "payment_rejected",
        paymentStatus: "payment_rejected",
        $push: { paymentRejections: { reason, rejectedAt: new Date() } },
      },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: "This order was just updated. Please refresh." });

    const statusUrl = `${SITE_URL}/payment-status?status=rejected&reference=${encodeURIComponent(updated.reference)}&email=${encodeURIComponent(updated.customer.email)}`;
    await Promise.allSettled([
      sendPaymentRejectedCustomerEmail({
        to: updated.customer.email,
        customerName: updated.customer.fullName,
        businessName: updated.vendors[0]?.businessName || "the seller",
        reference: updated.reference,
        reason,
        statusUrl,
      }),
    ]);

    res.json({ message: "Payment rejected. The customer has been told why.", order: updated });
  } catch (error) {
    console.error("Reject transfer payment error:", error);
    res.status(500).json({ message: "Error rejecting payment" });
  }
};

// POST /api/orders/:reference/receipt  (public, multipart: `receipt` + `email`)
// After a rejection the customer uploads a new receipt on the SAME order. The
// email must match the one on the order, since guest checkout has no login.
export const resubmitReceipt = async (req, res) => {
  try {
    const order = await Order.findOne({ reference: req.params.reference });
    if (!order || !sameEmail(order.customer.email, req.body?.email)) {
      return res.status(404).json({ message: "We couldn't find that order with that email." });
    }
    if (order.paymentMethod !== "bank_transfer" || order.status !== "payment_rejected") {
      return res.status(400).json({ message: "A new receipt can only be uploaded after a payment was rejected." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Please upload your payment receipt (JPG, PNG or PDF)." });
    }
    if (!sniffReceiptType(req.file.buffer)) {
      return res.status(400).json({ message: "The receipt must be a JPG, PNG, WEBP or PDF file." });
    }

    const receipt = await uploadReceipt(req.file.buffer, req.file.originalname);
    const fileHash = sha256(req.file.buffer);
    receipt.fileHash = fileHash;
    const duplicateReceiptOf = await findDuplicateReceipt(fileHash, order.reference);

    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "payment_rejected" },
      {
        status: "awaiting_confirmation",
        paymentStatus: "awaiting_confirmation",
        lastVendorReminderAt: null,
        duplicateReceiptOf,
        $push: { paymentReceipts: receipt },
      },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: "This order was just updated. Please refresh." });

    const businessId = updated.vendors[0]?.businessId;
    const vendor = businessId ? await Vendor.findOne({ businessId }) : null;
    if (vendor?.contactEmail) {
      await Promise.allSettled([
        sendVendorTransferOrderEmail({
          to: vendor.contactEmail,
          businessName: updated.vendors[0].businessName,
          customerName: updated.customer.fullName,
          reference: updated.reference,
          items: updated.items,
          total: updated.total,
          dashboardUrl: `${SITE_URL}/dashboard/${businessId}`,
          resubmitted: true,
        }),
      ]);
    }

    res.json({
      message: "Thanks. Your new receipt was sent to the seller.",
      order: { reference: updated.reference, status: updated.status },
    });
  } catch (error) {
    console.error("Resubmit receipt error:", error);
    res.status(500).json({ message: "We could not upload your receipt. Please try again." });
  }
};

// POST /api/orders/:reference/cancel   body: { email }   (customer, no login)
// A customer cancels an order the vendor has not confirmed yet. The email must
// match the one on the order, like the receipt re-upload. An order the vendor
// already confirmed can't be cancelled here: that is a dispute.
export const cancelTransferOrder = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const order = await Order.findOne({ reference: req.params.reference });
    if (!order || !email || String(order.customer?.email || "").trim().toLowerCase() !== email) {
      return res.status(404).json({ message: "We couldn't find that order with that email address." });
    }
    if (order.paymentMethod !== "bank_transfer") {
      return res.status(400).json({ message: "This order can't be cancelled here." });
    }
    if (order.status === "cancelled") {
      return res.json({ message: "This order was already cancelled.", order });
    }
    if (!["awaiting_confirmation", "payment_rejected"].includes(order.status)) {
      return res.status(400).json({
        message: "Only an order the seller hasn't confirmed yet can be cancelled. If something is wrong with it, report a problem instead.",
      });
    }

    // Atomic: if the vendor confirms at the same moment, only one of the two wins.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: { $in: ["awaiting_confirmation", "payment_rejected"] } },
      { status: "cancelled", paymentStatus: "cancelled", cancelledAt: new Date(), cancelledBy: "customer" },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ message: "This order just changed. Please refresh and check its status." });
    }

    // A "vendor hasn't confirmed" dispute has nothing left to decide.
    await Dispute.updateMany(
      { orderId: order._id, reason: "payment_not_confirmed", status: { $in: ["open", "escalated"] } },
      {
        status: "resolved",
        "adminResolution.note": "The customer cancelled the order.",
        "adminResolution.resolvedAt": new Date(),
      }
    ).catch((err) => console.error("Auto-resolve on cancel failed:", err));

    // Tell both sides. Best effort: a failed email never undoes the cancel.
    const businessId = order.vendors?.[0]?.businessId;
    const businessName = order.vendors?.[0]?.businessName || "the seller";
    const vendor = businessId ? await Vendor.findOne({ businessId }).select("contactEmail") : null;
    if (vendor?.contactEmail) {
      sendVendorOrderCancelledEmail({
        to: vendor.contactEmail,
        businessName,
        customerName: order.customer?.fullName,
        reference: order.reference,
        total: order.total,
        dashboardUrl: `${SITE_URL}/dashboard/${businessId}`,
      }).catch((err) => console.error("Cancel vendor email failed:", err));
    }
    sendCustomerOrderCancelledEmail({
      to: order.customer.email,
      customerName: order.customer.fullName,
      businessName,
      reference: order.reference,
      total: order.total,
    }).catch((err) => console.error("Cancel customer email failed:", err));

    res.json({ message: "Order cancelled.", order: updated });
  } catch (error) {
    console.error("Cancel transfer order error:", error);
    res.status(500).json({ message: "We couldn't cancel your order. Please try again." });
  }
};