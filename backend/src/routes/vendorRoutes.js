import { bankChangeLimiter } from "../middleware/rateLimiters.js";
import express from "express";
import multer from "multer";
import path from "path";
import { getBanks, resolveAccount, onboardVendor, getMyVendor, acknowledgeVendorNotification, blockCustomer, unblockCustomer } from "../controllers/vendorController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Memory storage — Vercel's filesystem is read-only/ephemeral, so files are
// buffered in memory and streamed straight to Cloudinary in the controller.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    const allowedByField = {
      cac_document: [".pdf", ".jpg", ".jpeg", ".png"],
      address_proof: [".pdf", ".jpg", ".jpeg", ".png"],
      selfie: [".jpg", ".jpeg", ".png"], // photo only, no PDFs
    };
    const allowed = allowedByField[file.fieldname] || [];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error(`Invalid file type for ${file.fieldname}`));
    }
    cb(null, true);
  },
});

// Verified-tier fields (CAC, address proof, selfie) are optional at
// submission — vendor can upgrade later.
const uploadFields = upload.fields([
  { name: "cac_document", maxCount: 1 },
  { name: "address_proof", maxCount: 1 },
  { name: "selfie", maxCount: 1 },
]);

router.get("/banks", getBanks);
router.get("/resolve-account", resolveAccount);
router.get("/me", protect, getMyVendor);
router.patch("/me/seen", protect, acknowledgeVendorNotification);
router.post("/me/blocked-customers", protect, blockCustomer);
router.delete("/me/blocked-customers", protect, unblockCustomer);
router.post("/", protect, bankChangeLimiter, uploadFields, onboardVendor);

export default router;