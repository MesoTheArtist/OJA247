// /product/:id -> the normal app, with this product's photo, name and price in
// the preview tags, so a shared product link looks like the product.
import {
  SITE,
  fetchJson,
  loadShell,
  hostOf,
  truncate,
  naira,
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

  const product = /^[0-9a-f]{24}$/i.test(id) ? await fetchJson(`/api/products/${id}`) : null;
  if (!product?.name) return sendHtml(res, shell, { cache: "public, s-maxage=30" });

  const shop = product.businessId?.name || "";
  const price = naira(product.price);
  const lead = [price, shop && `from ${shop}`].filter(Boolean).join(" ");
  const blurb = truncate(product.description, 140);
  const description = [lead && `${lead} on OJA247.`, blurb].filter(Boolean).join(" ");

  const html = applyPreview(shell, {
    title: price ? `${product.name} - ${price}` : product.name,
    description: description || `${product.name} on OJA247.`,
    url: `${SITE}/product/${product._id || id}`,
    // First usable product photo, else the shop's logo, else the site icon.
    image: previewImage(...(product.images || []), product.businessId?.logo),
    extra: [
      `<meta property="og:type" content="product" />`,
      ...(Number.isFinite(Number(product.price))
        ? [
            `<meta property="product:price:amount" content="${Math.round(Number(product.price))}" />`,
            `<meta property="product:price:currency" content="NGN" />`,
          ]
        : []),
    ],
  });
  return sendHtml(res, html);
}
