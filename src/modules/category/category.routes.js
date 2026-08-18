const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const {
  listCategories,
  getCategoryById,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} = require("./category.controller");
const { uploadImage } = require("../../../middleware/upload");

const router = express.Router();

router.get("/",  listCategories);
router.get("/:id", getCategoryById);
router.post("/", verifyToken, isAdmin, uploadImage.single("image"), createCategoryHandler);
router.put("/:id", verifyToken, isAdmin,uploadImage.single("image"), updateCategoryHandler);
router.delete("/:id", verifyToken, isAdmin, deleteCategoryHandler);

module.exports = router;
