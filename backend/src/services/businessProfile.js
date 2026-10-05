// Cleans the free-text profile fields a vendor can set on their store —
// social links and highlights — before they're saved.
//
// Links matter most: the storefront renders them as <a href>, so anything that
// isn't a plain web address (javascript:, data:, ...) must never reach the
// database. Values are NORMALISED rather than just rejected where that's safe
// ("instagram.com/x" becomes "https://instagram.com/x"), so an older saved
// value without https:// never blocks a vendor from editing something
// unrelated like their phone number.

const LINK_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "Twitter / X",
  website: "Website",
};

const MAX_LINK_LENGTH = 300;
export const MAX_HIGHLIGHTS = 10;
export const MAX_HIGHLIGHT_LENGTH = 60;

// Returns { value } with all four keys always present (empty string = not
// set), or { error } with a message fit to show the vendor.
export function sanitizeSocialLinks(input) {
  const source = input && typeof input === "object" ? input : {};
  const value = {};

  for (const [key, label] of Object.entries(LINK_LABELS)) {
    const raw = source[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      value[key] = "";
      continue;
    }

    let link = String(raw).trim();
    if (link.length > MAX_LINK_LENGTH) {
      return { error: `Your ${label} link is too long.` };
    }

    // No scheme typed at all -> assume https.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) link = `https://${link}`;

    let parsed;
    try {
      parsed = new URL(link);
    } catch {
      return { error: `Your ${label} link doesn't look like a web address.` };
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { error: `Your ${label} link must be a web address starting with https://.` };
    }
    if (!parsed.hostname.includes(".")) {
      return { error: `Your ${label} link doesn't look like a web address.` };
    }

    value[key] = link;
  }

  return { value };
}

// Trims, drops blanks and case-insensitive duplicates, shortens anything over
// the length limit and keeps the first MAX_HIGHLIGHTS. Shortening instead of
// rejecting means an older, longer highlight can't block an unrelated edit.
export function sanitizeHighlights(input) {
  if (!Array.isArray(input)) return { error: "Highlights must be a list." };

  const seen = new Set();
  const value = [];
  for (const item of input) {
    const text = String(item ?? "").trim().slice(0, MAX_HIGHLIGHT_LENGTH).trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    value.push(text);
    if (value.length === MAX_HIGHLIGHTS) break;
  }
  return { value };
}