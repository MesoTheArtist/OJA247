// One-time migration: older stores saved their logo/banner as a raw base64
// "data:image/..." string inside the database. Link previews (WhatsApp, etc.)
// can't use that as a picture, and it makes every /api/businesses response
// huge. This uploads each one to Cloudinary and stores the hosted URL instead.
//
// Run from the backend folder (needs the same .env as the server, including
// the CLOUDINARY_* values):
//   node scripts/migrateDataImages.js --dry    # just report what it would do
//   node scripts/migrateDataImages.js          # do it
//
// Safe to re-run: it only touches logo/banner values that still start with
// "data:". If an image fails to upload (too big, not a real image, network),
// that one is left exactly as it was and reported at the end.

import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../src/db.js";
import Business from "../src/models/Business.js";
import { normalizeProfileImage } from "../src/services/imageStorage.js";

const dryRun = process.argv.includes("--dry");
const FIELDS = ["logo", "banner"];
const kb = (text) => `${Math.round(text.length / 1024)} KB`;

const run = async () => {
  await connectDB();

  // lean() + $regex so we only pull stores that actually have a data: image
  const businesses = await Business.find({
    $or: FIELDS.map((f) => ({ [f]: { $regex: "^data:" } })),
  })
    .select(`name slug ${FIELDS.join(" ")}`)
    .lean();

  console.log(`${dryRun ? "[dry run] " : ""}Found ${businesses.length} business(es) with data: images.`);

  let migrated = 0;
  const failed = [];

  for (const business of businesses) {
    for (const field of FIELDS) {
      const value = business[field];
      if (typeof value !== "string" || !value.startsWith("data:")) continue;

      if (dryRun) {
        console.log(`  would upload ${field} for "${business.name}" (${kb(value)})`);
        continue;
      }

      const result = await normalizeProfileImage(value);
      if (result.error || !result.value) {
        failed.push(`${business.name} (${field}): ${result.error || "no URL returned"}`);
        console.log(`  ✗ "${business.name}" ${field}: ${result.error || "no URL returned"}`);
        continue;
      }

      // updateOne so old documents aren't re-validated against newer required fields
      await Business.updateOne({ _id: business._id }, { $set: { [field]: result.value } });
      migrated += 1;
      console.log(`  ✓ "${business.name}" ${field} -> ${result.value}`);
    }
  }

  if (!dryRun) console.log(`Done. ${migrated} image(s) moved to Cloudinary, ${failed.length} failed.`);
  if (failed.length) {
    console.log("Left unchanged (re-upload these from the vendor's Settings):");
    failed.forEach((line) => console.log(`  - ${line}`));
  }
  process.exit(0);
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});