/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("reviews");
  if (!hasTable) {
    await knex.schema.createTable("reviews", (table) => {
      table.increments("id").primary();
      table
        .integer("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table
        .integer("product_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("products")
        .onDelete("CASCADE");
      table.string("type", 20).defaultTo("product"); // 'product' | 'site'
      table.integer("rating").notNullable(); // 1 to 5
      table.string("title", 255).nullable();
      table.text("comment").notNullable();
      table.boolean("is_hidden").defaultTo(false);
      table.string("status", 20).defaultTo("published"); // 'published' | 'hidden'
      table.timestamps(true, true);

      // Indexes
      table.index(["product_id", "is_hidden"]);
      table.index(["user_id"]);
      table.index(["type", "is_hidden"]);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("reviews");
};

