const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const {
  listProducts,
  getProductById,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
} = require("./product.controller");
const { uploadImage } = require("../../../middleware/upload");

const router = express.Router();

// Storefront menu and product details are public read-only resources.
router.get("/", listProducts);
router.get("/:id", getProductById);
router.post("/", verifyToken, isAdmin, uploadImage.array("images", 5), createProductHandler);
router.put("/:id", verifyToken, isAdmin, uploadImage.array("images", 5), updateProductHandler);
router.delete("/:id", verifyToken, isAdmin, deleteProductHandler);

module.exports = router;
