const db = require("../../config/db");

function findUserByEmail(email) {
  return db("users").where({ email }).first();
}


function findUserByPhone(phone){
  return db("users").where({phone}).first();
}

function countAdmins() {
  return db("users").where({ role: "admin" }).count("id as count").first().then((row) => Number(row.count || 0));
}

function createUser(data) {
  return db("users")
    .insert(data)
    .returning(["id", "name", "email", "role"])
    .then((rows) => rows[0]);
}

module.exports = { findUserByEmail, countAdmins, createUser, findUserByPhone };
