require("dotenv").config();

const app = require("./app");
const db = require("./config/db");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log("Checking and running database migrations...");
    const [batchNo, log] = await db.migrate.latest();
    if (!log || log.length === 0) {
      console.log("Database schema is up to date.");
    } else {
      console.log(`Migrations executed (Batch ${batchNo}):`);
      log.forEach((migration) => console.log(`  - ${migration}`));
    }
  } catch (err) {
    console.error("Database migration error on startup:", err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();