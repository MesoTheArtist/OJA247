import EmailCampaign from "../models/EmailCampaign.js";
import User from "../models/User.js";
import Marketer from "../models/Marketer.js";
import { sendBroadcastEmail } from "../services/emailService.js";
import { signUnsubscribeToken } from "../services/unsubscribeTokens.js";

const SITE_URL = process.env.SITE_URL || "https://oja247.store";
const AUDIENCES = ["customers", "vendors", "marketers"];

// Zoho limits how much one mailbox can send per day, and the same mailbox
// also sends every order/security email. Set EMAIL_DAILY_CAP in the
// environment to comfortably under YOUR Zoho plan's real daily limit; a
// campaign pauses when it's reached and carries on the next day.
const DAILY_CAP = Number(process.env.EMAIL_DAILY_CAP) || 100;
// Sent per request, a few at a time so each request finishes well inside a
// serverless time limit. The admin page keeps calling until it's done.
const BATCH_SIZE = Number(process.env.EMAIL_BATCH_SIZE) || 5;

const firstNameOf = (name = "") => String(name).trim().split(/\s+/)[0] || "";
const unsubscribeUrlFor = (kind, uid) => `${SITE_URL}/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(kind, uid))}`;

const startOfTodayUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

async function countSentToday() {
  const rows = await EmailCampaign.aggregate([
    { $match: { updatedAt: { $gte: startOfTodayUTC() } } },
    { $unwind: "$recipients" },
    { $match: { "recipients.status": "sent", "recipients.sentAt": { $gte: startOfTodayUTC() } } },
    { $count: "n" },
  ]);
  return rows[0]?.n || 0;
}

// Who can be emailed: not banned, hasn't opted out, and (for customers)
// has a verified address — mailing mistyped, unverified addresses is how a
// sending domain ends up flagged as spam.
async function buildRecipients(audiences) {
  const byEmail = new Map();
  const add = (email, name, kind, uid) => {
    const key = String(email || "").trim().toLowerCase();
    if (!key || byEmail.has(key)) return; // one email per person even if they're in two groups
    byEmail.set(key, { email: key, name: name || "", kind, uid: String(uid), status: "pending" });
  };

  if (audiences.includes("customers")) {
    const customers = await User.find({
      role: "customer",
      banned: { $ne: true },
      marketingOptOut: { $ne: true },
      emailVerified: true,
    }).select("email fullName");
    customers.forEach((u) => add(u.email, u.fullName, "user", u._id));
  }

  if (audiences.includes("vendors")) {
    const owners = await User.find({
      role: "owner",
      banned: { $ne: true },
      marketingOptOut: { $ne: true },
    })
      .select("email businessId")
      .populate("businessId", "name");
    owners.forEach((u) => add(u.email, u.businessId?.name, "user", u._id));
  }

  if (audiences.includes("marketers")) {
    const marketers = await Marketer.find({
      banned: { $ne: true },
      marketingOptOut: { $ne: true },
    }).select("email name");
    marketers.forEach((m) => add(m.email, m.name, "marketer", m._id));
  }

  return [...byEmail.values()];
}

