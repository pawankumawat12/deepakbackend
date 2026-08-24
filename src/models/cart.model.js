const db = require("../../config/db");

function getCartItems(userId) {
  return db("cart_items")
    .select([
      "cart_items.id",
      "cart_items.product_id",
      "cart_items.quantity",
      "products.name",
      "products.description",
      "products.price",
      "products.stock",
      "products.images",
      "products.is_active",
      "categories.name as category_name",
    ])
    .join("products", "cart_items.product_id", "products.id")
    .leftJoin("categories", "products.category_id", "categories.id")
    .where("cart_items.user_id", userId)
    .orderBy("cart_items.updated_at", "desc");
}

function findCartItem(userId, productId) {
  return db("cart_items").where({ user_id: userId, product_id: productId }).first();
}

function upsertCartItem(userId, productId, quantity) {
  return db("cart_items")
    .insert({ user_id: userId, product_id: productId, quantity })
    .onConflict(["user_id", "product_id"])
    .merge({ quantity, updated_at: db.fn.now() });
}

function removeCartItem(userId, productId) {
  return db("cart_items").where({ user_id: userId, product_id: productId }).del();
}

function clearCart(userId) {
  return db("cart_items").where({ user_id: userId }).del();
}

module.exports = { getCartItems, findCartItem, upsertCartItem, removeCartItem, clearCart };
