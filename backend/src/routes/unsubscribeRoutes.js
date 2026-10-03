import express from "express";
import { getUnsubscribeInfo, unsubscribe } from "../controllers/unsubscribeController.js";
import { authLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// Public on purpose: the signed token in the emailed link is the credential.
router.get("/info", getUnsubscribeInfo);
router.post("/", authLimiter, unsubscribe);

export default router;