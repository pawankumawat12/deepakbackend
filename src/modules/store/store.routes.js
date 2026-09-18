const express = require("express");
const router = express.Router();
const {
  createStore,
  listStores,
  getStoreDetails,
  updateStore,
  toggleStoreStatus,
  toggleStoreAutoForward,
  deleteStore,
  requestStoreAccess,
  listAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  verifySetupToken,
  setPassword,
  getMyStore,
} = require("./store.controller");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");

// Public endpoints for Store Owner passwordless access request & setup
router.post("/request-access", requestStoreAccess);
router.get("/verify-setup-token", verifySetupToken);
router.post("/set-password", setPassword);

// Store Owner private endpoints
router.get("/my-store", verifyToken, getMyStore);
router.patch("/:id/status", verifyToken, toggleStoreStatus);

// Admin-only Store & Access Request Management
router.get("/requests", verifyToken, isAdmin, listAccessRequests);
router.patch("/requests/:id/approve", verifyToken, isAdmin, approveAccessRequest);
router.patch("/requests/:id/reject", verifyToken, isAdmin, rejectAccessRequest);

router.post("/", verifyToken, isAdmin, createStore);
router.get("/", verifyToken, isAdmin, listStores);
router.get("/:id", verifyToken, getStoreDetails);
router.patch("/:id", verifyToken, isAdmin, updateStore);
router.patch("/:id/auto-forward", verifyToken, isAdmin, toggleStoreAutoForward);
router.delete("/:id", verifyToken, isAdmin, deleteStore);

module.exports = router;

