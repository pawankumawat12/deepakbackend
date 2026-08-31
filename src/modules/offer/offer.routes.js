const express = require("express");
const { verifyToken, isAdmin, optionalToken } = require("../../../middleware/auth.middleware");
const { uploadImage } = require("../../../middleware/upload");
const {
  getActiveOffers,
  validateOfferCode,
  getAdminOffers,
  getOffer,
  createOfferHandler,
  updateOfferHandler,
  toggleOfferStatusHandler,
  deleteOfferHandler,
} = require("./offer.controller");

const router = express.Router();

// Public / Customer routes
router.get("/", getActiveOffers);
router.post("/validate", optionalToken, validateOfferCode);

// Admin routes
router.get("/admin", verifyToken, isAdmin, getAdminOffers);
router.post("/", verifyToken, isAdmin, uploadImage.single("banner_image"), createOfferHandler);
router.get("/:id", verifyToken, isAdmin, getOffer);
router.put("/:id", verifyToken, isAdmin, uploadImage.single("banner_image"), updateOfferHandler);
router.patch("/:id/status", verifyToken, isAdmin, toggleOfferStatusHandler);
router.delete("/:id", verifyToken, isAdmin, deleteOfferHandler);

module.exports = router;

