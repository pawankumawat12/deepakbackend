const bcrypt = require("bcrypt");

exports.seed = async function (knex) {
  const adminExists = await knex("users").where({ email: "pawan@yopmail.com" }).first();
  if (adminExists) {
    return;
  }

  const hashedPassword = await bcrypt.hash("Pawan@123", 10);

  await knex("users").insert({
    name: "Pawan",
    email: "pawan@yopmail.com",
    password: hashedPassword,
    role: "admin",
  });
};
