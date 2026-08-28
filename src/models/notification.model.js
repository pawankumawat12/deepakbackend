const db = require("../../config/db");

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

  return created;
}

/**
 * Retrieve notifications for a user or for admins
 */
async function getNotifications({ userId = null, role = "customer", limit = 50, offset = 0 }) {
  let query = db("notifications");

  if (role === "admin") {
    query = query.where({ role: "admin" });
  } else if (userId) {
    query = query.where({ user_id: Number(userId), role: "customer" });
  } else {
    return [];
  }

  const rows = await query
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset);

  return rows;
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
  const [updated] = await db("notifications")
    .where({ id: Number(id) })
    .update({ is_read: true, updated_at: db.fn.now() })
    .returning("*");

  return updated;
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
  return updated;
}

module.exports = {
  createNotification,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};

