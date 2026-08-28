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
const cookieParser = require("cookie-parser");

const app = express();
// const allowedOrigins = (process.env.BFF || "")
//   .split(",")
//   .map((origin) => origin.trim())
//   .filter(Boolean);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
