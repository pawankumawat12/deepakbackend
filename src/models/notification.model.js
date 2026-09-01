const db = require("../../config/db");
let socketService = null;
try {
  socketService = require("../socket/socket.service");
} catch {}

/**
 * Insert a new notification
 */
async function createNotification({
  userId = null,
  role = "customer",
  type,
  title,
  message,
  orderId = null,
  dataJson = null,
}) {
  const [created] = await db("notifications")
    .insert({
      user_id: userId ? Number(userId) : null,
      role,
      type,
      title,
      message,
      order_id: orderId ? Number(orderId) : null,
      data_json: dataJson
        ? typeof dataJson === "string"
          ? dataJson
          : JSON.stringify(dataJson)
        : null,
      is_read: false,
    })
    .returning("*");

  // Emit live Socket.IO notification
  if (socketService) {
    try {
      if (role === "admin") {
        socketService.emitToAdmin("notification:new", created);
        getUnreadNotificationCount({ role: "admin" }).then((count) => {
          socketService.emitToAdmin("notification:unread_count", { unreadCount: count });
        });
      } else if (userId) {
        socketService.emitToUser(userId, "notification:new", created);
        getUnreadNotificationCount({ userId, role: "customer" }).then((count) => {
          socketService.emitToUser(userId, "notification:unread_count", { unreadCount: count });
        });
      }
    } catch (err) {
      console.error("[Notification] Socket emission error:", err);
    }
  }

  return created;
}

/**
 * Retrieve notifications for a user or for admins
 */
async function getNotifications({ userId = null, role = "customer", page = 1, limit = 20, offset = null }) {
  let query = db("notifications");

  if (role === "admin") {
    query = query.where({ role: "admin" });
  } else if (userId) {
    query = query.where({ user_id: Number(userId), role: "customer" });
  } else {
    return { notifications: [], pagination: { total: 0, page: 1, limit, totalPages: 1 } };
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(100, Number(limit) || 20));
  const off = offset !== null ? Number(offset) : (p - 1) * l;

  const [notifications, countRow] = await Promise.all([
    query.clone().orderBy("created_at", "desc").limit(l).offset(off),
    query.clone().count("id as count").first(),
  ]);

  const total = Number(countRow?.count || 0);

  return {
    notifications,
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
    },
  };
}

/**
 * Get unread notification count
 */
async function getUnreadNotificationCount({ userId = null, role = "customer" }) {
  let query = db("notifications").where({ is_read: false });

  if (role === "admin") {
    query = query.where({ role: "admin" });
  } else if (userId) {
    query = query.where({ user_id: Number(userId), role: "customer" });
  } else {
    return 0;
  }

  const countRes = await query.count("id as count").first();
  return Number(countRes?.count || 0);
}

/**
 * Mark a single notification as read
 */
async function markNotificationAsRead(id) {
  const existing = await db("notifications").where({ id: Number(id) }).first();
  const [updated] = await db("notifications")
    .where({ id: Number(id) })
    .update({ is_read: true, updated_at: db.fn.now() })
    .returning("*");

  if (socketService && existing) {
    try {
      if (existing.role === "admin") {
        getUnreadNotificationCount({ role: "admin" }).then((count) => {
          socketService.emitToAdmin("notification:unread_count", { unreadCount: count });
        });
      } else if (existing.user_id) {
        getUnreadNotificationCount({ userId: existing.user_id, role: "customer" }).then((count) => {
          socketService.emitToUser(existing.user_id, "notification:unread_count", { unreadCount: count });
        });
      }
    } catch {}
  }

  return updated || existing;
}

/**
 * Mark all notifications as read for a user or admin
 */
async function markAllNotificationsAsRead({ userId = null, role = "customer" }) {
  let query = db("notifications").where({ is_read: false });

  if (role === "admin") {
    query = query.where({ role: "admin" });
  } else if (userId) {
    query = query.where({ user_id: Number(userId), role: "customer" });
  }

  const updated = await query.update({ is_read: true, updated_at: db.fn.now() });

  if (socketService) {
    try {
      if (role === "admin") {
        socketService.emitToAdmin("notification:unread_count", { unreadCount: 0 });
      } else if (userId) {
        socketService.emitToUser(userId, "notification:unread_count", { unreadCount: 0 });
      }
    } catch {}
  }

  return updated;
}

module.exports = {
  createNotification,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};

