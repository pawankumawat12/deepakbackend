const express = require("express");
const router = express.Router();
const {
  getEmailLogs,
  getEmailLogStats,
  getEmailLogById,
  deleteEmailLog,
  bulkDeleteEmailLogs,
} = require("./emailLog.controller");
const {
  verifyToken,
  isAdmin,
} = require("../../../middleware/auth.middleware");

// All email log endpoints are strictly admin-protected
router.use(verifyToken, isAdmin);

// List logs (paginated, filtered, searchable, sorted)
router.get("/", getEmailLogs);

// Aggregate statistics
router.get("/stats", getEmailLogStats);

// Bulk delete
router.delete("/bulk", bulkDeleteEmailLogs);

// Single log detail (including full HTML)
router.get("/:id", getEmailLogById);

// Single log delete
router.delete("/:id", deleteEmailLog);

module.exports = router;

