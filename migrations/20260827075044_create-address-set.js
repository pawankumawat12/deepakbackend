exports.up = function (knex) {
    return knex.schema.alterTable("addresses", (table) => {
      table.decimal("latitude", 10, 7).nullable().alter();
      table.decimal("longitude", 10, 7).nullable().alter();
    });
  };
  
  exports.down = function (knex) {
    return knex.schema.alterTable("addresses", (table) => {
      table.decimal("latitude", 10, 7).notNullable().alter();
      table.decimal("longitude", 10, 7).notNullable().alter();
    });
  };