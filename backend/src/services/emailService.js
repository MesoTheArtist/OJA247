import nodemailer from "nodemailer";

// Zoho Mail SMTP — matches the mailbox already set up for support@oja247.store.
// ZOHO_SMTP_USER / ZOHO_SMTP_PASS go in your .env (the password is a Zoho
// "app password" generated under Zoho Mail account security settings, not
// the regular mailbox login password — Zoho requires this for SMTP access
// once 2FA is on, and it's the safer option either way since it can be
// revoked independently of the main password).
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASS) {
    console.warn(
      "Email not sent: ZOHO_SMTP_USER / ZOHO_SMTP_PASS are not set. See backend/.env.example."
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || "smtp.zoho.com",
    port: Number(process.env.ZOHO_SMTP_PORT) || 465,
    secure: true, // port 465 is implicit TLS
    auth: {
      user: process.env.ZOHO_SMTP_USER,
      pass: process.env.ZOHO_SMTP_PASS,
    },
  });

  return transporter;
}

const FROM_NAME = process.env.EMAIL_FROM_NAME || "OJA247 STORE";
// Hosted logo used in every email header — same image as the site favicon.
// Override with LOGO_URL in .env if you host a smaller/optimized version
// elsewhere (the favicon is ~1MB, which is fine but not ideal for email).
const LOGO_URL = process.env.LOGO_URL || "https://oja247.store/favicon.png";
const NAIRA = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