function validateContent({ subject, body, ctaLabel, ctaUrl }) {
  if (!subject || !String(subject).trim()) return "A subject is required.";
  if (String(subject).length > 150) return "Subject is too long (150 characters max).";
  if (!body || !String(body).trim()) return "The message body is required.";
  if (String(body).length > 5000) return "The message is too long (5000 characters max).";
  if (ctaUrl && !/^https:\/\//i.test(String(ctaUrl))) return "The button link must start with https://";
  if (ctaUrl && !String(ctaLabel || "").trim()) return "Add a label for the button, or clear the link.";
  return null;
}

const summarise = (c) => ({
  _id: c._id,
  occasion: c.occasion,
  subject: c.subject,
  audiences: c.audiences,
  status: c.status,
  pausedReason: c.pausedReason,
  totalRecipients: c.totalRecipients,
  sentCount: c.sentCount,
  failedCount: c.failedCount,
  createdAt: c.createdAt,
  completedAt: c.completedAt,
});

// GET /api/admin/campaigns/audience
export const getAudienceCounts = async (req, res) => {
  try {
    const [customers, vendors, marketers, sentToday] = await Promise.all([
      buildRecipients(["customers"]),
      buildRecipients(["vendors"]),
      buildRecipients(["marketers"]),
      countSentToday(),
    ]);
    res.json({
      customers: customers.length,
      vendors: vendors.length,
      marketers: marketers.length,
      dailyCap: DAILY_CAP,
      sentToday,
    });
  } catch (error) {
    console.error("Audience count error:", error);
    res.status(500).json({ message: "Error counting audience" });
  }
};

// POST /api/admin/campaigns/test   body: { subject, body, ctaLabel?, ctaUrl? }
// Sends one copy to the admin themselves so they can check how it looks.
export const sendTestCampaign = async (req, res) => {
  try {
    const problem = validateContent(req.body || {});
    if (problem) return res.status(400).json({ message: problem });

    const result = await sendBroadcastEmail({
      to: req.user.email,
      subject: `[Test] ${req.body.subject}`,
      bodyText: req.body.body,
      firstName: firstNameOf(req.user.fullName) || "there",
      ctaLabel: req.body.ctaLabel,
      ctaUrl: req.body.ctaUrl,
      unsubscribeUrl: unsubscribeUrlFor("user", req.user._id),
    });
    if (!result.sent) {
      return res.status(502).json({ message: result.error || "Couldn't send the test email — check the mail settings." });
    }
    res.json({ success: true, sentTo: req.user.email });
  } catch (error) {
    console.error("Test campaign error:", error);
    res.status(500).json({ message: "Error sending test email" });
  }
};

// POST /api/admin/campaigns   body: { occasion?, subject, body, ctaLabel?, ctaUrl?, audiences }
// Freezes the recipient list. Nothing is sent until send-batch is called.
export const createCampaign = async (req, res) => {
  try {
    const { occasion, subject, body, ctaLabel, ctaUrl } = req.body || {};
    const audiences = (req.body?.audiences || []).filter((a) => AUDIENCES.includes(a));

    const problem = validateContent({ subject, body, ctaLabel, ctaUrl });
    if (problem) return res.status(400).json({ message: problem });
    if (audiences.length === 0) return res.status(400).json({ message: "Pick at least one audience." });

    const recipients = await buildRecipients(audiences);
    if (recipients.length === 0) {
      return res.status(400).json({ message: "Nobody in that audience can be emailed right now." });
    }

    const campaign = await EmailCampaign.create({
      occasion: occasion || "",
      subject: String(subject).trim(),
      body: String(body).trim(),
      ctaLabel: ctaLabel ? String(ctaLabel).trim() : "",
      ctaUrl: ctaUrl ? String(ctaUrl).trim() : "",
      audiences,
      recipients,
      totalRecipients: recipients.length,
      createdBy: req.user._id,
    });

    res.status(201).json({ campaign: summarise(campaign) });
  } catch (error) {
    console.error("Create campaign error:", error);
    res.status(500).json({ message: "Error creating campaign" });
  }
};

// POST /api/admin/campaigns/:id/send-batch
// Sends the next few pending recipients. Safe to call repeatedly, and safe
// from two tabs at once (the cursor is claimed atomically).
export const sendCampaignBatch = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    if (campaign.status === "sent") return res.json({ campaign: summarise(campaign), done: true });

    const sentToday = await countSentToday();
    const remainingToday = Math.max(0, DAILY_CAP - sentToday);
    if (remainingToday === 0) {
      campaign.status = "paused";
      campaign.pausedReason = `Daily sending limit of ${DAILY_CAP} reached. Press Continue tomorrow and it picks up where it stopped.`;
      await campaign.save();
      return res.json({ campaign: summarise(campaign), done: false, paused: true });
    }

    // Collect the next pending recipients, skipping ones already sent or
    // marked failed, up to this batch's allowance.
    const take = Math.min(BATCH_SIZE, remainingToday);
    const indexes = [];
    let i = campaign.cursor;
    while (i < campaign.recipients.length && indexes.length < take) {
      if (campaign.recipients[i].status === "pending") indexes.push(i);
      i += 1;
    }
    const newCursor = i;

    // Claim this slice. If another request already moved the cursor, back off.
    const claimed = await EmailCampaign.findOneAndUpdate(
      { _id: campaign._id, cursor: campaign.cursor },
      { $set: { cursor: newCursor, status: "sending", pausedReason: "" } },
      { new: true }
    );
    if (!claimed) {
      const fresh = await EmailCampaign.findById(campaign._id);
      return res.json({ campaign: summarise(fresh), done: fresh.status === "sent" });
    }

    const results = await Promise.all(
      indexes.map(async (idx) => {
        const r = campaign.recipients[idx];
        try {
          const out = await sendBroadcastEmail({
            to: r.email,
            subject: campaign.subject,
            bodyText: campaign.body,
            firstName: firstNameOf(r.name),
            ctaLabel: campaign.ctaLabel,
            ctaUrl: campaign.ctaUrl,
            unsubscribeUrl: unsubscribeUrlFor(r.kind, r.uid),
          });
          return { idx, ok: out.sent, error: out.error || "" };
        } catch (err) {
          return { idx, ok: false, error: err.message };
        }
      })
    );

    const set = {};
    let sent = 0;
    let failed = 0;
    const now = new Date();
    for (const r of results) {
      set[`recipients.${r.idx}.status`] = r.ok ? "sent" : "failed";
      set[`recipients.${r.idx}.sentAt`] = r.ok ? now : null;
      set[`recipients.${r.idx}.error`] = r.ok ? "" : String(r.error || "Send failed").slice(0, 200);
      if (r.ok) sent += 1;
      else failed += 1;
    }

    const finished = newCursor >= campaign.recipients.length;
    if (finished) {
      set.status = "sent";
      set.completedAt = now;
    }

    const updated = await EmailCampaign.findByIdAndUpdate(
      campaign._id,
      { $set: set, $inc: { sentCount: sent, failedCount: failed } },
      { new: true }
    );

    res.json({ campaign: summarise(updated), done: finished });
  } catch (error) {
    console.error("Send campaign batch error:", error);
    res.status(500).json({ message: "Error sending campaign" });
  }
};

