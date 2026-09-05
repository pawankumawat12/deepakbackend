const express = require("express");
const { handleRazorpayWebhook } = require("./webhook.controller");

const router = express.Router();

// Razorpay webhook endpoint: POST /api/v1/webhooks/razorpay (or /api/v1/webhook/razorpay)
router.post("/razorpay", handleRazorpayWebhook);
router.post("/", handleRazorpayWebhook);

module.exports = router;

