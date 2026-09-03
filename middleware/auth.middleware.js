const jwt = require("jsonwebtoken");
const db = require("../config/db");

// Verify access token from cookie or Authorization header
function verifyToken(req, res, next) {
  // 1. Try cookie first (raw JWT)
  let accessToken = req.cookies.accessToken || null;

  // 2. Fall back to Authorization header (Bearer <token>)
  if (!accessToken) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    }
  }

  if (!accessToken) {
    return res.status(401).json({
      message: "Access token not found",
    });
  }

  jwt.verify(
    accessToken,
    process.env.ACCESS_TOKEN_SECRET,
    async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          message: "Access token expired or invalid",
        });
      }

      req.user = decoded;

      // Check if user is blocked or deactivated (except for admins)
      try {
        const user = await db("users")
          .where({ id: decoded.id })
          .select("id", "role", "is_blocked", "is_active", "block_reason")
          .first();

        if (
          user &&
          (user.is_blocked || user.is_active === false) &&
          user.role !== "admin"
        ) {
          // Allow profile read (/me), logout, and blocked support request
          const currentPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
          const isAllowedPath =
            currentPath.endsWith("/me") ||
            currentPath.endsWith("/logout") ||
            currentPath.includes("blocked-support-request");

          if (!isAllowedPath) {
            return res.status(403).json({
              message: "Your account has been blocked by administrator.",
              is_blocked: true,
              block_reason:
                user.block_reason || "Account deactivated by administrator.",
            });
          }
        }
      } catch (dbErr) {
        console.error("Token verification DB check error:", dbErr);
      }

      next();
    }
  );
}

// Only admin allowed
function isAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Access denied. Admins only.",
    });
  }

  next();
}

function optionalToken(req, res, next) {
  let accessToken = req.cookies.accessToken || null;

  if (!accessToken) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    }
  }

  if (!accessToken) {
    return next();
  }

  jwt.verify(
    accessToken,
    process.env.ACCESS_TOKEN_SECRET,
    (err, decoded) => {
      if (!err && decoded) {
        req.user = decoded;
      }
      next();
    }
  );
}

module.exports = {
  verifyToken,
  isAdmin,
  optionalToken,
};
