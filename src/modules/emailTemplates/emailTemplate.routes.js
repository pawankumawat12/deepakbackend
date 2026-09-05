const express = require("express");
const { verifyToken, isAdmin } = require("../../../middleware/auth.middleware");
const {
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} = require("./emailTemplate.controller");

const router = express.Router();
router.use(verifyToken, isAdmin);
router.get("/", listEmailTemplates);
router.get("/:id", getEmailTemplate);
router.post("/", createEmailTemplate);
router.put("/:id", updateEmailTemplate);
router.delete("/:id", deleteEmailTemplate);

module.exports = router;
