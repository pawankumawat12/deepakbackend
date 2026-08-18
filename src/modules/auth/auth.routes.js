const express = require("express");
const router = express.Router();
const {
  register,
  registerAdmin,
  login,
  adminLogin,
  sendOtp,
  verifyOtp,
  refreshAccessToken,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
} = require("./auth.controller");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const { countAdmins } = require("../../models/auth.model");

router.post("/login", login);
router.post("/admin-login", adminLogin);

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

router.post("/send-otp", sendOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:accessToken", resetPassword);
router.post("/register", register);


router.post("/verify-otp", verifyOtp);
router.get("/me", verifyToken, getMe);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);
// Register admin: allow first admin without auth, then require admin token.
router.post("/register-admin", allowInitialAdmin, registerAdmin);

module.exports = router;
