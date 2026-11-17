import Product from "../models/Product.js";

// A store appears in the public store lists (Explore, the home page, the
// stores page) only once it has at least this many products. 0 means every live
// store is listed (the rule is off). Raise it and redeploy to hide thinner
// stores from those lists; their products still show on the Shop Products page
// and the store itself always opens by its direct link.
export const MIN_PRODUCTS_FOR_LISTING = 0;

// Stores with at least this many products are eligible to be featured. It is
// the goal the reminder emails point vendors toward.
export const FEATURE_TARGET_PRODUCTS = 10;

// Reminder spacing (see productReminderCronController.js). The job runs weekly
// and each store is only emailed when its last reminder is this old, so stores
// below the target get one about every two weeks (twice a month) and stores at
// or above it get a lighter nudge about once a month.
export const REMINDER_INTERVAL_DAYS_BELOW_TARGET = 14;
export const REMINDER_INTERVAL_DAYS_AT_TARGET = 30;

// Returns a Map of businessId (string) -> number of products.
export async function countProductsByBusiness(businessIds) {
  if (!businessIds.length) return new Map();
  const rows = await Product.aggregate([
    { $match: { businessId: { $in: businessIds } } },
    { $group: { _id: "$businessId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}