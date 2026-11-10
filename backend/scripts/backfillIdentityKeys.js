// One-time backfill: fills Business.contactKey and Business.ownerEmailKey for
// stores created before those fields existed. They let the free-trial rule
// recognise the same person (same phone or same inbox) even when it's typed
// differently, and they must exist on older stores so someone who already paid
// can't sign up again and claim a free week.
//
// Run once from the backend folder, after the new code is deployed:
//   node scripts/backfillIdentityKeys.js
//
// Safe to re-run; it only writes a key that is missing or different.

import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../src/db.js";
import Business from "../src/models/Business.js";
import User from "../src/models/User.js";
import { emailKey, phoneKey } from "../src/utils/identityKeys.js";

const run = async () => {
  await connectDB();

  const businesses = await Business.find().select("contact contactKey ownerEmailKey").lean();
  const owners = await User.find({ businessId: { $in: businesses.map((b) => b._id) } })
    .select("email businessId")
    .lean();
  const emailOf = new Map(owners.map((u) => [String(u.businessId), u.email]));

  const operations = [];
  for (const business of businesses) {
    const contactKey = phoneKey(business.contact);
    const ownerEmailKey = emailKey(emailOf.get(String(business._id)));
    if (contactKey === (business.contactKey ?? null) && ownerEmailKey === (business.ownerEmailKey ?? null)) continue;
    operations.push({
      updateOne: { filter: { _id: business._id }, update: { $set: { contactKey, ownerEmailKey } } },
    });
  }

  if (operations.length) await Business.bulkWrite(operations);
  console.log(`Checked ${businesses.length} business(es); updated ${operations.length}.`);
  process.exit(0);
};

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
