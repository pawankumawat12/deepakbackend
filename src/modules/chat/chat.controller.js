const orderModel = require("../../models/order.model");
const orderMessageModel = require("../../models/orderMessage.model");
const notificationModel = require("../../models/notification.model");
const { emitToOrder, emitToAdmin, emitToUser } = require("../../socket/socket.service");

/**
 * Get chat history for a specific order and mark unread messages as read
 */
async function getOrderMessages(req, res) {
  try {
    const { id: orderId } = req.params;
    const user = req.user;

    const order = await orderModel.findOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check ownership if not admin
    if (user.role !== "admin" && Number(order.user_id) !== Number(user.id)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to order chat" });
    }

    const messages = await orderMessageModel.getMessagesByOrderId(orderId);

    // Mark counter-party messages as read
    const userRole = user.role === "admin" ? "admin" : "customer";
    await orderMessageModel.markOrderMessagesAsRead(orderId, userRole);

    // Emit read receipt to order room
    emitToOrder(orderId, "messages_read", {
      orderId,
      readerRole: userRole,
      readAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Error getting order messages:", error);
    return res.status(500).json({ success: false, message: "Failed to get order messages" });
  }
}

/**
 * Post a new message to an order chat
 */
async function postOrderMessage(req, res) {
  try {
    const { id: orderId } = req.params;
    const user = req.user;
    const { message } = req.body || {};
    let attachmentUrl = req.body?.attachmentUrl || null;
    let attachmentType = req.body?.attachmentType || null;
    let attachmentName = req.body?.attachmentName || null;
    let attachmentSize = req.body?.attachmentSize || null;

    if (req.file) {
      attachmentUrl = `/uploads/${req.file.filename}`;
      attachmentName = req.file.originalname;
      attachmentType = req.file.mimetype.startsWith("image/")
        ? "image"
        : "document";
      const bytes = req.file.size || 0;
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = bytes > 0 ? Math.floor(Math.log(bytes) / Math.log(k)) : 0;
      attachmentSize =
        parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    if ((!message || !message.trim()) && !attachmentUrl) {
      return res
        .status(400)
        .json({ success: false, message: "Message or attachment is required" });
    }

    const order = await orderModel.findOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check ownership if not admin
    if (user.role !== "admin" && Number(order.user_id) !== Number(user.id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to post message in this order" });
    }

    const requestedRole = req.body.senderRole;
    let senderRole = "customer";
    if (requestedRole === "admin" && user.role === "admin") {
      senderRole = "admin";
    } else if (requestedRole === "customer") {
      senderRole = "customer";
    } else if (user.role === "admin" && Number(order.user_id) !== Number(user.id)) {
      senderRole = "admin";
    } else {
      senderRole = "customer";
    }

    const senderName =
      senderRole === "admin"
        ? "SFC Cafe"
        : (order.customer_name || user.name || "Customer");

    // Persist message in database
    const savedMessage = await orderMessageModel.createMessage({
      orderId,
      senderId: user.id,
      senderRole,
      senderName,
      message: message || (attachmentType === "image" ? "📷 Photo" : "📄 Document"),
      attachmentUrl,
      attachmentType,
      attachmentName,
      attachmentSize,
    });

    // 1. Emit live message to order room (for active chat viewers)
    emitToOrder(orderId, "new_chat_message", {
      orderId,
      message: savedMessage,
    });

    // 2. Send notification to counterpart
    if (senderRole === "customer") {
      // Notify admin
      await notificationModel.createNotification({
        role: "admin",
        type: "chat_message",
        title: `New Message on #${order.order_number || order.id}`,
        message: `${senderName}: ${message.substring(0, 80)}`,
        orderId: order.id,
        dataJson: { orderId: order.id, senderName, messageText: message },
      });

      emitToAdmin("admin_new_message", {
        orderId: order.id,
        orderNumber: order.order_number || `#SFC-${order.id}`,
        customerName: senderName,
        message: savedMessage,
      });
    } else {
      // Notify customer
      if (order.user_id) {
        await notificationModel.createNotification({
          userId: order.user_id,
          role: "customer",
          type: "chat_message",
          title: `New Message from SFC Cafe`,
          message: `Regarding Order #${order.order_number || order.id}: ${message.substring(0, 80)}`,
          orderId: order.id,
          dataJson: { orderId: order.id, messageText: message },
        });

        emitToUser(order.user_id, "customer_new_message", {
          orderId: order.id,
          orderNumber: order.order_number || `#SFC-${order.id}`,
          message: savedMessage,
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: savedMessage,
    });
  } catch (error) {
    console.error("Error posting order message:", error);
    return res.status(500).json({ success: false, message: "Failed to send message" });
  }
}

/**
 * Mark messages in an order as read
 */
async function markMessagesRead(req, res) {
  try {
    const { id: orderId } = req.params;
    const user = req.user;
    const userRole = user.role === "admin" ? "admin" : "customer";

    await orderMessageModel.markOrderMessagesAsRead(orderId, userRole);

    emitToOrder(orderId, "messages_read", {
      orderId,
      readerRole: userRole,
      readAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: "Messages marked as read" });
  } catch (error) {
    console.error("Error marking messages read:", error);
    return res.status(500).json({ success: false, message: "Failed to mark messages as read" });
  }
}

module.exports = {
  getOrderMessages,
  postOrderMessage,
  markMessagesRead,
};

