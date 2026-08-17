const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const {
  listProducts,
  getProductById,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
} = require("./product.controller");

const router = express.Router();

router.get("/", verifyToken, listProducts);
router.get("/:id", verifyToken, getProductById);
router.post("/", verifyToken, isAdmin, createProductHandler);
router.put("/:id", verifyToken, isAdmin, updateProductHandler);
router.delete("/:id", verifyToken, isAdmin, deleteProductHandler);

module.exports = router;
