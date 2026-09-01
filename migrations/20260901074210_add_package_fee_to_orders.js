exports.up = async function (knex) {
    await knex.schema.alterTable("orders", (table) => {
      table.decimal("packaging_fee", 10, 2).nullable();
    });
  };
  
  exports.down = async function (knex) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("packaging_fee");
    });
  };