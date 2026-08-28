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
  confirmPayment,
  updatePaymentStatusController,
  acceptOrderController,
  rejectOrderController,
} = require("./order.controller");

const router = express.Router();

// Authenticated customer routes
router.use(verifyToken);
router.post("/", createOrder);
router.get("/", getUserOrders);
router.get("/:id", getOrderDetails);
router.post("/:id/cancel", cancelUserOrder);
router.post("/:id/payment-confirm", confirmPayment);

// Admin order management routes
router.get("/admin/all", isAdmin, getAdminOrders);
router.patch("/:id/status", isAdmin, updateStatus);
router.post("/:id/accept", isAdmin, acceptOrderController);
router.post("/:id/reject", isAdmin, rejectOrderController);
router.patch("/:id/payment-status", isAdmin, updatePaymentStatusController);
router.patch("/items/:itemId/produced", isAdmin, markItemProduced);

module.exports = router;

