exports.up = async function (knex) {
  await knex.schema.createTable("orders", (table) => {
    table.increments("id").primary();
    table.string("order_number").notNullable().unique();
    table
      .integer("user_id")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.string("customer_name");
    table.string("customer_email");
    table.string("customer_phone");
    table.text("shipping_address");
    table.decimal("subtotal", 12, 2).notNullable().defaultTo(0);
    table.decimal("delivery_fee", 12, 2).notNullable().defaultTo(0);
    table.decimal("discount", 12, 2).notNullable().defaultTo(0);
    table.decimal("total_amount", 12, 2).notNullable().defaultTo(0);
    table.string("status").notNullable().defaultTo("Preparing");
    table.string("payment_method").notNullable().defaultTo("Cash on Delivery");
    table.text("notes");
    table.timestamps(true, true);

    table.index("user_id");
    table.index("order_number");
    table.index("status");
    table.index("created_at");
  });

  await knex.schema.createTable("order_items", (table) => {
    table.increments("id").primary();
    table
      .integer("order_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");
    table
      .integer("product_id")
      .unsigned()
      .references("id")
      .inTable("products")
      .onDelete("SET NULL");
    table.string("product_name").notNullable();
    table.decimal("price", 12, 2).notNullable();
    table.integer("quantity").notNullable().defaultTo(1);
    table.decimal("total", 12, 2).notNullable();
    table.string("availability_type").notNullable().defaultTo("IN_STOCK");
    table.string("production_status").notNullable().defaultTo("COMPLETED");
    table.text("image");
    table.timestamps(true, true);

    table.index("order_id");
    table.index("product_id");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("order_items");
  await knex.schema.dropTableIfExists("orders");
};

