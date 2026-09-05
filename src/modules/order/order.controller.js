const {
  createOrderWithTransaction,
  findOrdersByUser,
  findOrderById,
  findAllOrders,
  updateOrderStatus,
  updateItemProductionStatus,
  cancelOrder,
  updateOrderPaymentStatus,
  acceptOrder,
  rejectOrder,
} = require("../../models/order.model");
const Crypto = require("crypto");

const Address = require("../../models/address.model");
const notificationModel = require("../../models/notification.model");
const {
  emitToAdmin,
  emitToUser,
  emitToOrder,
} = require("../../socket/socket.service");
const { createRazorpayOrder } = require("../../services/razorpayService");
const { finalizePaidOrder } = require("../../services/orderPayment.service");
const db = require("../../../config/db");
const { incrementOfferUsage } = require("../../models/offer.model");

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

      notes = "",
      special_instructions = "",

      paymentMethod = "Cash on Delivery",

      offerCode,
    } = req.body || {};

    const finalNotes = (
      notes ||
      special_instructions ||
      req.body?.order_notes ||
      req.body?.note ||
      ""
    ).trim();

    // 1. VALIDATE PAYMENT METHOD
    const allowedPaymentMethods = [
      "Cash on Delivery",
      "Online Payment",
    ];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method.",
      });
    }

    // 2. INITIAL CUSTOMER / ADDRESS DATA
    let finalShippingAddress =
      inputShippingAddress || "";

    let finalDeliveryJson =
      inputDeliveryJson || null;

    let finalCustomerName =
      inputName ||
      req.user.name ||
      "Customer";

    let finalCustomerPhone =
      inputPhone ||
      req.user.phone ||
      "";

    // 3. GET SAVED ADDRESS
    if (addressId) {
      const savedAddress =
        await Address.getAddressById(
          addressId,
          userId
        );

      if (
        savedAddress &&
        Number(savedAddress.user_id) === Number(userId)
      ) {
        finalCustomerName =
          savedAddress.receiver_name ||
          finalCustomerName;

        finalCustomerPhone =
          savedAddress.phone_number ||
          finalCustomerPhone;

        const parts = [
          savedAddress.house_number,

          savedAddress.building_name,

          savedAddress.floor
            ? `Floor ${savedAddress.floor}`
            : null,

          savedAddress.landmark
            ? `Near ${savedAddress.landmark}`
            : null,

          savedAddress.formatted_address ||
          `${savedAddress.city}, ${savedAddress.state} - ${savedAddress.pincode}`,
        ].filter(Boolean);

        finalShippingAddress =
          parts.join(", ");

        // IMPORTANT:
        // Save complete address snapshot in order
        finalDeliveryJson =
          savedAddress;
      }
    }

    // 4. VALIDATE DELIVERY ADDRESS
    if (
      !finalShippingAddress &&
      !finalDeliveryJson
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please select or provide a delivery address before placing your order.",
      });
    }

    // 5. PARSE DELIVERY JSON
    let parsedDeliveryJson =
      finalDeliveryJson;

    if (
      typeof parsedDeliveryJson === "string"
    ) {
      try {
        parsedDeliveryJson =
          JSON.parse(parsedDeliveryJson);
      } catch {
        return res.status(400).json({
          success: false,
          message:
            "Invalid delivery address data.",
        });
      }
    }

    // 6. PAYMENT STATUS
    // New order always starts Pending.
    // Pending -> admin can mark Paid when cash collected
    // Online:
    // Pending -> Razorpay verification -> Paid

    const initialPaymentStatus =
      "Pending";

    // 7. CREATE LOCAL ORDER
    const order =
      await createOrderWithTransaction({
        userId,

        customerName:
          finalCustomerName,

        customerEmail,

        customerPhone:
          finalCustomerPhone,

        shippingAddress:
          finalShippingAddress,

        deliveryAddressJson:
          parsedDeliveryJson,

        paymentMethod,

        paymentStatus:
          initialPaymentStatus,

        transactionId:
          null,

        paymentDetailsJson:
          null,

        notes: finalNotes,

        offerCode:
          offerCode ||
          req.body?.couponCode ||
          null,

        // COD:
        // finalize immediately
        //
        // ONLINE:
        // don't decrease stock
        // don't clear cart
        // don't increment offer usage
        //
        finalizeOrder:
          paymentMethod ===
          "Cash on Delivery",
      });

    // 8. CREATE RAZORPAY ORDER FOR ONLINE PAYMENT

    let razorpayOrder = null;

    if (
      paymentMethod ===
      "Online Payment"
    ) {
      try {
        razorpayOrder =
          await createRazorpayOrder({
            amount:
              Number(order.total_amount),

            receipt:
              order.order_number,

            notes: {
              local_order_id:
                String(order.id),

              order_number:
                order.order_number,

              user_id:
                String(userId),
            },
          });

        // SAVE RAZORPAY ORDER ID
        const [updatedOrder] =
          await db("orders")
            .where({
              id: order.id,
            })
            .update({
              razorpay_order_id:
                razorpayOrder.id,

              updated_at:
                db.fn.now(),
            })
            .returning("*");

        if (updatedOrder) {
          Object.assign(
            order,
            updatedOrder
          );
        } else {
          order.razorpay_order_id =
            razorpayOrder.id;
        }
      } catch (razorpayError) {
        console.error(
          "Razorpay order creation error:",
          razorpayError
        );

        // Razorpay order create fail ho gaya,
        // local order ko failed/cancelled state
        // mein update karo.

        await db("orders")
          .where({
            id: order.id,
          })
          .update({
            status: "Payment Failed",

            payment_status: "Failed",

            payment_details_json: JSON.stringify({
              error:
                razorpayError.message,

              stage:
                "RAZORPAY_ORDER_CREATION",

              failed_at:
                new Date().toISOString(),
            }),

            updated_at:
              db.fn.now(),
          });

        return res.status(500).json({
          success: false,
          message:
            "Unable to initialize online payment. Please try again.",
        });
      }
    }

    // 9. ADMIN NOTIFICATION
    await notificationModel.createNotification({
      role: "admin",

      type: "order_created",

      title:
        `New ${paymentMethod} Order: #${order.order_number || order.id
        }`,

      message:
        `${finalCustomerName} placed a ${paymentMethod} order worth ₹${order.total_amount}.`,

      orderId:
        order.id,

      dataJson: {
        orderId:
          order.id,

        orderNumber:
          order.order_number ||
          `#SFC-${order.id}`,

        customerName:
          finalCustomerName,

        totalAmount:
          order.total_amount,

        paymentMethod,

        paymentStatus:
          order.payment_status,

        orderStatus:
          order.status,
      },
    });

    // 10. SOCKET.IO ADMIN EVENT

    emitToAdmin(
      "admin_new_order",
      {
        order,

        message:
          `New ${paymentMethod} order #${order.order_number ||
          order.id
          } from ${finalCustomerName}`,
      }
    );

    // 11. RESPONSE

    return res.status(201).json({
      success: true,

      message:
        paymentMethod ===
          "Online Payment"
          ? "Order created. Proceed to payment."
          : "Order placed successfully",

      data: {
        ...order,

        // RAZORPAY DATA
        razorpayOrderId:
          razorpayOrder?.id ||
          null,

        razorpayKeyId:
          paymentMethod ===
            "Online Payment"
            ? process.env
              .RAZORPAY_KEY_ID
            : null,

        paymentAmount:
          paymentMethod ===
            "Online Payment"
            ? Number(
              order.total_amount
            )
            : null,

        paymentCurrency:
          paymentMethod ===
            "Online Payment"
            ? "INR"
            : null,
      },
    });
  } catch (error) {
    console.error(
      "Create order error:",
      error
    );

    const status =
      error.statusCode || 500;

    return res.status(status).json({
      success: false,

      message:
        error.message ||
        "Failed to place order",
    });
  }
}


