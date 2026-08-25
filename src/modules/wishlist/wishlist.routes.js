const express = require("express");
const { verifyToken } = require("../../../middleware/auth.middleware");
const {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
  toggleWishlist,
  clearWishlist,
} = require("./wishlist.controller");

const router = express.Router();

router.use(verifyToken);

router.get("/", getWishlist);
router.post("/items", addWishlistItem);
router.delete("/items/:productId", removeWishlistItem);
router.post("/toggle", toggleWishlist);
router.delete("/", clearWishlist);

module.exports = router;

