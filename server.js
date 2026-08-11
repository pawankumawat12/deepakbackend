require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./src/modules/auth/auth.routes");

const app = express();

const frontendUrls = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((url) => url.trim())
  : ["http://localhost:3000", "http://localhost:5173"];

app.use(
  cors({
    origin: frontendUrls,
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend is running" });
});

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});