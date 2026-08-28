exports.up = async function (knex) {
  const hasPaymentStatus = await knex.schema.hasColumn("orders", "payment_status");
  if (!hasPaymentStatus) {
    await knex.schema.alterTable("orders", (table) => {
      table.string("payment_status").notNullable().defaultTo("Pending");
      table.string("transaction_id");
      table.jsonb("payment_details_json");
    });
  }
};

exports.down = async function (knex) {
  const hasPaymentStatus = await knex.schema.hasColumn("orders", "payment_status");
  if (hasPaymentStatus) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("payment_status");
      table.dropColumn("transaction_id");
      table.dropColumn("payment_details_json");
    });
  }
};
