const { findProductById } = require("../../models/product.model");
const { getCartItems, findCartItem, upsertCartItem, removeCartItem, clearCart } = require("../../models/cart.model");

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function respondWithCart(res, userId, message) {
  const items = await getCartItems(userId);
  return res.status(200).json({ message, data: items });
}

async function getCart(req, res) {
  try { return respondWithCart(res, req.user.id, "Cart fetched successfully"); }
  catch (error) { console.error("Get cart error:", error); return res.status(500).json({ message: "Server error" }); }
}

async function addCartItem(req, res) {
  try {
    const productId = parsePositiveInteger(req.body?.productId);
    const quantity = parsePositiveInteger(req.body?.quantity || 1);
    if (!productId || !quantity) return res.status(400).json({ message: "productId and quantity must be positive integers" });
    const product = await findProductById(productId);
    if (!product || !product.is_active) return res.status(404).json({ message: "Product is not available" });
    const current = await findCartItem(req.user.id, productId);
    const requestedQuantity = (current?.quantity || 0) + quantity;
    if (product.stock < requestedQuantity) return res.status(400).json({ message: `Only ${product.stock} item(s) are available`, availableStock: product.stock });
    await upsertCartItem(req.user.id, productId, requestedQuantity);
    return respondWithCart(res, req.user.id, "Item added to cart");
  } catch (error) { console.error("Add cart item error:", error); return res.status(500).json({ message: "Server error" }); }
}

async function updateCartItem(req, res) {
  try {
    const productId = parsePositiveInteger(req.params.productId);
    const quantity = Number(req.body?.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ message: "quantity must be a non-negative integer" });
    if (quantity === 0) { await removeCartItem(req.user.id, productId); return respondWithCart(res, req.user.id, "Item removed from cart"); }
    const product = await findProductById(productId);
    if (!product || !product.is_active) return res.status(404).json({ message: "Product is not available" });
    if (product.stock < quantity) return res.status(400).json({ message: `Only ${product.stock} item(s) are available`, availableStock: product.stock });
    await upsertCartItem(req.user.id, productId, quantity);
    return respondWithCart(res, req.user.id, "Cart item updated");
  } catch (error) { console.error("Update cart item error:", error); return res.status(500).json({ message: "Server error" }); }
}

async function deleteCartItem(req, res) {
  try { await removeCartItem(req.user.id, parsePositiveInteger(req.params.productId)); return respondWithCart(res, req.user.id, "Item removed from cart"); }
  catch (error) { console.error("Delete cart item error:", error); return res.status(500).json({ message: "Server error" }); }
}

async function deleteCart(req, res) {
  try { await clearCart(req.user.id); return res.status(200).json({ message: "Cart cleared", data: [] }); }
  catch (error) { console.error("Clear cart error:", error); return res.status(500).json({ message: "Server error" }); }
}

module.exports = { getCart, addCartItem, updateCartItem, deleteCartItem, deleteCart };
