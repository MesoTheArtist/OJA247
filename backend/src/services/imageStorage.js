import cloudinary from "../config/cloudinaryConfig.js";
import { sniffReceiptType } from "./receiptStorage.js";

// Store logos/banners safely. The signup and settings forms send a picture
// either as a normal web address (already uploaded) or as a base64 "data:"
// string straight from the browser. Saving that string in the database let
// anyone (signup needs no login) stuff megabytes of junk into a store record,
// and nothing checked that the text was even an image. Now:
//  - "" / nothing  -> no image
//  - http(s) URL   -> kept as is (length-capped)
//  - data:image/(png|jpeg|webp);base64,... -> checked by its real bytes, then
//    uploaded to Cloudinary and replaced with the hosted URL
//  - anything else -> rejected
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // matches Vercel's ~4.5 MB request limit
const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function uploadBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "oja247",
        public_id: `${Date.now()}-profile`,
        transformation: [{ width: 1600, height: 1600, crop: "limit" }],
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
}

// Returns { value } on success or { error } with a message fit to show the user.
export async function normalizeProfileImage(input) {
  if (input === undefined || input === null || input === "") return { value: "" };
  if (typeof input !== "string") return { error: "That image isn't valid." };

  const text = input.trim();
  if (/^https?:\/\//i.test(text)) {
    if (text.length > 2048) return { error: "That image link is too long." };
    try {
      new URL(text);
    } catch {
      return { error: "That image link isn't valid." };
    }
    return { value: text };
  }

  // Cheap size guard before decoding anything (base64 is ~4/3 of the bytes).
  if (text.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 200) {
    return { error: "Please use an image smaller than 4MB." };
  }
  const match = DATA_URL.exec(text);
  if (!match) return { error: "Please upload a JPG, PNG or WEBP image." };

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_IMAGE_BYTES) return { error: "Please use an image smaller than 4MB." };
  const type = sniffReceiptType(buffer);
  if (!type || type.ext === "pdf") return { error: "Please upload a JPG, PNG or WEBP image." };

  try {
    const result = await uploadBuffer(buffer);
    return { value: result.secure_url };
  } catch (err) {
    console.error("Profile image upload failed:", err?.message ?? err);
    return { error: "We couldn't save that image. Please try again." };
  }
}