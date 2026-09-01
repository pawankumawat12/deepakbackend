const express = require("express");
const path = require("path");
const cors = require("cors");
const authRoutes = require("./src/modules/auth/auth.routes");
const categoryRoutes = require("./src/modules/category/category.routes");
const productRoutes = require("./src/modules/product/product.routes");
const cartRoutes = require("./src/modules/cart/cart.routes");
const wishlistRoutes = require("./src/modules/wishlist/wishlist.routes");
const settingsRoutes = require("./src/modules/settings/settings.routes");
const orderRoutes = require("./src/modules/order/order.routes");
const addressRoutes = require("./src/modules/address/address.routes");
const chatRoutes = require("./src/modules/chat/chat.routes");
const notificationRoutes = require("./src/modules/notification/notification.routes");
const reviewRoutes = require("./src/modules/reviews/review.routes");
const offerRoutes = require("./src/modules/offer/offer.routes");
const contactRoutes = require("./src/modules/contact/contact.routes");
const cookieParser = require("cookie-parser");

const app = express();

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  next();
});

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  ...(process.env.BFF ? process.env.BFF.split(",").map((s) => s.trim()) : []),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or matching allowed list
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Serve static uploads with browser caching (1 day)
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "1d",
    etag: true,
  })
);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/offers", offerRoutes);
app.use("/api/v1/contact", contactRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
