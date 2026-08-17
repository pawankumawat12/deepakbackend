const db = require("../../config/db");

const PRODUCT_COLUMNS = [
  "products.id",
  "products.name",
  "products.description",
  "products.price",
  "products.stock",
  "products.category_id",
  "products.is_active",
  "products.created_at",
  "products.updated_at",
];

function findProductById(id) {
  return db("products")
    .select([
      ...PRODUCT_COLUMNS,
      "categories.name as category_name",
    ])
    .leftJoin("categories", "products.category_id", "categories.id")
    .where("products.id", id)
    .first();
}

function findProducts({ page, limit, offset, categoryId, isActive, search }) {
  let query = db("products")
    .select([
      ...PRODUCT_COLUMNS,
      "categories.name as category_name",
    ])
    .leftJoin("categories", "products.category_id", "categories.id");

  if (categoryId !== undefined) {
    query = query.where("products.category_id", categoryId);
  }

  if (isActive !== undefined) {
    query = query.where("products.is_active", isActive);
  }

  if (search) {
    query = query.where(function () {
      this.whereILike("products.name", `%${search}%`).orWhereILike(
        "products.description",
        `%${search}%`,
      );
    });
  }

  return query
    .orderBy("products.created_at", "desc")
    .limit(limit)
    .offset(offset);
}

function countProducts({ categoryId, isActive, search }) {
  let query = db("products");

  if (categoryId !== undefined) {
    query = query.where({ category_id: categoryId });
  }

  if (isActive !== undefined) {
    query = query.where({ is_active: isActive });
  }

  if (search) {
    query = query.where(function () {
      this.whereILike("name", `%${search}%`).orWhereILike(
        "description",
        `%${search}%`,
      );
    });
  }

  return query
    .count("id as count")
    .first()
    .then((row) => Number(row.count || 0));
}

function countProductsByCategory(categoryId) {
  return db("products")
    .where({ category_id: categoryId })
    .count("id as count")
    .first()
    .then((row) => Number(row.count || 0));
}

function createProduct(data) {
  return db("products")
    .insert(data)
    .returning([
      "id",
      "name",
      "description",
      "price",
      "stock",
      "category_id",
      "is_active",
      "created_at",
      "updated_at",
    ])
    .then((rows) => rows[0]);
}

function updateProduct(id, data) {
  return db("products")
    .where({ id })
    .update(data)
    .returning([
      "id",
      "name",
      "description",
      "price",
      "stock",
      "category_id",
      "is_active",
      "created_at",
      "updated_at",
    ])
    .then((rows) => rows[0]);
}

function deleteProduct(id) {
  return db("products").where({ id }).del();
}

module.exports = {
  findProductById,
  findProducts,
  countProducts,
  countProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
};