// verify the razor pay
async function verifyRazorpayPayment(req, res) {
  try {
    const userId = req.user.id;

    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    // 1. VALIDATE REQUEST
    if (
      !orderId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification data is incomplete.",
      });
    }

    // 2. FIND LOCAL ORDER
    const order = await db("orders")
      .where({
        id: orderId,
        user_id: userId,
      })
      .first();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // 3. MAKE SURE THIS IS ONLINE PAYMENT
    if (order.payment_method !== "Online Payment") {
      return res.status(400).json({
        success: false,
        message: "This order is not an online payment order.",
      });
    }

    // 4. CHECK RAZORPAY ORDER ID
    if (
      order.razorpay_order_id &&
      order.razorpay_order_id !== razorpay_order_id
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid Razorpay order ID.",
      });
    }

    // 5. ALREADY PAID CHECK
    if (order.payment_status === "Paid") {
      return res.status(200).json({
        success: true,
        message: "Payment is already verified.",
        data: {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentStatus: order.payment_status,
          orderStatus: order.status,
        },
      });
    }

    // 6. VERIFY RAZORPAY SIGNATURE
    const generatedSignature = Crypto.createHmac(
      "sha256",
      process.env.RAZORPAY_KEY_SECRET
    )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    if (
      generatedSignature !==
      razorpay_signature
    ) {
      console.error(
        "Invalid Razorpay signature",
        {
          orderId,
          razorpay_order_id,
          razorpay_payment_id,
        }
      );

      return res.status(400).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    // 7. FINALIZE PAYMENT SAFELY & IDEMPOTENTLY
    const { order: finalOrder, alreadyPaid } = await finalizePaidOrder({
      orderId: order.id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      source: "api",
    });

    return res.status(200).json({
      success: true,
      message: alreadyPaid
        ? "Payment is already verified."
        : "Payment verified successfully.",
      data: {
        orderId: finalOrder.id,
        orderNumber: finalOrder.order_number,
        paymentStatus: finalOrder.payment_status,
        orderStatus: finalOrder.status,
        transactionId: finalOrder.transaction_id,
        totalAmount: finalOrder.total_amount,
      },
    });
  } catch (error) {
    console.error(
      "Razorpay payment verification error:",
      error
    );

    const status =
      error.statusCode || 500;

    return res.status(status).json({
      success: false,

      message:
        error.message ||
        "Payment verification failed.",
    });
  }
}
async function getUserOrders(req, res) {
  try {
    const { page, limit, status } = req.query || {};
    const result = await findOrdersByUser(req.user.id, { page, limit, status });
    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: result.orders,
      pagination: result.pagination,
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
    const { notes } = req.body || {};

    const updated = await acceptOrder(orderId, { notes });

    // Notify customer in real-time
    if (updated && updated.user_id) {
      await notificationModel.createNotification({
        userId: updated.user_id,
        role: "customer",
        type: "order_accepted",
        title: "Order Accepted",
        message: `Your order #${updated.order_number || updated.id} has been accepted and is being prepared.`,
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

async function updatePaymentStatusController(req, res) {
  try {
    const orderId = Number(req.params.id);
    const { paymentStatus } = req.body;

    const allowed = ["Pending", "Paid", "Failed", "Refunded"];
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
  updatePaymentStatusController,
  acceptOrderController,
  rejectOrderController,
  verifyRazorpayPayment
};
