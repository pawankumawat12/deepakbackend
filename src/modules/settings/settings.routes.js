const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const { uploadImage } = require("../../../middleware/upload");
const {
  getTheme,
  updateTheme,
  getFooter,
  updateFooter,
  getLogo,
  updateLogo,
} = require("./settings.controller");

const router = express.Router();

router.get("/theme", getTheme);
router.put("/theme", verifyToken, isAdmin, updateTheme);

router.get("/footer", getFooter);
router.put("/footer", verifyToken, isAdmin, updateFooter);

router.get("/logo", getLogo);
router.put("/logo", verifyToken, isAdmin, uploadImage.single("logo"), updateLogo);

module.exports = router;
