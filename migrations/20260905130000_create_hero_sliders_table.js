exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("hero_sliders");
  if (!hasTable) {
    await knex.schema.createTable("hero_sliders", (table) => {
      table.increments("id").primary();
      table.string("tag", 150).nullable().defaultTo("FRESH & DELICIOUS");
      table.string("title", 255).notNullable();
      table.string("highlight", 255).notNullable();
      table.text("subtitle").nullable();
      table.string("cta", 100).notNullable().defaultTo("Order Now");
      table.string("href", 255).notNullable().defaultTo("/menu");
      table.string("secondary_cta", 100).nullable().defaultTo("View Menu");
      table.string("secondary_href", 255).nullable().defaultTo("/menu");
      table.string("image", 1000).notNullable();
      table.integer("display_order").notNullable().defaultTo(1);
      table.boolean("is_active").notNullable().defaultTo(true);
      table.timestamps(true, true);

      table.index(["display_order"]);
      table.index(["is_active"]);
    });
  }

  // Seed default 3 slides if table is currently empty
  const countRes = await knex("hero_sliders").count("id as count").first();
  const count = Number(countRes?.count || 0);

  if (count === 0) {
    await knex("hero_sliders").insert([
      {
        tag: "FRESH & DELICIOUS",
        title: "Good Food,",
        highlight: "Good Mood.",
        subtitle:
          "Freshly prepared fast food made with quality ingredients, bold flavors and lots of love.",
        cta: "Order Now",
        secondary_cta: "View Menu",
        href: "/menu",
        secondary_href: "/menu",
        image:
          "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1400&q=85",
        display_order: 1,
        is_active: true,
      },
      {
        tag: "HANDCRAFTED WITH LOVE",
        title: "Taste That",
        highlight: "Makes You Smile.",
        subtitle:
          "From juicy burgers to crispy fries, every bite is made fresh and served with flavor.",
        cta: "Explore Menu",
        secondary_cta: "Our Story",
        href: "/menu",
        secondary_href: "/about",
        image:
          "https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=1400&q=85",
        display_order: 2,
        is_active: true,
      },
      {
        tag: "FRESH • FAST • FLAVORFUL",
        title: "Your Favorite",
        highlight: "Food Is Here.",
        subtitle:
          "Craving something delicious? Pick your favorite meal and enjoy a fresh fast-food experience.",
        cta: "Order Food",
        secondary_cta: "Contact Us",
        href: "/menu",
        secondary_href: "/contact",
        image:
          "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1400&q=85",
        display_order: 3,
        is_active: true,
      },
    ]);
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("hero_sliders");
};
