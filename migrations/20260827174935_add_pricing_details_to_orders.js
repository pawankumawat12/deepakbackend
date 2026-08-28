exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("orders", "pricing_details_json");
  if (!hasColumn) {
    await knex.schema.alterTable("orders", (table) => {
      table.jsonb("pricing_details_json");
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("orders", "pricing_details_json");
  if (hasColumn) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("pricing_details_json");
    });
  }
};
