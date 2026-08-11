exports.up = function (knex) {
  return knex.schema.createTable("users", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("email").notNullable().unique();
    table.string("phone").unique();
    table.string("password").notNullable();
    table.enu("role", ["user", "admin"]).defaultTo("user").notNullable();
    table.timestamps(true, true);
  })
  .then(function () {
    return knex.raw("CREATE UNIQUE INDEX IF NOT EXISTS unique_admin_role ON users(role) WHERE role = 'admin';");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("users");
};