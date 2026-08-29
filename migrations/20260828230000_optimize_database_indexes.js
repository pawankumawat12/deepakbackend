/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Orders table indexes
  const hasOrders = await knex.schema.hasTable("orders");
  if (hasOrders) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
      CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);
    `);
  }

  // 2. Order items indexes
  const hasOrderItems = await knex.schema.hasTable("order_items");
  if (hasOrderItems) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);
    `);
  }

  // 3. Order messages indexes
  const hasOrderMessages = await knex.schema.hasTable("order_messages");
  if (hasOrderMessages) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_order_messages_order_created ON order_messages (order_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_order_messages_is_read ON order_messages (is_read);
    `);
  }

  // 4. Notifications indexes
  const hasNotifications = await knex.schema.hasTable("notifications");
  if (hasNotifications) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_role_read ON notifications (user_id, role, is_read, created_at DESC);
    `);
  }

  // 5. Products indexes
  const hasProducts = await knex.schema.hasTable("products");
  if (hasProducts) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_products_category_active ON products (category_id, is_active);
    `);
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_orders_user_created;
    DROP INDEX IF EXISTS idx_orders_status;
    DROP INDEX IF EXISTS idx_orders_payment_status;
    DROP INDEX IF EXISTS idx_order_items_order_id;
    DROP INDEX IF EXISTS idx_order_items_product_id;
    DROP INDEX IF EXISTS idx_order_messages_order_created;
    DROP INDEX IF EXISTS idx_order_messages_is_read;
    DROP INDEX IF EXISTS idx_notifications_user_role_read;
    DROP INDEX IF EXISTS idx_products_category_active;
  `);
};

