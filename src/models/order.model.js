const db = require("../../config/db");
const { calculateCartAndOrderPricing, roundCurrency } = require("../utils/pricing.util");

function generateOrderNumber() {
  const timestamp = Date.now().toString().slice(-5);
  const random = Math.floor(100 + Math.random() * 900);
  return `SFC-${timestamp}${random}`;
}

//order transaction create
async function createOrderWithTransaction({
  userId,
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  deliveryAddressJson,
  paymentMethod = "Cash on Delivery",
  paymentStatus = "Pending",
  transactionId = null,
  paymentDetailsJson = null,
  notes = "",
  offerCode = null,
  finalizeOrder = true,
}) {
  return await db.transaction(async (trx) => {
    const rawCartItems = await trx("cart_items")
      .select([
        "cart_items.id as cart_item_id",
        "cart_items.product_id",
        "cart_items.quantity",
        "products.name",
        "products.price",
        "products.stock",
        "products.availability_type",
        "products.images",
        "products.is_active",
        "products.category_id",
      ])
      .join("products", "cart_items.product_id", "products.id")
      .where("cart_items.user_id", userId)
      .forUpdate();

    if (!rawCartItems || rawCartItems.length === 0) {
      const err = new Error("Your cart is empty");
      err.statusCode = 400;
      throw err;
    }

    // 2. CALCULATE PRICING AND BOGO ALLOCATION ON BACKEND
    const pricing = await calculateCartAndOrderPricing({
      items: rawCartItems,
      deliveryAddress: deliveryAddressJson,
      paymentMethod,
      offerCode,
    });

    const enrichedItems = pricing.items || rawCartItems;

    // 3. VALIDATE PRODUCT AVAILABILITY + STOCK (AGAINST TOTAL DELIVERED QUANTITY)
    for (const item of enrichedItems) {
      if (!item.is_active) {
        const err = new Error(
          `Item "${item.name}" is currently unavailable. Please remove it from your cart.`
        );
        err.statusCode = 400;
        throw err;
      }

      const requiredStock = item.total_quantity || item.quantity;
      // MADE_TO_ORDER does not require stock
      if (
        item.availability_type !== "MADE_TO_ORDER" &&
        Number(item.stock) < Number(requiredStock)
      ) {
        const err = new Error(
          `Item "${item.name}" only has ${item.stock} in stock. Cannot fulfill ${requiredStock} item(s) (including free promotional items). Please adjust quantity.`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    // 4. MINIMUM ORDER VALIDATION
    if (pricing.is_below_minimum_order) {
      const err = new Error(
        `Minimum order amount is ₹${pricing.minimum_order_amount}. Please add items worth ₹${pricing.minimum_order_shortfall} more to proceed.`
      );

      err.statusCode = 400;
      throw err;
    }

    // 5. DELIVERY RANGE VALIDATION
    if (pricing.is_out_of_range) {
      const err = new Error(
        `Your delivery address is ${pricing.distance_km} km away, which exceeds our maximum delivery radius of ${pricing.max_delivery_distance} km.`
      );

      err.statusCode = 400;
      throw err;
    }

    // 6. GENERATE ORDER NUMBER
    const orderNumber = generateOrderNumber();

    // 7. CREATE LOCAL ORDER
    const [order] = await trx("orders")
      .insert({
        order_number: orderNumber,

        user_id: userId,

        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,

        shipping_address: shippingAddress,
        delivery_address_json: deliveryAddressJson,

        // Pricing snapshot
        subtotal: roundCurrency(pricing.subtotal),
        delivery_fee: roundCurrency(pricing.delivery_fee),
        discount: roundCurrency(pricing.discount),
        tax_amount: roundCurrency(pricing.tax_amount),
        packaging_fee: roundCurrency(pricing.packaging_fee),
        platform_fee: roundCurrency(pricing.platform_fee),
        cod_fee: roundCurrency(pricing.cod_fee),

        distance_km: pricing.distance_km || 0,

        tax_inclusive: pricing.tax_inclusive,

        total_amount: roundCurrency(pricing.grand_total),

        // Store complete pricing calculation at order time
        pricing_details_json: pricing,

        // Initial status is Pending (or Pending Payment for unverified online payment).
        // Only transitions to Preparing when admin accepts the order.
        status:
          paymentMethod === "Online Payment" && paymentStatus !== "Paid"
            ? "Pending Payment"
            : "Pending",

        // Payment information
        payment_method: paymentMethod,

        payment_status: paymentStatus || "Pending",

        transaction_id: transactionId || null,

        payment_details_json: paymentDetailsJson || null,

        notes: notes || "",

        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning("*");

    // 8. CREATE ORDER ITEMS WITH BOGO BREAKDOWN
    const orderItemsToInsert = [];

    for (const item of enrichedItems) {
      const price = roundCurrency(item.price);
      const paidQuantity =
        item.paid_quantity != null
          ? Number(item.paid_quantity)
          : Number(item.quantity) || 1;
      const freeQuantity =
        item.free_quantity != null ? Number(item.free_quantity) : 0;
      const totalQuantity =
        item.total_quantity != null
          ? Number(item.total_quantity)
          : paidQuantity + freeQuantity;

      // Customer is charged ONLY for the BUY / paid quantity
      const itemTotal =
        item.itemTotal != null
          ? roundCurrency(item.itemTotal)
          : roundCurrency(price * paidQuantity);

      const isMadeToOrder =
        item.availability_type === "MADE_TO_ORDER";

      // Parse product images
      let images = [];

      try {
        images =
          typeof item.images === "string"
            ? JSON.parse(item.images)
            : item.images;
      } catch {
        images = [];
      }

      const image =
        Array.isArray(images) && images.length > 0
          ? images[0]
          : null;

      // STOCK DECREASE
      // Deducts total quantity physically leaving inventory (paid + free)
      // Only finalize stock when order is actually finalized (e.g. COD or after online payment).
      if (finalizeOrder && !isMadeToOrder) {
        const quantityToRemove = totalQuantity;

        const updatedRows = await trx("products")
          .where("id", item.product_id)
          .where("stock", ">=", quantityToRemove)
          .update({
            stock: trx.raw("stock - ?", [quantityToRemove]),
            updated_at: trx.fn.now(),
          });

        if (updatedRows === 0) {
          const err = new Error(
            `Item "${item.name}" is no longer available in the requested quantity (${quantityToRemove} items).`
          );

          err.statusCode = 400;
          throw err;
        }
      }

      // ORDER ITEM ROW
      orderItemsToInsert.push({
        order_id: order.id,

        product_id: item.product_id,

        product_name: item.name,

        price,

        quantity: totalQuantity, // Total items fulfilled / delivered

        paid_quantity: paidQuantity, // Items billed to customer

        free_quantity: freeQuantity, // Promotional free items

        bogo_details_json: item.bogo_details
          ? JSON.stringify(item.bogo_details)
          : null,

        total: itemTotal, // Charged amount (paid_quantity * price)

        availability_type:
          item.availability_type || "IN_STOCK",

        production_status: isMadeToOrder
          ? "PENDING_PRODUCTION"
          : finalizeOrder
            ? "COMPLETED"
            : "PENDING",

        image,

        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    }

    // Safely check if order_items has paid_quantity column
    try {
      const hasPaidQtyCol = await trx.schema.hasColumn(
        "order_items",
        "paid_quantity"
      );
      if (!hasPaidQtyCol) {
        for (const row of orderItemsToInsert) {
          delete row.paid_quantity;
          delete row.free_quantity;
          delete row.bogo_details_json;
        }
      }
    } catch {}

    // 9. INSERT ORDER ITEMS
    const insertedItems = await trx("order_items")
      .insert(orderItemsToInsert)
      .returning("*");

    // 10. OFFER USAGE
    // Only count offer usage when order is actually finalized.
    //
    // For online payment:
    // offer usage should happen after successful payment.
    //

    if (
      finalizeOrder &&
      pricing.applied_offer?.id
    ) {
      const { incrementOfferUsage } = require("./offer.model");

      await incrementOfferUsage(
        pricing.applied_offer.id,
        trx
      );
    }

    // 11. CLEAR CART
    // COD -> clear immediately

    if (finalizeOrder) {
      await trx("cart_items")
        .where({ user_id: userId })
        .del();

      // Deduct raw ingredients inventory if product recipes exist
      try {
        const { deductIngredientStockForOrder } = require("../services/inventory.service");
        await deductIngredientStockForOrder(order.id, trx);
      } catch (ingErr) {
        console.warn("[OrderModel] Warning during ingredient stock deduction:", ingErr.message);
      }
    }

    // 12. RETURN ORDER
    return {
      ...order,
      items: insertedItems,
    };
  });
}


/**
 * Calculate chat expiry and status for an order.
 * Rule: Chat expires 20 minutes after the order is delivered/completed.
 * Returns: { isExpired: boolean, canChat: boolean, expiresAt: string | null, remainingMinutes: number | null }
 */
function getOrderChatStatus(order) {
  if (!order) {
    return {
      isExpired: false,
      canChat: false,
      expiresAt: null,
      remainingMinutes: null,
    };
  }

  const status = String(order.status || "").toLowerCase();
  const isDeliveredOrCompleted = status === "delivered" || status === "completed";

  if (!isDeliveredOrCompleted) {
    return {
      isExpired: false,
      canChat: true,
      expiresAt: null,
      remainingMinutes: null,
    };
  }

  const deliveredTime = order.delivered_at
    ? new Date(order.delivered_at).getTime()
    : order.updated_at
    ? new Date(order.updated_at).getTime()
    : null;

  if (!deliveredTime || isNaN(deliveredTime)) {
    return {
      isExpired: false,
      canChat: true,
      expiresAt: null,
      remainingMinutes: null,
    };
  }

  const CHAT_EXPIRY_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
  const expiresAtMs = deliveredTime + CHAT_EXPIRY_WINDOW_MS;
  const nowMs = Date.now();
  const isExpired = nowMs >= expiresAtMs;
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const remainingMinutes = isExpired ? 0 : Math.ceil(remainingMs / 60000);

  return {
    isExpired,
    canChat: !isExpired,
    expiresAt: new Date(expiresAtMs).toISOString(),
    remainingMinutes,
  };
}

function formatOrderRow(order) {
  if (!order) return null;
  let deliveryAddressJson = order.delivery_address_json;
  if (typeof deliveryAddressJson === "string") {
    try {
      deliveryAddressJson = JSON.parse(deliveryAddressJson);
    } catch {}
  }
  let pricingDetailsJson = order.pricing_details_json;
  if (typeof pricingDetailsJson === "string") {
    try {
      pricingDetailsJson = JSON.parse(pricingDetailsJson);
    } catch {}
  }
  let paymentDetailsJson = order.payment_details_json;
  if (typeof paymentDetailsJson === "string") {
    try {
      paymentDetailsJson = JSON.parse(paymentDetailsJson);
    } catch {}
  }
  const chatStatus = getOrderChatStatus(order);

  return {
    ...order,
    delivery_address_json: deliveryAddressJson,
    pricing_details_json: pricingDetailsJson,
    payment_details_json: paymentDetailsJson,
    chat_status: chatStatus,
    chatStatus,
  };
}

async function findOrdersByUser(userId, { page = 1, limit = 10, status = null } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(100, Number(limit) || 10));
  const offset = (p - 1) * l;

  let query = db("orders").where({ user_id: userId });

  if (status && String(status).trim() && String(status).toLowerCase() !== "all") {
    query = query.where({ status });
  }

  const [orders, countRow] = await Promise.all([
    query.clone().orderBy("created_at", "desc").limit(l).offset(offset),
    query.clone().count("id as count").first(),
  ]);

  const total = Number(countRow?.count || 0);

  if (!orders.length) {
    return {
      orders: [],
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l) || 1,
      },
    };
  }

  const orderIds = orders.map((o) => o.id);
  const items = await db("order_items")
    .whereIn("order_id", orderIds)
    .orderBy("id", "asc");

  const itemsByOrder = {};
  items.forEach((item) => {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  });

  return {
    orders: orders.map((o) => ({
      ...formatOrderRow(o),
      items: itemsByOrder[o.id] || [],
    })),
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
    },
  };
}

async function findOrderById(orderId, userId = null) {
  let query = db("orders");
  const trimmed = String(orderId || "").trim();
  if (/^\d+$/.test(trimmed)) {
    query = query.where({ id: Number(trimmed) });
  } else {
    query = query.where({ order_number: trimmed });
  }
  if (userId) {
    query = query.where({ user_id: userId });
  }
  const order = await query.first();
  if (!order) return null;

  const items = await db("order_items")
    .where({ order_id: order.id })
    .orderBy("id", "asc");

  return {
    ...formatOrderRow(order),
    items,
  };
}

async function findAllOrders({ page = 1, limit = 20, status, search }) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(100, Number(limit) || 20));
  const offset = (p - 1) * l;
  let query = db("orders");

  if (status && status !== "all" && status !== "") {
    query = query.where({ status });
  }

  if (search && String(search).trim()) {
    const s = `%${String(search).trim()}%`;
    query = query.where(function () {
      this.whereILike("order_number", s)
        .orWhereILike("customer_name", s)
        .orWhereILike("customer_email", s)
        .orWhereILike("customer_phone", s);
    });
  }

  const [orders, countRow] = await Promise.all([
    query.clone().orderBy("created_at", "desc").limit(l).offset(offset),
    query.clone().count("id as count").first(),
  ]);

  const total = Number(countRow?.count || 0);

  if (!orders.length) {
    return {
      orders: [],
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l) || 1,
      },
    };
  }

  const orderIds = orders.map((o) => o.id);
  const items = await db("order_items")
    .whereIn("order_id", orderIds)
    .orderBy("id", "asc");

  const itemsByOrder = {};
  items.forEach((item) => {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  });

  return {
    orders: orders.map((o) => ({
      ...formatOrderRow(o),
      items: itemsByOrder[o.id] || [],
    })),
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
    },
  };
}

