/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Add status/block fields to users table
  const hasIsActive = await knex.schema.hasColumn("users", "is_active");
  if (!hasIsActive) {
    await knex.schema.alterTable("users", (table) => {
      table.boolean("is_active").defaultTo(true);
      table.boolean("is_blocked").defaultTo(false);
      table.string("block_reason").nullable();
      table.timestamp("blocked_at").nullable();
    });
  }

  // 2. Create blocked_customer_requests table
  const hasBlockedRequests = await knex.schema.hasTable(
    "blocked_customer_requests"
  );
  if (!hasBlockedRequests) {
    await knex.schema.createTable("blocked_customer_requests", (table) => {
      table.increments("id").primary();
      table
        .integer("user_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table.string("name").notNullable();
      table.string("email").notNullable();
      table.string("phone").nullable();
      table.text("message").notNullable();
      table.string("status").defaultTo("pending"); // pending, approved, rejected
      table.text("admin_response").nullable();
      table.timestamp("resolved_at").nullable();
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("blocked_customer_requests");
  const hasIsActive = await knex.schema.hasColumn("users", "is_active");
  if (hasIsActive) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("is_active");
      table.dropColumn("is_blocked");
      table.dropColumn("block_reason");
      table.dropColumn("blocked_at");
    });
  }
};

