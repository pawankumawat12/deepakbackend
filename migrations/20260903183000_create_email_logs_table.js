/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("email_logs");
  if (!hasTable) {
    await knex.schema.createTable("email_logs", (table) => {
      table.increments("id").primary();
      table.string("recipient", 255).notNullable();
      table.string("sender", 255).nullable();
      table.string("subject", 500).notNullable();
      table.string("email_type", 50).notNullable().defaultTo("general"); // 'otp' | 'email_change_otp' | 'password_reset' | 'test_smtp' | 'general'
      table.string("status", 25).notNullable().defaultTo("sent"); // 'sent' | 'failed' | 'disabled'
      table.text("body_html").nullable();
      table.text("body_text").nullable();
      table.text("error_message").nullable();
      table.string("message_id", 255).nullable();
      table
        .integer("user_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.jsonb("metadata").nullable();
      table.timestamps(true, true);

      // Indexes for fast searching, filtering, and sorting
      table.index(["created_at"]);
      table.index(["recipient"]);
      table.index(["email_type"]);
      table.index(["status"]);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("email_logs");
};

