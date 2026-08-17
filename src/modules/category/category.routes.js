const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const {
  listCategories,
  getCategoryById,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} = require("./category.controller");

const router = express.Router();

router.get("/", verifyToken, listCategories);
router.get("/:id", verifyToken, getCategoryById);
router.post("/", verifyToken, isAdmin, createCategoryHandler);
router.put("/:id", verifyToken, isAdmin, updateCategoryHandler);
router.delete("/:id", verifyToken, isAdmin, deleteCategoryHandler);

module.exports = router;
