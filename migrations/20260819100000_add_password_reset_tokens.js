exports.up = function (knex) {
  return knex.schema.alterTable("users", (table) => {
    table.string("password_reset_token", 64).nullable().index();
    table.timestamp("password_reset_expires_at").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", (table) => {
    table.dropColumn("password_reset_token");
    table.dropColumn("password_reset_expires_at");
  });
};
