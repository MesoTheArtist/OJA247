import Order from "../models/Order.js";

// Backfills userId on a customer's past guest orders, matched by email.
//
// SECURITY: only ever links for an account whose email is VERIFIED
// (user.emailVerified === true — set by Google sign-in, which proves the
// email itself, or by clicking the confirmation-email link). Password signup
// does not verify the email, so without this gate anyone could register
// someone else's address and read that person's guest orders (name, phone,
// delivery address).
//
// Emails on orders are stored as typed at checkout while account emails are
// lowercase, so the match ignores case (collation strength 2).
//
// Runs after login/Google/verify and when order history is loaded, so it also
// catches orders placed with the same email after the account already
// existed. Idempotent — updateMany only touches unlinked rows. Never throws:
// a linking hiccup must not block auth or order history. Returns how many
// orders were linked.
export async function linkGuestOrders(user) {
  if (user?.emailVerified !== true) return 0;
  try {
    const result = await Order.updateMany(
      { "customer.email": user.email, userId: null },
      { userId: user._id },
      { collation: { locale: "en", strength: 2 } }
    );
    return result?.modifiedCount || 0;
  } catch (error) {
    console.error(`Guest-order linking failed for ${user.email}:`, error.message);
    return 0;
  }
}