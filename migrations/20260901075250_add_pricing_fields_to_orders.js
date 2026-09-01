/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTax = await knex.schema.hasColumn("orders", "tax_amount");
  const hasPlatform = await knex.schema.hasColumn("orders", "platform_fee");
  const hasInclusive = await knex.schema.hasColumn("orders", "tax_inclusive");

  await knex.schema.alterTable("orders", (table) => {
    if (!hasTax) {
      table.decimal("tax_amount", 12, 2).notNullable().defaultTo(0);
    }
    if (!hasPlatform) {
      table.decimal("platform_fee", 12, 2).notNullable().defaultTo(0);
    }
    if (!hasInclusive) {
      table.boolean("tax_inclusive").notNullable().defaultTo(false);
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasTax = await knex.schema.hasColumn("orders", "tax_amount");
  const hasPlatform = await knex.schema.hasColumn("orders", "platform_fee");
  const hasInclusive = await knex.schema.hasColumn("orders", "tax_inclusive");

  await knex.schema.alterTable("orders", (table) => {
    if (hasInclusive) table.dropColumn("tax_inclusive");
    if (hasPlatform) table.dropColumn("platform_fee");
    if (hasTax) table.dropColumn("tax_amount");
  });
};