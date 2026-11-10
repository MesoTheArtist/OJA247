/* global process */
// Shared pieces for the link-preview functions (business, product, referral).
//
// Link previews (WhatsApp, Facebook, X, iMessage, Slack...) don't run
// JavaScript, so for a shared link they only see the <head> of the static
// index.html. Each function in /api looks up what the link is about and returns
// that same app shell with the right preview tags, so real visitors still get
// the full site.
//
// This folder starts with "_" so Vercel treats it as shared code, not as a
// function of its own.

export const SITE = process.env.SITE_URL || "https://oja247.store";
export const BACKEND = process.env.BACKEND_URL || "https://oja-247.vercel.app";
export const FALLBACK_IMAGE = `${SITE}/favicon.png`;

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const truncate = (text, max) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

// 12500 -> "₦12,500"
export const naira = (amount) => {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return "";
  return `₦${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

// A picture a crawler can actually use: https only (a stored "data:" image can't
// be a preview image). Cloudinary pictures are padded onto a white 1200x630 JPG,
// which is the shape WhatsApp and Facebook like and avoids cropping.
// Returns { url, padded } or null when there's nothing usable.
export function previewImage(...candidates) {
  const url = candidates.find((c) => typeof c === "string" && /^https:\/\//i.test(c));
  if (!url) return null;
  if (/res\.cloudinary\.com\/.+\/image\/upload\//.test(url)) {
    return { url: url.replace("/image/upload/", "/image/upload/c_pad,w_1200,h_630,b_white,f_jpg,q_auto/"), padded: true };
  }
  return { url, padded: false };
}

export async function loadShell(host) {
  const res = await fetch(`https://${host}/index.html`);
  if (!res.ok) throw new Error(`index.html -> ${res.status}`);
  return res.text();
}

// Returns parsed JSON, or null when the request fails or the answer isn't OK.
export async function fetchJson(path) {
  try {
    const res = await fetch(`${BACKEND}${path}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Swaps the page's default preview tags for these. The shell already carries
// its own default <title>, description, og:* and twitter:* tags, so the old ones
// are removed first. Two og:title tags would leave it up to each crawler which
// one wins, and many pick the first (the generic one).
export function applyPreview(shell, { title, description, url, image, extra = [] }) {
  const card = image?.padded ? "summary_large_image" : "summary";
  const picture = image?.url || FALLBACK_IMAGE;
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="OJA247" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(picture)}" />`,
    ...(image?.padded
      ? [`<meta property="og:image:width" content="1200" />`, `<meta property="og:image:height" content="630" />`]
      : []),
    `<meta name="twitter:card" content="${card}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(picture)}" />`,
    ...extra,
  ];

  const stripped = shell
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(
      /<meta\b[^>]*?(?:name|property)\s*=\s*["'](?:description|og:[^"']*|twitter:[^"']*|product:[^"']*)["'][^>]*>/gis,
      ""
    )
    .replace(/<link\b[^>]*?rel\s*=\s*["']canonical["'][^>]*>/gis, "");

  return stripped.replace(
    "</head>",
    `    <title>${escapeHtml(title)}</title>\n    ${tags.join("\n    ")}\n  </head>`
  );
}

export function sendHtml(res, html, { cache = "public, s-maxage=300, stale-while-revalidate=600" } = {}) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.statusCode = 200;
  res.end(html);
}

export function sendUnavailable(res) {
  res.statusCode = 502;
  res.end("Temporarily unavailable");
}

export const hostOf = (req) => req.headers["x-forwarded-host"] || req.headers.host;
