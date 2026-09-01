const express = require("express");
const router = express.Router();
const dashboardController = require("./dashboard.controller");
const { isAdmin, verifyToken } = require("../../../middleware/auth.middleware");

router.get("/overview", verifyToken, isAdmin, dashboardController.getDashboardOverview);
router.get("/trends", verifyToken, isAdmin, dashboardController.getDashboardTrends);

module.exports = router;

