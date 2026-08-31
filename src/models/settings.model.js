const db = require("../../config/db");

const DEFAULT_COLOR_THEMES = [
  {
    id: "matcha",
    name: "Matcha Green",
    color: "#7cb324",
    desc: "Organic matcha & fresh espresso green",
    accent: "#f0f7e6",
  },
  {
    id: "caramel",
    name: "Espresso Caramel",
    color: "#e86b1a",
    desc: "Warm roasted caramel and spiced amber",
    accent: "#fef3eb",
  },
  {
    id: "mocha",
    name: "Golden Mocha",
    color: "#f5a623",
    desc: "Golden honey, cocoa and rich crema",
    accent: "#fef8ed",
  },
  {
    id: "berry",
    name: "Velvet Berry",
    color: "#e11d48",
    desc: "Rich wild berry & velvet roast red",
    accent: "#fef1f2",
  },
];

const DEFAULT_THEME = {
  theme: "light",
  colorTheme: "matcha",
  availableColorThemes: DEFAULT_COLOR_THEMES,
};

async function getSetting(key) {
  const row = await db("settings").where({ key }).first();
  if (!row) return null;
  if (typeof row.value === "string") {
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }
  return row.value;
}

async function setSetting(key, value) {
  const serializedValue =
    typeof value === "object" ? JSON.stringify(value) : value;

  const exists = await db("settings").where({ key }).first();
  if (exists) {
    await db("settings").where({ key }).update({
      value: serializedValue,
      updated_at: db.fn.now(),
    });
  } else {
    await db("settings").insert({
      key,
      value: serializedValue,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  }

  return getSetting(key);
}

async function getThemeSettings() {
  const theme = await getSetting("theme");
  const availableColorThemes =
    Array.isArray(theme?.availableColorThemes) &&
    theme.availableColorThemes.length > 0
      ? theme.availableColorThemes
      : DEFAULT_COLOR_THEMES;

  return {
    theme: theme?.theme || DEFAULT_THEME.theme,
    colorTheme: theme?.colorTheme || DEFAULT_THEME.colorTheme,
    availableColorThemes,
  };
}

async function updateThemeSettings({
  theme,
  colorTheme,
  availableColorThemes,
}) {
  const current = await getThemeSettings();
  const next = {
    theme: theme || current.theme,
    colorTheme: colorTheme || current.colorTheme,
    availableColorThemes:
      Array.isArray(availableColorThemes) && availableColorThemes.length > 0
        ? availableColorThemes
        : current.availableColorThemes,
  };
  await setSetting("theme", next);
  return next;
}

const DEFAULT_FOOTER = {
  phone_number: "",
  email: "",
  location: "",
  working_hours: "",
  instagram: "",
  facebook: "",
  twitter: "",
};

async function getFooterSettings() {
  const footer = await getSetting("footer");
  return { ...DEFAULT_FOOTER, ...footer };
}

async function updateFooterSettings(data) {
  const current = await getFooterSettings();
  const next = {
    phone_number: data.phone_number ?? current.phone_number,
    email: data.email ?? current.email,
    location: data.location ?? current.location,
    working_hours: data.working_hours ?? current.working_hours,
    instagram: data.instagram ?? current.instagram,
    facebook: data.facebook ?? current.facebook,
    twitter: data.twitter ?? current.twitter,
  };
  await setSetting("footer", next);
  return next;
}

async function getLogoSettings() {
  const logo = await getSetting("logo");
  return logo || { logo_url: "" };
}

async function updateLogoSettings(logoUrl) {
  const data = { logo_url: logoUrl };
  await setSetting("logo", data);
  return data;
}

const DEFAULT_ORDER_PRICING = {
  gst_percent: 5,
  tax_inclusive: false,
  delivery_charge_type: "fixed", // "fixed" | "per_km"
  delivery_charge_value: 30,
  free_delivery_threshold: 500,
  max_delivery_distance: 15,
  packaging_fee: 10,
  cod_fee: 20,
  platform_fee: 5,
  minimum_order_amount: 100,
  store_latitude: 26.9124,
  store_longitude: 75.7873,
  discount_percent: 0,
};

async function getOrderPricingSettings() {
  const pricing = await getSetting("order_pricing");
  return { ...DEFAULT_ORDER_PRICING, ...pricing };
}

async function updateOrderPricingSettings(data) {
  const current = await getOrderPricingSettings();
  const next = {
    gst_percent:
      data.gst_percent != null ? Number(data.gst_percent) : current.gst_percent,
    tax_inclusive:
      data.tax_inclusive != null
        ? Boolean(data.tax_inclusive)
        : current.tax_inclusive,
    delivery_charge_type:
      data.delivery_charge_type ?? current.delivery_charge_type,
    delivery_charge_value:
      data.delivery_charge_value != null
        ? Number(data.delivery_charge_value)
        : current.delivery_charge_value,
    free_delivery_threshold:
      data.free_delivery_threshold != null
        ? Number(data.free_delivery_threshold)
        : current.free_delivery_threshold,
    max_delivery_distance:
      data.max_delivery_distance != null
        ? Number(data.max_delivery_distance)
        : current.max_delivery_distance,
    packaging_fee:
      data.packaging_fee != null
        ? Number(data.packaging_fee)
        : current.packaging_fee,
    cod_fee: data.cod_fee != null ? Number(data.cod_fee) : current.cod_fee,
    platform_fee:
      data.platform_fee != null
        ? Number(data.platform_fee)
        : current.platform_fee,
    minimum_order_amount:
      data.minimum_order_amount != null
        ? Number(data.minimum_order_amount)
        : current.minimum_order_amount,
    store_latitude:
      data.store_latitude != null
        ? Number(data.store_latitude)
        : current.store_latitude,
    store_longitude:
      data.store_longitude != null
        ? Number(data.store_longitude)
        : current.store_longitude,
    discount_percent:
      data.discount_percent != null
        ? Number(data.discount_percent)
        : current.discount_percent,
  };
  await setSetting("order_pricing", next);
  return next;
}

module.exports = {
  DEFAULT_COLOR_THEMES,
  getSetting,
  setSetting,
  getThemeSettings,
  updateThemeSettings,
  getFooterSettings,
  updateFooterSettings,
  getLogoSettings,
  updateLogoSettings,
  DEFAULT_ORDER_PRICING,
  getOrderPricingSettings,
  updateOrderPricingSettings,
};
