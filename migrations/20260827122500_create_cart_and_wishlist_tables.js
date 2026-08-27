/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Ensure cart_items table exists
  const hasCartTable = await knex.schema.hasTable("cart_items");
  if (!hasCartTable) {
    await knex.schema.createTable("cart_items", (table) => {
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
        .notNullable()
        .references("id")
        .inTable("products")
        .onDelete("CASCADE");
      table.integer("quantity").unsigned().notNullable().defaultTo(1);
      table.timestamps(true, true);
      table.unique(["user_id", "product_id"]);
      table.index("user_id");
    });
  }

  // 2. Ensure wishlist_items table exists
  const hasWishlistTable = await knex.schema.hasTable("wishlist_items");
  if (!hasWishlistTable) {
    await knex.schema.createTable("wishlist_items", (table) => {
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
        .notNullable()
        .references("id")
        .inTable("products")
        .onDelete("CASCADE");
      table.timestamps(true, true);
      table.unique(["user_id", "product_id"]);
      table.index("user_id");
    });
  }

  // 3. Ensure products table has availability_type column
  const hasAvailCol = await knex.schema.hasColumn(
    "products",
    "availability_type"
  );
  if (!hasAvailCol) {
    await knex.schema.alterTable("products", (table) => {
      table
        .string("availability_type")
        .notNullable()
        .defaultTo("IN_STOCK");
      table.index("availability_type");
    });
  }

  // 4. Ensure addresses table exists
  const hasAddressTable = await knex.schema.hasTable("addresses");
  if (!hasAddressTable) {
    await knex.schema.createTable("addresses", (table) => {
      table.increments("id").primary();
      table
        .integer("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table.string("receiver_name").notNullable();
      table.string("phone_number").notNullable();
      table.string("house_number").notNullable();
      table.string("building_name");
      table.string("floor");
      table.string("landmark");
      table.string("formatted_address").notNullable();
      table.string("city").notNullable();
      table.string("state").notNullable();
      table.string("pincode").notNullable();
      table.decimal("latitude", 10, 7).defaultTo(26.9124);
      table.decimal("longitude", 10, 7).defaultTo(75.7873);
      table.string("label").defaultTo("Home");
      table.boolean("is_default").defaultTo(false);
      table.timestamps(true, true);
      table.index("user_id");
    });
  }

  // 5. Ensure orders table has delivery_address_json column
  const hasOrdersTable = await knex.schema.hasTable("orders");
  if (hasOrdersTable) {
    const hasAddressJsonCol = await knex.schema.hasColumn(
      "orders",
      "delivery_address_json"
    );
    if (!hasAddressJsonCol) {
      await knex.schema.alterTable("orders", (table) => {
        table.jsonb("delivery_address_json");
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("addresses");
  await knex.schema.dropTableIfExists("wishlist_items");
  await knex.schema.dropTableIfExists("cart_items");
};
