import User from "../models/User.js";
import Order from "../models/Order.js";
import DeviceToken from "../models/DeviceToken.js";
import { buildMulticastMessage, deadTokens } from "./pushMessage.js";

// Sends notifications through Firebase. It needs the FIREBASE_SERVICE_ACCOUNT
// setting (the whole key file from Firebase, pasted into the host's settings).
// Without it, or if anything goes wrong, nothing is sent and nothing breaks:
// a missed notification must never fail an order or a payment.

let messagingPromise = null;

function getMessaging() {
  if (messagingPromise) return messagingPromise;
  messagingPromise = (async () => {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    try {
      const credential = JSON.parse(raw);
      // Pasted into a settings page, the line breaks in the key often turn
      // into the two characters \n; put them back.
      if (typeof credential.private_key === "string") {
        credential.private_key = credential.private_key.replace(/\\n/g, "\n");
      }
      const { getApps, getApp, initializeApp, cert } = await import("firebase-admin/app");
      const { getMessaging: getFirebaseMessaging } = await import("firebase-admin/messaging");
      const app = getApps().length ? getApp() : initializeApp({ credential: cert(credential) });
      return getFirebaseMessaging(app);
    } catch (error) {
      console.error("Push notifications could not start:", error.message);
      return null;
    }
  })();
  return messagingPromise;
}

// Sends one notification to every phone signed in as this user.
// Resolves with { configured, devices, sent, failed }; never throws.
export async function sendPushToUser(userId, payload) {
  try {
    const messaging = await getMessaging();
    if (!messaging) return { configured: false, devices: 0, sent: 0, failed: 0 };

    const rows = await DeviceToken.find({ userId }).select("token");
    const tokens = rows.map((row) => row.token);
    if (tokens.length === 0) return { configured: true, devices: 0, sent: 0, failed: 0 };

    const response = await messaging.sendEachForMulticast(buildMulticastMessage(tokens, payload));
    const dead = deadTokens(tokens, response.responses);
    if (dead.length > 0) await DeviceToken.deleteMany({ token: { $in: dead } });

    return { configured: true, devices: tokens.length, sent: response.successCount, failed: response.failureCount };
  } catch (error) {
    console.error("Sending a push notification failed:", error.message);
    return { configured: true, devices: 0, sent: 0, failed: 0, error: true };
  }
}

// Tells the owner of a store (the user whose businessId matches).
// Never throws, so a failed notification cannot break an order or a dispute.
export async function pushToBusinessOwner(businessId, payload) {
  try {
    if (!businessId) return;
    const owner = await User.findOne({ businessId }).select("_id");
    if (owner) await sendPushToUser(owner._id, payload);
  } catch (error) {
    console.error("Push to business owner failed:", error.message);
  }
}

// Tells the shopper who placed an order (only signed-in shoppers have a phone
// on file; guest orders have no userId and are skipped).
// Never throws.
export async function pushToOrderCustomer(order, payload) {
  try {
    let userId = order?.userId || null;
    if (!userId && order?._id) {
      const row = await Order.findById(order._id).select("userId");
      userId = row?.userId || null;
    }
    if (userId) await sendPushToUser(userId, payload);
  } catch (error) {
    console.error("Push to order customer failed:", error.message);
  }
}