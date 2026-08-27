const db = require("../../config/db");

function getWishlistItems(userId) {
  return db("wishlist_items")
    .select([
      "wishlist_items.id as wishlist_id",
      "wishlist_items.product_id",
      "wishlist_items.created_at as wishlisted_at",
      "products.id",
      "products.name",
      "products.description",
      "products.price",
      "products.stock",
      "products.availability_type",
      "products.images",
      "products.is_active",
      "products.category_id",
      "categories.name as category_name",
    ])
    .join("products", "wishlist_items.product_id", "products.id")
    .leftJoin("categories", "products.category_id", "categories.id")
    .where("wishlist_items.user_id", userId)
    .orderBy("wishlist_items.created_at", "desc");
}

function findWishlistItem(userId, productId) {
  return db("wishlist_items")
    .where({ user_id: userId, product_id: productId })
    .first();
}

function addWishlistItem(userId, productId) {
  return db("wishlist_items")
    .insert({ user_id: userId, product_id: productId })
    .onConflict(["user_id", "product_id"])
    .ignore()
    .returning("*");
}

function removeWishlistItem(userId, productId) {
  return db("wishlist_items")
    .where({ user_id: userId, product_id: productId })
    .del();
}

function clearWishlist(userId) {
  return db("wishlist_items").where({ user_id: userId }).del();
}

module.exports = {
  getWishlistItems,
  findWishlistItem,
  addWishlistItem,
  removeWishlistItem,
  clearWishlist,
};

