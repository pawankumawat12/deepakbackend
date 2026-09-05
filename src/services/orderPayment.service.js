const db = require("../../config/db");
const notificationModel = require("../models/notification.model");
const { incrementOfferUsage } = require("../models/offer.model");
const {
  emitToAdmin,
  emitToUser,
  emitToOrder,
} = require("../socket/socket.service");

/**
 * Helper to dispatch payment notifications and socket events safely.
 */
async function notifyPaymentSuccess(order, paymentId, source = "api") {
  try {
    const orderNumber = order.order_number || String(order.id);
    const amount = Number(order.total_amount || 0).toFixed(2);
    const viaText = source === "webhook" ? " (via Webhook)" : "";

    // 1. Admin In-App Notification
    await notificationModel.createNotification({
      role: "admin",
      type: "payment_success",
      title: `Payment Received: #${orderNumber}`,
      message: `Online payment of ₹${amount} received successfully for order #${orderNumber}${viaText}.`,
      orderId: order.id,
      dataJson: {
        orderId: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        totalAmount: order.total_amount,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        orderStatus: order.status,
        razorpayPaymentId: paymentId,
        source,
      },
    });

    // 2. Customer In-App Notification
    if (order.user_id) {
      await notificationModel.createNotification({
        userId: order.user_id,
        type: "order_status",
        title: `Payment Confirmed: #${orderNumber}`,
        message: `Your payment of ₹${amount} for order #${orderNumber} has been confirmed. The kitchen is preparing your order!`,
        orderId: order.id,
        dataJson: {
          orderId: order.id,
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          paymentStatus: order.payment_status,
          orderStatus: order.status,
          source,
        },
      });
    }

    // 3. Socket.IO Admin Events
    emitToAdmin("payment_success", {
      order,
      message: `Payment received for order #${orderNumber}`,
      source,
    });
    emitToAdmin("admin_order_updated", {
      order,
      message: `Order #${orderNumber} marked as Paid`,
    });

    // 4. Socket.IO Customer Private Events
    if (order.user_id) {
      emitToUser(order.user_id, "payment_status_updated", {
        orderId: order.id,
        orderNumber: order.order_number,
        paymentStatus: order.payment_status,
        orderStatus: order.status,
        order,
      });
      emitToUser(order.user_id, "order_status_updated", {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        order,
      });
    }

    // 5. Socket.IO Order Room Event
    emitToOrder(order.id, "payment_status_updated", {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: order.payment_status,
      orderStatus: order.status,
    });
  } catch (err) {
    console.error("[OrderPaymentService] notifyPaymentSuccess error:", err);
  }
}

/**
 * Finalize an online order payment safely with strict row-locking idempotency.
 * Can be called by either client verification endpoint or Razorpay webhook.
 *
 * @param {Object} params
 * @param {number|string} [params.orderId] - Local database order ID
 * @param {string} [params.razorpayOrderId] - Razorpay order ID (e.g. order_xxxx)
 * @param {string} params.razorpayPaymentId - Razorpay payment ID (e.g. pay_xxxx)
 * @param {string} [params.razorpaySignature] - Verification signature
 * @param {Object} [params.paymentDetails] - Raw details or metadata to record
 * @param {string} [params.source="api"] - 'api' | 'webhook'
 * @returns {Promise<{ order: Object, alreadyPaid: boolean }>}
 */
