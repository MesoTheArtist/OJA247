import crypto from "crypto";
import Order from "../models/Order.js";
import Vendor from "../models/Vendor.js";
import Business from "../models/Business.js";
import TaxLedger from "../models/TaxLedger.js";
import { sendOrderConfirmationEmail, sendVendorNewOrderEmail, sendOrderPaymentFailedEmail } from "../services/emailService.js";
import { sendVendorNewOrderWhatsApp } from "../services/whatsappService.js";
import { withActiveDisputeVendors } from "../services/disputeOrderStatus.js";

// Shared by /verify and the webhook — idempotent, safe to call twice for the
// same reference (e.g. if the customer's browser confirms AND the webhook
// fires). Only ever transitions an order into "paid" once, and only sends
// the confirmation/notification emails on that one transition.
async function markOrderPaid(reference) {
  const existing = await Order.findOne({ reference });
  if (!existing) return null;
  if (existing.status === "paid") return existing; // already processed, no-op

  const order = await Order.findOneAndUpdate(
    { reference },
    { status: "paid", paymentStatus: "paid" },
    { new: true }
  );

  const fullAddress = [order.customer?.address, order.customer?.city, order.customer?.state]
    .filter(Boolean)
    .join(", ");

  // Accrue this order's VAT into the tax ledger the moment payment succeeds
  // — see TaxLedger.js. Never blocks or fails the order itself; a ledger
  // hiccup shouldn't undo a real payment, just gets logged loudly.
  if (order.vat > 0) {
    try {
      await TaxLedger.create({
        orderId: order._id,
        orderReference: order.reference,
        orderTotal: order.total,
        pssCharge: order.serviceFee,
        taxRate: order.serviceFee > 0 ? order.vat / order.serviceFee : 0,
        taxAmount: order.vat,
      });
    } catch (err) {
      // Unique index on orderId — a duplicate is just the idempotent
      // re-run guard above having already let this through once; anything
      // else is worth knowing about.
      if (err?.code !== 11000) {
        console.error(`Tax ledger entry failed for order ${order.reference}:`, err.message);
      }
    }
  }

  await sendOrderConfirmationEmail({
    to: order.customer?.email,
    customerName: order.customer?.fullName,
    reference: order.reference,
    items: order.items,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    serviceFee: order.serviceFee,
    vat: order.vat,
    total: order.total,
    deliveryMethod: order.deliveryMethod,
    address: fullAddress,
  });

  const businessIds = order.vendors.map((v) => v.businessId).filter(Boolean);
  const vendorRecords = await Vendor.find({ businessId: { $in: businessIds } }).select(
    "businessId contactEmail contactWhatsapp"
  );
  const emailByBusinessId = new Map(vendorRecords.map((v) => [v.businessId.toString(), v.contactEmail]));
  const whatsappByBusinessId = new Map(
    vendorRecords.map((v) => [v.businessId.toString(), v.contactWhatsapp])
  );

  // forEach can't be awaited (its callback's returned promises are
  // discarded), so this used to race the same way the other unawaited
  // sends did — Promise.all over a map() actually blocks until every
  // vendor's email is done.
  await Promise.all(
    order.vendors.map((v) => {
      const vendorItems = order.items.filter((i) => i.businessId === v.businessId);

      const emailPromise = (() => {
        const vendorEmail = v.businessId && emailByBusinessId.get(v.businessId.toString());
        if (!vendorEmail) return null;
        return sendVendorNewOrderEmail({
          to: vendorEmail,
          businessName: v.businessName,
          customerName: order.customer?.fullName,
          customerPhone: order.customer?.phone,
          reference: order.reference,
          items: vendorItems,
          subtotal: v.itemsSubtotal,
          deliveryFee: v.deliveryFee,
          deliveryMethod: order.deliveryMethod,
          address: fullAddress,
          note: order.customer?.note,
        });
      })();

      // WhatsApp is best-effort alongside email, not instead of it — if
      // the number's missing, unrecognized, or Twilio isn't configured,
      // sendVendorNewOrderWhatsApp already resolves with {sent:false}
      // rather than throwing (see whatsappService.js), so this never
      // blocks the order flow or the email above.
      const whatsappPromise = (() => {
        const vendorWhatsapp = v.businessId && whatsappByBusinessId.get(v.businessId.toString());
        if (!vendorWhatsapp) return null;
        const itemsSummary = vendorItems.map((i) => `${i.quantity}x ${i.name}`).join(", ");
        return sendVendorNewOrderWhatsApp({
          to: vendorWhatsapp,
          orderReference: order.reference,
          customerName: order.customer?.fullName,
          customerPhone: order.customer?.phone,
          itemsSummary,
          total: v.itemsSubtotal,
          dashboardUrl: `${process.env.SITE_URL || "https://oja247.store"}/business-dashboard`,
        });
      })();

      return Promise.all([emailPromise, whatsappPromise]);
    })
  );

  return order;
}

