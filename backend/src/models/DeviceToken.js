import mongoose from "mongoose";

// One row per phone that can receive notifications. The token is the phone's
// notification address from Firebase; it belongs to whoever signed in on that
// phone last, so signing in as someone else on the same phone moves it.
const DeviceTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    platform: { type: String, enum: ["android", "ios", "web"], default: "android" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("DeviceToken", DeviceTokenSchema);