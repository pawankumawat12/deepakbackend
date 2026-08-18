/**
 * Store each product's uploaded image paths as a JSON array.
 * PostgreSQL returns JSONB values as JavaScript arrays, so API responses expose
 * the same `images` array saved in the database.
 */
exports.up = function (knex) {
  return knex.schema.alterTable("products", (table) => {
    table.jsonb("images").notNullable().defaultTo("[]");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("products", (table) => {
    table.dropColumn("images");
  });
};
