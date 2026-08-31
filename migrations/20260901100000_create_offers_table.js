exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("offers");
  if (!exists) {
    await knex.schema.createTable("offers", (table) => {
      table.increments("id").primary();
      table.string("title", 255).notNullable();
      table.string("code", 50).notNullable().unique();
      table.text("description").nullable();
      table.string("badge", 100).nullable();
      table.string("type", 50).notNullable().defaultTo("PERCENTAGE"); // 'PERCENTAGE', 'FLAT', 'BOGO', 'PRODUCT', 'CATEGORY'
      table.decimal("discount_value", 10, 2).notNullable().defaultTo(0);
      table.decimal("min_order_amount", 10, 2).notNullable().defaultTo(0);
      table.decimal("max_discount_amount", 10, 2).nullable();
      table.jsonb("target_product_ids").notNullable().defaultTo("[]");
      table.jsonb("target_category_ids").notNullable().defaultTo("[]");
      table.integer("buy_qty").notNullable().defaultTo(1);
      table.integer("get_qty").notNullable().defaultTo(1);
      table.string("banner_image", 500).nullable();
      table.timestamp("start_date", { useTz: true }).nullable();
      table.timestamp("end_date", { useTz: true }).nullable();
      table.integer("usage_limit").nullable();
      table.integer("used_count").notNullable().defaultTo(0);
      table.boolean("is_active").notNullable().defaultTo(true);
      table.boolean("auto_apply").notNullable().defaultTo(false);
      table.integer("priority").notNullable().defaultTo(0);
      table.timestamps(true, true);
    });

    // Seed initial promotional offers
    await knex("offers").insert([
      {
        title: "Burger Combo Saver",
        code: "BURGER24",
        description: "Get 24% off on delicious burgers and combos with minimum order of ₹199.",
        badge: "BEST VALUE",
        type: "PERCENTAGE",
        discount_value: 24,
        min_order_amount: 199,
        max_discount_amount: 100,
        banner_image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85",
        is_active: true,
        auto_apply: false,
        priority: 5,
      },
      {
        title: "Pizza Party Mega Deal",
        code: "PIZZA23",
        description: "Enjoy 23% off on all large & medium pizzas with orders above ₹399.",
        badge: "HOT DEAL",
        type: "PERCENTAGE",
        discount_value: 23,
        min_order_amount: 399,
        max_discount_amount: 150,
        banner_image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1200&q=85",
        is_active: true,
        auto_apply: false,
        priority: 4,
      },
      {
        title: "Flat ₹50 Welcome Discount",
        code: "FLAT50",
        description: "Flat ₹50 off on all orders above ₹250. Auto-applied for instant savings!",
        badge: "SAVE MORE",
        type: "FLAT",
        discount_value: 50,
        min_order_amount: 250,
        banner_image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85",
        is_active: true,
        auto_apply: true,
        priority: 3,
      },
      {
        title: "Family Feast Bonanza",
        code: "FEAST20",
        description: "20% off on all family meal orders exceeding ₹599.",
        badge: "LIMITED TIME",
        type: "PERCENTAGE",
        discount_value: 20,
        min_order_amount: 599,
        max_discount_amount: 200,
        banner_image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85",
        is_active: true,
        auto_apply: false,
        priority: 2,
      },
      {
        title: "Buy 1 Get 1 Snack Free",
        code: "BOGOSNACK",
        description: "Buy 1 snack item and get 1 free on selected cafe favorites.",
        badge: "BOGO DEAL",
        type: "BOGO",
        discount_value: 0,
        buy_qty: 1,
        get_qty: 1,
        min_order_amount: 150,
        banner_image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85",
        is_active: true,
        auto_apply: false,
        priority: 1,
      },
    ]);
  }
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("offers");
};

