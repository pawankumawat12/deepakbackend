/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("payment_webhook_logs");
  if (!hasTable) {
    await knex.schema.createTable("payment_webhook_logs", (table) => {
      table.increments("id").primary();
      table.string("event_id", 255).nullable();
      table.string("event_name", 100).notNullable();
      table.string("razorpay_order_id", 255).nullable();
      table.string("razorpay_payment_id", 255).nullable();
      table
        .integer("order_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("orders")
        .onDelete("SET NULL");
      table.string("status", 50).notNullable().defaultTo("received"); // 'received', 'processed', 'ignored', 'failed'
      table.jsonb("payload").nullable();
      table.text("error_message").nullable();
      table.timestamps(true, true);

      // Indexes for fast lookups & deduplication
      table.index(["event_id"]);
      table.index(["razorpay_order_id"]);
      table.index(["razorpay_payment_id"]);
      table.index(["order_id"]);
      table.index(["created_at"]);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("payment_webhook_logs");
};

