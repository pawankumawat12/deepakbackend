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
  const serializedValue = typeof value === "object" ? JSON.stringify(value) : value;

  const exists = await db("settings").where({ key }).first();
  if (exists) {
    await db("settings")
      .where({ key })
      .update({
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
    Array.isArray(theme?.availableColorThemes) && theme.availableColorThemes.length > 0
      ? theme.availableColorThemes
      : DEFAULT_COLOR_THEMES;

  return {
    theme: theme?.theme || DEFAULT_THEME.theme,
    colorTheme: theme?.colorTheme || DEFAULT_THEME.colorTheme,
    availableColorThemes,
  };
}

async function updateThemeSettings({ theme, colorTheme, availableColorThemes }) {
  const current = await getThemeSettings();
  const next = {
    theme: theme || current.theme,
    colorTheme: colorTheme || current.colorTheme,
    availableColorThemes: Array.isArray(availableColorThemes) && availableColorThemes.length > 0
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
};