// Every send goes through here. Failures are logged, not thrown — a broken
// mail server should never take down a checkout or registration flow, so
// every call site is deliberately "fire and forget" (no await required by
// the caller, though awaiting is fine too).
async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t || !to) return { sent: false };

  try {
    await t.sendMail({
      from: `"${FROM_NAME}" <${process.env.ZOHO_SMTP_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, " "),
    });
    return { sent: true };
  } catch (error) {
    console.error(`Email send failed (to: ${to}, subject: "${subject}"):`, error.message);
    return { sent: false, error: error.message };
  }
}

// Every failure above is deliberately non-throwing (see the comment on
// sendEmail) so a broken mail server never takes down checkout or
// registration — but that also means a misconfigured or broken mailbox
// fails completely silently: no error the caller sees, nothing in the
// response, just an email that quietly never arrives. Password reset in
// particular has no other channel to fall back on if this goes wrong.
// Call this once at server startup (see server.js) so a broken mail
// setup shows up loudly in deploy logs immediately, not days later as
// a "the email never showed up" report with nothing to go on.
export async function verifyEmailTransporter() {
  const t = getTransporter();
  if (!t) {
    console.error(
      "EMAIL DISABLED: ZOHO_SMTP_USER / ZOHO_SMTP_PASS are not set — no emails (password resets included) will send."
    );
    return;
  }
  try {
    await t.verify();
    console.log("Email transporter verified OK (Zoho SMTP reachable, credentials accepted).");
  } catch (error) {
    console.error(
      "EMAIL TRANSPORTER VERIFICATION FAILED — emails will silently fail to send until this is fixed:",
      error.message
    );
  }
}

// Shared wrapper so every email looks like it's from the same platform,
// without repeating header/footer markup in every template below. Modeled
// on how most transactional email actually looks: light gray page
// background, a centered white "card", a real logo, and a proper footer
// with a tagline — not just a colored div with text in it.
function layout(bodyHtml, { preheader = "" } = {}) {
  return `
  <div style="background:#f3f4f6; padding:32px 16px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ""}
    <div style="max-width:560px; margin:0 auto;">
      <div style="text-align:center; padding-bottom:20px;">
        <img src="${LOGO_URL}" alt="OJA247" width="52" height="52" style="border-radius:12px; display:inline-block;" />
        <div style="font-weight:800; font-size:15px; letter-spacing:0.12em; color:#111827; margin-top:8px;">OJA247</div>
      </div>
      <div style="background:#ffffff; border-radius:14px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid #eef0f3;">
        ${bodyHtml}
      </div>
      <div style="text-align:center; padding-top:24px;">
        <p style="color:#9ca3af; font-size:12px; margin:0 0 4px;">
          OJA247 &middot; Nigeria's marketplace for local businesses
        </p>
        <p style="color:#c1c5cc; font-size:12px; margin:0;">
          Need help? Reply to this email or write to
          <a href="mailto:support@oja247.store" style="color:#16a34a; text-decoration:none;">support@oja247.store</a>
        </p>
      </div>
    </div>
  </div>`;
}

// Small shared building block for a plain "big button" call to action.
function button(label, url) {
  if (!url) return "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
      <tr><td style="border-radius:10px; background:#16a34a;">
        <a href="${url}" style="display:inline-block; padding:12px 24px; color:#ffffff; font-weight:600; font-size:14px; text-decoration:none; border-radius:10px;">${label}</a>
      </td></tr>
    </table>`;
}

const SITE_URL = process.env.SITE_URL || "https://oja247.store";
// Where admin-facing notifications (like withdrawal requests) go. Falls
// back to the same mailbox everything sends FROM, so this works with zero
// extra setup — override with ADMIN_NOTIFICATION_EMAIL if you want these
// routed to a different inbox than support@oja247.store.
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ZOHO_SMTP_USER;

export async function sendMarketerWithdrawalRequestEmail({ marketerName, marketerEmail, amount }) {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Withdrawal request: ${marketerName} — ₦${amount.toLocaleString()}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Marketer withdrawal request</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;"><strong>${marketerName}</strong> (${marketerEmail}) just requested a withdrawal of their pending balance.</p>
      <div style="background:#f0fdf4; border-radius:10px; padding:18px; text-align:center; margin:20px 0;">
        <p style="margin:0; font-size:28px; font-weight:800; color:#16a34a;">₦${amount.toLocaleString()}</p>
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Your Paystack account is still on the Preapproved tier, so this needs a manual bank transfer — please review and pay it in the admin panel's payout batches, then mark it paid.</p>
      ${button("Review payout batches", `${SITE_URL}/admin`)}
      `,
      { preheader: `${marketerName} requested a ₦${amount.toLocaleString()} withdrawal` }
    ),
  });
}

export async function sendBusinessPointsWithdrawalRequestEmail({ businessName, businessEmail, amount }) {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Points withdrawal request: ${businessName} — ₦${amount.toLocaleString()}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Business points withdrawal request</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;"><strong>${businessName}</strong> (${businessEmail}) just requested a cash withdrawal of their referral points balance.</p>
      <div style="background:#f0fdf4; border-radius:10px; padding:18px; text-align:center; margin:20px 0;">
        <p style="margin:0; font-size:28px; font-weight:800; color:#16a34a;">₦${amount.toLocaleString()}</p>
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">This is paid out to the vendor's existing verified payout account — review and mark it paid in the admin panel's transactions tab.</p>
      ${button("Review transactions", `${SITE_URL}/admin`)}
      `,
      { preheader: `${businessName} requested a ₦${amount.toLocaleString()} points withdrawal` }
    ),
  });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  return sendEmail({
    to,
    subject: "Reset your OJA247 password",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Reset your password</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${name || "there"}, we got a request to reset your OJA247 password. Click below to choose a new one — this link works for the next hour.</p>
      ${button("Reset my password", resetUrl)}
      <p style="color:#9ca3af; font-size:13px; line-height:1.6;">Didn't request this? You can safely ignore this email — your password won't change unless you click the link above.</p>
      `,
      { preheader: "Reset your OJA247 password — link expires in 1 hour" }
    ),
  });
}

export async function sendCustomerVerificationEmail({ to, name, verifyUrl }) {
  return sendEmail({
    to,
    subject: "Confirm your email for OJA247",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Confirm your email</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${name || "there"}, confirm this is your email address to finish setting up your OJA247 account. Once it's confirmed, orders you placed as a guest with this email show up in your order history. This link works for 48 hours.</p>
      ${button("Confirm my email", verifyUrl)}
      <p style="color:#9ca3af; font-size:13px; line-height:1.6;">Didn't create an OJA247 account? You can ignore this email.</p>
      `,
      { preheader: "Confirm your email to see your OJA247 orders" }
    ),
  });
}

// --- Vendor / business -----------------------------------------------------

