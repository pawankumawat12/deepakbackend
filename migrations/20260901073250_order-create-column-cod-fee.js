/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.decimal("cod_fee", 10, 2).notNullable().defaultTo(0);
  })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.alterTable("orders", (table) => {
        table.dropColumn("cod_fee");
      });
};
