/**
 * Migration: Add BOGO fields to order_items
 * Adds paid_quantity, free_quantity, bogo_details_json columns
 * so that BOGO order items can track the quantity breakdown.
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("order_items");
  if (!hasTable) return;

  const hasPaidQty = await knex.schema.hasColumn("order_items", "paid_quantity");
  const hasFreeQty = await knex.schema.hasColumn("order_items", "free_quantity");
  const hasBogoJson = await knex.schema.hasColumn("order_items", "bogo_details_json");

  await knex.schema.alterTable("order_items", (table) => {
    if (!hasPaidQty) table.integer("paid_quantity").nullable().defaultTo(null);
    if (!hasFreeQty) table.integer("free_quantity").nullable().defaultTo(null);
    if (!hasBogoJson) table.text("bogo_details_json").nullable().defaultTo(null);
  });
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("order_items");
  if (!hasTable) return;

  await knex.schema.alterTable("order_items", (table) => {
    table.dropColumn("paid_quantity");
    table.dropColumn("free_quantity");
    table.dropColumn("bogo_details_json");
  });
};

