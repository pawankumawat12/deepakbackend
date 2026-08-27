exports.up = function (knex) {
  return knex.schema.alterTable("products", (table) => {
    table
      .string("availability_type")
      .notNullable()
      .defaultTo("IN_STOCK");
    table.index("availability_type");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("products", (table) => {
    table.dropIndex("availability_type");
    table.dropColumn("availability_type");
  });
};

