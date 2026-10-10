import express from "express";
import { runWeeklyPayoutBatch } from "../controllers/payoutBatchController.js";
import { runSubscriptionExpiryCheck } from "../controllers/subscriptionExpiryCronController.js";
import { runDisputeEscalationCheck } from "../controllers/disputeCronController.js";
import { runVerificationReminderCheck } from "../controllers/verificationReminderCronController.js";
import { runAutoReceiveCheck } from "../controllers/receiptCronController.js";
import { runTransferFollowUpCheck } from "../controllers/transferFollowUpCronController.js";
import { runSubscriptionAutoRenewal } from "../controllers/subscriptionController.js";

const router = express.Router();

// Vercel Cron sends GET requests with an Authorization header set from
// CRON_SECRET automatically — see the "crons" entry in vercel.json.
router.get("/payout-batch", runWeeklyPayoutBatch);
router.get("/subscription-expiry", runSubscriptionExpiryCheck);
router.get("/subscription-auto-renew", runSubscriptionAutoRenewal);
router.get("/dispute-escalation", runDisputeEscalationCheck);
router.get("/verification-reminder", runVerificationReminderCheck);
router.get("/auto-receive", runAutoReceiveCheck);
router.get("/transfer-follow-up", runTransferFollowUpCheck);

export default router;