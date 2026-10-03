import Order from "../models/Order.js";
import User from "../models/User.js";
import {
  sendOrderShippedEmail,
  sendOrderReceivedVendorEmail,
} from "../services/emailService.js";
import { signReceiptToken, verifyReceiptToken } from "../services/fulfillmentTokens.js";

const SITE_URL = process.env.SITE_URL || "https://oja247.store";

export const receiptUrlFor = (orderReference, businessId) =>
  `${SITE_URL}/confirm-receipt?token=${encodeURIComponent(signReceiptToken(orderReference, businessId))}`;

const statusOf = (vendor) => vendor?.fulfillmentStatus || "processing";

// Flips ONE vendor's part of an order from `from` to `to`, atomically, so two
// clicks (or a click racing the daily auto-confirm job) can't both win.
// Returns the updated order, or null if that vendor wasn't in `from`.
export async function transitionVendorFulfillment(orderId, businessId, from, set) {
  const fromMatch =
    from === "processing"
      ? { $in: ["processing", null] } // orders from before the field existed
      : from;

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, vendors: { $elemMatch: { businessId, fulfillmentStatus: fromMatch } } },
    { $set: Object.fromEntries(Object.entries(set).map(([k, v]) => [`vendors.$[v].${k}`, v])) },
    {
      new: true,
      arrayFilters: [{ "v.businessId": businessId, "v.fulfillmentStatus": fromMatch }],
    }
  );
  return updated;
}

async function ownerEmailFor(businessId) {
  const owner = await User.findOne({ businessId }).select("email");
  return owner?.email || null;
}

// PATCH /api/orders/:reference/ship   body: { businessId }
// The vendor says they've sent their part of the order out.
export const markVendorShipped = async (req, res) => {
  try {
    const { reference } = req.params;
    const businessId = String(req.body?.businessId || req.user.businessId || "");

    if (req.user.role !== "admin" && req.user.businessId?.toString() !== businessId) {
      return res.status(403).json({ message: "Not authorized for this business" });
    }

    const order = await Order.findOne({ reference });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const vendor = (order.vendors || []).find((v) => v.businessId === businessId);
    if (!vendor) return res.status(400).json({ message: "That business isn't part of this order" });

    // "disputed" is still a paid order: it flips to that as soon as ONE vendor
    // on a multi-vendor order is disputed, and the other vendors still need
    // to be able to send their part out.
    if (!["paid", "disputed"].includes(order.status)) {
      return res.status(400).json({ message: `Only paid orders can be sent out (this one is ${order.status}).` });
    }
    if (statusOf(vendor) !== "processing") {
      return res.status(400).json({ message: "This order has already been marked as sent out." });
    }

    const updated = await transitionVendorFulfillment(order._id, businessId, "processing", {
      fulfillmentStatus: "shipped",
      shippedAt: new Date(),
    });
    if (!updated) {
      return res.status(409).json({ message: "This order was just updated. Please refresh." });
    }

    sendOrderShippedEmail({
      to: order.customer.email,
      customerName: order.customer.fullName,
      businessName: vendor.businessName,
      orderReference: order.reference,
      confirmUrl: receiptUrlFor(order.reference, businessId),
    }).catch((err) => console.error("Order-shipped email failed:", err));

    res.json({ order: updated });
  } catch (error) {
    console.error("Mark shipped error:", error);
    res.status(500).json({ message: "Error updating order" });
  }
};

// Shared by the logged-in button and the emailed link.
async function confirmReceived(order, businessId) {
  const vendor = (order.vendors || []).find((v) => v.businessId === businessId);
  if (!vendor) return { ok: false, code: 400, message: "That business isn't part of this order" };

  const current = statusOf(vendor);
  if (current === "received") return { ok: true, already: true, vendor };
  if (current !== "shipped") {
    return { ok: false, code: 400, message: "This order hasn't been sent out yet." };
  }

  const updated = await transitionVendorFulfillment(order._id, businessId, "shipped", {
    fulfillmentStatus: "received",
    receivedAt: new Date(),
    autoReceived: false,
  });
  if (!updated) return { ok: true, already: true, vendor }; // lost a race to another confirmation

  ownerEmailFor(businessId)
    .then((to) =>
      to
        ? sendOrderReceivedVendorEmail({
            to,
            businessName: vendor.businessName,
            orderReference: order.reference,
            customerName: order.customer.fullName,
            auto: false,
          })
        : null
    )
    .catch((err) => console.error("Order-received vendor email failed:", err));

  return { ok: true, order: updated, vendor };
}

// POST /api/orders/:reference/receive   body: { businessId }   (customer login)
export const receiveOrderAsCustomer = async (req, res) => {
  try {
    const { reference } = req.params;
    const businessId = String(req.body?.businessId || "");
    if (!businessId) return res.status(400).json({ message: "businessId is required" });

    const order = await Order.findOne({ reference });
    if (!order || order.userId?.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: "No matching order found" });
    }

    const result = await confirmReceived(order, businessId);
    if (!result.ok) return res.status(result.code).json({ message: result.message });
    res.json({ success: true, already: Boolean(result.already) });
  } catch (error) {
    console.error("Receive order error:", error);
    res.status(500).json({ message: "Error confirming delivery" });
  }
};

// GET /api/orders/receipt-info?token=...
// Read-only: lets the confirmation page say what it's about to confirm.
// Never changes anything, so link pre-fetching by mail scanners is harmless.
export const getReceiptInfo = async (req, res) => {
  try {
    const parsed = verifyReceiptToken(req.query.token);
    if (!parsed) return res.status(400).json({ message: "This link is invalid or has expired." });

    const order = await Order.findOne({ reference: parsed.orderReference });
    const vendor = order?.vendors?.find((v) => v.businessId === parsed.businessId);
    if (!order || !vendor) return res.status(404).json({ message: "Order not found." });

    res.json({
      orderReference: order.reference,
      businessName: vendor.businessName,
      status: statusOf(vendor),
    });
  } catch (error) {
    console.error("Receipt info error:", error);
    res.status(500).json({ message: "Something went wrong." });
  }
};

// POST /api/orders/confirm-receipt   body: { token }   (no login — guest-safe)
export const confirmReceiptByLink = async (req, res) => {
  try {
    const parsed = verifyReceiptToken(req.body?.token);
    if (!parsed) return res.status(400).json({ message: "This link is invalid or has expired." });

    const order = await Order.findOne({ reference: parsed.orderReference });
    if (!order) return res.status(404).json({ message: "Order not found." });

    const result = await confirmReceived(order, parsed.businessId);
    if (!result.ok) return res.status(result.code).json({ message: result.message });
    res.json({ success: true, already: Boolean(result.already), businessName: result.vendor.businessName });
  } catch (error) {
    console.error("Confirm receipt error:", error);
    res.status(500).json({ message: "Something went wrong." });
  }
};