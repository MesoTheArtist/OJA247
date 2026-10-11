// A vendor must not be able to place and then confirm an order on their own
// store: a confirmed order unlocks a "verified purchase" review, so a vendor
// could otherwise review themselves (and inflate order numbers) without any
// real customer. This catches the obvious cases by matching the customer's
// email or phone against the store's own contact details. It is a speed bump,
// not a guarantee: someone determined can use a different email and phone.
const digits = (value) => String(value || "").replace(/\D/g, "");
const lastTen = (value) => digits(value).slice(-10);
const clean = (value) => String(value || "").trim().toLowerCase();

export function isOwnStoreCustomer({ customer, vendor, ownerEmail }) {
  const email = clean(customer?.email);
  const ownEmails = [ownerEmail, vendor?.contactEmail].map(clean).filter(Boolean);
  if (email && ownEmails.includes(email)) return true;

  const phone = lastTen(customer?.phone);
  const ownPhones = [vendor?.contactPhone, vendor?.contactWhatsapp].map(lastTen).filter((p) => p.length === 10);
  return phone.length === 10 && ownPhones.includes(phone);
}