export async function sendVendorWelcomeEmail({ to, businessName }) {
  return sendEmail({
    to,
    subject: `Welcome to OJA247, ${businessName}!`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Welcome to OJA247, ${businessName} 🎉</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Your store is live on OJA247 — Nigeria's marketplace built for local businesses to sell to the customers they already have.</p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6; margin-bottom:4px;">Here's what to do next:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin: 12px 0 4px;">
        <tr>
          <td style="padding:10px 0; border-bottom:1px solid #f1f2f4; font-size:14px; color:#374151;">✅&nbsp;&nbsp;Complete vendor verification for a verified badge on your storefront</td>
        </tr>
        <tr>
          <td style="padding:10px 0; border-bottom:1px solid #f1f2f4; font-size:14px; color:#374151;">📦&nbsp;&nbsp;Add your first products</td>
        </tr>
        <tr>
          <td style="padding:10px 0; font-size:14px; color:#374151;">💳&nbsp;&nbsp;Subscribe to a plan so your store shows up in customer search</td>
        </tr>
      </table>
      ${button("Go to my dashboard", `${SITE_URL}/dashboard`)}
      `,
      { preheader: `Your OJA247 store for ${businessName} is ready.` }
    ),
  });
}

export async function sendVerificationReviewedEmail({ to, businessName, businessCategory, decision, reviewNotes }) {
  const approved = decision === "approved";
  const badgeLabel = `Verified${businessCategory ? ` ${businessCategory}` : ""} Vendor`;
  return sendEmail({
    to,
    subject: approved ? "Your vendor verification was approved" : "Your vendor verification needs attention",
    html: layout(
      approved
        ? `
          <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">You're verified ✅</h1>
          <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, your vendor verification documents have been approved. Your <strong>${badgeLabel}</strong> badge is now active on your storefront.</p>
          ${button("View my dashboard", `${SITE_URL}/dashboard`)}
          `
        : `
          <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Action needed on your verification</h1>
          <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, we weren't able to approve your verification submission.</p>
          ${reviewNotes ? `<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px 14px; color:#991b1b; font-size:14px; margin:14px 0;">${reviewNotes}</div>` : ""}
          <p style="color:#4b5563; font-size:14px; line-height:1.6;">Please update your details and resubmit from your dashboard.</p>
          ${button("Update my details", `${SITE_URL}/dashboard`)}
          `
    ),
  });
}

export async function sendPayoutHoldEmail({ to, businessName, reason }) {
  return sendEmail({
    to,
    subject: "Your payouts are on hold — action needed",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your payouts are temporarily on hold</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, we've paused payouts to your account.</p>
      ${reason ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:12px 14px; color:#9a3412; font-size:14px; margin:14px 0;">${reason}</div>` : ""}
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">This is usually because a bank account change couldn't be automatically verified. An admin will review it shortly — you don't need to do anything else right now, but orders can't be split to your account until it's cleared.</p>
      ${button("View my dashboard", `${SITE_URL}/dashboard`)}
      `,
      { preheader: "Your account needs a quick review before payouts resume" }
    ),
  });
}

export async function sendBankDetailsUpdatedEmail({ to, businessName, bankName, accountNumberLast4 }) {
  return sendEmail({
    to,
    subject: "Your payout bank details were updated",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Payout bank account updated</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, this confirms your payout account on OJA247 was just changed to:</p>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px; color:#166534; font-size:14px; margin:14px 0;">
        ${bankName} &middot; account ending in ${accountNumberLast4}
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">The account name matched your business name, so this took effect immediately — no admin review needed and payouts continue as normal. If you didn't make this change, contact us right away.</p>
      ${button("View my dashboard", `${SITE_URL}/dashboard`)}
      `,
      { preheader: "Your payout bank account was just changed" }
    ),
  });
}

// --- Orders ------------------------------------------------------------

function orderItemsTable(items) {
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0; font-size:14px; color:#374151; border-bottom:1px solid #f1f2f4;">${i.name}</td>
        <td style="padding:10px 0; font-size:14px; color:#6b7280; text-align:center; border-bottom:1px solid #f1f2f4;">&times;${i.quantity}</td>
        <td style="padding:10px 0; font-size:14px; color:#111827; text-align:right; border-bottom:1px solid #f1f2f4; white-space:nowrap;">${NAIRA(i.price * i.quantity)}</td>
      </tr>`
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0;">
      <tr>
        <td style="padding-bottom:8px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #111827;">Item</td>
        <td style="padding-bottom:8px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #111827; text-align:center;">Qty</td>
        <td style="padding-bottom:8px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #111827; text-align:right;">Amount</td>
      </tr>
      ${rows}
    </table>`;
}

// Shared receipt-style summary rows (subtotal / fees / total) used by both
// the customer order confirmation and (in a lighter form) elsewhere.
function summaryRow(label, value, { bold = false } = {}) {
  const weight = bold ? "700" : "400";
  const color = bold ? "#111827" : "#6b7280";
  const size = bold ? "15px" : "13px";
  return `
    <tr>
      <td style="padding:4px 0; font-size:${size}; font-weight:${weight}; color:${color};">${label}</td>
      <td style="padding:4px 0; font-size:${size}; font-weight:${weight}; color:${color}; text-align:right;">${value}</td>
    </tr>`;
}

