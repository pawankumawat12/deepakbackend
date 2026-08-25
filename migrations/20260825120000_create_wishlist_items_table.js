exports.up = function (knex) {
  return knex.schema.createTable("wishlist_items", (table) => {
    table.increments("id").primary();
    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table
      .integer("product_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("products")
      .onDelete("CASCADE");
    table.timestamps(true, true);
    table.unique(["user_id", "product_id"]);
    table.index("user_id");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("wishlist_items");
};

