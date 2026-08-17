const jwt = require("jsonwebtoken");

// Verify access token from cookie
function verifyToken(req, res, next) {
  const accessToken = req.cookies.accessToken;

  if (!accessToken) {
    return res.status(401).json({
      message: "Access token not found",
    });
  }

  jwt.verify(
    accessToken,
    process.env.JWT_ACCESS_SECRET,
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