export async function sendOrderConfirmationEmail({
  to,
  customerName,
  reference,
  items,
  subtotal,
  deliveryFee,
  serviceFee,
  vat,
  total,
  deliveryMethod,
  address,
}) {
  const summaryHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-top:8px;">
      ${summaryRow("Subtotal", NAIRA(subtotal))}
      ${deliveryFee > 0 ? summaryRow("Delivery fee", NAIRA(deliveryFee)) : ""}
      ${serviceFee > 0 ? summaryRow("Service fee", NAIRA(serviceFee)) : ""}
      ${vat > 0 ? summaryRow("VAT", NAIRA(vat)) : ""}
      <tr><td colspan="2" style="border-top:1px solid #e5e7eb; padding-top:8px;"></td></tr>
      ${summaryRow("Total paid", NAIRA(total), { bold: true })}
    </table>`;

  return sendEmail({
    to,
    subject: `Your OJA247 order is confirmed — ${reference}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Thanks for your order${customerName ? `, ${customerName}` : ""}! 🛍️</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Your payment was successful and your order is being prepared for ${deliveryMethod === "pickup" ? "pickup" : "delivery"}.</p>

      <div style="background:#f9fafb; border-radius:10px; padding:16px 18px; margin:20px 0;">
        <p style="margin:0 0 2px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Order reference</p>
        <p style="margin:0; font-size:15px; font-weight:700; color:#111827; font-family:monospace;">${reference}</p>
      </div>

      ${orderItemsTable(items)}
      ${summaryHtml}

      ${
        address
          ? `<div style="margin-top:22px; padding-top:18px; border-top:1px solid #f1f2f4;">
              <p style="margin:0 0 4px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Delivering to</p>
              <p style="margin:0; font-size:14px; color:#374151; line-height:1.5;">${address}</p>
            </div>`
          : ""
      }
      `,
      { preheader: `Order ${reference} confirmed — total ${NAIRA(total)}` }
    ),
  });
}

export async function sendVendorNewOrderEmail({
  to,
  businessName,
  customerName,
  customerPhone,
  reference,
  items,
  subtotal,
  deliveryFee,
  deliveryMethod,
  address,
  note,
}) {
  return sendEmail({
    to,
    subject: `New order received — ${reference}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">You've got a new order! 📦</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, ${customerName || "a customer"} just placed an order on OJA247.</p>

      <div style="background:#f9fafb; border-radius:10px; padding:16px 18px; margin:20px 0;">
        <p style="margin:0 0 2px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Order reference</p>
        <p style="margin:0; font-size:15px; font-weight:700; color:#111827; font-family:monospace;">${reference}</p>
      </div>

      ${orderItemsTable(items)}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-top:8px;">
        ${summaryRow("Your share", NAIRA(subtotal), { bold: true })}
        ${deliveryFee > 0 ? summaryRow("Delivery fee (yours to fulfil)", NAIRA(deliveryFee)) : ""}
      </table>

      <div style="margin-top:22px; padding-top:18px; border-top:1px solid #f1f2f4;">
        <p style="margin:0 0 8px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Customer &amp; delivery details</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
          <tr><td style="padding:4px 0; color:#9ca3af; width:110px;">Name</td><td style="padding:4px 0;">${customerName || "—"}</td></tr>
          ${customerPhone ? `<tr><td style="padding:4px 0; color:#9ca3af;">Phone</td><td style="padding:4px 0;">${customerPhone}</td></tr>` : ""}
          <tr><td style="padding:4px 0; color:#9ca3af;">Method</td><td style="padding:4px 0; text-transform:capitalize;">${deliveryMethod || "delivery"}</td></tr>
          ${address ? `<tr><td style="padding:4px 0; color:#9ca3af; vertical-align:top;">Address</td><td style="padding:4px 0;">${address}</td></tr>` : ""}
          ${note ? `<tr><td style="padding:4px 0; color:#9ca3af; vertical-align:top;">Note</td><td style="padding:4px 0;">${note}</td></tr>` : ""}
        </table>
      </div>

      ${button("View order in dashboard", `${SITE_URL}/dashboard`)}
      `,
      { preheader: `New order ${reference} from ${customerName || "a customer"} — ${NAIRA(subtotal)}` }
    ),
  });
}

export async function sendOrderPaymentFailedEmail({ to, customerName, reference }) {
  return sendEmail({
    to,
    subject: "Your payment didn't go through",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your payment didn't go through</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${customerName || "there"}, we weren't able to confirm your payment for this order, so it hasn't been placed and nothing was charged.</p>
      <div style="background:#f9fafb; border-radius:10px; padding:16px 18px; margin:20px 0;">
        <p style="margin:0 0 2px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Order reference</p>
        <p style="margin:0; font-size:15px; font-weight:700; color:#111827; font-family:monospace;">${reference}</p>
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">This can happen from a declined card, an expired session, or a network hiccup mid-payment. You can just try checking out again — your cart items weren't lost.</p>
      ${button("Try again", `${SITE_URL}`)}
      `,
      { preheader: "Your order wasn't placed — no charge was made" }
    ),
  });
}

