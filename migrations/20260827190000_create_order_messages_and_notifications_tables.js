/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasOrderMessages = await knex.schema.hasTable("order_messages");
  if (!hasOrderMessages) {
    await knex.schema.createTable("order_messages", (table) => {
      table.increments("id").primary();
      table
        .integer("order_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("orders")
        .onDelete("CASCADE")
        .index();
      table
        .integer("sender_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.string("sender_role", 30).notNullable().defaultTo("customer");
      table.string("sender_name", 150).notNullable().defaultTo("User");
      table.text("message").notNullable();
      table.boolean("is_read").notNullable().defaultTo(false).index();
      table.timestamp("read_at").nullable();
      table.timestamps(true, true);
    });
  }

  const hasNotifications = await knex.schema.hasTable("notifications");
  if (!hasNotifications) {
    await knex.schema.createTable("notifications", (table) => {
      table.increments("id").primary();
      table
        .integer("user_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE")
        .index();
      table.string("role", 30).notNullable().defaultTo("customer").index();
      table.string("type", 50).notNullable().index();
      table.string("title", 200).notNullable();
      table.text("message").notNullable();
      table
        .integer("order_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("orders")
        .onDelete("SET NULL")
        .index();
      table.text("data_json").nullable();
      table.boolean("is_read").notNullable().defaultTo(false).index();
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("notifications");
  await knex.schema.dropTableIfExists("order_messages");
};

