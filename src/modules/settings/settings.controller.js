const {
  getThemeSettings,
  updateThemeSettings,
  getFooterSettings,
  updateFooterSettings,
  getLogoSettings,
  updateLogoSettings,
  getOrderPricingSettings,
  updateOrderPricingSettings,
  getPaymentQrSettings,
  updatePaymentQrSettings,
} = require("../../models/settings.model");

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

async function getPaymentQr(req, res) {
  try {
    const data = await getPaymentQrSettings();
    return res.status(200).json({
      success: true,
      message: "Payment QR settings fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get payment QR error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment QR settings",
    });
  }
}

async function updatePaymentQr(req, res) {
  try {
    const updateData = { ...req.body };
    if (req.file) {
      updateData.qr_code_url = `/uploads/${req.file.filename}`;
    }

    if (updateData.is_enabled !== undefined) {
      updateData.is_enabled = updateData.is_enabled === "true" || updateData.is_enabled === true;
    }

    const updated = await updatePaymentQrSettings(updateData);
    return res.status(200).json({
      success: true,
      message: "Payment QR settings updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update payment QR error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment QR settings",
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
  getPaymentQr,
  updatePaymentQr,
};
