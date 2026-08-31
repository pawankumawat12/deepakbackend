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
  getOrderPricing,
  updateOrderPricing,
  getSmtp,
  updateSmtp,
  testSmtp,
} = require("./settings.controller");

const router = express.Router();

router.get("/theme", getTheme);
router.put("/theme", verifyToken, isAdmin, updateTheme);

router.get("/footer", getFooter);
router.put("/footer", verifyToken, isAdmin, updateFooter);

router.get("/logo", getLogo);
router.put("/logo", verifyToken, isAdmin, uploadImage.single("logo"), updateLogo);

router.get("/order-pricing", getOrderPricing);
router.put("/order-pricing", verifyToken, isAdmin, updateOrderPricing);

router.get("/smtp", verifyToken, isAdmin, getSmtp);
router.put("/smtp", verifyToken, isAdmin, updateSmtp);
router.post("/smtp/test", verifyToken, isAdmin, testSmtp);

module.exports = router;
