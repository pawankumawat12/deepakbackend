exports.up = function (knex) {
  return knex.schema.alterTable("users", (table) => {
    table.string("image").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", (table) => {
    table.dropColumn("image");
  });
};

