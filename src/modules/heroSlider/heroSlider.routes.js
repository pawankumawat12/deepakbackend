const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const { uploadImage } = require("../../../middleware/upload");
const {
  getActiveSliders,
  getAdminSliders,
  getSliderByIdHandler,
  createSliderHandler,
  updateSliderHandler,
  toggleSliderStatusHandler,
  reorderSlidersHandler,
  deleteSliderHandler,
} = require("./heroSlider.controller");

const router = express.Router();

// Public route: Get all active sliders for the frontend Hero component
router.get("/", getActiveSliders);

// Admin routes: Manage sliders
router.get("/admin", verifyToken, isAdmin, getAdminSliders);
router.patch("/reorder", verifyToken, isAdmin, reorderSlidersHandler);
router.get("/:id", verifyToken, isAdmin, getSliderByIdHandler);
router.post("/", verifyToken, isAdmin, uploadImage.single("image"), createSliderHandler);
router.put("/:id", verifyToken, isAdmin, uploadImage.single("image"), updateSliderHandler);
router.patch("/:id/status", verifyToken, isAdmin, toggleSliderStatusHandler);
router.delete("/:id", verifyToken, isAdmin, deleteSliderHandler);

module.exports = router;

