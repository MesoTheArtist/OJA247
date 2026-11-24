// Checks what a shopper typed when changing their own profile.
// Returns { updates } with the cleaned values, or { error } with a message
// that is safe to show to the shopper.
export function cleanProfileUpdates(body) {
  const input = body && typeof body === "object" ? body : {};
  const updates = {};

  if (input.fullName !== undefined) {
    if (typeof input.fullName !== "string") return { error: "Enter your full name (2 to 80 characters)." };
    const fullName = input.fullName.trim().replace(/\s+/g, " ");
    if (fullName.length < 2 || fullName.length > 80) {
      return { error: "Enter your full name (2 to 80 characters)." };
    }
    updates.fullName = fullName;
  }

  if (input.phone !== undefined) {
    if (typeof input.phone !== "string") return { error: "Enter a valid phone number." };
    const phone = input.phone.trim();
    const digits = phone.replace(/\D/g, "");
    // An empty phone is allowed (the shopper is removing it); otherwise it
    // needs 7-15 digits and nothing but digits, +, -, spaces and brackets.
    if (phone && (!/^[0-9+\-() ]{7,20}$/.test(phone) || digits.length < 7 || digits.length > 15)) {
      return { error: "Enter a valid phone number." };
    }
    updates.phone = phone;
  }

  if (Object.keys(updates).length === 0) return { error: "Nothing to update." };
  return { updates };
}