/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("contact_queries");
  if (hasTable) {
    const hasAdminReply = await knex.schema.hasColumn("contact_queries", "admin_reply");
    if (!hasAdminReply) {
      await knex.schema.alterTable("contact_queries", (table) => {
        table.text("admin_reply").nullable();
        table.timestamp("replied_at").nullable();
        table
          .integer("admin_id")
          .unsigned()
          .nullable()
          .references("id")
          .inTable("users")
          .onDelete("SET NULL");
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("contact_queries");
  if (hasTable) {
    const hasAdminReply = await knex.schema.hasColumn("contact_queries", "admin_reply");
    if (hasAdminReply) {
      await knex.schema.alterTable("contact_queries", (table) => {
        table.dropColumn("admin_id");
        table.dropColumn("replied_at");
        table.dropColumn("admin_reply");
      });
    }
  }
};
