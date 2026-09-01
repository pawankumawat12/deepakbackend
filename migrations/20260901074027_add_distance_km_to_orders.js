exports.up = async function (knex) {
    await knex.schema.alterTable("orders", (table) => {
      table.decimal("distance_km", 10, 2).nullable();
    });
  };
  
  exports.down = async function (knex) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("distance_km");
    });
  };