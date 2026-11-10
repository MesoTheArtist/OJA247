import { transliterate } from "transliteration";
import Business from "../models/Business.js";

// Letters that don't split into "base letter + accent mark" under Unicode
// normalization, so they need an explicit plain-letter equivalent.
const SPECIAL_LETTERS = {
  "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "đ": "d", "ð": "d",
  "ł": "l", "þ": "th", "ı": "i", "ħ": "h", "ŧ": "t",
};

// Turns a store name into a link-safe slug and keeps every kind of lettering
// readable instead of dropping it:
//   "Chioma Fashion & Co." -> "chioma-fashion-co"
//   "JANOSÉ"               -> "janose"        (accents)
//   "Ọlá’s Ẹ̀wù"           -> "olas-ewu"      (Yoruba / Igbo marks)
//   "Café Møller"          -> "cafe-moller"
//   "متجر النور"           -> "mtjr-lnwr"     (Arabic, Chinese, Cyrillic...
//   "日本店"               -> "ri-ben-dian"    are converted to Latin letters)
// A name that still ends up empty (only symbols or emoji) is handled by
// generateUniqueSlug, which falls back to "store".
export const slugify = (text) => {
  const plain = String(text || "")
    .normalize("NFD") // é -> e + a separate accent mark
    .replace(/[\u0300-\u036f]/g, "") // ...then drop the accent marks
    .toLowerCase()
    .replace(/[øæœßđðłþıħŧ]/g, (ch) => SPECIAL_LETTERS[ch]);

  return transliterate(plain, { unknown: "" }) // other alphabets -> Latin letters
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // strip anything that isn't a letter, number, space, or hyphen
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

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