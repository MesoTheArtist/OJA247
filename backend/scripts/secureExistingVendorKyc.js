import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import cloudinary from "../src/config/cloudinaryConfig.js";
import Vendor from "../src/models/Vendor.js";
import { connectDB } from "../src/db.js";

const FIELDS = ["cacDocumentUrl", "addressProofUrl", "selfieUrl"];
const execute = process.argv.includes("--execute");

if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

function parseCloudinaryUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.hostname !== "res.cloudinary.com") return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const resourceIndex = parts.findIndex(
    (part, index) =>
      ["image", "raw", "video"].includes(part) &&
      ["upload", "authenticated"].includes(parts[index + 1])
  );
  if (resourceIndex < 0) return null;

  const resourceType = parts[resourceIndex];
  const deliveryType = parts[resourceIndex + 1];
  if (deliveryType !== "upload" && deliveryType !== "authenticated") return null;

  const assetParts = parts.slice(resourceIndex + 2);
  if (/^s--[^/]+--$/.test(assetParts[0] || "")) assetParts.shift();
  if (/^v\d+$/.test(assetParts[0] || "")) assetParts.shift();
  if (assetParts.length === 0) return null;

  const lastPart = assetParts[assetParts.length - 1];
  const extension = lastPart.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "";
  if (extension && resourceType !== "raw") {
    assetParts[assetParts.length - 1] = lastPart.slice(0, -(extension.length + 1));
  }

  return {
    publicId: assetParts.join("/"),
    resourceType,
    deliveryType,
    format: extension,
  };
}

function authenticatedUrl(publicId, resourceType, format) {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    secure: true,
    ...(format && resourceType !== "raw" ? { format } : {}),
  });
}

async function migrateField(vendor, field) {
  const currentUrl = vendor[field];
  if (!currentUrl) return "empty";

  const asset = parseCloudinaryUrl(currentUrl);
  if (!asset) {
    console.error(`Cannot parse Cloudinary URL for vendor ${vendor._id}, field ${field}.`);
    return "failed";
  }
  if (asset.deliveryType === "authenticated") return "already-secure";

  const targetId = `${asset.publicId}-private-${String(vendor._id).slice(-8)}`;
  if (!execute) return "would-migrate";

  try {
    try {
      await cloudinary.api.resource(targetId, {
        resource_type: asset.resourceType,
        type: "authenticated",
      });
    } catch {
      await cloudinary.uploader.rename(asset.publicId, targetId, {
        resource_type: asset.resourceType,
        type: "upload",
        to_type: "authenticated",
        invalidate: true,
      });
    }

    const secureUrl = authenticatedUrl(targetId, asset.resourceType, asset.format);
    await Vendor.updateOne({ _id: vendor._id }, { $set: { [field]: secureUrl } });
    return "migrated";
  } catch (error) {
    console.error(`Migration failed for vendor ${vendor._id}, field ${field}: ${error.message}`);
    return "failed";
  }
}

async function main() {
  if (!process.env.MONGO_URI || !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("MONGO_URI and all Cloudinary credentials must be configured.");
  }

  await connectDB();
  const vendors = await Vendor.find({
    $or: FIELDS.map((field) => ({ [field]: { $ne: null } })),
  }).select(FIELDS.join(" "));

  const totals = {
    scanned: 0,
    wouldMigrate: 0,
    migrated: 0,
    alreadySecure: 0,
    failed: 0,
  };

  for (const vendor of vendors) {
    for (const field of FIELDS) {
      if (!vendor[field]) continue;
      totals.scanned += 1;
      const result = await migrateField(vendor, field);
      if (result === "would-migrate") totals.wouldMigrate += 1;
      if (result === "migrated") totals.migrated += 1;
      if (result === "already-secure") totals.alreadySecure += 1;
      if (result === "failed") totals.failed += 1;
    }
  }

  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", ...totals }, null, 2));
  await mongoose.disconnect();
  if (totals.failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("KYC asset migration stopped:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
