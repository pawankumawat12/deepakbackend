const db = require("../../config/db");

/**
 * Insert a new message into order_messages
 */
async function createMessage({
  orderId,
  senderId = null,
  senderRole = "customer",
  senderName = "User",
  message = "",
  attachmentUrl = null,
  attachmentType = null,
  attachmentName = null,
  attachmentSize = null,
}) {
  const insertData = {
    order_id: Number(orderId),
    sender_id: senderId ? Number(senderId) : null,
    sender_role: senderRole,
    sender_name: senderName,
    message: (message || "").trim(),
    is_read: false,
  };

  if (attachmentUrl) {
    insertData.attachment_url = attachmentUrl;
    insertData.attachment_type = attachmentType;
    insertData.attachment_name = attachmentName;
    insertData.attachment_size = attachmentSize;
  }

  const [created] = await db("order_messages")
    .insert(insertData)
    .returning("*");

  return created;
}

/**
 * Get all messages for a specific order, sorted chronologically
 */
async function getMessagesByOrderId(orderId) {
  const rows = await db("order_messages")
    .where({ order_id: Number(orderId) })
    .orderBy("created_at", "asc");

  return rows;
}

/**
 * Mark messages in an order as read when opened by customer or admin
 */
async function markOrderMessagesAsRead(orderId, readerRole) {
  // If reader is customer, mark admin messages as read.
  // If reader is admin, mark customer messages as read.
  const targetSenderRole = readerRole === "admin" ? "customer" : "admin";

  const updated = await db("order_messages")
    .where({
      order_id: Number(orderId),
      sender_role: targetSenderRole,
      is_read: false,
    })
    .update({
      is_read: true,
      read_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated;
}

/**
 * Get unread count for an order based on reader role
 */
async function getUnreadCountForOrder(orderId, readerRole) {
  const targetSenderRole = readerRole === "admin" ? "customer" : "admin";

  const countRes = await db("order_messages")
    .where({
      order_id: Number(orderId),
      sender_role: targetSenderRole,
      is_read: false,
    })
    .count("id as count")
    .first();

  return Number(countRes?.count || 0);
}

module.exports = {
  createMessage,
  getMessagesByOrderId,
  markOrderMessagesAsRead,
  getUnreadCountForOrder,
};

