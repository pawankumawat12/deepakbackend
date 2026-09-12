const inventoryModel = require("../../models/inventory.model");

/**
 * ============================================================================
 * SUPPLIERS
 * ============================================================================
 */

async function getSuppliers(req, res, next) {
  try {
    const { search, status, page, limit } = req.query;
    const result = await inventoryModel.getAllSuppliers({ search, status, page, limit });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function getSupplier(req, res, next) {
  try {
    const supplier = await inventoryModel.getSupplierById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    return res.status(200).json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
}

async function createSupplier(req, res, next) {
  try {
    const { name, contact_person, phone, email, address, gstin, notes, is_active } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Supplier name is required" });
    }

    const created = await inventoryModel.createSupplier({
      name,
      contact_person,
      phone,
      email,
      address,
      gstin,
      notes,
      is_active,
    });

    return res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: created,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Supplier with this name already exists" });
    }
    next(error);
  }
}

async function updateSupplier(req, res, next) {
  try {
    const updated = await inventoryModel.updateSupplier(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
      data: updated,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Supplier with this name already exists" });
    }
    next(error);
  }
}

async function deleteSupplier(req, res, next) {
  try {
    const deleted = await inventoryModel.deleteSupplier(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    return res.status(200).json({ success: true, message: "Supplier deleted successfully" });
  } catch (error) {
    next(error);
  }
}

/**
 * ============================================================================
 * INGREDIENTS
 * ============================================================================
 */

async function getIngredients(req, res, next) {
  try {
    const { search, category, status, stockStatus, supplierId, page, limit } = req.query;
    const result = await inventoryModel.getAllIngredients({
      search,
      category,
      status,
      stockStatus,
      supplierId,
      page,
      limit,
    });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function getIngredient(req, res, next) {
  try {
    const item = await inventoryModel.getIngredientById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Ingredient not found" });
    }
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

async function createIngredient(req, res, next) {
  try {
    const {
      name,
      supplier_id,
      category,
      base_unit,
      current_stock,
      min_stock_threshold,
      purchase_price,
      restore_stock_on_cancel,
      batch_number,
      expiry_date,
      is_active,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Ingredient name is required" });
    }
    if (!base_unit || !base_unit.trim()) {
      return res.status(400).json({ success: false, message: "Base unit is required" });
    }

    const created = await inventoryModel.createIngredient(
      {
        name,
        supplier_id,
        category,
        base_unit,
        current_stock,
        min_stock_threshold,
        purchase_price,
        restore_stock_on_cancel,
        batch_number,
        expiry_date,
        is_active,
      },
      req.user?.id
    );

    return res.status(201).json({
      success: true,
      message: "Ingredient created successfully",
      data: created,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Ingredient with this name already exists" });
    }
    next(error);
  }
}

async function updateIngredient(req, res, next) {
  try {
    const updated = await inventoryModel.updateIngredient(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Ingredient not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Ingredient updated successfully",
      data: updated,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Ingredient with this name already exists" });
    }
    next(error);
  }
}

async function adjustStock(req, res, next) {
  try {
    const { adjustmentType, quantity, costPerUnit, reason } = req.body;
    if (quantity === undefined || Number(quantity) <= 0) {
      return res.status(400).json({ success: false, message: "A positive quantity is required" });
    }

    const result = await inventoryModel.adjustIngredientStock(req.params.id, {
      adjustmentType,
      quantity,
      costPerUnit,
      reason,
      userId: req.user?.id,
    });

    return res.status(200).json({
      success: true,
      message: "Stock adjusted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteIngredient(req, res, next) {
  try {
    await inventoryModel.deleteIngredient(req.params.id);
    return res.status(200).json({ success: true, message: "Ingredient deleted successfully" });
  } catch (error) {
    next(error);
  }
}

/**
 * ============================================================================
 * RECIPES / BOM
 * ============================================================================
 */

async function getProductRecipe(req, res, next) {
  try {
    const recipe = await inventoryModel.getRecipeForProduct(req.params.productId);
    if (!recipe) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    return res.status(200).json({ success: true, data: recipe });
  } catch (error) {
    next(error);
  }
}

async function saveProductRecipe(req, res, next) {
  try {
    const { ingredients } = req.body;
    if (!Array.isArray(ingredients)) {
      return res.status(400).json({ success: false, message: "Ingredients array is required" });
    }

    const updated = await inventoryModel.saveProductRecipe(req.params.productId, ingredients);
    return res.status(200).json({
      success: true,
      message: "Product recipe updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteProductIngredient(req, res, next) {
  try {
    const { productId, ingredientId } = req.params;
    await inventoryModel.deleteProductIngredient(productId, ingredientId);
    return res.status(200).json({ success: true, message: "Recipe ingredient removed successfully" });
  } catch (error) {
    next(error);
  }
}

/**
 * ============================================================================
 * LOGS & LOW STOCK
 * ============================================================================
 */

async function getStockLogs(req, res, next) {
  try {
    const { ingredientId, orderId, changeType, page, limit } = req.query;
    const result = await inventoryModel.getStockLogs({
      ingredientId,
      orderId,
      changeType,
      page,
      limit,
    });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function getLowStockIngredients(req, res, next) {
  try {
    const items = await inventoryModel.getLowStockIngredients();
    return res.status(200).json({
      success: true,
      data: items,
      count: items.length,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  // Suppliers
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,

  // Ingredients
  getIngredients,
  getIngredient,
  createIngredient,
  updateIngredient,
  adjustStock,
  deleteIngredient,

  // Recipes
  getProductRecipe,
  saveProductRecipe,
  deleteProductIngredient,

  // Logs & Low Stock
  getStockLogs,
  getLowStockIngredients,
};

