const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const {
  createOrder,
  getUserOrders,
  getOrderDetails,
  getAdminOrders,
  updateStatus,
  markItemProduced,
  cancelUserOrder,
  updatePaymentStatusController,
  refundOrderController,
  acceptOrderController,
  rejectOrderController,
  verifyRazorpayPayment,
  retryPaymentController,
  bulkUpdateOrderStatusHandler,
  exportOrdersHandler,
  downloadInvoiceHandler,
} = require("./order.controller");
const { handleRazorpayWebhook } = require("../webhook/webhook.controller");
const { orderCreateLimiter } = require("../../../middleware/rateLimiter");
const idempotencyMiddleware = require("../../../middleware/idempotency.middleware");

const router = express.Router();

// Public webhook endpoint for Razorpay payment notifications
router.post("/webhook/razorpay", handleRazorpayWebhook);

// Authenticated customer & admin routes
router.use(verifyToken);
router.get("/export", isAdmin, exportOrdersHandler);
router.post("/bulk-status", isAdmin, bulkUpdateOrderStatusHandler);
router.post("/", orderCreateLimiter, idempotencyMiddleware, createOrder);
router.post("/verify-payment", verifyRazorpayPayment);
router.post("/:id/retry-payment", retryPaymentController);
router.get("/:id/invoice", downloadInvoiceHandler);
router.get("/", getUserOrders);
router.get("/:id", getOrderDetails);
router.post("/:id/cancel", cancelUserOrder);

// Admin order management routes
router.get("/admin/all", isAdmin, getAdminOrders);
router.patch("/:id/status", isAdmin, updateStatus);
router.post("/:id/accept", isAdmin, acceptOrderController);
router.post("/:id/reject", isAdmin, rejectOrderController);
router.patch("/:id/payment-status", isAdmin, updatePaymentStatusController);
router.post("/:id/refund", isAdmin, refundOrderController);
router.patch("/items/:itemId/produced", isAdmin, markItemProduced);

module.exports = router;

