/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("orders", "cod_fee");
  if (!hasColumn) {
    await knex.schema.alterTable("orders", (table) => {
      table.decimal("cod_fee", 12, 2).notNullable().defaultTo(0);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("orders", "cod_fee");
  if (hasColumn) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("cod_fee");
    });
  }
};
