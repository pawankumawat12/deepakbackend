const { Server } = require("socket.io");

let io = null;

/**
 * Initialize Socket.IO server with HTTP server
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // Allow all origins for dev and prod
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    const { userId, role, orderId } = socket.handshake.query || {};

    console.log(
      `[Socket.IO] New connection: ${socket.id} (User: ${userId || "anon"}, Role: ${role || "guest"})`
    );

    // Join Admin room if admin
    if (role === "admin" || socket.handshake.auth?.role === "admin") {
      socket.join("admin");
      console.log(`[Socket.IO] Socket ${socket.id} joined 'admin' room`);
    }

    // Join User private room if authenticated
    const effectiveUserId = userId || socket.handshake.auth?.userId;
    if (effectiveUserId) {
      socket.join(`user_${effectiveUserId}`);
      console.log(
        `[Socket.IO] Socket ${socket.id} joined 'user_${effectiveUserId}' room`
      );
    }

    // Join specific order room if requested in query
    if (orderId) {
      socket.join(`order_${orderId}`);
      console.log(`[Socket.IO] Socket ${socket.id} joined 'order_${orderId}' room`);
    }

    // Client dynamically joins an order chat room
    socket.on("join_order_room", ({ orderId: targetOrderId }) => {
      if (targetOrderId) {
        socket.join(`order_${targetOrderId}`);
        console.log(
          `[Socket.IO] Socket ${socket.id} joined 'order_${targetOrderId}' room`
        );
      }
    });

    // Client leaves an order chat room
    socket.on("leave_order_room", ({ orderId: targetOrderId }) => {
      if (targetOrderId) {
        socket.leave(`order_${targetOrderId}`);
        console.log(
          `[Socket.IO] Socket ${socket.id} left 'order_${targetOrderId}' room`
        );
      }
    });

    // Typing indicators
    socket.on("typing_start", ({ orderId: targetOrderId, senderRole, senderName }) => {
      if (targetOrderId) {
        socket.to(`order_${targetOrderId}`).emit("user_typing", {
          orderId: targetOrderId,
          senderRole,
          senderName,
          isTyping: true,
        });
      }
    });

    socket.on("typing_stop", ({ orderId: targetOrderId, senderRole }) => {
      if (targetOrderId) {
        socket.to(`order_${targetOrderId}`).emit("user_typing", {
          orderId: targetOrderId,
          senderRole,
          isTyping: false,
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.IO] Disconnected ${socket.id}: ${reason}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    console.warn("[Socket.IO] IO instance not initialized yet!");
  }
  return io;
}

/**
 * Emit event to all connected admin clients
 */
function emitToAdmin(event, data) {
  if (io) {
    io.to("admin").emit(event, data);
  }
}

/**
 * Emit event to a specific user's private room
 */
function emitToUser(userId, event, data) {
  if (io && userId) {
    io.to(`user_${userId}`).emit(event, data);
  }
}

/**
 * Emit event to an order-specific room (e.g. for live chat)
 */
function emitToOrder(orderId, event, data) {
  if (io && orderId) {
    io.to(`order_${orderId}`).emit(event, data);
  }
}

/**
 * Emit event to all connected clients
 */
function emitToAll(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

/**
 * Check if at least one admin socket is currently present in a given order chat room.
 * Admin sockets are identified by membership in the shared "admin" room.
 * @param {string|number} orderId
 * @returns {boolean}
 */
function isAdminInOrderRoom(orderId) {
  if (!io) return false;
  const orderRoom = io.sockets.adapter.rooms.get(`order_${orderId}`);
  if (!orderRoom || orderRoom.size === 0) return false;
  const adminRoom = io.sockets.adapter.rooms.get("admin");
  if (!adminRoom || adminRoom.size === 0) return false;
  for (const socketId of orderRoom) {
    if (adminRoom.has(socketId)) return true;
  }
  return false;
}

/**
 * Check if a specific customer is currently present in a given order chat room.
 * Customer sockets carry their userId in the handshake query.
 * @param {string|number} userId
 * @param {string|number} orderId
 * @returns {boolean}
 */
function isCustomerInOrderRoom(userId, orderId) {
  if (!io || !userId) return false;
  const orderRoom = io.sockets.adapter.rooms.get(`order_${orderId}`);
  if (!orderRoom || orderRoom.size === 0) return false;
  for (const socketId of orderRoom) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) continue;
    const uid =
      sock.handshake?.query?.userId || sock.handshake?.auth?.userId;
    if (uid && String(uid) === String(userId)) return true;
  }
  return false;
}

module.exports = {
  initSocket,
  getIO,
  emitToAdmin,
  emitToUser,
  emitToOrder,
  emitToAll,
  isAdminInOrderRoom,
  isCustomerInOrderRoom,
};

