const db = require("../../config/db");

const PRODUCT_COLUMNS = [
  "products.id",
  "products.name",
  "products.description",
  "products.price",
  "products.stock",
  "products.availability_type",
  "products.images",
  "products.category_id",
  "products.is_active",
  "products.created_at",
  "products.updated_at",
];

function serializeImages(data) {
  if (!Array.isArray(data.images)) return data;
  return { ...data, images: JSON.stringify(data.images) };
}

function findProductById(id) {
  return db("products")
    .select([
      ...PRODUCT_COLUMNS,
      "categories.name as category_name",
      db.raw(
        "COALESCE(ROUND(AVG(CASE WHEN reviews.is_hidden = false THEN reviews.rating END)::numeric, 1), 0)::float as rating"
      ),
      db.raw(
        "COUNT(CASE WHEN reviews.is_hidden = false THEN reviews.id END)::int as total_reviews"
      ),
    ])
    .leftJoin("categories", "products.category_id", "categories.id")
    .leftJoin("reviews", "products.id", "reviews.product_id")
    .where("products.id", id)
    .groupBy("products.id", "categories.name")
    .first();
}

function findProducts({
  page,
  limit,
  offset,
  categoryId,
  isActive,
  availabilityType,
  search,
  sortBy = "products.created_at",
  sortOrder = "desc",
}) {
  let query = db("products")
    .select([
      ...PRODUCT_COLUMNS,
      "categories.name as category_name",
      db.raw(
        "COALESCE(ROUND(AVG(CASE WHEN reviews.is_hidden = false THEN reviews.rating END)::numeric, 1), 0)::float as rating"
      ),
      db.raw(
        "COUNT(CASE WHEN reviews.is_hidden = false THEN reviews.id END)::int as total_reviews"
      ),
    ])
    .leftJoin("categories", "products.category_id", "categories.id")
    .leftJoin("reviews", "products.id", "reviews.product_id");

  if (categoryId !== undefined) {
    query = query.where("products.category_id", categoryId);
  }

  if (isActive !== undefined) {
    query = query.where("products.is_active", isActive);
  }

  if (availabilityType !== undefined) {
    query = query.where("products.availability_type", availabilityType);
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
    .groupBy("products.id", "categories.name")
    .orderBy(sortBy, sortOrder)
    .limit(limit)
    .offset(offset);
}

function countProducts({ categoryId, isActive, availabilityType, search }) {
  let query = db("products");

  if (categoryId !== undefined) {
    query = query.where({ category_id: categoryId });
  }

  if (isActive !== undefined) {
    query = query.where({ is_active: isActive });
  }

  if (availabilityType !== undefined) {
    query = query.where({ availability_type: availabilityType });
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
    .insert(serializeImages(data))
    .returning([
      "id",
      "name",
      "description",
      "price",
      "stock",
      "availability_type",
      "images",
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
    .update(serializeImages(data))
    .returning([
      "id",
      "name",
      "description",
      "price",
      "stock",
      "availability_type",
      "images",
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
