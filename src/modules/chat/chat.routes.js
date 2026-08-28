const express = require("express");
const { verifyToken } = require("../../../middleware/auth.middleware");
const { uploadChatAttachment } = require("../../../middleware/upload");
const {
  getOrderMessages,
  postOrderMessage,
  markMessagesRead,
} = require("./chat.controller");

const router = express.Router();

router.use(verifyToken);
router.get("/orders/:id/messages", getOrderMessages);
router.post(
  "/orders/:id/messages",
  uploadChatAttachment.single("file"),
  postOrderMessage
);
router.patch("/orders/:id/messages/read", markMessagesRead);

module.exports = router;

