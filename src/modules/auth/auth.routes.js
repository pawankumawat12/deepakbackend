const express = require("express");
const router = express.Router();
const {
  register,
  registerAdmin,
  login,
  sendotp,
  verifyOtp,
  refreshAccessToken,
} = require("./auth.controller");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const { countAdmins } = require("../../models/auth.model");

async function allowInitialAdmin(req, res, next) {
  try {
    const adminCount = await countAdmins();
    if (adminCount === 0) {
      return next();
    }

    verifyToken(req, res, () => isAdmin(req, res, next));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
}


router.post("/send-otp", sendotp);
router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.post("/refresh-token",verifyToken, refreshAccessToken);
// Register admin: allow first admin without auth, then require admin token.
router.post("/register-admin", allowInitialAdmin, registerAdmin);

module.exports = router;
