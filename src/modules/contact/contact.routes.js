const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const {
  submitContactQuery,
  getAdminContactQueries,
  getAdminContactStats,
  updateAdminContactQuery,
  deleteAdminContactQuery,
  getMyContactQueries,
} = require("./contact.controller");
const {
  verifyToken,
  isAdmin,
} = require("../../../middleware/auth.middleware");

function optionalVerifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;
  const accessToken = req.cookies?.accessToken || bearerToken;

  if (accessToken) {
    jwt.verify(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET,
      (err, decoded) => {
        if (!err && decoded) {
          req.user = decoded;
        }
        next();
      }
    );
  } else {
    next();
  }
}

// Public / Customer endpoint to submit query
router.post("/", optionalVerifyToken, submitContactQuery);

// Customer endpoint to get their own contact query threads
router.get("/my", verifyToken, getMyContactQueries);

// Admin-only management endpoints
router.get("/admin/stats", verifyToken, isAdmin, getAdminContactStats);
router.get("/admin", verifyToken, isAdmin, getAdminContactQueries);
router.patch("/admin/:id", verifyToken, isAdmin, updateAdminContactQuery);
router.delete("/admin/:id", verifyToken, isAdmin, deleteAdminContactQuery);

module.exports = router;

