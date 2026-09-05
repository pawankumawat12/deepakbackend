exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("email_templates");
  if (hasTable) return;

  await knex.schema.createTable("email_templates", (table) => {
    table.increments("id").primary();
    table.string("name", 150).notNullable();
    table.string("slug", 160).notNullable().unique();
    table.string("subject", 500).notNullable();
    table.text("description").nullable();
    table.text("body").notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index(["name"]);
    table.index(["is_active"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("email_templates");
};
