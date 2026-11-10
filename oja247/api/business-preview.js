// /business/:id -> the normal app, with this store's name, description and logo
// in the preview tags (see _lib/preview.js and the rewrite in vercel.json).
import {
  SITE,
  fetchJson,
  loadShell,
  hostOf,
  truncate,
  previewImage,
  applyPreview,
  sendHtml,
  sendUnavailable,
} from "./_lib/preview.js";

export default async function handler(req, res) {
  const id = String(req.query.id || "");

  let shell;
  try {
    shell = await loadShell(hostOf(req));
  } catch {
    return sendUnavailable(res);
  }

  const business = /^[\w-]{1,100}$/.test(id) ? await fetchJson(`/api/businesses/${encodeURIComponent(id)}`) : null;
  if (!business?.name) return sendHtml(res, shell, { cache: "public, s-maxage=30" });

  const html = applyPreview(shell, {
    title: `${business.name} | OJA247`,
    description:
      truncate(business.description, 160) || `Shop ${business.name} on OJA247. Local vendors, one marketplace.`,
    url: `${SITE}/business/${business.slug || business._id}`,
    image: previewImage(business.logo),
    extra: [`<meta property="og:type" content="website" />`],
  });
  return sendHtml(res, html);
}