// --- Subscription --------------------------------------------------------

const PLAN_LABELS = {
  monthly: "Monthly Plan",
  six_month: "6-Month Plan",
  yearly: "Yearly Plan",
};

export async function sendSubscriptionReceiptEmail({
  to,
  businessName,
  planType,
  amountPaid,
  pointsApplied,
  planPrice,
  paidAt,
  reference,
  expiresAt,
}) {
  const planLabel = PLAN_LABELS[planType] || planType;
  const paidWithPoints = pointsApplied > 0;

  return sendEmail({
    to,
    subject: "Your OJA247 subscription receipt",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Payment received ✅</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, here's your receipt.</p>

      <div style="border:1px solid #eef0f3; border-radius:12px; padding:20px 22px; margin:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:14px;">
          <tr>
            <td style="font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Receipt for</td>
            <td style="font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; text-align:right;">Date</td>
          </tr>
          <tr>
            <td style="font-size:14px; font-weight:600; color:#111827;">${businessName}</td>
            <td style="font-size:14px; color:#111827; text-align:right;">${formatDate(paidAt || new Date())}</td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          ${summaryRow(planLabel, NAIRA(planPrice != null ? planPrice : amountPaid + (pointsApplied || 0)))}
          ${paidWithPoints ? summaryRow("Paid with points", `-${NAIRA(pointsApplied)}`) : ""}
          <tr><td colspan="2" style="border-top:1px solid #e5e7eb; padding-top:8px;"></td></tr>
          ${summaryRow("Amount charged", NAIRA(amountPaid), { bold: true })}
        </table>

        ${reference ? `<p style="margin:14px 0 0; font-size:12px; color:#9ca3af; font-family:monospace;">Ref: ${reference}</p>` : ""}
      </div>

      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Your store will remain visible to customers until <strong>${formatDate(expiresAt)}</strong>.</p>
      ${button("Manage my subscription", `${SITE_URL}/dashboard`)}
      `,
      { preheader: `Receipt for your ${planLabel} — ${NAIRA(amountPaid)}` }
    ),
  });
}

export async function sendBusinessReferralConversionEmail({ to, businessName, referredBusinessName, points, newBalance }) {
  return sendEmail({
    to,
    subject: "You just earned referral points!",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Nice work, ${businessName} 🎉</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;"><strong>${referredBusinessName}</strong> just subscribed using your referral link.</p>
      <div style="background:#f0fdf4; border-radius:10px; padding:18px; text-align:center; margin:20px 0;">
        <p style="margin:0; font-size:28px; font-weight:800; color:#16a34a;">+${points} points</p>
        <p style="margin:6px 0 0; font-size:13px; color:#166534;">New balance: ${newBalance} points</p>
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">You can use your points toward your next subscription payment at checkout.</p>
      ${button("View my dashboard", `${SITE_URL}/dashboard`)}
      `,
      { preheader: `You earned ${points} points from ${referredBusinessName}` }
    ),
  });
}

export async function sendSubscriptionExpiringEmail({ to, businessName, daysLeft, expiresAt }) {
  return sendEmail({
    to,
    subject: `Your subscription expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your subscription is expiring soon ⏳</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, your subscription expires on <strong>${formatDate(expiresAt)}</strong> — that's ${daysLeft} day${daysLeft === 1 ? "" : "s"} away.</p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Renew before then so your store stays visible to customers without any interruption.</p>
      ${button("Renew my subscription", `${SITE_URL}/dashboard`)}
      `,
      { preheader: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on your subscription` }
    ),
  });
}

export async function sendSubscriptionExpiredEmail({ to, businessName }) {
  return sendEmail({
    to,
    subject: "Your subscription has expired",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your subscription has expired</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, your subscription period has ended, so your store is currently hidden from customer search.</p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Renew now to bring it back — your store goes live again immediately after payment.</p>
      ${button("Renew now", `${SITE_URL}/dashboard`)}
      `,
      { preheader: "Your store is hidden from search until you renew" }
    ),
  });
}

