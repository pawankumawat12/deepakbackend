const express = require("express");
const router = express.Router();

const {
  createAddressController,
  getAddressesController,
  updateAddressController,
  deleteAddressController,
  setDefaultAddressController,
} = require("./address.controller");

const { verifyToken } = require("../../../middleware/auth.middleware");

router.use(verifyToken);

router.post("/", createAddressController);

router.get("/", getAddressesController);

router.put("/:id", updateAddressController);

router.delete("/:id", deleteAddressController);

router.put("/:id/default", setDefaultAddressController);

module.exports = router;