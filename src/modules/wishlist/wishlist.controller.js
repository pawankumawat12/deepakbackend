const { findProductById } = require("../../models/product.model");
const {
  getWishlistItems,
  findWishlistItem,
  addWishlistItem: addWishlistItemDb,
  removeWishlistItem: removeWishlistItemDb,
  clearWishlist: clearWishlistDb,
} = require("../../models/wishlist.model");

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function respondWithWishlist(res, userId, message, extra = {}) {
  const items = await getWishlistItems(userId);
  return res.status(200).json({ message, data: items, ...extra });
}

async function getWishlist(req, res) {
  try {
    return respondWithWishlist(res, req.user.id, "Wishlist fetched successfully");
  } catch (error) {
    console.error("Get wishlist error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function addWishlistItem(req, res) {
  try {
    const productId = parsePositiveInteger(req.body?.productId);
    if (!productId) {
      return res.status(400).json({ message: "productId must be a positive integer" });
    }

    const product = await findProductById(productId);
    if (!product || !product.is_active) {
      return res.status(404).json({ message: "Product is not available" });
    }

    await addWishlistItemDb(req.user.id, productId);
    return respondWithWishlist(res, req.user.id, "Item added to wishlist", { inWishlist: true });
  } catch (error) {
    console.error("Add wishlist item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function removeWishlistItem(req, res) {
  try {
    const productId = parsePositiveInteger(req.params.productId);
    if (!productId) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    await removeWishlistItemDb(req.user.id, productId);
    return respondWithWishlist(res, req.user.id, "Item removed from wishlist", { inWishlist: false });
  } catch (error) {
    console.error("Remove wishlist item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function toggleWishlist(req, res) {
  try {
    const productId = parsePositiveInteger(req.body?.productId);
    if (!productId) {
      return res.status(400).json({ message: "productId must be a positive integer" });
    }

    const existing = await findWishlistItem(req.user.id, productId);
    if (existing) {
      await removeWishlistItemDb(req.user.id, productId);
      return respondWithWishlist(res, req.user.id, "Item removed from wishlist", { inWishlist: false });
    }

    const product = await findProductById(productId);
    if (!product || !product.is_active) {
      return res.status(404).json({ message: "Product is not available" });
    }

    await addWishlistItemDb(req.user.id, productId);
    return respondWithWishlist(res, req.user.id, "Item added to wishlist", { inWishlist: true });
  } catch (error) {
    console.error("Toggle wishlist error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function clearWishlist(req, res) {
  try {
    await clearWishlistDb(req.user.id);
    return res.status(200).json({ message: "Wishlist cleared", data: [] });
  } catch (error) {
    console.error("Clear wishlist error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
  toggleWishlist,
  clearWishlist,
};

