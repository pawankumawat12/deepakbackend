/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasOrderMessages = await knex.schema.hasTable("order_messages");
  if (hasOrderMessages) {
    const hasAttachmentUrl = await knex.schema.hasColumn(
      "order_messages",
      "attachment_url"
    );
    if (!hasAttachmentUrl) {
      await knex.schema.table("order_messages", (table) => {
        table.text("attachment_url").nullable();
        table.string("attachment_type", 50).nullable();
        table.string("attachment_name", 255).nullable();
        table.string("attachment_size", 50).nullable();
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasOrderMessages = await knex.schema.hasTable("order_messages");
  if (hasOrderMessages) {
    const hasAttachmentUrl = await knex.schema.hasColumn(
      "order_messages",
      "attachment_url"
    );
    if (hasAttachmentUrl) {
      await knex.schema.table("order_messages", (table) => {
        table.dropColumn("attachment_url");
        table.dropColumn("attachment_type");
        table.dropColumn("attachment_name");
        table.dropColumn("attachment_size");
      });
    }
  }
};

