const db = require("../../config/db");

function generateOrderNumber() {
  const timestamp = Date.now().toString().slice(-5);
  const random = Math.floor(100 + Math.random() * 900);
  return `SFC-${timestamp}${random}`;
}

async function createOrderWithTransaction({
  userId,
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  deliveryAddressJson,
  paymentMethod = "Cash on Delivery",
  notes,
}) {
  return db.transaction(async (trx) => {
    // 1. Fetch current cart items with lock
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
      ])
      .join("products", "cart_items.product_id", "products.id")
      .where("cart_items.user_id", userId)
      .forUpdate();

    if (!rawCartItems || rawCartItems.length === 0) {
      const err = new Error("Your cart is empty");
      err.statusCode = 400;
      throw err;
    }

    // 2. Validate availability and stock
    for (const item of rawCartItems) {
      if (!item.is_active) {
        const err = new Error(`"${item.name}" is currently not available`);
        err.statusCode = 400;
        throw err;
      }

      const isMadeToOrder = item.availability_type === "MADE_TO_ORDER";
      const stock = Number(item.stock) || 0;
      const quantity = Number(item.quantity) || 1;

      if (!isMadeToOrder) {
        if (stock < quantity) {
          const err = new Error(
            `Insufficient stock for "${item.name}". Only ${stock} item(s) available in stock.`,
          );
          err.statusCode = 400;
          throw err;
        }
      }
    }

    // 3. Compute totals
    let subtotal = 0;
    for (const item of rawCartItems) {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      subtotal += price * quantity;
    }
    const deliveryFee = 0;
    const discount = 0;
    const totalAmount = Math.max(0, subtotal + deliveryFee - discount);

    // 4. Create Order Record
    const orderNumber = generateOrderNumber();
    const [order] = await trx("orders")
      .insert({
        order_number: orderNumber,
        user_id: userId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        shipping_address: shippingAddress,
        delivery_address_json: deliveryAddressJson,
        subtotal,
        delivery_fee: deliveryFee,
        discount,
        total_amount: totalAmount,
        status: "Preparing",
        payment_method: paymentMethod,
        notes,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning("*");

    // 5. Create Order Items and Decrease Stock for IN_STOCK items
    const orderItemsToInsert = [];
    for (const item of rawCartItems) {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      const itemTotal = price * quantity;
      const isMadeToOrder = item.availability_type === "MADE_TO_ORDER";
      let images = [];
      try {
        images = typeof item.images === "string" ? JSON.parse(item.images) : item.images;
      } catch {
        images = [];
      }
      const image = Array.isArray(images) && images.length > 0 ? images[0] : null;

      if (!isMadeToOrder) {
        // Atomic stock decrease for IN_STOCK
        const currentStock = Number(item.stock) || 0;
        const newStock = Math.max(0, currentStock - quantity);
        await trx("products")
          .where({ id: item.product_id })
          .update({
            stock: newStock,
            updated_at: trx.fn.now(),
          });
      }

      orderItemsToInsert.push({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.name,
        price,
        quantity,
        total: itemTotal,
        availability_type: item.availability_type || "IN_STOCK",
        production_status: isMadeToOrder ? "PENDING_PRODUCTION" : "COMPLETED",
        image,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    }

    const insertedItems = await trx("order_items")
      .insert(orderItemsToInsert)
      .returning("*");

    // 6. Clear user cart
    await trx("cart_items").where({ user_id: userId }).del();

    return {
      ...order,
      items: insertedItems,
    };
  });
}

async function findOrdersByUser(userId) {
  const orders = await db("orders")
    .where({ user_id: userId })
    .orderBy("created_at", "desc");

  if (!orders.length) return [];

  const orderIds = orders.map((o) => o.id);
  const items = await db("order_items")
    .whereIn("order_id", orderIds)
    .orderBy("id", "asc");

  const itemsByOrder = {};
  items.forEach((item) => {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  });

  return orders.map((o) => ({
    ...o,
    items: itemsByOrder[o.id] || [],
  }));
}

async function findOrderById(orderId, userId = null) {
  let query = db("orders").where({ id: orderId });
  if (userId) {
    query = query.where({ user_id: userId });
  }
  const order = await query.first();
  if (!order) return null;

  const items = await db("order_items")
    .where({ order_id: order.id })
    .orderBy("id", "asc");

  return {
    ...order,
    items,
  };
}

async function findAllOrders({ page = 1, limit = 20, status, search }) {
  const offset = (page - 1) * limit;
  let query = db("orders");

  if (status) {
    query = query.where({ status });
  }

  if (search) {
    query = query.where(function () {
      this.whereILike("order_number", `%${search}%`)
        .orWhereILike("customer_name", `%${search}%`)
        .orWhereILike("customer_email", `%${search}%`);
    });
  }

  const [orders, countRow] = await Promise.all([
    query
      .clone()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset),
    query.clone().count("id as count").first(),
  ]);

  const total = Number(countRow?.count || 0);

  if (!orders.length) {
    return {
      orders: [],
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit) || 1,
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
      ...o,
      items: itemsByOrder[o.id] || [],
    })),
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function updateOrderStatus(orderId, status) {
  const [updated] = await db("orders")
    .where({ id: orderId })
    .update({
      status,
      updated_at: db.fn.now(),
    })
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

    // Fetch order items to restore stock
    const items = await trx("order_items").where({ order_id: orderId });
    for (const item of items) {
      if (item.availability_type !== "MADE_TO_ORDER") {
        await trx("products")
          .where({ id: item.product_id })
          .increment("stock", item.quantity);
      }
    }

    return updatedOrder;
  });
}

module.exports = {
  createOrderWithTransaction,
  findOrdersByUser,
  findOrderById,
  findAllOrders,
  updateOrderStatus,
  updateItemProductionStatus,
  cancelOrder,
};

