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
} = require("./order.controller");

const router = express.Router();

// Authenticated customer routes
router.use(verifyToken);
router.post("/", createOrder);
router.get("/", getUserOrders);
router.get("/:id", getOrderDetails);
router.post("/:id/cancel", cancelUserOrder);

// Admin order management routes
router.get("/admin/all", isAdmin, getAdminOrders);
router.patch("/:id/status", isAdmin, updateStatus);
router.patch("/items/:itemId/produced", isAdmin, markItemProduced);

module.exports = router;

