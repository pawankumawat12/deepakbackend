exports.up = function (knex) {
  return knex.schema.hasColumn("categories", "slug").then((hasColumn) => {
    if (!hasColumn) {
      return knex.schema.alterTable("categories", (table) => {
        table.string("slug").nullable();
      });
    }
  });
};

exports.down = function (knex) {
  return knex.schema.hasColumn("categories", "slug").then((hasColumn) => {
    if (hasColumn) {
      return knex.schema.alterTable("categories", (table) => {
        table.dropColumn("slug");
      });
    }
  });
};

