const jwt = require("jsonwebtoken");

const ACCESS_SECRET =
  process.env.ACCESS_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  "sfc_access_secret_production_key";

const REFRESH_SECRET =
  process.env.REFRESH_TOKEN_SECRET ||
  (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}_refresh` : null) ||
  "sfc_refresh_secret_production_key";

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
    },
    ACCESS_SECRET,
    {
      expiresIn: "15m",
    }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
    },
    REFRESH_SECRET,
    {
      expiresIn: "30d",
    }
  );
};

const isHttpsRequest = (req) => {
  if (process.env.NODE_ENV === "production") return true;
  if (!req) return false;
  return Boolean(
    req.secure ||
    req.headers?.["x-forwarded-proto"] === "https" ||
    req.connection?.encrypted
  );
};

const getRefreshTokenCookieOptions = (req) => {
  const secure = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure: secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
};

const getCookieClearOptions = (req) => {
  const secure = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure: secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    path: "/",
  };
};

module.exports = {
  ACCESS_SECRET,
  REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenCookieOptions,
  getCookieClearOptions,
};

