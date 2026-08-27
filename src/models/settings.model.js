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

module.exports = {
  DEFAULT_COLOR_THEMES,
  getSetting,
  setSetting,
  getThemeSettings,
  updateThemeSettings,
};