// Same idempotency shape as markOrderPaid — never overwrites an order that's
// already "paid" (a late charge.failed webhook arriving after a successful
// verify shouldn't undo it), and only emails the customer once per order.
async function markOrderFailed(reference) {
  const existing = await Order.findOne({ reference });
  if (!existing) return null;
  if (existing.status === "paid" || existing.status === "failed") return existing;

  const order = await Order.findOneAndUpdate(
    { reference },
    { status: "failed", paymentStatus: "failed" },
    { new: true }
  );

  await sendOrderPaymentFailedEmail({
    to: order.customer?.email,
    customerName: order.customer?.fullName,
    reference: order.reference,
  });

  return order;
}

// Looks up each vendor's Paystack subaccount and builds the dynamic "flat"
// split payload (Paystack keeps whatever isn't allocated to a subaccount,
// so the platform's service fee + VAT naturally stay on the main account).
async function buildPaystackSplit(orderVendors) {
  const businessIds = orderVendors.map((v) => v.businessId).filter(Boolean);
  const vendorRecords = await Vendor.find({ businessId: { $in: businessIds } });
  const vendorByBusinessId = new Map(vendorRecords.map((v) => [v.businessId.toString(), v]));

  const subaccounts = [];
  const missing = [];

  orderVendors.forEach((v) => {
    const vendor = v.businessId && vendorByBusinessId.get(v.businessId.toString());
    if (!vendor?.subaccountCode) {
      missing.push(v.businessName || "Unknown vendor");
      return;
    }
    if (vendor.payoutHold) {
      // Bank change failed re-verification — treat the same as "not set up
      // yet" so checkout can't route money to an unverified account.
      missing.push(v.businessName || "Unknown vendor");
      return;
    }

    const share = Math.round((v.itemsSubtotal + v.deliveryFee) * 100); // kobo
    if (share > 0) {
      subaccounts.push({ subaccount: vendor.subaccountCode, share });
    }
  });

  return { subaccounts, missing };
}

export const createOrder = async (req, res) => {
  try {
    const {
      reference,
      customer,
      items,
      subtotal,
      serviceFee,
      vat,
      deliveryFee,
      deliveryBreakdown,
      total,
      deliveryMethod,
    } = req.body;

    if (!reference || !customer || !items || items.length === 0) {
      return res.status(400).json({ message: "Missing required order fields" });
    }

    const existingOrder = await Order.findOne({ reference });
    if (existingOrder) {
      const { subaccounts, missing } = await buildPaystackSplit(existingOrder.vendors);
      if (missing.length > 0) {
        return res.status(400).json({
          message: `Some vendors in this order haven't finished payout setup yet: ${missing.join(
            ", "
          )}. Remove their items and try again.`,
        });
      }

      return res.status(200).json({
        message: "Order already exists",
        order: existingOrder,
        split: { type: "flat", bearer_type: "account", subaccounts },
      });
    }

    // Build the per-vendor breakdown the Order model expects (vendors[]),
    // from what Checkout.jsx sends as deliveryBreakdown ([{businessId, businessName, fee}]).
    // itemsSubtotal is derived here since the frontend doesn't currently send it per vendor.
    const vendors = Array.isArray(deliveryBreakdown)
      ? deliveryBreakdown.map((v) => {
          const vendorItemsSubtotal = (items || [])
            .filter((item) => (item.businessId || null) === (v.businessId || null))
            .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

          return {
            businessId: v.businessId || null,
            businessName: v.businessName || "",
            itemsSubtotal: vendorItemsSubtotal,
            deliveryFee: Number(v.fee || 0),
          };
        })
      : [];

    // Belt-and-suspenders on top of the public listing filter: isHidden
    // (set on ban — see adminController.js toggleUserBan, and previously
    // the storefront could still be checked out against directly even
    // when hidden from browse/search) has to be checked here too, or
    // someone with a stale/shared product link can still complete a
    // purchase from a vendor that's supposed to be shut down.
    const vendorIds = vendors.map((v) => v.businessId).filter(Boolean);
    if (vendorIds.length > 0) {
      const hiddenVendors = await Business.find({ _id: { $in: vendorIds }, isHidden: true }).select("name");
      if (hiddenVendors.length > 0) {
        return res.status(400).json({
          message: `${hiddenVendors.map((b) => b.name).join(", ")} ${
            hiddenVendors.length === 1 ? "is" : "are"
          } no longer available. Remove ${hiddenVendors.length === 1 ? "it" : "them"} from your cart to continue.`,
        });
      }
    }

    // Every vendor in the cart must have a working payout subaccount before
    // we accept payment — otherwise their share of the money has nowhere to
    // automatically go.
    const { subaccounts, missing } = await buildPaystackSplit(vendors);
    if (missing.length > 0) {
      return res.status(400).json({
        message: `Some vendors in your cart haven't finished payout setup yet: ${missing.join(
          ", "
        )}. Remove their items to continue.`,
      });
    }

    const order = await Order.create({
      reference,
      customer,
      items,
      vendors,
      subtotal,
      serviceFee: serviceFee || 0,
      vat: vat || 0,
      deliveryFee,
      total,
      deliveryMethod,
      status: "pending",
      paymentStatus: "pending",
    });

    res.status(201).json({
      message: "Order created",
      order,
      split: { type: "flat", bearer_type: "account", subaccounts },
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: "Error creating order" });
  }
};

