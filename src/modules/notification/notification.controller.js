const notificationModel = require("../../models/notification.model");

async function listNotifications(req, res) {
  try {
    const user = req.user;
    const role = user.role === "admin" ? "admin" : "customer";
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const notifications = await notificationModel.getNotifications({
      userId: user.id,
      role,
      limit,
      offset,
    });

    const unreadCount = await notificationModel.getUnreadNotificationCount({
      userId: user.id,
      role,
    });

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Error listing notifications:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
}

async function getUnreadCount(req, res) {
  try {
    const user = req.user;
    const role = user.role === "admin" ? "admin" : "customer";

    const count = await notificationModel.getUnreadNotificationCount({
      userId: user.id,
      role,
    });

    return res.status(200).json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    return res.status(500).json({ success: false, message: "Failed to get unread count" });
  }
}

async function markRead(req, res) {
  try {
    const { id } = req.params;
    const updated = await notificationModel.markNotificationAsRead(id);

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({ success: false, message: "Failed to mark notification read" });
  }
}

async function markAllRead(req, res) {
  try {
    const user = req.user;
    const role = user.role === "admin" ? "admin" : "customer";

    await notificationModel.markAllNotificationsAsRead({
      userId: user.id,
      role,
    });

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    return res.status(500).json({ success: false, message: "Failed to mark notifications read" });
  }
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};

