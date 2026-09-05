const path = require("path");
const fs = require("fs");
const {
  parsePagination,
  buildPaginationMeta,
} = require("../../../config/pagination");
const {
  findActiveSliders,
  findSliders,
  countSliders,
  getSliderStats,
  findSliderById,
  getMaxDisplayOrder,
  createSlider,
  updateSlider,
  deleteSlider,
  reorderSliders,
} = require("../../models/heroSlider.model");

function parseIdParam(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function formatSlider(row) {
  if (!row) return null;
  return {
    ...row,
    img: row.image,
    secondaryCta: row.secondary_cta,
    secondaryHref: row.secondary_href,
    status: row.is_active ? "Active" : "Inactive",
  };
}

// Public: Get all active sliders ordered by display_order
async function getActiveSliders(req, res) {
  try {
    const sliders = await findActiveSliders();
    const formatted = sliders.map(formatSlider);

    return res.status(200).json({
      success: true,
      message: "Active hero sliders fetched successfully",
      data: formatted,
    });
  } catch (error) {
    console.error("Get active hero sliders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Admin: Get all sliders with pagination, filter, and stats
async function getAdminSliders(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.search ? req.query.search.trim() : undefined;
    const isActive = req.query.status || req.query.isActive;
    const sortBy = req.query.sortBy || "display_order";
    const sortOrder = req.query.sortOrder || "asc";

    const [sliders, total, stats] = await Promise.all([
      findSliders({ page, limit, offset, search, isActive, sortBy, sortOrder }),
      countSliders({ search, isActive }),
      getSliderStats(),
    ]);

    const formatted = sliders.map(formatSlider);

    return res.status(200).json({
      success: true,
      message: "Hero sliders fetched successfully",
      data: {
        sliders: formatted,
        pagination: buildPaginationMeta(page, limit, total),
        stats,
      },
    });
  } catch (error) {
    console.error("Get admin hero sliders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Admin: Get slider by ID
async function getSliderByIdHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid slider ID" });
    }

    const slider = await findSliderById(id);
    if (!slider) {
      return res.status(404).json({ success: false, message: "Slider not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Slider fetched successfully",
      data: formatSlider(slider),
    });
  } catch (error) {
    console.error("Get hero slider by ID error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Admin: Create slider
async function createSliderHandler(req, res) {
  try {
    const {
      tag,
      title,
      highlight,
      subtitle,
      cta,
      href,
      secondary_cta,
      secondaryCta,
      secondary_href,
      secondaryHref,
      display_order,
      displayOrder,
      is_active,
      isActive,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Slider title is required" });
    }
    if (!highlight || !highlight.trim()) {
      return res.status(400).json({ success: false, message: "Slider highlight is required" });
    }

    let image = "";
    if (req.file) {
      image = `/uploads/${req.file.filename}`;
    } else if (req.body.image && typeof req.body.image === "string" && req.body.image.trim()) {
      image = req.body.image.trim();
    }

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "A background image (file upload or URL) is required",
      });
    }

    let parsedOrder = parseInt(display_order ?? displayOrder, 10);
    if (isNaN(parsedOrder) || parsedOrder <= 0) {
      const maxOrder = await getMaxDisplayOrder();
      parsedOrder = maxOrder + 1;
    }

    const activeVal =
      is_active !== undefined
        ? is_active === true || is_active === "true" || is_active === 1
        : isActive !== undefined
        ? isActive === true || isActive === "true" || isActive === "Active"
        : true;

    const newSlider = await createSlider({
      tag: (tag || "FRESH & DELICIOUS").trim(),
      title: title.trim(),
      highlight: highlight.trim(),
      subtitle: subtitle ? subtitle.trim() : null,
      cta: (cta || "Order Now").trim(),
      href: (href || "/menu").trim(),
      secondary_cta: (secondary_cta ?? secondaryCta ?? "View Menu")?.trim() || null,
      secondary_href: (secondary_href ?? secondaryHref ?? "/menu")?.trim() || null,
      image,
      display_order: parsedOrder,
      is_active: activeVal,
    });

    return res.status(201).json({
      success: true,
      message: "Hero slider created successfully",
      data: formatSlider(newSlider),
    });
  } catch (error) {
    console.error("Create hero slider error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Admin: Update slider
async function updateSliderHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid slider ID" });
    }

    const existing = await findSliderById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Slider not found" });
    }

    const {
      tag,
      title,
      highlight,
      subtitle,
      cta,
      href,
      secondary_cta,
      secondaryCta,
      secondary_href,
      secondaryHref,
      display_order,
      displayOrder,
      is_active,
      isActive,
      image: bodyImage,
    } = req.body;

    const updateData = {};

    if (tag !== undefined) updateData.tag = tag.trim();
    if (title !== undefined) updateData.title = title.trim();
    if (highlight !== undefined) updateData.highlight = highlight.trim();
    if (subtitle !== undefined) updateData.subtitle = subtitle.trim();
    if (cta !== undefined) updateData.cta = cta.trim();
    if (href !== undefined) updateData.href = href.trim();

    if (secondary_cta !== undefined || secondaryCta !== undefined) {
      updateData.secondary_cta = (secondary_cta ?? secondaryCta)?.trim() || null;
    }
    if (secondary_href !== undefined || secondaryHref !== undefined) {
      updateData.secondary_href = (secondary_href ?? secondaryHref)?.trim() || null;
    }

    if (display_order !== undefined || displayOrder !== undefined) {
      const parsedOrder = parseInt(display_order ?? displayOrder, 10);
      if (!isNaN(parsedOrder)) {
        updateData.display_order = parsedOrder;
      }
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active === true || is_active === "true" || is_active === 1;
    } else if (isActive !== undefined) {
      updateData.is_active = isActive === true || isActive === "true" || isActive === "Active";
    }

    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
      // Cleanup old local file if replacing with a new local file
      if (existing.image && existing.image.startsWith("/uploads/")) {
        const oldPath = path.join(__dirname, "../../../", existing.image);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (err) {
            console.warn("Failed to delete old image:", err.message);
          }
        }
      }
    } else if (bodyImage && typeof bodyImage === "string" && bodyImage.trim()) {
      updateData.image = bodyImage.trim();
    }

    const updated = await updateSlider(id, updateData);

    return res.status(200).json({
      success: true,
      message: "Hero slider updated successfully",
      data: formatSlider(updated),
    });
  } catch (error) {
    console.error("Update hero slider error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Admin: Toggle slider status
async function toggleSliderStatusHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid slider ID" });
    }

    const existing = await findSliderById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Slider not found" });
    }

    const nextStatus =
      req.body.is_active !== undefined
        ? req.body.is_active === true || req.body.is_active === "true"
        : !existing.is_active;

    const updated = await updateSlider(id, { is_active: nextStatus });

    return res.status(200).json({
      success: true,
      message: `Slider ${nextStatus ? "activated" : "deactivated"} successfully`,
      data: formatSlider(updated),
    });
  } catch (error) {
    console.error("Toggle slider status error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Admin: Reorder sliders
async function reorderSlidersHandler(req, res) {
  try {
    const { items } = req.body;
    // items can be an array of IDs: [3, 1, 2] or array of objects: [{ id: 3, display_order: 1 }, ...]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Ordered items array is required",
      });
    }

    let orderList = [];
    if (typeof items[0] === "number" || typeof items[0] === "string") {
      orderList = items.map((id, index) => ({
        id: Number(id),
        display_order: index + 1,
      }));
    } else if (items[0] && typeof items[0] === "object") {
      orderList = items.map((item, index) => ({
        id: Number(item.id),
        display_order: Number(item.display_order ?? item.displayOrder ?? index + 1),
      }));
    }

    await reorderSliders(orderList);

    return res.status(200).json({
      success: true,
      message: "Sliders reordered successfully",
    });
  } catch (error) {
    console.error("Reorder hero sliders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Admin: Delete slider
async function deleteSliderHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid slider ID" });
    }

    const existing = await findSliderById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Slider not found" });
    }

    // If local image, delete file
    if (existing.image && existing.image.startsWith("/uploads/")) {
      const localPath = path.join(__dirname, "../../../", existing.image);
      if (fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
        } catch (err) {
          console.warn("Failed to delete slider image file:", err.message);
        }
      }
    }

    await deleteSlider(id);

    return res.status(200).json({
      success: true,
      message: "Hero slider deleted successfully",
    });
  } catch (error) {
    console.error("Delete hero slider error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  getActiveSliders,
  getAdminSliders,
  getSliderByIdHandler,
  createSliderHandler,
  updateSliderHandler,
  toggleSliderStatusHandler,
  reorderSlidersHandler,
  deleteSliderHandler,
};

