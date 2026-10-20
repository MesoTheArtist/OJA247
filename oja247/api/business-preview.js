/* global process */
// Link previews (WhatsApp, Facebook, X, iMessage, Slack...) don't run JavaScript,
// so they only ever saw the generic <title>oja247</title> from index.html.
// /business/:id is rewritten here (see vercel.json): we look the store up,
// put its name, description and logo into the page's <head>, and return the
// normal app shell so real visitors still get the full site.

const SITE = process.env.SITE_URL || "https://oja247.store";
const BACKEND = process.env.BACKEND_URL || "https://oja-247.vercel.app";
const FALLBACK_IMAGE = `${SITE}/favicon.png`;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// WhatsApp wants a light image; pad the logo onto a 1200x630 white card as a JPG.
function previewImage(logo) {
  if (!logo || !/^https:\/\//i.test(logo)) return FALLBACK_IMAGE;
  if (/res\.cloudinary\.com\/.+\/image\/upload\//.test(logo)) {
    return logo.replace("/image/upload/", "/image/upload/c_pad,w_1200,h_630,b_white,f_jpg,q_auto/");
  }
  return logo;
}

const truncate = (text, max) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

async function loadShell(host) {
  const res = await fetch(`https://${host}/index.html`);
  if (!res.ok) throw new Error(`index.html -> ${res.status}`);
  return res.text();
}

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const id = String(req.query.id || "");

  let shell;
  try {
    shell = await loadShell(host);
  } catch {
    res.statusCode = 502;
    return res.end("Temporarily unavailable");
  }

  let business = null;
  if (/^[\w-]{1,100}$/.test(id)) {
    try {
      const r = await fetch(`${BACKEND}/api/businesses/${encodeURIComponent(id)}`);
      if (r.ok) business = await r.json();
    } catch {
      // fall through to the generic shell
    }
  }

  let html = shell;
  if (business?.name) {
    const title = `${business.name} | oja247`;
    const description =
      truncate(business.description, 160) || `Shop ${business.name} on oja247 — local vendors, one marketplace.`;
    const url = `${SITE}/business/${business.slug || business._id}`;
    const image = previewImage(business.logo);

    const tags = [
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<link rel="canonical" href="${escapeHtml(url)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="oja247" />`,
      `<meta property="og:title" content="${escapeHtml(business.name)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(url)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(business.name)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    ].join("\n    ");

    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace("</head>", `    ${tags}\n  </head>`);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Cache at Vercel's edge a few minutes so crawlers/visitors don't hit the DB each time,
  // but a renamed store or new logo shows up quickly.
  res.setHeader("Cache-Control", business ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=30");
  res.statusCode = 200;
  res.end(html);
}