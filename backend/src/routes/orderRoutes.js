import express from "express";
import {
  createOrder,
  getOrderByReference,
  lookupOrderForDispute,
  verifyOrderPayment,
  getOrdersByBusiness,
  getMyOrders,
  handlePaystackWebhook,
} from "../controllers/orderController.js";
import {
  markVendorShipped,
  receiveOrderAsCustomer,
  getReceiptInfo,
  confirmReceiptByLink,
} from "../controllers/fulfillmentController.js";
import {
  getPaymentDetails,
  createDirectOrder,
  confirmTransferPayment,
  rejectTransferPayment,
  resubmitReceipt,
  handleReceiptUpload,
} from "../controllers/directOrderController.js";
import { protect, requireCustomer } from "../middleware/authMiddleware.js";
import { authLimiter, paymentDetailsLimiter, directOrderLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/", createOrder);

// Direct bank transfer: the customer pays the vendor's own bank account,
// uploads a receipt, and the vendor confirms or rejects it.
router.get("/payment-details/:businessId", paymentDetailsLimiter, getPaymentDetails);
router.post("/direct", directOrderLimiter, handleReceiptUpload, createDirectOrder);
router.post("/:reference/receipt", directOrderLimiter, handleReceiptUpload, resubmitReceipt);
router.patch("/:reference/payment/confirm", protect, confirmTransferPayment);
router.patch("/:reference/payment/reject", protect, rejectTransferPayment);
router.post("/verify/:reference", verifyOrderPayment);
// Public — Paystack calls this directly, verified via signature, not a user token
router.post("/webhook", handlePaystackWebhook);
router.get("/reference/:reference", getOrderByReference);
// Email-verified lookup — see lookupOrderForDispute's comment for why this
// is separate from the bare-reference endpoint above.
router.get("/lookup", lookupOrderForDispute);
// SECURITY: there used to be an unauthenticated
// `router.patch("/reference/:reference", updateOrderStatus)` here — no
// auth, no ownership check, client-controlled paymentStatus. Anyone could
// mark any order "paid" without ever touching Paystack. Removed entirely
// rather than gated, since real status changes should only ever come from
// the signature-verified webhook above or verifyOrderPayment — nothing
// else should be trusted to set payment status. Confirmed the frontend
// never called this route before removing it.

// Customer's own order history — scoped to req.user._id server-side (see
// getMyOrders), so there's no id param a customer could tamper with to see
// someone else's orders the way there theoretically could be below.
router.get("/my-orders", protect, requireCustomer, getMyOrders);

// Vendor's own orders — protect + ownership check inside getOrdersByBusiness
// (see its comment) locks this to the business's own owner or an admin.
router.get("/business/:businessId", protect, getOrdersByBusiness);

// Delivery: vendor marks their part sent out; the customer confirms receipt
// either logged in, or from the emailed link (guest checkout has no login).
router.patch("/:reference/ship", protect, markVendorShipped);
router.post("/:reference/receive", protect, requireCustomer, receiveOrderAsCustomer);
router.get("/receipt-info", getReceiptInfo);
router.post("/confirm-receipt", authLimiter, confirmReceiptByLink);

export default router;