async function updateOrderStatus(orderId, status) {
  const order = await db("orders").where({ id: orderId }).first();
  if (!order) {
    throw new Error("Order not found");
  }

  // Guard: Cannot advance unpaid online order to in-progress or completed states
  if (
    order.payment_method !== "Cash on Delivery" &&
    order.payment_status !== "Paid" &&
    ["Preparing", "Out for Delivery", "Delivered", "Completed"].includes(status)
  ) {
    const err = new Error(
      `Cannot change order status to '${status}': Online payment is still pending.`
    );
    err.statusCode = 400;
    throw err;
  }

  const updatePayload = {
    status,
    updated_at: db.fn.now(),
  };

  if (status === "Delivered" || status === "Completed") {
    updatePayload.payment_status = "Paid";
    if (!order.delivered_at) {
      updatePayload.delivered_at = db.fn.now();
    }
  }

  const [updated] = await db("orders")
    .where({ id: orderId })
    .update(updatePayload)
    .returning("*");
  return updated;
}

async function updateItemProductionStatus(orderItemId, productionStatus) {
  const [updated] = await db("order_items")
    .where({ id: orderItemId })
    .update({
      production_status: productionStatus,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return updated;
}

async function cancelOrder(orderId, cancelReason) {
  return db.transaction(async (trx) => {
    const order = await trx("orders").where({ id: orderId }).first();
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status === "Cancelled") {
      throw new Error("Order is already cancelled");
    }
    if (order.status === "Completed") {
      throw new Error("Completed orders cannot be cancelled");
    }

    // Update order status
    const [updatedOrder] = await trx("orders")
      .where({ id: orderId })
      .update({
        status: "Cancelled",
        cancel_reason: cancelReason,
        updated_at: trx.fn.now(),
      })
      .returning("*");

    // Fetch order items to restore stock ONLY if stock was deducted originally.
    // Stock is only deducted for Cash on Delivery or once payment is marked 'Paid'.
    const stockWasDeducted =
      order.payment_method === "Cash on Delivery" || order.payment_status === "Paid";

    if (stockWasDeducted) {
      const items = await trx("order_items").where({ order_id: orderId });
      for (const item of items) {
        if (item.availability_type !== "MADE_TO_ORDER") {
          await trx("products")
            .where({ id: item.product_id })
            .increment("stock", item.quantity);
        }
      }
    }

    // Conditionally restore raw ingredients based on restore_stock_on_cancel
    try {
      const { restoreIngredientStockForOrder } = require("../services/inventory.service");
      await restoreIngredientStockForOrder(orderId, trx, cancelReason);
    } catch (restErr) {
      console.warn("[OrderModel] Warning during ingredient stock restoration:", restErr.message);
    }

    return updatedOrder;
  });
}

async function updateOrderPaymentStatus(orderId, paymentStatus) {
  const [updated] = await db("orders")
    .where({ id: orderId })
    .update({
      payment_status: paymentStatus,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return formatOrderRow(updated);
}

async function acceptOrder(orderId, { notes = null } = {}) {
  const order = await db("orders").where({ id: orderId }).first();
  if (!order) {
    throw new Error("Order not found");
  }

  // Guard: Unpaid online payment orders cannot be accepted or prepared
  if (order.payment_method !== "Cash on Delivery" && order.payment_status !== "Paid") {
    const err = new Error(
      "Cannot accept order: Online payment is still pending. Customer must complete payment before the order can be accepted."
    );
    err.statusCode = 400;
    throw err;
  }

  const updatePayload = {
    status: "Preparing",
    updated_at: db.fn.now(),
  };

  if (notes) {
    updatePayload.notes = notes;
  }

  const [updated] = await db("orders")
    .where({ id: orderId })
    .update(updatePayload)
    .returning("*");

  return formatOrderRow(updated);
}

async function rejectOrder(orderId, { cancelReason = "Order rejected by store" } = {}) {
  return cancelOrder(orderId, cancelReason);
}

async function bulkUpdateOrderStatus(ids, targetStatus, { cancelReason = "Cancelled in bulk by admin" } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { updatedCount: 0, skippedCount: 0, skippedUnpaidOnline: [], otherSkipped: [], updatedOrders: [] };
  }

  const inProgressStatuses = ["Preparing", "Out for Delivery", "Delivered", "Completed"];
  const isAdvancingToFulfillment = inProgressStatuses.includes(targetStatus);

  const orders = await db("orders").whereIn("id", ids);
  const updatedOrders = [];
  const skippedUnpaidOnline = [];
  const otherSkipped = [];

  for (const order of orders) {
    // Payment Guardrail: cannot advance unpaid online orders to in-progress or fulfilled states
    const isUnpaidOnline =
      order.payment_method === "Online Payment" && order.payment_status !== "Paid";

    if (isAdvancingToFulfillment && isUnpaidOnline) {
      skippedUnpaidOnline.push({
        id: order.id,
        orderNumber: order.order_number,
        reason: "Online payment is still pending",
      });
      continue;
    }

    try {
      if (targetStatus === "Cancelled") {
        if (order.status === "Cancelled" || order.status === "Completed") {
          otherSkipped.push({
            id: order.id,
            orderNumber: order.order_number,
            reason: `Order is already ${order.status.toLowerCase()}`,
          });
          continue;
        }
        const cancelled = await cancelOrder(order.id, cancelReason);
        updatedOrders.push(cancelled);
      } else {
        const updatePayload = {
          status: targetStatus,
          updated_at: db.fn.now(),
        };
        if (targetStatus === "Delivered" || targetStatus === "Completed") {
          updatePayload.payment_status = "Paid";
          if (!order.delivered_at) {
            updatePayload.delivered_at = db.fn.now();
          }
        }
        const [updated] = await db("orders")
          .where({ id: order.id })
          .update(updatePayload)
          .returning("*");
        updatedOrders.push(updated);
      }
    } catch (err) {
      otherSkipped.push({
        id: order.id,
        orderNumber: order.order_number,
        reason: err.message,
      });
    }
  }

  return {
    updatedCount: updatedOrders.length,
    skippedCount: skippedUnpaidOnline.length + otherSkipped.length,
    skippedUnpaidOnline,
    otherSkipped,
    updatedOrders,
  };
}

module.exports = {
  createOrderWithTransaction,
  findOrdersByUser,
  findOrderById,
  findAllOrders,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  updateItemProductionStatus,
  cancelOrder,
  updateOrderPaymentStatus,
  acceptOrder,
  rejectOrder,
  getOrderChatStatus,
};
