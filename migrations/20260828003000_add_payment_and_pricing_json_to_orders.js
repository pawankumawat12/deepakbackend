exports.up = async function (knex) {
  const hasPricingDetails = await knex.schema.hasColumn("orders", "pricing_details_json");
  const hasPaymentStatus = await knex.schema.hasColumn("orders", "payment_status");
  const hasTransactionId = await knex.schema.hasColumn("orders", "transaction_id");
  const hasPaymentDetails = await knex.schema.hasColumn("orders", "payment_details_json");

  await knex.schema.alterTable("orders", (table) => {
    if (!hasPricingDetails) {
      table.jsonb("pricing_details_json");
    }
    if (!hasPaymentStatus) {
      table.string("payment_status").notNullable().defaultTo("Pending");
    }
    if (!hasTransactionId) {
      table.string("transaction_id");
    }
    if (!hasPaymentDetails) {
      table.jsonb("payment_details_json");
    }
  });
};

exports.down = async function (knex) {
  const hasPricingDetails = await knex.schema.hasColumn("orders", "pricing_details_json");
  const hasPaymentStatus = await knex.schema.hasColumn("orders", "payment_status");
  const hasTransactionId = await knex.schema.hasColumn("orders", "transaction_id");
  const hasPaymentDetails = await knex.schema.hasColumn("orders", "payment_details_json");

  await knex.schema.alterTable("orders", (table) => {
    if (hasPaymentDetails) {
      table.dropColumn("payment_details_json");
    }
    if (hasTransactionId) {
      table.dropColumn("transaction_id");
    }
    if (hasPaymentStatus) {
      table.dropColumn("payment_status");
    }
    if (hasPricingDetails) {
      table.dropColumn("pricing_details_json");
    }
  });
};

