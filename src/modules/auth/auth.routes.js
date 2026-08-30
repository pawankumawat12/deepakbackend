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
  verifyPasswordResetToken,
  resetPassword,
  updateProfile,
  getCustomers,
  editCustomer,
  removeCustomer,
  toggleCustomerStatus,
  submitBlockedSupportRequest,
  getBlockedSupportRequests,
  resolveBlockedSupportRequest,
} = require("./auth.controller");
const {
  verifyToken,
  isAdmin,
} = require("../../../middleware/auth.middleware");
const { countAdmins } = require("../../models/auth.model");
const { uploadImage } = require("../../../middleware/upload");

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
router.get("/reset-password/:accessToken", verifyPasswordResetToken);
router.post("/reset-password/:accessToken", resetPassword);
router.post("/register", register);

router.post("/verify-otp", verifyOtp);
router.get("/me", verifyToken, getMe);
router.put(
  "/profile",
  verifyToken,
  uploadImage.single("image"),
  updateProfile
);

// Customer Management (Admin)
router.get("/customers", verifyToken, isAdmin, getCustomers);
router.put("/customers/:id", verifyToken, isAdmin, editCustomer);
router.delete("/customers/:id", verifyToken, isAdmin, removeCustomer);
router.patch("/customers/:id/status", verifyToken, isAdmin, toggleCustomerStatus);

// Blocked Support Requests
router.post("/blocked-support-request", submitBlockedSupportRequest);
router.get(
  "/blocked-support-requests",
  verifyToken,
  isAdmin,
  getBlockedSupportRequests
);
router.patch(
  "/blocked-support-requests/:id/resolve",
  verifyToken,
  isAdmin,
  resolveBlockedSupportRequest
);

router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);
router.post("/register-admin", allowInitialAdmin, registerAdmin);

module.exports = router;
