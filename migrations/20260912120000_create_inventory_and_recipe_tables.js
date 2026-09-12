/**
 * Migration: Create Inventory, Suppliers, Recipes (Product Ingredients), and Stock Logs
 * Plus idempotency columns on orders table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Suppliers table
  const hasSuppliers = await knex.schema.hasTable("suppliers");
  if (!hasSuppliers) {
    await knex.schema.createTable("suppliers", (table) => {
      table.increments("id").primary();
      table.string("name", 150).notNullable().unique();
      table.string("contact_person", 100).nullable();
      table.string("phone", 25).nullable();
      table.string("email", 120).nullable();
      table.text("address").nullable();
      table.string("gstin", 30).nullable();
      table.text("notes").nullable();
      table.boolean("is_active").defaultTo(true).index();
      table.timestamps(true, true);
    });
  }

  // 2. Ingredients table
  const hasIngredients = await knex.schema.hasTable("ingredients");
  if (!hasIngredients) {
    await knex.schema.createTable("ingredients", (table) => {
      table.increments("id").primary();
      table
        .integer("supplier_id")
        .unsigned()
        .references("id")
        .inTable("suppliers")
        .onDelete("SET NULL")
        .nullable()
        .index();
      table.string("name", 150).notNullable().unique();
      table.string("category", 80).defaultTo("General").index();
      table.string("base_unit", 20).notNullable().defaultTo("piece"); // piece, gram, kg, ml, litre
      table.decimal("current_stock", 12, 4).notNullable().defaultTo(0);
      table.decimal("min_stock_threshold", 12, 4).notNullable().defaultTo(0);
      table.decimal("purchase_price", 10, 2).notNullable().defaultTo(0.0);
      table.boolean("restore_stock_on_cancel").notNullable().defaultTo(true);
      table.boolean("low_stock_notified").notNullable().defaultTo(false).index();
      table.string("batch_number", 60).nullable();
      table.date("expiry_date").nullable();
      table.boolean("is_active").defaultTo(true).index();
      table.timestamps(true, true);
    });
  }

  // 3. Product Ingredients (Recipes / Bill of Materials)
  const hasProductIngredients = await knex.schema.hasTable("product_ingredients");
  if (!hasProductIngredients) {
    await knex.schema.createTable("product_ingredients", (table) => {
      table.increments("id").primary();
      table
        .integer("product_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("products")
        .onDelete("CASCADE")
        .index();
      table
        .integer("ingredient_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("ingredients")
        .onDelete("RESTRICT")
        .index();
      table.decimal("quantity", 10, 4).notNullable().defaultTo(1);
      table.string("unit", 20).nullable();
      table.timestamps(true, true);

      table.unique(["product_id", "ingredient_id"]);
    });
  }

  // 4. Ingredient Stock Movement Logs (Audit Trail)
  const hasStockLogs = await knex.schema.hasTable("ingredient_stock_logs");
  if (!hasStockLogs) {
    await knex.schema.createTable("ingredient_stock_logs", (table) => {
      table.increments("id").primary();
      table
        .integer("ingredient_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("ingredients")
        .onDelete("CASCADE")
        .index();
      table
        .integer("order_id")
        .unsigned()
        .references("id")
        .inTable("orders")
        .onDelete("SET NULL")
        .nullable()
        .index();
      table.string("change_type", 40).notNullable().index(); // PURCHASE_RESTOCK, ORDER_CONSUMED, ORDER_CANCELLED_RESTORE, ORDER_CANCELLED_SKIPPED, MANUAL_ADJUSTMENT, WASTAGE
      table.decimal("quantity_changed", 12, 4).notNullable().defaultTo(0);
      table.decimal("stock_after", 12, 4).notNullable().defaultTo(0);
      table.decimal("cost_per_unit", 10, 2).nullable();
      table.text("reason").nullable();
      table
        .integer("created_by")
        .unsigned()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now()).index();
    });
  }

  // 5. Add idempotency tracking columns to orders table
  const hasOrders = await knex.schema.hasTable("orders");
  if (hasOrders) {
    const hasDeductedCol = await knex.schema.hasColumn(
      "orders",
      "ingredient_stock_deducted"
    );
    if (!hasDeductedCol) {
      await knex.schema.alterTable("orders", (table) => {
        table.boolean("ingredient_stock_deducted").defaultTo(false).index();
      });
    }

    const hasRestoredCol = await knex.schema.hasColumn(
      "orders",
      "ingredient_stock_restored"
    );
    if (!hasRestoredCol) {
      await knex.schema.alterTable("orders", (table) => {
        table.boolean("ingredient_stock_restored").defaultTo(false).index();
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasOrders = await knex.schema.hasTable("orders");
  if (hasOrders) {
    await knex.schema.alterTable("orders", (table) => {
      table.dropColumn("ingredient_stock_restored");
      table.dropColumn("ingredient_stock_deducted");
    });
  }

  await knex.schema.dropTableIfExists("ingredient_stock_logs");
  await knex.schema.dropTableIfExists("product_ingredients");
  await knex.schema.dropTableIfExists("ingredients");
  await knex.schema.dropTableIfExists("suppliers");
};