// POST /api/admin/campaigns/:id/retry
// Puts failed recipients back in the queue and rewinds the cursor, so the
// next batches pick them up (already-sent ones are skipped).
export const retryCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    let requeued = 0;
    campaign.recipients.forEach((r) => {
      if (r.status === "failed") {
        r.status = "pending";
        r.error = "";
        requeued += 1;
      }
    });
    if (requeued === 0 && campaign.status === "sent") {
      return res.json({ campaign: summarise(campaign), requeued: 0 });
    }

    campaign.failedCount = 0;
    campaign.cursor = 0;
    campaign.status = "sending";
    campaign.completedAt = null;
    await campaign.save();

    res.json({ campaign: summarise(campaign), requeued });
  } catch (error) {
    console.error("Retry campaign error:", error);
    res.status(500).json({ message: "Error retrying campaign" });
  }
};

// GET /api/admin/campaigns
export const listCampaigns = async (req, res) => {
  try {
    const campaigns = await EmailCampaign.find({}).select("-recipients").sort({ createdAt: -1 }).limit(50);
    res.json({ campaigns: campaigns.map(summarise) });
  } catch (error) {
    console.error("List campaigns error:", error);
    res.status(500).json({ message: "Error loading campaigns" });
  }
};

// GET /api/admin/campaigns/:id
export const getCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    res.json({
      campaign: summarise(campaign),
      failed: campaign.recipients
        .filter((r) => r.status === "failed")
        .slice(0, 50)
        .map((r) => ({ email: r.email, error: r.error })),
    });
  } catch (error) {
    console.error("Get campaign error:", error);
    res.status(500).json({ message: "Error loading campaign" });
  }
};