export const verifyOrderPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ message: "Payment reference is required" });
    }

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) {
      return res.status(500).json({
        message: "Paystack secret key is not configured on the backend",
      });
    }

    const verificationResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const verificationData = await verificationResponse.json();

    const order = await Order.findOne({ reference });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!verificationResponse.ok || !verificationData.status || verificationData.data?.status !== "success") {
      const failedOrder = await markOrderFailed(reference);

      return res.status(400).json({
        message: "Payment verification failed",
        order: failedOrder,
        verification: verificationData,
      });
    }

    const paidOrder = await markOrderPaid(reference);

    return res.json({
      message: "Payment verified successfully",
      order: paidOrder,
      verification: verificationData,
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(500).json({ message: "Error verifying payment" });
  }
};

// POST /api/orders/webhook
// Paystack calls this asynchronously on payment events — this is the
// source of truth for marking orders paid, independent of whether the
// customer's browser stayed on the page long enough to hit /verify.
export const handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    // req.rawBody is populated by the express.json() verify hook in server.js —
    // the signature is an HMAC over the exact raw bytes, not the parsed JSON.
    if (!secret || !signature || !req.rawBody) {
      return res.sendStatus(401);
    }

    const expectedSignature = crypto.createHmac("sha512", secret).update(req.rawBody).digest("hex");
    if (expectedSignature !== signature) {
      console.error("Paystack webhook: signature mismatch");
      return res.sendStatus(401);
    }

    const event = req.body;

    // findOneAndUpdate is idempotent — safe if Paystack retries, or if
    // /verify already marked this order paid via the redirect callback.
    if (event.event === "charge.success" && event.data?.reference) {
      await markOrderPaid(event.data.reference);
    }

    if (event.event === "charge.failed" && event.data?.reference) {
      await markOrderFailed(event.data.reference);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Paystack webhook error:", error.message);
    // Non-2xx so Paystack retries later rather than silently losing the event
    return res.sendStatus(500);
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { reference } = req.params;
    const { status, paymentStatus } = req.body;

    const order = await Order.findOneAndUpdate(
      { reference },
      {
        status: status || "pending",
        paymentStatus: paymentStatus || status || "pending",
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ message: "Order status updated", order });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ message: "Error updating order" });
  }
};

// GET /api/orders/lookup?reference=...&email=...
// Unlike getOrderByReference below (bare reference, no verification — used
// on the checkout confirmation page right after payment, where the
// customer just came from Paystack and the reference alone is enough),
// this also checks the customer's email matches, since it's meant for
// contexts where the requester isn't necessarily the person who just paid
// — e.g. filing a dispute later. Guards against someone who merely has a
// reference number (which can leak into logs, screenshots, etc.) pulling
// up someone else's order.
export const lookupOrderForDispute = async (req, res) => {
  try {
    const { reference, email } = req.query;

    if (!reference || !email) {
      return res.status(400).json({ message: "reference and email are required" });
    }

    const order = await Order.findOne({ reference });

    if (!order || order.customer?.email?.toLowerCase() !== String(email).toLowerCase()) {
      // Same message either way — don't reveal whether the reference
      // exists to someone who guessed it with the wrong email.
      return res.status(404).json({ message: "No matching order found" });
    }

    const [withDisputes] = await withActiveDisputeVendors([order]);
    res.json({ order: withDisputes });
  } catch (error) {
    console.error("Lookup order for dispute error:", error);
    res.status(500).json({ message: "Error looking up order" });
  }
};

export const getOrderByReference = async (req, res) => {
  try {
    const { reference } = req.params;
    const order = await Order.findOne({ reference });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ order });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ message: "Error fetching order" });
  }
};

// Orders containing at least one item belonging to this business.
// Used by the vendor's Orders tab in BusinessDashboard.jsx.
export const getOrdersByBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId) {
      return res.status(400).json({ message: "businessId is required" });
    }

    // SECURITY: without this check, any logged-in vendor could view any
    // OTHER business's full order list — customer names, phone numbers,
    // addresses, order amounts — just by knowing/guessing a businessId.
    if (req.user.role !== "admin" && req.user.businessId?.toString() !== businessId) {
      return res.status(403).json({ message: "Not authorized to view these orders" });
    }

    const orders = await Order.find({ "items.businessId": businessId }).sort({
      createdAt: -1,
    });

    res.json(orders);
  } catch (error) {
    console.error("Get orders by business error:", error);
    res.status(500).json({ message: "Error fetching business orders" });
  }
};

// GET /api/orders/my-orders — the logged-in customer's own order history.
// req.user comes from protect (see authMiddleware.js); requireCustomer on
// the route guarantees this is actually a customer token, so there's no
// separate id param to trust/validate here the way getOrdersByBusiness
// has to for businessId.
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(await withActiveDisputeVendors(orders));
  } catch (error) {
    console.error("Get my orders error:", error);
    res.status(500).json({ message: "Error fetching your orders" });
  }
};