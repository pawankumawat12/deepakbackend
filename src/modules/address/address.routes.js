const express = require("express");
const router = express.Router();
const addressController = require("./address.controller");
const { verifyToken } = require("../../../middleware/auth.middleware");

router.use(verifyToken);

router.post("/", addressController.createAddress);
router.get("/", addressController.getAddresses);
router.put("/:id", addressController.updateAddress);
router.delete("/:id", addressController.deleteAddress);
router.put("/:id/default", addressController.setDefaultAddress);

module.exports = router;
