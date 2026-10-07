import cloudinary from "../config/cloudinaryConfig.js";

// Payment receipts are private: they can show a customer's name and bank
// details. They are uploaded with Cloudinary "authenticated" delivery, so the
// stored publicId alone is useless; only a signed link we generate works.

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// Decide what a file really is from its first bytes, not from the name or the
// mimetype the browser claims. Returns null for anything that is not a JPG,
// PNG, WEBP or PDF.
export function sniffReceiptType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", mime: "image/png" };
  }
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  if (buffer.slice(0, 5).toString("ascii") === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  return null;
}

export function uploadReceipt(buffer, originalName) {
  return new Promise((resolve, reject) => {
    const safeBase = String(originalName || "receipt")
      .split(".")[0]
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 40) || "receipt";

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "oja247/receipts",
        resource_type: "auto",
        type: "authenticated",
        public_id: `${Date.now()}-${safeBase}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          publicId: result.public_id,
          resourceType: result.resource_type || "image",
          format: result.format || "",
          originalName: originalName || "",
        });
      }
    );
    stream.end(buffer);
  });
}

// A link a vendor or admin can open to see one receipt.
export function signedReceiptUrl(receipt) {
  if (!receipt?.publicId) return null;
  const options = {
    resource_type: receipt.resourceType || "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
  };
  if (receipt.resourceType !== "raw" && receipt.format) options.format = receipt.format;
  return cloudinary.url(receipt.publicId, options);
}

// Adds ready-to-open links to an order for the vendor's dashboard, and leaves
// everything else as it was.
export function withReceiptLinks(order) {
  const plain = typeof order.toObject === "function" ? order.toObject() : order;
  return {
    ...plain,
    paymentReceipts: (plain.paymentReceipts || []).map((r) => ({
      ...r,
      url: signedReceiptUrl(r),
    })),
  };
}