export async function sendNeverSubscribedReminderEmail({ to, businessName }) {
  return sendEmail({
    to,
    subject: "Your store isn't showing up in customer search",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your store isn't visible to customers yet</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, your store on OJA247 is set up but it won't show up in customer search or the Explore page until you subscribe.</p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Subscribe any time — your store goes live right after payment.</p>
      ${button("Subscribe now", `${SITE_URL}/dashboard`)}
      `,
      { preheader: "Subscribe to put your store in front of customers" }
    ),
  });
}

// --- Marketer --------------------------------------------------------------

export async function sendMarketerWelcomeEmail({ to, name, referralCode }) {
  return sendEmail({
    to,
    subject: "Welcome to the OJA247 Marketer Program",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Welcome, ${name} 🚀</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Your marketer account is ready. Share your referral code with businesses — you'll earn a payout whenever one of them subscribes.</p>

      <div style="background:#f0fdf4; border:1px dashed #16a34a; border-radius:10px; padding:18px; text-align:center; margin:20px 0;">
        <p style="margin:0 0 4px; font-size:11px; color:#166534; text-transform:uppercase; letter-spacing:0.1em;">Your referral code</p>
        <p style="margin:0; font-size:24px; font-weight:800; letter-spacing:0.1em; color:#16a34a; font-family:monospace;">${referralCode}</p>
      </div>

      ${button("Go to my marketer dashboard", `${SITE_URL}/marketer-dashboard`)}
      `,
      { preheader: `Your referral code is ${referralCode}` }
    ),
  });
}

export async function sendMarketerConversionEmail({ to, name, businessName, payoutAmount }) {
  return sendEmail({
    to,
    subject: "You just earned a referral payout!",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Nice work, ${name} 💰</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;"><strong>${businessName}</strong> just subscribed using your referral link.</p>
      <div style="background:#f0fdf4; border-radius:10px; padding:18px; text-align:center; margin:20px 0;">
        <p style="margin:0; font-size:28px; font-weight:800; color:#16a34a;">+${NAIRA(payoutAmount)}</p>
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">This has been added to your pending payout balance and will go out in the next weekly batch.</p>
      ${button("View my earnings", `${SITE_URL}/marketer-dashboard`)}
      `,
      { preheader: `You earned ${NAIRA(payoutAmount)} from ${businessName}` }
    ),
  });
}

export async function sendMarketerPayoutPaidEmail({ to, name, amount }) {
  return sendEmail({
    to,
    subject: "Your marketer payout has been sent",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Payout sent 💸</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${name}, <strong>${NAIRA(amount)}</strong> has been paid out to your registered bank account.</p>
      ${button("View payout history", `${SITE_URL}/marketer-dashboard`)}
      `,
      { preheader: `${NAIRA(amount)} has been sent to your bank account` }
    ),
  });
}

export async function sendMarketerReferralCodeChangedEmail({ to, name, oldCode, newCode }) {
  return sendEmail({
    to,
    subject: "Your OJA247 referral code has changed",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your referral code changed</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${name}, this confirms your OJA247 marketer referral code was just updated. If you didn't make this change, contact support right away — anyone with access to your account can redirect who gets credit for new referrals.</p>

      <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin:20px 0;">
        <p style="margin:0 0 6px; font-size:12px; color:#9ca3af;">Old code</p>
        <p style="margin:0 0 14px; font-size:16px; font-weight:700; color:#9ca3af; text-decoration:line-through; font-family:monospace;">${oldCode}</p>
        <p style="margin:0 0 6px; font-size:12px; color:#166534;">New code</p>
        <p style="margin:0; font-size:22px; font-weight:800; letter-spacing:0.08em; color:#16a34a; font-family:monospace;">${newCode}</p>
      </div>

      <p style="color:#6b7280; font-size:13px; line-height:1.6;">Links or codes shared before this change will no longer credit you — update anything you've already shared.</p>

      ${button("Go to my marketer dashboard", `${SITE_URL}/marketer-dashboard`)}
      `,
      { preheader: `Your referral code is now ${newCode}` }
    ),
  });
}

export async function sendBusinessReferralCodeChangedEmail({ to, businessName, oldCode, newCode }) {
  return sendEmail({
    to,
    subject: "Your OJA247 referral code has changed",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your referral code changed</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, this confirms your OJA247 referral code was just updated. If you didn't make this change, contact support right away.</p>

      <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin:20px 0;">
        <p style="margin:0 0 6px; font-size:12px; color:#9ca3af;">Old code</p>
        <p style="margin:0 0 14px; font-size:16px; font-weight:700; color:#9ca3af; text-decoration:line-through; font-family:monospace;">${oldCode}</p>
        <p style="margin:0 0 6px; font-size:12px; color:#166534;">New code</p>
        <p style="margin:0; font-size:22px; font-weight:800; letter-spacing:0.08em; color:#16a34a; font-family:monospace;">${newCode}</p>
      </div>

      <p style="color:#6b7280; font-size:13px; line-height:1.6;">Links or codes shared before this change will no longer credit you — update anything you've already shared.</p>

      ${button("Go to my dashboard", `${SITE_URL}/business-dashboard`)}
      `,
      { preheader: `Your referral code is now ${newCode}` }
    ),
  });
}

