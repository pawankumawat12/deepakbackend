const {
  parsePagination,
  buildPaginationMeta,
} = require("../../../config/pagination");
const {
  findCategoryById,
  findCategories,
  countCategories,
  countChildCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  isCategoryAncestor,
} = require("../../models/category.model");
const { countProductsByCategory } = require("../../models/product.model");
const {
  validateCategoryCreate,
  validateCategoryUpdate,
  validateCategoryListQuery,
} = require("./category.validation");

function parseIdParam(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function listCategories(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { valid, errors, filters } = validateCategoryListQuery(req.query);

    if (!valid) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    const [categories, total] = await Promise.all([
      findCategories({ page, limit, offset, ...filters }),
      countCategories(filters),
    ]);

    return res.status(200).json({
      message: "Categories fetched successfully",
      data: categories,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (error) {
    console.error("List categories error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getCategoryById(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await findCategoryById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.status(200).json({
      message: "Category fetched successfully",
      data: category,
    });
  } catch (error) {
    console.error("Get category error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function createCategoryHandler(req, res) {
  try {
    const { name, description, parentCategoryId, isActive } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : undefined;

    const { valid, errors, data } = validateCategoryCreate({
      name,
      description,
      image,
      parentCategoryId,
      isActive,
    });

    if (!valid) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    if (data.parent_category_id) {
      const parentCategory = await findCategoryById(data.parent_category_id);
      if (!parentCategory) {
        return res.status(400).json({
          message: "Parent category not found",
        });
      }
    }
    const category = await createCategory(data);

    return res.status(201).json({
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error("Create category error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function updateCategoryHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const existingCategory = await findCategoryById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    const { name, description, parentCategoryId, isActive } = req.body || {};
    const image = req.file ? `/uploads/${req.file.filename}` : undefined;
    const { valid, errors, data } = validateCategoryUpdate({
      name,
      description,
      parentCategoryId,
      image,
      isActive,
    });

    if (!valid) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    if (data.parent_category_id !== undefined) {
      if (data.parent_category_id === id) {
        return res.status(400).json({
          message: "A category cannot be its own parent",
        });
      }

      if (data.parent_category_id !== null) {
        const parentCategory = await findCategoryById(data.parent_category_id);
        if (!parentCategory) {
          return res.status(400).json({
            message: "Parent category not found",
          });
        }

        const createsCycle = await isCategoryAncestor(
          id,
          data.parent_category_id
        );
        if (createsCycle) {
          return res.status(400).json({
            message: "Cannot set parent category: circular hierarchy detected",
          });
        }
      }
    }

    const category = await updateCategory(id, data);

    return res.status(200).json({
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    console.error("Update category error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function deleteCategoryHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const existingCategory = await findCategoryById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    const [childCount, productCount] = await Promise.all([
      countChildCategories(id),
      countProductsByCategory(id),
    ]);

    if (childCount > 0) {
      return res.status(400).json({
        message: "Cannot delete category with child categories",
      });
    }

    if (productCount > 0) {
      return res.status(400).json({
        message: "Cannot delete category with associated products",
      });
    }

    await deleteCategory(id);

    return res.status(200).json({
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Delete category error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  listCategories,
  getCategoryById,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
};
