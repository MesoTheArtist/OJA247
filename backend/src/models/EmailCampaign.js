import mongoose from "mongoose";

// One admin announcement ("Merry Christmas", maintenance notice, new feature).
// The recipient list is frozen when the campaign is created, and the send
// works through it a few at a time (see campaignController.sendCampaignBatch)
// so it never has to fit inside one serverless request or blow past the
// mailbox's daily sending limit.
const RecipientSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    name: { type: String, default: "" },
    kind: { type: String, enum: ["user", "marketer"], required: true }, // which collection uid points at
    uid: { type: String, required: true }, // for the unsubscribe link
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
    sentAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const EmailCampaignSchema = new mongoose.Schema(
  {
    occasion: { type: String, default: "" }, // preset name, just for the history list
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, maxlength: 5000 },
    ctaLabel: { type: String, default: "", maxlength: 40 },
    ctaUrl: { type: String, default: "", maxlength: 500 },
    audiences: [{ type: String, enum: ["customers", "vendors", "marketers"] }],
    recipients: [RecipientSchema],
    // Index of the next recipient to look at. Moved atomically when a batch
    // is claimed, so two open admin tabs can't send the same people twice.
    cursor: { type: Number, default: 0 },
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "sending", "paused", "sent"], default: "draft" },
    pausedReason: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("EmailCampaign", EmailCampaignSchema)