export async function sendMarketerPayoutDetailsChangedEmail({ to, name, bankName, accountNumber, accountName }) {
  const maskedAccount = accountNumber ? `••••${String(accountNumber).slice(-4)}` : "unknown";
  return sendEmail({
    to,
    subject: "Your OJA247 payout account was changed",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Payout account updated</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${name}, this confirms your OJA247 marketer payout details were just changed. If this wasn't you, contact support immediately — future payouts will be sent to this account.</p>

      <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin:20px 0;">
        <p style="margin:0 0 4px; font-size:13px; color:#111827;"><strong>${bankName}</strong></p>
        <p style="margin:0 0 4px; font-size:13px; color:#4b5563;">${accountName}</p>
        <p style="margin:0; font-size:13px; color:#6b7280; font-family:monospace;">${maskedAccount}</p>
      </div>

      ${button("Go to my marketer dashboard", `${SITE_URL}/marketer-dashboard`)}
      `,
      { preheader: "Your payout account details were changed" }
    ),
  });
}

// Shared by both the User (business owner/buyer account) and Marketer ban
// flows — same message shape either way, just a different dashboard link.
export async function sendAccountBanStatusEmail({ to, name, banned, dashboardUrl }) {
  return sendEmail({
    to,
    subject: banned ? "Your OJA247 account has been suspended" : "Your OJA247 account has been reinstated",
    html: layout(
      banned
        ? `
        <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Account suspended</h1>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${name}, your OJA247 account has been suspended by an administrator. You won't be able to log in while this is in effect.</p>
        <p style="color:#6b7280; font-size:13px; line-height:1.6;">If you believe this is a mistake, reply to this email or contact support to ask about the reason and next steps.</p>
        `
        : `
        <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Account reinstated</h1>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${name}, your OJA247 account has been reinstated — you can log in and use OJA247 normally again.</p>
        ${button("Go to my dashboard", dashboardUrl || SITE_URL)}
        `,
      { preheader: banned ? "Your account has been suspended" : "Your account has been reinstated" }
    ),
  });
}

const DISPUTE_REASON_LABELS = {
  item_not_received: "Item not received",
  wrong_item: "Wrong item received",
  damaged: "Item arrived damaged",
  not_as_described: "Not as described",
  other: "Other",
};

export async function sendDisputeFiledVendorEmail({
  to,
  businessName,
  orderReference,
  reason,
  description,
  selfResolveDeadline,
}) {
  return sendEmail({
    to,
    subject: `A customer has raised a dispute — order ${orderReference}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">A customer has a problem with an order</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, a customer has raised a dispute on order <strong>${orderReference}</strong>.</p>
      <div style="background:#fff7ed; border-radius:10px; padding:16px 18px; margin:20px 0;">
        <p style="margin:0 0 6px; font-size:13px; color:#9a3412; font-weight:700;">${DISPUTE_REASON_LABELS[reason] || reason}</p>
        <p style="margin:0; font-size:14px; color:#4b5563; line-height:1.6;">${description}</p>
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Please reach out to the customer directly to sort this out. You have until <strong>${formatDate(selfResolveDeadline)}</strong> to resolve it — after that it moves to platform review.</p>
      ${button("View in dashboard", `${SITE_URL}/business-dashboard`)}
      `,
      { preheader: `Dispute on order ${orderReference}: ${DISPUTE_REASON_LABELS[reason] || reason}` }
    ),
  });
}

export async function sendDisputeFiledCustomerEmail({ to, customerName, businessName, orderReference }) {
  return sendEmail({
    to,
    subject: `We've received your report on order ${orderReference}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">We've let ${businessName} know</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${customerName}, thanks for letting us know about an issue with order <strong>${orderReference}</strong>. We've notified ${businessName} and asked them to reach out to you directly to sort it out.</p>
      <p style="color:#6b7280; font-size:13px; line-height:1.6;">If you don't hear back within a week, this will automatically move to OJA247 for review.</p>
      `,
      { preheader: `We've notified ${businessName} about your order` }
    ),
  });
}

export async function sendDisputeResolvedCustomerEmail({
  to,
  customerName,
  businessName,
  orderReference,
  refunded,
}) {
  return sendEmail({
    to,
    subject: `${businessName} has resolved your report on order ${orderReference}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your dispute has been marked resolved</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${customerName}, ${businessName} has marked the issue with order <strong>${orderReference}</strong> as resolved${refunded ? ", and noted that you've been refunded" : ""}.</p>
      <p style="color:#6b7280; font-size:13px; line-height:1.6;">If that doesn't match what actually happened, reply to this email and we'll take another look.</p>
      `,
      { preheader: `${businessName} marked order ${orderReference} resolved` }
    ),
  });
}