async function finalizePaidOrder({
  orderId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  paymentDetails = {},
  source = "api",
}) {
  const result = await db.transaction(async (trx) => {
    // 1. Find and lock the order row
    let query = trx("orders").forUpdate();
    if (orderId) {
      query = query.where({ id: orderId });
    } else if (razorpayOrderId) {
      query = query.where({ razorpay_order_id: razorpayOrderId });
    } else {
      const err = new Error("Missing order identifier to finalize payment.");
      err.statusCode = 400;
      throw err;
    }

    const currentOrder = await query.first();

    if (!currentOrder) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }

    // 2. IDEMPOTENCY CHECK: If already paid, exit early without duplicating stock/cart changes
    if (currentOrder.payment_status === "Paid") {
      return {
        order: currentOrder,
        alreadyPaid: true,
      };
    }

    // 3. Fetch order items with lock
    const orderItems = await trx("order_items")
      .where({ order_id: currentOrder.id })
      .forUpdate();

    // 4. Decrease stock for catalog items
    for (const item of orderItems) {
      if (item.availability_type === "MADE_TO_ORDER") {
        continue;
      }

      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) continue;

      const product = await trx("products")
        .where({ id: item.product_id })
        .forUpdate()
        .first();

      if (product) {
        const currentStock = Number(product.stock) || 0;
        await trx("products")
          .where({ id: item.product_id })
          .update({
            stock: Math.max(0, currentStock - quantity),
            updated_at: trx.fn.now(),
          });
      }
    }

    // 5. Increment offer usage if an offer code was used
    let pricing = currentOrder.pricing_details_json;
    if (typeof pricing === "string") {
      try {
        pricing = JSON.parse(pricing);
      } catch {
        pricing = null;
      }
    }

    if (pricing?.applied_offer?.id) {
      try {
        await incrementOfferUsage(pricing.applied_offer.id, trx);
      } catch (offerErr) {
        console.warn("[OrderPaymentService] Offer increment warning:", offerErr.message);
      }
    }

    // 6. Clear user cart
    if (currentOrder.user_id) {
      await trx("cart_items")
        .where({ user_id: currentOrder.user_id })
        .del();
    }

    // 7. Update order items production status
    for (const item of orderItems) {
      const isMadeToOrder = item.availability_type === "MADE_TO_ORDER";
      await trx("order_items")
        .where({ id: item.id })
        .update({
          production_status: isMadeToOrder
            ? "PENDING_PRODUCTION"
            : "COMPLETED",
          updated_at: trx.fn.now(),
        });
    }

    // 8. Prepare merged payment details
    let existingPaymentDetails = {};
    if (currentOrder.payment_details_json) {
      try {
        existingPaymentDetails =
          typeof currentOrder.payment_details_json === "string"
            ? JSON.parse(currentOrder.payment_details_json)
            : currentOrder.payment_details_json;
      } catch {}
    }

    const mergedDetails = {
      ...existingPaymentDetails,
      razorpay_order_id:
        razorpayOrderId || currentOrder.razorpay_order_id,
      razorpay_payment_id:
        razorpayPaymentId || currentOrder.razorpay_payment_id,
      razorpay_signature:
        razorpaySignature || currentOrder.razorpay_signature,
      verified_at: new Date().toISOString(),
      verified_via: source,
      ...(paymentDetails || {}),
    };

    // 9. Update order to Paid
    const [updatedOrder] = await trx("orders")
      .where({ id: currentOrder.id })
      .update({
        payment_status: "Paid",
        transaction_id: razorpayPaymentId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature:
          razorpaySignature || currentOrder.razorpay_signature,
        payment_details_json: JSON.stringify(mergedDetails),
        status: "Pending", // Ready for restaurant fulfillment
        updated_at: trx.fn.now(),
      })
      .returning("*");

    return {
      order: updatedOrder,
      alreadyPaid: false,
    };
  });

  // If newly finalized, trigger notifications & socket broadcasts
  if (!result.alreadyPaid) {
    await notifyPaymentSuccess(result.order, razorpayPaymentId, source);
  }

  return result;
}

/**
 * Handle a failed payment event from Razorpay.
 */
async function handlePaymentFailed({
  razorpayOrderId,
  razorpayPaymentId,
  errorDetails = {},
  notes = {},
}) {
  let query = db("orders");
  if (razorpayOrderId) {
    query = query.where({ razorpay_order_id: razorpayOrderId });
  } else if (notes?.local_order_id) {
    query = query.where({ id: notes.local_order_id });
  } else {
    return null;
  }

  const order = await query.first();
  if (!order) return null;

  // Never overwrite an already paid order with a failure event
  if (order.payment_status === "Paid") {
    return order;
  }

  let existingDetails = {};
  if (order.payment_details_json) {
    try {
      existingDetails =
        typeof order.payment_details_json === "string"
          ? JSON.parse(order.payment_details_json)
          : order.payment_details_json;
    } catch {}
  }

  const updatedDetails = {
    ...existingDetails,
    last_failure: {
      razorpay_payment_id: razorpayPaymentId,
      error: errorDetails,
      failed_at: new Date().toISOString(),
    },
  };

  const [updatedOrder] = await db("orders")
    .where({ id: order.id })
    .update({
      payment_status: "Failed",
      payment_details_json: JSON.stringify(updatedDetails),
      updated_at: db.fn.now(),
    })
    .returning("*");

  // Notifications & Sockets
  emitToAdmin("admin_order_updated", {
    order: updatedOrder,
    message: `Payment failed for order #${updatedOrder.order_number || updatedOrder.id}`,
    error: errorDetails,
  });

  if (updatedOrder.user_id) {
    emitToUser(updatedOrder.user_id, "payment_status_updated", {
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.order_number,
      paymentStatus: "Failed",
      error: errorDetails?.description || "Payment failed",
    });
  }

  return updatedOrder;
}

/**
 * Handle a processed refund event from Razorpay safely.
 */
