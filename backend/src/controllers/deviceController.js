import DeviceToken from "../models/DeviceToken.js";
import { sendPushToUser } from "../services/pushService.js";

// A user rarely has more than a couple of phones; keep the newest few.
const MAX_DEVICES_PER_USER = 10;

// POST /api/devices   body: { token, platform? }
// The app sends this phone's notification address after sign-in.
export const registerDevice = async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (token.length < 20 || token.length > 4096) {
      return res.status(400).json({ message: "A valid device token is required." });
    }
    const platform = ["android", "ios", "web"].includes(req.body.platform) ? req.body.platform : "android";

    await DeviceToken.findOneAndUpdate(
      { token },
      { userId: req.user._id, platform, lastSeenAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const extra = await DeviceToken.find({ userId: req.user._id })
      .sort({ lastSeenAt: -1 })
      .skip(MAX_DEVICES_PER_USER)
      .select("_id");
    if (extra.length > 0) await DeviceToken.deleteMany({ _id: { $in: extra.map((device) => device._id) } });

    res.json({ success: true });
  } catch (error) {
    // Two requests with the same new token at once: the other one won.
    if (error.code === 11000) return res.json({ success: true });
    console.error("Register device error:", error);
    res.status(500).json({ message: "Could not register this phone for notifications." });
  }
};

// POST /api/devices/unregister   body: { token }
// Sent by the app just before sign-out.
export const unregisterDevice = async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token) return res.status(400).json({ message: "A device token is required." });

    await DeviceToken.deleteOne({ token, userId: req.user._id });
    res.json({ success: true });
  } catch (error) {
    console.error("Unregister device error:", error);
    res.status(500).json({ message: "Could not remove this phone from notifications." });
  }
};

// POST /api/devices/test
// Sends a test notification to the signed-in user's own phones.
export const sendTestNotification = async (req, res) => {
  const result = await sendPushToUser(req.user._id, {
    title: "OJA247",
    body: "Notifications are working on this phone.",
    data: { type: "test" },
  });

  if (!result.configured) {
    return res.status(503).json({ message: "Notifications are not switched on for the server yet." });
  }
  if (result.devices === 0) {
    return res.status(400).json({
      message: "No phone is set up for notifications yet. Allow notifications in the app and sign in again.",
    });
  }
  if (result.sent === 0) {
    return res.status(502).json({ message: "The notification could not be delivered. Please try again." });
  }
  res.json({
    sent: result.sent,
    message: `Test notification sent to ${result.sent} device${result.sent === 1 ? "" : "s"}.`,
  });
};