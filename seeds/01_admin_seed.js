const bcrypt = require("bcrypt");

exports.seed = async function (knex) {
  const adminExists = await knex("users").where({ email: process.env.ADMIN_EMAIL }).first();
  if (adminExists) {
    return;
  }

  const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

  await knex("users").insert({
    name: "Pawan",
    email: process.env.ADMIN_EMAIL,
    password: hashedPassword,
    role: "admin",
  });
};
