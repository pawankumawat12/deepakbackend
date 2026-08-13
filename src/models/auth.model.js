const db = require("../../config/db");

function findUserByEmail(email) {
  return db("users").where({ email }).first();
}

function findUserByPhone(phone) {
  return db("users").where({ phone }).first();
}

function countAdmins() {
  return db("users")
    .where({ role: "admin" })
    .count("id as count")
    .first()
    .then((row) => Number(row.count || 0));
}

function createUser(data) {
  return db("users")
    .insert(data)
    .returning(["id", "name", "email", "role"])
    .then((rows) => rows[0]);
}

const sendOtp = async ({ phone, otp }) => {
  try {
    const response = await fetch(`https://2factor.in/API/V1/${process.env.TWO_FACTOR_API_KEY}/SMS/${phone}/${otp}`, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.TWO_FACTOR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: `+91${phone}`,
        template_name: "sfc cafe",
        var1: otp,
      }),
    });

    const data = await response.text();
    if (!response.ok) {
      throw new Error(`2Factor API failed: ${response.status} - ${data}`);
    }

    return JSON.parse(data);
  } catch (error) {
    console.error("2Factor OTP error:", error);
    throw error;
  }
};

module.exports = {
  findUserByEmail,
  countAdmins,
  createUser,
  findUserByPhone,
  sendOtp,
};
