import Business from "../models/Business.js";

// Turns "Chioma Fashion & Co." into "chioma-fashion-co"
export const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// A store link nobody has taken yet: "chioma-fashion", then "chioma-fashion-2", ...
// Never returns something that looks like a Mongo id, so /business/<slug>
// can't be mistaken for an id lookup.
export async function generateUniqueSlug(name, excludeId = null) {
  let base = slugify(name) || "store";
  if (/^[0-9a-f]{24}$/.test(base)) base = `store-${base}`;
  let slug = base;
  let suffix = 2;

  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Business.findOne(query).select("_id").lean();
    if (!existing) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}