import express from "express";
import { registerDevice, unregisterDevice, sendTestNotification } from "../controllers/deviceController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Shoppers and vendors, signed in. The phone's notification address is
// registered after sign-in and removed just before sign-out.
router.post("/", protect, registerDevice);
router.post("/unregister", protect, unregisterDevice);
router.post("/test", protect, sendTestNotification);

export default router;