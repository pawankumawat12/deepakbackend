const {
  createOrderWithTransaction,
  findOrdersByUser,
  findOrderById,
  findAllOrders,
  updateOrderStatus,
  updateItemProductionStatus,
  cancelOrder,
  submitPaymentConfirmation,
  updateOrderPaymentStatus,
  acceptOrder,
  rejectOrder,
} = require("../../models/order.model");

const Address = require("../../models/address.model");
const notificationModel = require("../../models/notification.model");
const {
  emitToAdmin,
  emitToUser,
  emitToOrder,
} = require("../../socket/socket.service");

async function createOrder(req, res) {
  try {
    const userId = req.user.id;
    const {
      addressId,
      customerName: inputName,
      customerEmail = req.user.email || "",
      customerPhone: inputPhone,
      shippingAddress: inputShippingAddress,
      deliveryAddressJson: inputDeliveryJson,
      paymentMethod = "Cash on Delivery",
      paymentStatus,
      transactionId,
      paymentDetailsJson,
      notes = "",
    } = req.body || {};

    let finalShippingAddress = inputShippingAddress || "";
    let finalDeliveryJson = inputDeliveryJson || null;
    let finalCustomerName = inputName || req.user.name || "Customer";
    let finalCustomerPhone = inputPhone || req.user.phone || "";

    // 1. If addressId is provided, look up saved address
    if (addressId) {
      const savedAddress = await Address.getAddressById(addressId, userId);
      if (savedAddress && Number(savedAddress.user_id) === Number(userId)) {
        finalCustomerName = savedAddress.receiver_name || finalCustomerName;
        finalCustomerPhone = savedAddress.phone_number || finalCustomerPhone;

        const parts = [
          savedAddress.house_number,
          savedAddress.building_name,
          savedAddress.landmark ? `Near ${savedAddress.landmark}` : null,
          savedAddress.formatted_address || `${savedAddress.city}, ${savedAddress.state} - ${savedAddress.pincode}`,
        ].filter(Boolean);

        finalShippingAddress = parts.join(", ");
        finalDeliveryJson = savedAddress;
      }
    }

    // 2. Validate that address is present
    if (!finalShippingAddress && !finalDeliveryJson) {
      return res.status(400).json({
        success: false,
        message: "Please select or provide a delivery address before placing your order.",
      });
    }

    let parsedDeliveryJson = finalDeliveryJson;
    if (typeof parsedDeliveryJson === "string") {
      try {
        parsedDeliveryJson = JSON.parse(parsedDeliveryJson);
      } catch {}
    }

    const order = await createOrderWithTransaction({
      userId,
      customerName: finalCustomerName,
      customerEmail,
      customerPhone: finalCustomerPhone,
      shippingAddress: finalShippingAddress,
      deliveryAddressJson: parsedDeliveryJson,
      paymentMethod,
      paymentStatus,
      transactionId,
      paymentDetailsJson,
      notes,
    });

    const isOnline =
      paymentMethod.toLowerCase().includes("online") ||
      paymentMethod.toLowerCase().includes("upi");

    // Create Admin Notification in Database
    await notificationModel.createNotification({
      role: "admin",
      type: isOnline ? "payment_received" : "order_created",
      title: isOnline
        ? `New Online Payment Order: #${order.order_number || order.id}`
        : `New Order: #${order.order_number || order.id}`,
      message: `${finalCustomerName} placed an order worth ₹${order.total_amount} via ${paymentMethod}.`,
      orderId: order.id,
      dataJson: {
        orderId: order.id,
        orderNumber: order.order_number || `#SFC-${order.id}`,
        customerName: finalCustomerName,
        totalAmount: order.total_amount,
        paymentMethod,
        paymentStatus: order.payment_status,
        transactionId: order.transaction_id,
      },
    });

    // Real-time Socket.IO emission to admin
    emitToAdmin("admin_new_order", {
      order,
      isOnline,
      message: `New order #${order.order_number || order.id} from ${finalCustomerName}`,
    });

    if (isOnline && order.transaction_id) {
      emitToAdmin("admin_payment_received", {
        orderId: order.id,
        orderNumber: order.order_number || `#SFC-${order.id}`,
        customerName: finalCustomerName,
        amount: order.total_amount,
        transactionId: order.transaction_id,
        paymentStatus: order.payment_status,
      });
    }

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
    const order = await findOrderById(orderId);

    // Real-time notification to customer
    if (order && order.user_id) {
      await notificationModel.createNotification({
        userId: order.user_id,
        role: "customer",
        type: "order_status",
        title: `Order Status: ${status}`,
        message: `Your order #${order.order_number || order.id} is now ${status}.`,
        orderId: order.id,
        dataJson: { orderId: order.id, status },
      });

      emitToUser(order.user_id, "order_status_updated", {
        orderId: order.id,
        orderNumber: order.order_number || `#SFC-${order.id}`,
        status,
      });
    }

    emitToOrder(orderId, "order_status_updated", {
      orderId,
      status,
    });

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

async function acceptOrderController(req, res) {
  try {
    const orderId = Number(req.params.id);
    const { paymentStatus, notes } = req.body || {};

    const updated = await acceptOrder(orderId, { paymentStatus, notes });

    // Notify customer in real-time
    if (updated && updated.user_id) {
      await notificationModel.createNotification({
        userId: updated.user_id,
        role: "customer",
        type: "order_accepted",
        title: `Order Accepted! 🎉`,
        message: `Your order #${updated.order_number || updated.id} has been confirmed and is now being prepared in the kitchen.`,
        orderId: updated.id,
        dataJson: { orderId: updated.id, status: updated.status, paymentStatus: updated.payment_status },
      });

      emitToUser(updated.user_id, "order_accepted", {
        orderId: updated.id,
        orderNumber: updated.order_number || `#SFC-${updated.id}`,
        status: updated.status,
        paymentStatus: updated.payment_status,
      });

      emitToUser(updated.user_id, "order_status_updated", {
        orderId: updated.id,
        orderNumber: updated.order_number || `#SFC-${updated.id}`,
        status: updated.status,
      });
    }

    emitToOrder(orderId, "order_status_updated", {
      orderId,
      status: updated.status,
      paymentStatus: updated.payment_status,
    });

    emitToAdmin("admin_order_updated", {
      order: updated,
    });

    return res.status(200).json({
      success: true,
      message: "Order accepted successfully and kitchen preparation started",
      data: updated,
    });
  } catch (error) {
    console.error("Accept order error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to accept order",
    });
  }
}

async function rejectOrderController(req, res) {
  try {
    const orderId = Number(req.params.id);
    const { cancelReason = "Order rejected by store" } = req.body || {};

    const updated = await rejectOrder(orderId, { cancelReason });

    // Notify customer in real-time
    if (updated && updated.user_id) {
      await notificationModel.createNotification({
        userId: updated.user_id,
        role: "customer",
        type: "order_rejected",
        title: `Order Declined ⚠️`,
        message: `Your order #${updated.order_number || updated.id} could not be accepted. Reason: ${cancelReason}`,
        orderId: updated.id,
        dataJson: { orderId: updated.id, status: "Cancelled", cancelReason },
      });

      emitToUser(updated.user_id, "order_rejected", {
        orderId: updated.id,
        orderNumber: updated.order_number || `#SFC-${updated.id}`,
        status: "Cancelled",
        cancelReason,
      });

      emitToUser(updated.user_id, "order_status_updated", {
        orderId: updated.id,
        orderNumber: updated.order_number || `#SFC-${updated.id}`,
        status: "Cancelled",
      });
    }

    emitToOrder(orderId, "order_status_updated", {
      orderId,
      status: "Cancelled",
      cancelReason,
    });

    emitToAdmin("admin_order_updated", {
      order: updated,
    });

    return res.status(200).json({
      success: true,
      message: "Order rejected and inventory restored",
      data: updated,
    });
  } catch (error) {
    console.error("Reject order error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reject order",
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

    const updated = await cancelOrder(orderId, cancelReason);

    // Notify Admin
    await notificationModel.createNotification({
      role: "admin",
      type: "order_status",
      title: `Order Cancelled by Customer: #${updated.order_number || updated.id}`,
      message: `Customer cancelled order. Reason: ${cancelReason}`,
      orderId: updated.id,
      dataJson: { orderId: updated.id, cancelReason },
    });

    emitToAdmin("admin_order_cancelled", {
      orderId: updated.id,
      orderNumber: updated.order_number || `#SFC-${updated.id}`,
      cancelReason,
    });

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

async function confirmPayment(req, res) {
  try {
    const orderId = Number(req.params.id);
    const userId = req.user.id;
    const { transactionId, paymentDetails } = req.body || {};
    let paymentApp =
      req.body?.paymentApp ||
      paymentDetails?.app ||
      paymentDetails?.paymentApp ||
      "UPI App";

    const updatedOrder = await submitPaymentConfirmation(orderId, userId, {
      transactionId: transactionId ? String(transactionId).trim() : undefined,
      paymentApp: String(paymentApp).trim(),
      paymentDetails,
    });

    // Notify Admin about submitted payment proof
    await notificationModel.createNotification({
      role: "admin",
      type: "payment_received",
      title: `Payment Proof Submitted: #${updatedOrder.order_number || updatedOrder.id}`,
      message: `UTR: ${updatedOrder.transaction_id || "N/A"} via ${paymentApp || "UPI"} for ₹${updatedOrder.total_amount}.`,
      orderId: updatedOrder.id,
      dataJson: {
        orderId: updatedOrder.id,
        transactionId: updatedOrder.transaction_id,
        paymentApp,
        totalAmount: updatedOrder.total_amount,
      },
    });

    emitToAdmin("admin_payment_received", {
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.order_number || `#SFC-${updatedOrder.id}`,
      customerName: updatedOrder.customer_name,
      amount: updatedOrder.total_amount,
      transactionId: updatedOrder.transaction_id,
      paymentApp,
      paymentStatus: updatedOrder.payment_status,
    });

    return res.status(200).json({
      success: true,
      message: "Payment confirmation submitted successfully. We are verifying your payment.",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("Confirm payment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to confirm payment",
    });
  }
}

async function updatePaymentStatusController(req, res) {
  try {
    const orderId = Number(req.params.id);
    const { paymentStatus } = req.body;

    const allowed = ["Pending", "Pending Verification", "Paid", "Failed", "Refunded"];
    if (!paymentStatus || !allowed.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status. Allowed: ${allowed.join(", ")}`,
      });
    }

    const updated = await updateOrderPaymentStatus(orderId, paymentStatus);
    const order = await findOrderById(orderId);

    // Notify Customer in real-time
    if (order && order.user_id) {
      await notificationModel.createNotification({
        userId: order.user_id,
        role: "customer",
        type: "payment_status",
        title: `Payment Status: ${paymentStatus}`,
        message: `Payment status for Order #${order.order_number || order.id} is now ${paymentStatus}.`,
        orderId: order.id,
        dataJson: { orderId: order.id, paymentStatus },
      });

      emitToUser(order.user_id, "payment_status_updated", {
        orderId: order.id,
        orderNumber: order.order_number || `#SFC-${order.id}`,
        paymentStatus,
      });
    }

    emitToOrder(orderId, "payment_status_updated", {
      orderId,
      paymentStatus,
    });

    emitToAdmin("admin_order_updated", {
      order: updated,
    });

    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update payment status error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update payment status",
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
  confirmPayment,
  updatePaymentStatusController,
  acceptOrderController,
  rejectOrderController,
};