async function handleRefundProcessed({
  razorpayPaymentId,
  razorpayOrderId,
  refundEntity = {},
  notes = {},
}) {
  let query = db("orders");
  if (razorpayPaymentId) {
    query = query
      .where({ transaction_id: razorpayPaymentId })
      .orWhere({ razorpay_payment_id: razorpayPaymentId });
  } else if (razorpayOrderId) {
    query = query.where({ razorpay_order_id: razorpayOrderId });
  } else if (notes?.local_order_id) {
    query = query.where({ id: notes.local_order_id });
  } else {
    return null;
  }

  const order = await query.first();
  if (!order) return null;

  // Idempotency: if already refunded, exit
  if (order.payment_status === "Refunded") {
    return order;
  }

  const txResult = await db.transaction(async (trx) => {
    const currentOrder = await trx("orders")
      .where({ id: order.id })
      .forUpdate()
      .first();

    if (!currentOrder || currentOrder.payment_status === "Refunded") {
      return { updatedOrder: currentOrder, refundAmount: 0, alreadyRefunded: true };
    }

    let existingDetails = {};
    if (currentOrder.payment_details_json) {
      try {
        existingDetails =
          typeof currentOrder.payment_details_json === "string"
            ? JSON.parse(currentOrder.payment_details_json)
            : currentOrder.payment_details_json;
      } catch {}
    }

    const refunds = Array.isArray(existingDetails.refunds)
      ? existingDetails.refunds
      : [];

    const refundAmount = refundEntity.amount
      ? Number(refundEntity.amount) / 100
      : Number(currentOrder.total_amount || 0);

    refunds.push({
      refund_id: refundEntity.id,
      amount: refundAmount,
      status: refundEntity.status || "processed",
      created_at: new Date().toISOString(),
      raw: refundEntity,
    });

    const updatedDetails = {
      ...existingDetails,
      refunds,
      last_refund: refundEntity,
    };

    const isFullRefund = refundAmount >= Number(currentOrder.total_amount || 0);

    // If order was not cancelled, and full refund is issued, restore stock if it was previously deducted
    if (isFullRefund && currentOrder.status !== "Cancelled") {
      const orderItems = await trx("order_items").where({
        order_id: currentOrder.id,
      });

      for (const item of orderItems) {
        if (item.availability_type !== "MADE_TO_ORDER") {
          const qty = Number(item.quantity) || 0;
          if (qty > 0) {
            await trx("products")
              .where({ id: item.product_id })
              .increment("stock", qty);
          }
        }
      }
    }

    const [updatedOrder] = await trx("orders")
      .where({ id: currentOrder.id })
      .update({
        payment_status: "Refunded",
        ...(isFullRefund && currentOrder.status !== "Cancelled"
          ? {
              status: "Cancelled",
              cancel_reason: "Full refund processed via Razorpay",
            }
          : {}),
        payment_details_json: JSON.stringify(updatedDetails),
        updated_at: trx.fn.now(),
      })
      .returning("*");

    return {
      updatedOrder,
      refundAmount,
    };
  });

  if (!txResult || !txResult.updatedOrder) {
    return null;
  }

  const { updatedOrder, refundAmount, alreadyRefunded } = txResult;

  if (alreadyRefunded) {
    return updatedOrder;
  }

  // Notifications & Socket Events outside transaction
  try {
    await notificationModel.createNotification({
      role: "admin",
      type: "order_status",
      title: `Refund Processed: #${updatedOrder.order_number || updatedOrder.id}`,
      message: `Refund of ₹${refundAmount.toFixed(2)} processed for order #${updatedOrder.order_number || updatedOrder.id}.`,
      orderId: updatedOrder.id,
      dataJson: {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        refundId: refundEntity.id,
        refundAmount,
        paymentStatus: "Refunded",
      },
    });

    if (updatedOrder.user_id) {
      await notificationModel.createNotification({
        userId: updatedOrder.user_id,
        type: "order_status",
        title: `Refund Processed: #${updatedOrder.order_number || updatedOrder.id}`,
        message: `Your refund of ₹${refundAmount.toFixed(2)} for order #${updatedOrder.order_number || updatedOrder.id} has been processed.`,
        orderId: updatedOrder.id,
      });

      emitToUser(updatedOrder.user_id, "payment_status_updated", {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        paymentStatus: "Refunded",
        orderStatus: updatedOrder.status,
        order: updatedOrder,
      });
    }

    emitToAdmin("admin_order_updated", {
      order: updatedOrder,
      message: `Refund of ₹${refundAmount.toFixed(2)} processed for order #${updatedOrder.order_number || updatedOrder.id}`,
    });
  } catch (notifyErr) {
    console.warn("[OrderPaymentService] Refund notification warning:", notifyErr.message);
  }

  return updatedOrder;
}

module.exports = {
  finalizePaidOrder,
  handlePaymentFailed,
  handleRefundProcessed,
  notifyPaymentSuccess,
};
