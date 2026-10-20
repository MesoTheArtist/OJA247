// One-time script to generate a slug for any existing business that
// doesn't have one yet (businesses created before the slug feature existed).
//
// Run once from your backend folder with:
//   node scripts/backfillSlugs.js
//
// Safe to run multiple times — it only touches businesses where slug is
// missing, so it won't overwrite a slug a vendor has already set.

// Force Node.js to use Google's public DNS servers — same workaround
// server.js uses, needed because the default DNS on this machine can't
// resolve MongoDB Atlas's SRV record otherwise.
import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../src/db.js";
import Business from "../src/models/Business.js";
import { generateUniqueSlug } from "../src/services/storeSlug.js";

const run = async () => {
  await connectDB();

  const businesses = await Business.find({
    $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }],
  });

  console.log(`Found ${businesses.length} business(es) without a slug.`);

  for (const business of businesses) {
    const slug = await generateUniqueSlug(business.name, business._id);
    business.slug = slug;
    await business.save();
    console.log(`  ✓ "${business.name}" -> /business/${slug}`);
  }

  console.log("Done.");
  process.exit(0);
};

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});