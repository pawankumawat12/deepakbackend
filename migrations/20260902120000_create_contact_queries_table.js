/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("contact_queries");
  if (!hasTable) {
    await knex.schema.createTable("contact_queries", (table) => {
      table.increments("id").primary();
      table
        .integer("user_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.string("name", 100).notNullable();
      table.string("email", 150).notNullable();
      table.string("phone", 25).nullable();
      table.string("subject", 200).notNullable();
      table.text("message").notNullable();
      table.string("status", 25).defaultTo("pending"); // 'pending' | 'in_progress' | 'resolved'
      table.text("admin_notes").nullable();
      table.timestamps(true, true);

      // Indexes
      table.index(["status"]);
      table.index(["email"]);
      table.index(["created_at"]);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("contact_queries");
};

