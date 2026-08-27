const {
  parsePagination,
  buildPaginationMeta,
} = require("../../../config/pagination");
const { findCategoryById } = require("../../models/category.model");
const {
  findProductById,
  findProducts,
  countProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../../models/product.model");
const {
  validateProductCreate,
  validateProductUpdate,
  validateProductListQuery,
} = require("./product.validation");

function parseIdParam(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function listProducts(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { valid, errors, filters } = validateProductListQuery(req.query);

    if (!valid) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    // Validate the category server-side before querying its products.
    if (filters.categoryId !== undefined) {
      const category = await findCategoryById(filters.categoryId);
      if (!category) {
        return res.status(400).json({
          message: "Category not found for the given filter",
        });
      }
    }

    const [products, total] = await Promise.all([
      findProducts({ page, limit, offset, ...filters }),
      countProducts(filters),
    ]);

    return res.status(200).json({
      message: "Products fetched successfully",
      data: products,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (error) {
    console.error("List products error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getProductById(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await findProductById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json({
      message: "Product fetched successfully",
      data: product,
    });
  } catch (error) {
    console.error("Get product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function createProductHandler(req, res) {
  try {
    const { name, description, price, stock, availabilityType, categoryId, isActive } =
      req.body || {};

    const images = (req.files || []).map((file) => `/uploads/${file.filename}`);
    const { valid, errors, data } = validateProductCreate({
      name,
      description,
      price,
      stock,
      availabilityType,
      images,
      categoryId,
      isActive,
    });

    if (!valid) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    const category = await findCategoryById(data.category_id);
    if (!category) {
      return res.status(400).json({
        message: "Category not found",
      });
    }

    const product = await createProduct(data);
    const productWithCategory = await findProductById(product.id);

    return res.status(201).json({
      message: "Product created successfully",
      data: productWithCategory,
    });
  } catch (error) {
    console.error("Create product error:", error);

    if (error.code === "23503") {
      return res.status(400).json({
        message: "Invalid category reference",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
}

async function updateProductHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const existingProduct = await findProductById(id);

    if (!existingProduct) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const {
      name,
      description,
      price,
      stock,
      availabilityType,
      categoryId,
      isActive,
      existingImages,
    } = req.body || {};

    /*
     * Existing images that frontend wants to keep
     */
    let keptImages = [];

    if (existingImages) {
      try {
        keptImages =
          typeof existingImages === "string"
            ? JSON.parse(existingImages)
            : existingImages;
      } catch {
        return res.status(400).json({
          message: "Invalid existingImages format",
        });
      }
    }

    if (!Array.isArray(keptImages)) {
      return res.status(400).json({
        message: "existingImages must be an array",
      });
    }

    /*
     * New uploaded images
     */
    const newImages = (req.files || []).map(
      (file) => `/uploads/${file.filename}`
    );

    /*
     * Final images
     *
     * Existing images user kept
     * +
     * Newly uploaded images
     */
    const images = [
      ...keptImages,
      ...newImages,
    ];

    /*
     * Maximum 5 images
     */
    if (images.length > 5) {
      return res.status(400).json({
        message: "Maximum 5 images are allowed",
      });
    }

    const { valid, errors, data } =
      validateProductUpdate({
        name,
        description,
        price,
        stock,
        availabilityType,
        images,
        categoryId,
        isActive,
      });

    if (!valid) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    if (data.category_id) {
      const category = await findCategoryById(
        data.category_id
      );

      if (!category) {
        return res.status(400).json({
          message: "Category not found",
        });
      }
    }

    await updateProduct(id, data);

    const product = await findProductById(id);

    return res.status(200).json({
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Update product error:", error);

    if (error.code === "23503") {
      return res.status(400).json({
        message: "Invalid category reference",
      });
    }

    return res.status(500).json({
      message: "Server error",
    });
  }
}

async function deleteProductHandler(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const existingProduct = await findProductById(id);
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    await deleteProduct(id);

    return res.status(200).json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  listProducts,
  getProductById,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
};
