exports.up = async function (knex) {
  const tableExists = await knex.schema.hasTable("orders");
  if (tableExists) {
    await knex.schema.alterTable("orders", (table) => {
      table.decimal("tax_amount", 12, 2).notNullable().defaultTo(0);
      table.decimal("packaging_fee", 12, 2).notNullable().defaultTo(0);
      table.decimal("cod_fee", 12, 2).notNullable().defaultTo(0);
      table.decimal("platform_fee", 12, 2).notNullable().defaultTo(0);
      table.decimal("distance_km", 12, 4).notNullable().defaultTo(0);
      table.boolean("tax_inclusive").notNullable().defaultTo(false);
    });
  }
};

exports.down = async function (knex) {
  const tableExists = await knex.schema.hasTable("orders");
  if (tableExists) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("tax_amount");
      table.dropColumn("packaging_fee");
      table.dropColumn("cod_fee");
      table.dropColumn("platform_fee");
      table.dropColumn("distance_km");
      table.dropColumn("tax_inclusive");
    });
  }
};
