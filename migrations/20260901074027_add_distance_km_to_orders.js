/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("orders", "distance_km");
  if (!hasColumn) {
    await knex.schema.alterTable("orders", (table) => {
      table.decimal("distance_km", 12, 4).notNullable().defaultTo(0);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("orders", "distance_km");
  if (hasColumn) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("distance_km");
    });
  }
};