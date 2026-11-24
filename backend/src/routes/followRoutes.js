import express from "express";
import { getFollowStatus, followBusiness, unfollowBusiness } from "../controllers/followController.js";
import { listFollowedBusinesses } from "../controllers/customerProfileController.js";
import { protect, requireCustomer } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every route here needs a real customer session - following is a
// customer-only action, there's nothing a guest or vendor should be able
// to do through this router.
router.get("/", protect, requireCustomer, listFollowedBusinesses);
router.get("/status/:businessId", protect, requireCustomer, getFollowStatus);
router.post("/:businessId", protect, requireCustomer, followBusiness);
router.delete("/:businessId", protect, requireCustomer, unfollowBusiness);

export default router;