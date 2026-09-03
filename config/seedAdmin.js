const bcrypt = require("bcrypt");
const db = require("./db");


async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log("Admin seed skipped: ADMIN_EMAIL or ADMIN_PASSWORD not set in .env");
    return;
  }

  try {
    const existing = await db("users").where({ email: ADMIN_EMAIL }).first();

    if (existing) {
      console.log(`Admin user already exists (${ADMIN_EMAIL}). Skipping seed.`);
      return;
    }

    // Hash the password securely (salt rounds = 10)
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const [admin] = await db("users")
      .insert({
        name: "Admin",
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: "admin",
      })
      .returning(["id", "name", "email", "role"]);

    console.log(`Default admin user created: ${admin.email} (id: ${admin.id})`);
  } catch (error) {
    console.error("Error seeding admin user:", error.message);
  }
}

module.exports = seedAdmin;

