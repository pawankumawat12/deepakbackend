exports.up = function (knex) {
  return knex.schema.alterTable("users", (table) => {
    table.boolean("is_email_verified").notNullable().defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", (table) => {
    table.dropColumn("is_email_verified");
  });
};
