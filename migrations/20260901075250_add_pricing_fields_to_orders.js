exports.up = async function (knex) {
    await knex.schema.alterTable("orders", (table) => {
      table.decimal("tax_amount", 10, 2).nullable();
      table.decimal("platform_fee", 10, 2).nullable();
      table.boolean("tax_inclusive").nullable();
    });
  };
  
  exports.down = async function (knex) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("tax_amount");
      table.dropColumn("platform_fee");
      table.dropColumn("tax_inclusive");
    });
  };