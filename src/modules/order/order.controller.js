const {
  createOrderWithTransaction,
  findOrdersByUser,
  findOrderById,
  findAllOrders,
  updateOrderStatus,
  updateItemProductionStatus,
} = require("../../models/order.model");

async function createOrder(req, res) {
  try {
    const userId = req.user.id;
    const {
      customerName = req.user.name || "Customer",
      customerEmail = req.user.email || "",
      customerPhone = "",
      shippingAddress = "Jaipur, Rajasthan",
      deliveryAddressJson = null,
      paymentMethod = "Cash on Delivery",
      notes = "",
    } = req.body || {};

    const order = await createOrderWithTransaction({
      userId,
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress,
      deliveryAddressJson,
      paymentMethod,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: order,
    });
  } catch (error) {
    console.error("Create order error:", error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to place order",
    });
  }
}

async function getUserOrders(req, res) {
  try {
    const orders = await findOrdersByUser(req.user.id);
    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
    });
  } catch (error) {
    console.error("Get user orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
}

async function getOrderDetails(req, res) {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await findOrderById(orderId, req.user.role === "admin" ? null : req.user.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order details fetched successfully",
      data: order,
    });
  } catch (error) {
    console.error("Get order details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
    });
  }
}

async function getAdminOrders(req, res) {
  try {
    const { page, limit, status, search } = req.query;
    const result = await findAllOrders({ page, limit, status, search });
    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: result.orders,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Admin get orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
}

async function updateStatus(req, res) {
  try {
    const orderId = Number(req.params.id);
    const { status } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({
        success: false,
        message: "order ID and status are required",
      });
    }

    const updated = await updateOrderStatus(orderId, status);
    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update order status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
}

async function markItemProduced(req, res) {
  try {
    const itemId = Number(req.params.itemId);
    const { productionStatus = "PRODUCED" } = req.body;
    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    const updated = await updateItemProductionStatus(itemId, productionStatus);
    return res.status(200).json({
      success: true,
      message: "Item production status updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Mark item produced error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update production status",
    });
  }
}

async function cancelUserOrder(req, res) {
  try {
    const orderId = Number(req.params.id);
    const { cancelReason } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    if (!cancelReason) {
      return res.status(400).json({ success: false, message: "Cancel reason is required" });
    }

    const { cancelOrder } = require("../../models/order.model");
    const updated = await cancelOrder(orderId, cancelReason);

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel order",
    });
  }
}

module.exports = {
  createOrder,
  getUserOrders,
  getOrderDetails,
  getAdminOrders,
  updateStatus,
  markItemProduced,
  cancelUserOrder,
};

