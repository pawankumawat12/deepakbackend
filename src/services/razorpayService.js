const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const crypto = require("crypto");

const createRazorpayOrder = async ({
  amount,
  receipt,
  notes = {},
}) => {
  const options = {
    amount: Math.round(Number(amount) * 100),
    currency: "INR",
    receipt,
    notes,
  };

  return await razorpay.orders.create(options);
};

/**
 * Verify Razorpay Webhook signature securely using HMAC SHA-256 and timingSafeEqual.
 *
 * @param {Buffer|string} rawBody - Raw unparsed HTTP request body
 * @param {string} signature - Header value from 'x-razorpay-signature'
 * @param {string} [secret] - Webhook secret (defaults to env RAZORPAY_WEBHOOK_SECRET or RAZORPAY_KEY_SECRET)
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signature, secret) => {
  try {
    const webhookSecret =
      secret ||
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      process.env.RAZORPAY_KEY_SECRET;

    if (!rawBody || !signature || !webhookSecret) {
      return false;
    }

    const payloadStr = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : typeof rawBody === "string"
      ? rawBody
      : JSON.stringify(rawBody);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payloadStr)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const signatureBuffer = Buffer.from(String(signature).trim(), "utf8");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    console.error("[Razorpay Webhook Signature Verification Error]:", err);
    return false;
  }
};

module.exports = {
  razorpay,
  createRazorpayOrder,
  verifyWebhookSignature,
};