export async function sendDisputeEscalatedVendorEmail({ to, businessName, orderReference, reason }) {
  return sendEmail({
    to,
    subject: `Dispute on order ${orderReference} has moved to platform review`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">This dispute is now under platform review</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, the dispute on order <strong>${orderReference}</strong> (${DISPUTE_REASON_LABELS[reason] || reason}) wasn't marked resolved within the response window, so OJA247 is stepping in to review it.</p>
      <p style="color:#6b7280; font-size:13px; line-height:1.6;">You can still resolve this directly with the customer — let us know if you do.</p>
      `,
      { preheader: `Dispute on order ${orderReference} escalated to platform review` }
    ),
  });
}

export async function sendDisputeEscalatedCustomerEmail({ to, customerName, businessName, orderReference }) {
  return sendEmail({
    to,
    subject: `Your report on order ${orderReference} is now with OJA247`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">We're taking a closer look</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${customerName}, ${businessName} didn't resolve your report on order <strong>${orderReference}</strong> within the response window, so OJA247 is now reviewing it directly.</p>
      `,
      { preheader: `OJA247 is reviewing your report on order ${orderReference}` }
    ),
  });
}

export async function sendDisputeEscalatedAdminEmail({ businessName, orderReference, reason, disputeId }) {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Dispute auto-escalated — ${businessName}, order ${orderReference}`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">A dispute needs review</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;"><strong>${businessName}</strong> didn't resolve a dispute on order <strong>${orderReference}</strong> (${DISPUTE_REASON_LABELS[reason] || reason}) within the self-resolve window, so it's moved to platform review.</p>
      ${button("Review in admin panel", `${SITE_URL}/admin`)}
      `,
      { preheader: `Dispute on order ${orderReference} needs admin review` }
    ),
  });
}

export async function sendVerificationReminderEmail({ to, businessName, verificationTier, dashboardUrl }) {
  return sendEmail({
    to,
    subject:
      verificationTier === "basic"
        ? "You're on Basic — finish verification for the Verified badge"
        : "Finish setting up your vendor verification",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">A quick reminder</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, your storefront is live${
        verificationTier === "basic" ? " on the Basic tier" : ""
      } — no action needed to keep selling. But finishing verification${
        verificationTier === "basic" ? " (CAC document, address proof, and a selfie)" : ""
      } unlocks the Verified badge on your storefront.</p>
      ${button("Finish verification", dashboardUrl)}
      <p style="color:#9ca3af; font-size:12px; line-height:1.6; margin-top:20px;">This is just a nudge — your store stays fully visible either way.</p>
      `,
      { preheader: `Finish verification to unlock the Verified badge` }
    ),
  });
}

export async function sendNewProductFollowerEmail({
  to,
  customerName,
  businessName,
  productName,
  productImage,
  storefrontUrl,
}) {  
  return sendEmail({
    to,
    subject: `${businessName} just added something new`,
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">New from a store you follow</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${customerName}, <strong>${businessName}</strong> just listed a new product:</p>
      ${
        productImage
          ? `<img src="${productImage}" alt="${productName}" style="width:100%; max-width:280px; border-radius:12px; margin:16px 0; display:block;" />`
          : ""
      }
      <p style="font-size:16px; font-weight:700; color:#111827; margin:0 0 16px;">${productName}</p>
      ${button("View in store", storefrontUrl)}
      `,
      { preheader: `${businessName} just listed ${productName}` }
    ),
  });
}

export default {
  sendEmail,
  sendPasswordResetEmail,
  sendCustomerVerificationEmail,
  sendMarketerWithdrawalRequestEmail,
  sendBusinessPointsWithdrawalRequestEmail,
  sendVendorWelcomeEmail,
  sendVerificationReviewedEmail,
  sendPayoutHoldEmail,
  sendOrderConfirmationEmail,
  sendOrderPaymentFailedEmail,
  sendVendorNewOrderEmail,
  sendSubscriptionReceiptEmail,
  sendSubscriptionExpiringEmail,
  sendSubscriptionExpiredEmail,
  sendNeverSubscribedReminderEmail,
  sendMarketerWelcomeEmail,
  sendMarketerConversionEmail,
  sendMarketerPayoutPaidEmail,
  sendBusinessReferralConversionEmail,
  sendDisputeFiledVendorEmail,
  sendDisputeFiledCustomerEmail,
  sendDisputeResolvedCustomerEmail,
  sendDisputeEscalatedVendorEmail,
  sendDisputeEscalatedCustomerEmail,
  sendDisputeEscalatedAdminEmail,
  sendVerificationReminderEmail,
  sendNewProductFollowerEmail,
  verifyEmailTransporter,
};