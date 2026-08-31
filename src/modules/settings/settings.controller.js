const {
  getThemeSettings,
  updateThemeSettings,
  getFooterSettings,
  updateFooterSettings,
  getLogoSettings,
  updateLogoSettings,
  getOrderPricingSettings,
  updateOrderPricingSettings,
  getSmtpSettings,
  updateSmtpSettings,
} = require("../../models/settings.model");
const { testSmtpConnection } = require("../../services/smtp.service");

const ALLOWED_THEMES = ["light", "dark"];

async function getTheme(req, res) {
  try {
    const data = await getThemeSettings();
    return res.status(200).json({
      success: true,
      message: "Theme settings fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get theme error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch theme settings",
    });
  }
}

async function updateTheme(req, res) {
  try {
    const { theme, colorTheme, availableColorThemes } = req.body;

    if (theme && !ALLOWED_THEMES.includes(theme)) {
      return res.status(400).json({
        success: false,
        message: `Invalid theme. Allowed values: ${ALLOWED_THEMES.join(", ")}`,
      });
    }

    const currentSettings = await getThemeSettings();
    const validColorIds = (
      Array.isArray(availableColorThemes) && availableColorThemes.length > 0
        ? availableColorThemes
        : currentSettings.availableColorThemes
    ).map((c) => c.id);

    if (colorTheme && !validColorIds.includes(colorTheme)) {
      return res.status(400).json({
        success: false,
        message: `Invalid color theme "${colorTheme}". Allowed values: ${validColorIds.join(", ")}`,
      });
    }

    const updated = await updateThemeSettings({
      theme,
      colorTheme,
      availableColorThemes,
    });

    return res.status(200).json({
      success: true,
      message: "Theme settings updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update theme error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update theme settings",
    });
  }
}

module.exports = {
  getTheme,
  updateTheme,
  getFooter,
  updateFooter,
  getLogo,
  updateLogo,
  getOrderPricing,
  updateOrderPricing,
};

async function getFooter(req, res) {
  try {
    const data = await getFooterSettings();
    return res.status(200).json({
      success: true,
      message: "Footer settings fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get footer error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch footer settings",
    });
  }
}

async function updateFooter(req, res) {
  try {
    const {
      phone_number,
      email,
      location,
      working_hours,
      instagram,
      facebook,
      twitter,
    } = req.body;

    const updated = await updateFooterSettings({
      phone_number,
      email,
      location,
      working_hours,
      instagram,
      facebook,
      twitter,
    });

    return res.status(200).json({
      success: true,
      message: "Footer settings updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update footer error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update footer settings",
    });
  }
}

async function getLogo(req, res) {
  try {
    const data = await getLogoSettings();
    return res.status(200).json({
      success: true,
      message: "Logo settings fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get logo error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch logo settings",
    });
  }
}

async function updateLogo(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Logo image file is required",
      });
    }

    const logoUrl = `/uploads/${req.file.filename}`;
    const updated = await updateLogoSettings(logoUrl);

    return res.status(200).json({
      success: true,
      message: "Logo updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update logo error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update logo",
    });
  }
}

async function getOrderPricing(req, res) {
  try {
    const data = await getOrderPricingSettings();
    return res.status(200).json({
      success: true,
      message: "Order pricing settings fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get order pricing error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order pricing settings",
    });
  }
}

async function updateOrderPricing(req, res) {
  try {
    const updated = await updateOrderPricingSettings(req.body);
    return res.status(200).json({
      success: true,
      message: "Order pricing settings updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update order pricing error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order pricing settings",
    });
  }
}

async function getSmtp(req, res) {
  try {
    const data = await getSmtpSettings({ maskPassword: true });
    return res.status(200).json({
      success: true,
      message: "SMTP settings fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get SMTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch SMTP settings",
    });
  }
}

async function updateSmtp(req, res) {
  try {
    const { host, port, secure, user, password, from_email, from_name, is_enabled } = req.body;

    if (!host || !String(host).trim()) {
      return res.status(400).json({
        success: false,
        message: "SMTP host is required (e.g. smtp.gmail.com)",
      });
    }

    if (!user || !String(user).trim()) {
      return res.status(400).json({
        success: false,
        message: "SMTP username / account email is required",
      });
    }

    const updated = await updateSmtpSettings({
      host,
      port: Number(port) || 587,
      secure: Boolean(secure),
      user,
      password,
      from_email,
      from_name,
      is_enabled: is_enabled !== false,
    });

    return res.status(200).json({
      success: true,
      message: "SMTP settings saved and updated successfully!",
      data: updated,
    });
  } catch (error) {
    console.error("Update SMTP error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to update SMTP settings",
    });
  }
}

async function testSmtp(req, res) {
  try {
    const { to, host, port, secure, user, password, from_email, from_name } = req.body;
    const recipient = to || req.user?.email || "pawan@yopmail.com";

    let customConfig = null;
    if (host && user) {
      const currentSaved = await getSmtpSettings({ maskPassword: false });
      let testPass = password;
      if (!testPass || testPass === "••••••••") {
        testPass = currentSaved.password;
      }
      customConfig = {
        host: String(host).trim(),
        port: Number(port) || 587,
        secure: Boolean(secure),
        user: String(user).trim(),
        pass: testPass,
        from_email: from_email ? String(from_email).trim() : user,
        from_name: from_name || "SFC Cafe",
        is_enabled: true,
      };
    }

    const result = await testSmtpConnection({ to: recipient, customConfig });

    return res.status(200).json({
      success: true,
      message: result.message || `Test email sent to ${recipient}!`,
      data: result,
    });
  } catch (error) {
    console.error("Test SMTP error:", error);
    return res.status(400).json({
      success: false,
      message: error?.message || "Failed to connect to SMTP server. Please check your credentials and host settings.",
    });
  }
}

module.exports = {
  getTheme,
  updateTheme,
  getFooter,
  updateFooter,
  getLogo,
  updateLogo,
  getOrderPricing,
  updateOrderPricing,
  getSmtp,
  updateSmtp,
  testSmtp,
};
