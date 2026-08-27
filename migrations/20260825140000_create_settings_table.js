exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("settings");
  if (!exists) {
    await knex.schema.createTable("settings", (table) => {
      table.increments("id").primary();
      table.string("key", 100).notNullable().unique();
      table.jsonb("value").notNullable();
      table.timestamps(true, true);
    });

    // Seed default theme settings
    await knex("settings").insert({
      key: "theme",
      value: JSON.stringify({
        theme: "light",
        colorTheme: "matcha",
      }),
    });
  }
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("settings");
};
