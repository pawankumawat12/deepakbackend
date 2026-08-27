const jwt = require("jsonwebtoken");

// Verify access token from cookie or Authorization header
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;
  const accessToken = req.cookies?.accessToken || bearerToken;

  if (!accessToken) {
    return res.status(401).json({
      message: "Access token not found",
    });
  }

  jwt.verify(
    accessToken,
    process.env.ACCESS_TOKEN_SECRET,
    (err, decoded) => {
      if (err) {
        return res.status(401).json({
          message: "Access token expired or invalid",
        });
      }

      req.user = decoded;
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

module.exports = {
  verifyToken,
  isAdmin,
};
