exports.up = function (knex) {
  return knex.schema.createTable("pending_registrations", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("email").notNullable().unique();
    table.string("phone").unique();
    table.string("password").notNullable();
    table.string("otp").nullable();
    table.timestamp("expire_at").nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("pending_registrations");
};
