const db = require("../../config/db");
const transporter = require("../../config/mail");

function findUserByEmail(email) {
  return db("users").where({ email }).first();
}

function findUserByPhone(phone) {
  return db("users").where({ phone }).first();
}

function findUserById(id){
  return db("users").where({id}).first();
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


function updateUser(id, data) {
  return db("users")
    .where({ id })
    .update(data)
    .returning(["id", "name", "email", "phone", "role"]);
}


const sendOtp = async ({ email, otp }) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Verification Code",
      text: `Your OTP is ${otp}. This OTP is valid for 5 minutes.`,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error("Nodemailer OTP error:", error);
    throw error;
  }
};

module.exports = {
  findUserByEmail,
  countAdmins,
  createUser,
  findUserByPhone,
  sendOtp,
  updateUser,
  findUserById
};
