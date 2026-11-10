// "Same person, different spelling" keys for phone numbers and emails.
//
// Used to catch someone signing up again with the same phone or inbox written
// differently, both for the self-referral check (a referrer must not earn from
// their own signups) and for the one-free-trial-per-person rule.

// 08012345678, +234 801 234 5678, 2348012345678 and 0801-234-5678 all become
// "8012345678" (the last 10 digits). Returns null when there are too few digits
// to compare safely.
export function phoneKey(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Lowercases, drops a "+tag" (me+promo@x.com -> me@x.com) and, for Gmail,
// ignores dots too (j.ohn@gmail.com -> john@gmail.com), because they all land
// in the same inbox. Returns null for anything that isn't an email.
export function emailKey(value) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;

  let local = email.slice(0, at).split("+")[0];
  let domain = email.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  return local ? `${local}@${domain}` : null;
}
