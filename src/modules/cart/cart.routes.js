const express = require("express");
const { verifyToken } = require("../../../middleware/auth.middleware");
const { getCart, addCartItem, updateCartItem, deleteCartItem, deleteCart } = require("./cart.controller");

const router = express.Router();
router.use(verifyToken);
router.get("/", getCart);
router.post("/items", addCartItem);
router.patch("/items/:productId", updateCartItem);
router.delete("/items/:productId", deleteCartItem);
router.delete("/", deleteCart);
module.exports = router;
