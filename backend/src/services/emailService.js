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
async function sendEmail({ to, subject, html, text, headers }) {
  const t = getTransporter();
  if (!t || !to) return { sent: false };

  try {
    await t.sendMail({
      from: `"${FROM_NAME}" <${process.env.ZOHO_SMTP_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, " "),
      ...(headers ? { headers } : {}),
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
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Marketer payouts are paid by hand for now — please review and pay it in the admin panel's payout batches, then mark it paid.</p>
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
    subject: "Your store is paused — action needed",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Your store is temporarily paused</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, we've paused new orders to your store.</p>
      ${reason ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:12px 14px; color:#9a3412; font-size:14px; margin:14px 0;">${reason}</div>` : ""}
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">This is usually because a bank account change couldn't be automatically verified. An admin will review it shortly — you don't need to do anything else right now, but customers can't place new orders at your store until it's cleared.</p>
      ${button("View my dashboard", `${SITE_URL}/dashboard`)}
      `,
      { preheader: "Your store needs a quick review before it can take orders again" }
    ),
  });
}

export async function sendBankDetailsUpdatedEmail({ to, businessName, bankName, accountNumberLast4 }) {
  return sendEmail({
    to,
    subject: "Your bank details were updated",
    html: layout(
      `
      <h1 style="margin:0 0 4px; font-size:20px; color:#111827;">Bank account updated</h1>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">Hi ${businessName}, this confirms the bank account customers pay on OJA247 was just changed to:</p>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px; color:#166534; font-size:14px; margin:14px 0;">
        ${bankName} &middot; account ending in ${accountNumberLast4}
      </div>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">The account name matched your business name, so this took effect immediately — no admin review needed. Customers placing new orders will now be asked to pay this account. If you didn't make this change, change your password and contact us right away, because someone else may have access to your account.</p>
      ${button("View my dashboard", `${SITE_URL}/dashboard`)}
      `,
      { preheader: "The bank account customers pay was just changed" }
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

// To the admin right after a vendor is banned, listing every bank-transfer
// order still waiting on them. Those customers paid the vendor's own account,
// so OJA247 cannot refund them; this list is what to follow up on.
export async function sendAdminBannedVendorOpenOrdersEmail({ businessName, vendorEmail, orders }) {
  const rows = orders
    .map(
      (o) => `<tr>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-size:13px;">${esc(o.reference)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-size:13px;">${NAIRA(o.total)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-size:13px;">${esc(o.customer?.fullName || "—")}<br><span style="color:#6b7280;">${esc(o.customer?.email || "")}</span></td>
        <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-size:13px;">${o.daysWaiting}d</td>
      </tr>`
    )
    .join("");
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Vendor banned with ${orders.length} unconfirmed order${orders.length === 1 ? "" : "s"}: ${businessName}`,
    html: layout(
      `
      ${h1("A banned vendor has orders waiting")}
      ${p(`<strong>${esc(businessName)}</strong> (${esc(vendorEmail || "no email on file")}) was just banned. ${orders.length} bank-transfer order${orders.length === 1 ? " is" : "s are"} still waiting for them to confirm payment. They can no longer log in, so they cannot answer.`)}
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <tr style="text-align:left; font-size:12px; color:#6b7280;"><th style="padding:6px 8px;">Order</th><th style="padding:6px 8px;">Amount</th><th style="padding:6px 8px;">Customer</th><th style="padding:6px 8px;">Waiting</th></tr>
        ${rows}
      </table>
      ${p("These customers paid the vendor's own bank account, so OJA247 cannot refund them. They can file a dispute straight away from their order page, and the useful next step is to contact the vendor about these orders.")}
      ${button("Open the admin dashboard", `${SITE_URL}/admin`)}
      `,
      { preheader: `${businessName} was banned with ${orders.length} orders still unconfirmed.` }
    ),
  });
}

const DISPUTE_REASON_LABELS = {
  item_not_received: "Item not received",
  wrong_item: "Wrong item received",
  damaged: "Item arrived damaged",
  not_as_described: "Not as described",
  payment_not_confirmed: "Payment not confirmed by the vendor",
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

// --- Added: account actions, order delivery, reviews, broadcasts -----------

// User-supplied text (business names, review comments, admin broadcast copy)
// goes through this before being dropped into HTML.
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const h1 = (text) => `<h1 style="margin:0 0 4px; font-size:20px; color:#111827;">${text}</h1>`;
const p = (text) => `<p style="color:#4b5563; font-size:14px; line-height:1.6;">${text}</p>`;
const small = (text) => `<p style="color:#6b7280; font-size:13px; line-height:1.6;">${text}</p>`;

// Admin deleted an account (customer, business owner or marketer).
export async function sendAccountDeletedEmail({ to, name, accountType }) {
  const detail =
    accountType === "business"
      ? "Your store and its products have been removed from OJA247."
      : accountType === "marketer"
      ? "Your marketer account and its payout records have been removed."
      : "Your customer account has been removed. Orders you've already placed stay on record with the stores you bought from.";
  return sendEmail({
    to,
    subject: "Your OJA247 account has been deleted",
    html: layout(
      `${h1("Your account has been deleted")}
       ${p(`Hi ${esc(name) || "there"}, an OJA247 administrator has deleted your account. ${detail}`)}
       ${small("If you think this was a mistake, reply to this email or write to support and we'll look into it.")}`,
      { preheader: "Your OJA247 account has been deleted" }
    ),
  });
}

// Admin edited a customer's profile details.
export async function sendCustomerDetailsUpdatedEmail({ to, name, changes }) {
  const list = (changes || []).map((c) => esc(c)).join(" and ");
  return sendEmail({
    to,
    subject: "Your OJA247 account details were updated",
    html: layout(
      `${h1("Account details updated")}
       ${p(`Hi ${esc(name) || "there"}, an OJA247 administrator updated your ${list}.`)}
       ${small("If you didn't expect this change, reply to this email and we'll check it with you.")}
       ${button("View my account", `${SITE_URL}/orders`)}`,
      { preheader: "An admin updated your account details" }
    ),
  });
}

// A business's points-to-cash withdrawal was marked paid by an admin.
// Vendor: an admin declined a points withdrawal; the points are back in their balance.
export async function sendPointsWithdrawalRejectedEmail({ to, businessName, amount, reason, newBalance }) {
  return sendEmail({
    to,
    subject: `Your ${NAIRA(amount)} points withdrawal wasn't approved`,
    html: layout(
      `${h1("Your withdrawal wasn't approved")}
       ${p(`Hi ${esc(businessName)}, we couldn't process your request to withdraw <strong>${NAIRA(amount)}</strong> from your referral points.`)}
       ${reason ? `<div style="background:#f9fafb; border-left:4px solid #9ca3af; border-radius:6px; padding:12px 16px; margin:16px 0; color:#374151; font-size:14px; line-height:1.6;"><strong>Reason:</strong> ${esc(reason)}</div>` : ""}
       ${p(`Nothing has been lost: the <strong>${esc(String(amount))} points</strong> are back in your balance, which is now <strong>${esc(Number(newBalance).toLocaleString())} points</strong>.`)}
       ${small("Fix the issue mentioned above (for example your payout account details) and you can request the withdrawal again, or use your points toward your subscription.")}
       ${button("Open my dashboard", `${SITE_URL}/dashboard`)}`,
      { preheader: `Your ${NAIRA(amount)} in points is back in your balance` }
    ),
  });
}

export async function sendPointsWithdrawalPaidEmail({ to, businessName, amount, transferReference }) {
  return sendEmail({
    to,
    subject: `Your ${NAIRA(amount)} points withdrawal has been paid`,
    html: layout(
      `${h1("Your withdrawal has been paid 💸")}
       ${p(`Hi ${esc(businessName)}, we've sent <strong>${NAIRA(amount)}</strong> from your referral points to your payout account.`)}
       ${transferReference ? small(`Transfer reference: <strong>${esc(transferReference)}</strong>`) : ""}
       ${small("Transfers can take a little while to show in your bank app. If it hasn't arrived after one working day, reply to this email.")}
       ${button("Open my dashboard", `${SITE_URL}/dashboard`)}`,
      { preheader: `${NAIRA(amount)} is on its way to your account` }
    ),
  });
}

// Sent after a password reset completes. If the owner didn't do it, this is
// the only warning they'd ever get.
export async function sendPasswordChangedEmail({ to, name }) {
  return sendEmail({
    to,
    subject: "Your OJA247 password was changed",
    html: layout(
      `${h1("Your password was changed")}
       ${p(`Hi ${esc(name) || "there"}, the password on your OJA247 account was just changed.`)}
       ${p("If that was you, there's nothing more to do.")}
       ${small("If it wasn't you, reset your password straight away and write to support@oja247.store so we can secure your account.")}`,
      { preheader: "Your OJA247 password was changed" }
    ),
  });
}

// Vendor: a customer left a review.
export async function sendNewReviewVendorEmail({ to, businessName, customerName, rating, comment }) {
  const stars = "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
  return sendEmail({
    to,
    subject: `New ${rating}-star review for ${businessName}`,
    html: layout(
      `${h1("You have a new review ⭐")}
       ${p(`Hi ${esc(businessName)}, ${esc(customerName) || "a customer"} left you a review.`)}
       <p style="font-size:20px; color:#f59e0b; margin:8px 0;">${stars}</p>
       ${comment ? `<blockquote style="margin:12px 0; padding:10px 14px; border-left:3px solid #d1fae5; color:#374151; font-size:14px; line-height:1.6;">${esc(comment)}</blockquote>` : ""}
       ${small("You can post a public reply from the Reviews tab of your dashboard.")}
       ${button("Reply to this review", `${SITE_URL}/dashboard`)}`,
      { preheader: `${rating} stars from ${customerName || "a customer"}` }
    ),
  });
}

// Customer: the vendor replied to their review.
export async function sendReviewReplyCustomerEmail({ to, customerName, businessName, note }) {
  return sendEmail({
    to,
    subject: `${businessName} replied to your review`,
    html: layout(
      `${h1("The store replied to your review")}
       ${p(`Hi ${esc(customerName) || "there"}, <strong>${esc(businessName)}</strong> responded to the review you left:`)}
       <blockquote style="margin:12px 0; padding:10px 14px; border-left:3px solid #d1fae5; color:#374151; font-size:14px; line-height:1.6;">${esc(note)}</blockquote>`,
      { preheader: `${businessName} replied to your review` }
    ),
  });
}

// Vendor: an admin featured their store.
export async function sendFeaturedEmail({ to, businessName }) {
  return sendEmail({
    to,
    subject: `${businessName} is now a featured store on OJA247`,
    html: layout(
      `${h1("Your store is now featured 🎉")}
       ${p(`Hi ${esc(businessName)}, our team has picked your store as a featured business, so it gets extra visibility to shoppers on OJA247.`)}
       ${small("Keep your products and photos up to date to make the most of it.")}
       ${button("Open my dashboard", `${SITE_URL}/dashboard`)}`,
      { preheader: "Your store is now featured on OJA247" }
    ),
  });
}

// Vendor: an admin gave this store a time-limited exemption, so it stays visible
// to shoppers until `exemptUntil` without needing an active subscription.
// `extended` is true when the store already had an active exemption and the
// date was pushed back.
export async function sendExemptionGrantedEmail({ to, businessName, exemptUntil, extended = false }) {
  const until = formatDate(exemptUntil);
  const daysLeft = Math.max(1, Math.ceil((new Date(exemptUntil).getTime() - Date.now()) / 86400000));
  const duration = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  return sendEmail({
    to,
    subject: extended
      ? `Good news: your OJA247 visibility is extended to ${until}`
      : `Congratulations! ${businessName} stays visible on OJA247 until ${until}`,
    html: layout(
      `${h1(extended ? "Your free visibility has been extended 🎉" : "Congratulations, you've got free visibility 🎉")}
       ${p(`Hi ${esc(businessName)}, great news from the OJA247 team. ${
         extended
           ? "We've extended the time your store stays visible to shoppers"
           : "We've given your store a special exemption, so it stays visible to shoppers"
       } <strong>until ${esc(until)}</strong> (${esc(duration)} from today), with no subscription needed.`)}
       ${p("In that time customers can find your store and products in search and listings, and place orders as normal.")}
       ${small(`When ${esc(until)} passes, your store goes back to the normal rule: it stays listed while you have an active subscription. Subscribe before then and your store won't miss a day.`)}
       ${button("Open my dashboard", `${SITE_URL}/dashboard`)}`,
      { preheader: `Your store stays visible on OJA247 until ${until}.` }
    ),
  });
}

// Vendor: the free exemption is about to end and no subscription covers the
// time after it, so the store will drop out of search unless they subscribe.
export async function sendExemptionEndingEmail({ to, businessName, exemptUntil, daysLeft }) {
  const until = formatDate(exemptUntil);
  const days = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  return sendEmail({
    to,
    subject: `Your free visibility on OJA247 ends in ${days}`,
    html: layout(
      `${h1("Your free visibility is ending soon ⏳")}
       ${p(`Hi ${esc(businessName)}, the free period that keeps your store visible to shoppers ends on <strong>${esc(until)}</strong> — that's ${esc(days)} away.`)}
       ${p("After that date your store only stays in customer search and the Explore page while you have an active subscription.")}
       ${small("Subscribe before then and your store won't miss a single day of visibility.")}
       ${button("Subscribe now", `${SITE_URL}/dashboard`)}`,
      { preheader: `Subscribe before ${until} to keep your store visible.` }
    ),
  });
}

// Customer + vendor: an admin settled an escalated dispute. `audience`
// decides the wording.
export async function sendDisputeAdminDecisionEmail({
  to,
  name,
  businessName,
  orderReference,
  outcome,
  note,
  audience,
}) {
  const resolved = outcome === "resolved";
  const lead = resolved
    ? "marked the dispute as resolved"
    : "closed the dispute as unresolved after reviewing it";
  const who = audience === "vendor" ? `the dispute on order <strong>${esc(orderReference)}</strong>` : `your dispute with <strong>${esc(businessName)}</strong> on order <strong>${esc(orderReference)}</strong>`;
  return sendEmail({
    to,
    subject: `Update on the dispute for order ${orderReference}`,
    html: layout(
      `${h1("Our team has reviewed the dispute")}
       ${p(`Hi ${esc(name) || "there"}, after looking into it, OJA247 has ${lead} — ${who}.`)}
       ${note ? `<blockquote style="margin:12px 0; padding:10px 14px; border-left:3px solid #e5e7eb; color:#374151; font-size:14px; line-height:1.6;">${esc(note)}</blockquote>` : ""}
       ${small("If you have more information that changes the picture, reply to this email and we'll take another look.")}`,
      { preheader: `Decision on the dispute for order ${orderReference}` }
    ),
  });
}

// --- Order delivery (vendor ships -> customer confirms) --------------------

// Customer: a vendor marked their part of the order as sent out. The button
// opens a confirmation page rather than confirming on click, so mail
// scanners that pre-open links can't confirm receipt by accident.
export async function sendOrderShippedEmail({ to, customerName, businessName, orderReference, confirmUrl }) {
  return sendEmail({
    to,
    subject: `${businessName} has sent out your order ${orderReference}`,
    html: layout(
      `${h1("Your order is on its way 📦")}
       ${p(`Hi ${esc(customerName) || "there"}, <strong>${esc(businessName)}</strong> has sent out your items from order <strong>${esc(orderReference)}</strong>.`)}
       ${p("Once it reaches you, let us know so the order can be closed out.")}
       ${button("I've received it", confirmUrl)}
       ${small("If you don't confirm, we'll mark it as received automatically after a few days. Something wrong with the delivery? You can report a problem from your orders page.")}`,
      { preheader: `${businessName} has sent out your order` }
    ),
  });
}

// Customer: nudge a few days after shipping, before auto-confirm kicks in.
export async function sendReceiptReminderEmail({ to, customerName, businessName, orderReference, confirmUrl, daysUntilAuto }) {
  return sendEmail({
    to,
    subject: `Did your order ${orderReference} arrive?`,
    html: layout(
      `${h1("Did your order arrive?")}
       ${p(`Hi ${esc(customerName) || "there"}, <strong>${esc(businessName)}</strong> sent out order <strong>${esc(orderReference)}</strong> a few days ago.`)}
       ${p("If it's with you, a quick confirmation closes it out.")}
       ${button("Yes, I've received it", confirmUrl)}
       ${small(`If we don't hear from you, we'll mark it as received in about ${daysUntilAuto} day${daysUntilAuto === 1 ? "" : "s"}. If something's wrong, report it from your orders page before then.`)}
       ${button("Report a problem", `${SITE_URL}/report-problem`)}`,
      { preheader: "Confirm your delivery or report a problem" }
    ),
  });
}

// Customer: we auto-marked it received because they never confirmed.
export async function sendOrderAutoReceivedCustomerEmail({ to, customerName, businessName, orderReference }) {
  return sendEmail({
    to,
    subject: `Order ${orderReference} marked as received`,
    html: layout(
      `${h1("Order marked as received")}
       ${p(`Hi ${esc(customerName) || "there"}, we haven't heard back about the delivery from <strong>${esc(businessName)}</strong> on order <strong>${esc(orderReference)}</strong>, so we've marked it as received.`)}
       ${small("If it never arrived or there's a problem with it, report it and we'll look into it.")}
       ${button("Report a problem", `${SITE_URL}/report-problem`)}`,
      { preheader: `Order ${orderReference} was marked as received` }
    ),
  });
}

// Vendor: the customer confirmed (or it was auto-confirmed).
export async function sendOrderReceivedVendorEmail({ to, businessName, orderReference, customerName, auto }) {
  return sendEmail({
    to,
    subject: auto ? `Order ${orderReference} auto-confirmed as received` : `Customer confirmed delivery of order ${orderReference}`,
    html: layout(
      `${h1(auto ? "Order auto-confirmed as received" : "Delivery confirmed ✅")}
       ${p(
         auto
           ? `Hi ${esc(businessName)}, ${esc(customerName) || "your customer"} didn't respond after you sent out order <strong>${esc(orderReference)}</strong>, so it has been marked as received automatically.`
           : `Hi ${esc(businessName)}, ${esc(customerName) || "your customer"} confirmed they received order <strong>${esc(orderReference)}</strong>.`
       )}
       ${small("Thanks for fulfilling it on time.")}`,
      { preheader: `Order ${orderReference} is complete` }
    ),
  });
}

// --- Admin broadcasts ------------------------------------------------------

// Turns the plain text an admin types into email HTML: escapes everything,
// splits paragraphs on blank lines, keeps single line breaks, and swaps
// {{name}} for the recipient's first name. No raw HTML ever gets through.
export function renderBroadcastText(text, firstName) {
  const personalised = String(text || "").replace(/\{\{\s*name\s*\}\}/gi, firstName || "there");
  return personalised
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="color:#4b5563; font-size:14px; line-height:1.7; margin:0 0 14px;">${esc(para).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function renderBroadcastSubject(subject, firstName) {
  return String(subject || "").replace(/\{\{\s*name\s*\}\}/gi, firstName || "there");
}

export async function sendBroadcastEmail({ to, subject, bodyText, firstName, imageUrl, ctaLabel, ctaUrl, unsubscribeUrl }) {
  const footer = unsubscribeUrl
    ? `<p style="color:#9ca3af; font-size:12px; line-height:1.6; margin:24px 0 0; border-top:1px solid #f1f2f4; padding-top:14px;">You're getting this because you have an OJA247 account. <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe from announcements</a> &mdash; you'll still receive order and account emails.</p>`
    : "";
  // Flyer image, if any, goes first — above the message text, same as a
  // physical flyer leads with the graphic. imageUrl is a Cloudinary URL
  // from the ordinary upload flow (see campaignController.validateContent),
  // not raw HTML, so no further escaping is needed for it.
  const image = imageUrl
    ? `<img src="${imageUrl}" alt="" style="max-width:100%; border-radius:12px; margin:0 0 16px; display:block;" />`
    : "";
  return sendEmail({
    to,
    subject: renderBroadcastSubject(subject, firstName),
    html: layout(
      `${image}${renderBroadcastText(bodyText, firstName)}${ctaLabel && ctaUrl ? button(esc(ctaLabel), ctaUrl) : ""}${footer}`,
      { preheader: renderBroadcastSubject(subject, firstName) }
    ),
    headers: unsubscribeUrl
      ? { "List-Unsubscribe": `<${unsubscribeUrl}>` }
      : undefined,
  });
}


// ---------------------------------------------------------------------------
// Direct bank-transfer orders
// ---------------------------------------------------------------------------

// To the vendor the moment a customer places an order and uploads a receipt —
// before anything is confirmed. Its whole job is to get them to check their
// own bank and then confirm or reject in the dashboard.
export async function sendVendorTransferOrderEmail({
  to,
  businessName,
  customerName,
  reference,
  items,
  total,
  dashboardUrl,
  resubmitted = false,
}) {
  return sendEmail({
    to,
    subject: resubmitted
      ? `New receipt uploaded: check your bank, order ${reference}`
      : `New order: check your bank and confirm, ${reference}`,
    html: layout(
      `
      ${h1(resubmitted ? "A new receipt was uploaded" : "New order: check your bank")}
      ${p(`Hi ${esc(businessName)}, ${esc(customerName || "a customer")} ${resubmitted ? "uploaded a new payment receipt for" : "placed"} an order and says they have paid <strong>${NAIRA(total)}</strong> into your bank account.`)}

      <div style="background:#f9fafb; border-radius:10px; padding:16px 18px; margin:20px 0;">
        <p style="margin:0 0 2px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Order reference</p>
        <p style="margin:0; font-size:15px; font-weight:700; color:#111827; font-family:monospace;">${esc(reference)}</p>
      </div>

      ${orderItemsTable(items)}

      <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:14px 16px; margin:20px 0;">
        <p style="margin:0; font-size:13px; color:#92400e; line-height:1.6;">
          <strong>Check your own bank first.</strong> A receipt is only a screenshot or PDF and can be faked.
          Only tap <em>Payment received</em> once the money is really in your account. If it is not,
          tap <em>Reject</em> and tell the customer why.
        </p>
      </div>

      ${button("Open the order and confirm", dashboardUrl)}
      ${small("You will get a reminder once a day until you confirm or reject this order.")}
      `,
      { preheader: `${customerName || "A customer"} says they paid ${NAIRA(total)} for order ${reference}. Check your bank and confirm.` }
    ),
  });
}

// To the customer right after they place a bank-transfer order.
export async function sendCustomerTransferOrderReceivedEmail({ to, customerName, businessName, reference, total, statusUrl }) {
  return sendEmail({
    to,
    subject: `We received your order: waiting for ${businessName} to confirm payment (${reference})`,
    html: layout(
      `
      ${h1("Order received")}
      ${p(`Hi ${esc(customerName || "there")}, thanks for your order from <strong>${esc(businessName)}</strong>. You paid <strong>${NAIRA(total)}</strong> by bank transfer, and the seller now needs to confirm the money reached their account.`)}
      <div style="background:#f9fafb; border-radius:10px; padding:16px 18px; margin:20px 0;">
        <p style="margin:0 0 2px; font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">Order reference</p>
        <p style="margin:0; font-size:15px; font-weight:700; color:#111827; font-family:monospace;">${esc(reference)}</p>
      </div>
      ${p("We will email you again as soon as the seller confirms your payment, or if they need something from you.")}
      ${button("Check my order", statusUrl)}
      `,
      { preheader: `Your order ${reference} is waiting for ${businessName} to confirm your payment.` }
    ),
  });
}

// To the customer when the vendor turns a payment down, with their reason.
export async function sendPaymentRejectedCustomerEmail({ to, customerName, businessName, reference, reason, statusUrl }) {
  return sendEmail({
    to,
    subject: `${businessName} could not confirm your payment (${reference})`,
    html: layout(
      `
      ${h1("Your payment was not confirmed")}
      ${p(`Hi ${esc(customerName || "there")}, <strong>${esc(businessName)}</strong> could not confirm the payment for order <strong>${esc(reference)}</strong>.`)}
      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:14px 16px; margin:20px 0;">
        <p style="margin:0 0 4px; font-size:12px; color:#b91c1c; text-transform:uppercase; letter-spacing:0.05em;">Reason from the seller</p>
        <p style="margin:0; font-size:14px; color:#7f1d1d; line-height:1.6; white-space:pre-wrap;">${esc(reason)}</p>
      </div>
      ${p("If you have already paid, you can upload a new or clearer receipt on the same order. The seller will be told straight away.")}
      ${button("Upload a new receipt", statusUrl)}
      ${small("If you cannot sort it out with the seller, you can file a dispute on the order from your order page.")}
      `,
      { preheader: `${businessName} could not confirm your payment for ${reference}.` }
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
  sendVendorTransferOrderEmail,
  sendCustomerTransferOrderReceivedEmail,
  sendPaymentRejectedCustomerEmail,
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
  sendAccountDeletedEmail,
  sendCustomerDetailsUpdatedEmail,
  sendPointsWithdrawalPaidEmail,
  sendPasswordChangedEmail,
  sendNewReviewVendorEmail,
  sendReviewReplyCustomerEmail,
  sendFeaturedEmail,
  sendDisputeAdminDecisionEmail,
  sendOrderShippedEmail,
  sendReceiptReminderEmail,
  sendOrderAutoReceivedCustomerEmail,
  sendOrderReceivedVendorEmail,
  sendBroadcastEmail,
  verifyEmailTransporter,
};
// Daily nudge to the vendor while a bank-transfer order is still waiting on
// them. Same job as the first email: check your own bank, then confirm or reject.
export async function sendVendorTransferReminderEmail({ to, businessName, reference, total, daysWaiting, dashboardUrl }) {
  const waiting = daysWaiting >= 1 ? `${daysWaiting} day${daysWaiting === 1 ? "" : "s"}` : "a while";
  return sendEmail({
    to,
    subject: `Reminder: order ${reference} is waiting for your confirmation`,
    html: layout(
      `
      ${h1("A customer is waiting on you")}
      ${p(`Hi ${esc(businessName)}, order <strong>${esc(reference)}</strong> for <strong>${NAIRA(total)}</strong> has been waiting for your answer for ${waiting}. The customer says they have paid you directly and cannot get their order moving until you respond.`)}

      <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:14px 16px; margin:20px 0;">
        <p style="margin:0; font-size:13px; color:#92400e; line-height:1.6;">
          Check your own bank. If the money is there, tap <em>Payment received</em>.
          If it is not, tap <em>Reject</em> and tell the customer why.
        </p>
      </div>

      ${button("Open the order and respond", dashboardUrl)}
      ${small("You will keep getting one reminder a day until you confirm or reject this order. Orders that stay unanswered for several days are flagged to the OJA247 team.")}
      `,
      { preheader: `Order ${reference} (${NAIRA(total)}) is still waiting for you to confirm payment.` }
    ),
  });
}

// To the admin once a vendor has left a bank-transfer order unanswered for
// several days. OJA247 cannot move the money, so this is a heads-up to follow
// up with the vendor (and a signal for the ban decision if it keeps happening).
export async function sendAdminUnconfirmedTransferEmail({ businessName, vendorEmail, reference, total, daysWaiting, customerName, customerEmail }) {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Vendor not responding: ${businessName}, order ${reference}`,
    html: layout(
      `
      ${h1("A vendor has not responded to an order")}
      ${p(`<strong>${esc(businessName)}</strong> (${esc(vendorEmail || "no email on file")}) has left order <strong>${esc(reference)}</strong> for <strong>${NAIRA(total)}</strong> unanswered for <strong>${daysWaiting} days</strong>, despite daily reminders.`)}
      ${p(`Customer: ${esc(customerName || "—")} (${esc(customerEmail || "—")}). They paid the vendor's own bank account, so OJA247 cannot refund them. The useful next step is to contact the vendor. Repeated cases are a reason to consider a ban.`)}
      ${button("Open the admin dashboard", `${SITE_URL}/admin`)}
      `,
      { preheader: `${businessName} has not answered order ${reference} for ${daysWaiting} days.` }
    ),
  });
}