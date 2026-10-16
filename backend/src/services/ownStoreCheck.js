// A vendor must not be able to place and then confirm an order on their own
// store: a confirmed order unlocks a "verified purchase" review, so a vendor
// could otherwise review themselves (and inflate order numbers) without any
// real customer. This catches the obvious cases by matching the customer's
// email or phone against the store's own contact details. It is a speed bump,
// not a guarantee: someone determined can still use a completely different
// email and phone, and no check on the customer's own details can stop that.
const digits = (value) => String(value || "").replace(/\D/g, "");
const lastTen = (value) => digits(value).slice(-10);
const clean = (value) => String(value || "").trim().toLowerCase();

// The same mailbox written differently counts as the same email, so the usual
// tricks don't slip past: "me+shop@gmail.com" and "m.e@googlemail.com" are
// both just "me@gmail.com". "+tag" is dropped for every provider; dots only
// for Gmail, where they really are ignored.
export function canonicalEmail(value) {
  const email = clean(value);
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  let local = email.slice(0, at).split("+")[0];
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

// Every phone-looking number in a free-text field such as a store's public
// "contact" line, reduced to its last ten digits.
function phonesIn(value) {
  const found = String(value || "").match(/\+?\d[\d\s\-().]{8,}\d/g) || [];
  return found.map(lastTen).filter((p) => p.length === 10);
}

export function isOwnStoreCustomer({ customer, vendor, ownerEmail, businessContact }) {
  const email = canonicalEmail(customer?.email);
  const ownEmails = [ownerEmail, vendor?.contactEmail].map(canonicalEmail).filter(Boolean);
  if (email && ownEmails.includes(email)) return true;

  const phone = lastTen(customer?.phone);
  const ownPhones = [
    ...[vendor?.contactPhone, vendor?.contactWhatsapp].map(lastTen),
    ...phonesIn(businessContact),
  ].filter((p) => p.length === 10);
  return phone.length === 10 && ownPhones.includes(phone);
}