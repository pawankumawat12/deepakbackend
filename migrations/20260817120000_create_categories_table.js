exports.up = function (knex) {
  return knex.schema.createTable("categories", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.text("description");
    table
      .integer("parent_category_id")
      .unsigned()
      .references("id")
      .inTable("categories")
      .onDelete("SET NULL");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index("parent_category_id");
    table.index("is_active");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("categories");
};
