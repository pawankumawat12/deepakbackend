const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const { getTheme, updateTheme } = require("./settings.controller");

const router = express.Router();

router.get("/theme", getTheme);
router.put("/theme", verifyToken, isAdmin, updateTheme);

module.exports = router;
