const db = require("../../config/db");
const transporter = require("../../config/mail");

function findUserByEmail(email) {
  return db("users").where({ email }).first();
}

function findUserByPhone(phone) {
  return db("users").where({ phone }).first();
}

function findUserById(id) {
  return db("users").where({ id }).first();
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
    .returning([
      "id",
      "name",
      "email",
      "phone",
      "role",
      "image",
      "is_active",
      "is_blocked",
      "block_reason",
    ])
    .then((rows) => rows[0]);
}

function updateUser(id, data) {
  return db("users")
    .where({ id })
    .update(data)
    .returning([
      "id",
      "name",
      "email",
      "phone",
      "role",
      "image",
      "is_active",
      "is_blocked",
      "block_reason",
    ]);
}

function deleteUser(id) {
  return db("users").where({ id }).del();
}

const sendOtp = async ({ email, otp }) => {
  try {
    const { sendMail } = require("../services/smtp.service");
    const result = await sendMail({
      to: email,
      subject: "Your OTP Verification Code - SFC Cafe",
      text: `Your OTP is ${otp}. This OTP is valid for 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #4f7d16; margin-top: 0;">SFC Cafe Verification</h2>
          <p style="font-size: 14px; color: #555;">Use the following One-Time Password (OTP) to complete your verification:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #111; background: #f4f8ec; padding: 12px 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #888;">This OTP is valid for 5 minutes. If you did not request this code, please ignore this email.</p>
        </div>
      `,
    });
    return result;
  } catch (error) {
    console.error("Dynamic SMTP OTP error:", error);
    throw error;
  }
};

const sendPasswordResetEmail = async ({ email, resetUrl }) => {
  try {
    const { sendMail } = require("../services/smtp.service");
    return await sendMail({
      to: email,
      subject: "Reset your SFC Cafe password",
      text: `We received a request to reset your password. Use this link within 15 minutes: ${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #4f7d16; margin-top: 0;">Password Reset Request</h2>
          <p style="font-size: 14px; color: #555;">We received a request to reset your SFC Cafe password.</p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl}" style="background-color: #4f7d16; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="font-size: 12px; color: #888;">This link expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Dynamic SMTP password reset error:", error);
    throw error;
  }
};

async function listCustomers({ search } = {}) {
  let query = db("users")
    .leftJoin("orders", "users.id", "orders.user_id")
    .select(
      "users.id",
      "users.name",
      "users.email",
      "users.phone",
      "users.role",
      "users.is_active",
      "users.is_blocked",
      "users.block_reason",
      "users.blocked_at",
      "users.created_at",
      db.raw("COUNT(orders.id) as orders_count"),
      db.raw("COALESCE(SUM(orders.total_amount), 0) as total_spent")
    )
    .where("users.role", "!=", "admin")
    .groupBy("users.id")
    .orderBy("users.created_at", "desc");

  if (search) {
    query = query.where((builder) => {
      builder
        .whereILike("users.name", `%${search}%`)
        .orWhereILike("users.email", `%${search}%`)
        .orWhereILike("users.phone", `%${search}%`);
    });
  }

  return await query;
}

// Blocked Support Requests
function createBlockedCustomerRequest(data) {
  return db("blocked_customer_requests")
    .insert(data)
    .returning("*")
    .then((rows) => rows[0]);
}

function listBlockedCustomerRequests({ status } = {}) {
  let query = db("blocked_customer_requests").orderBy("created_at", "desc");
  if (status) {
    query = query.where({ status });
  }
  return query;
}

function findBlockedRequestById(id) {
  return db("blocked_customer_requests").where({ id }).first();
}

function updateBlockedCustomerRequest(id, data) {
  return db("blocked_customer_requests")
    .where({ id })
    .update(data)
    .returning("*")
    .then((rows) => rows[0]);
}

module.exports = {
  findUserByEmail,
  countAdmins,
  createUser,
  findUserByPhone,
  sendOtp,
  sendPasswordResetEmail,
  updateUser,
  deleteUser,
  findUserById,
  listCustomers,
  createBlockedCustomerRequest,
  listBlockedCustomerRequests,
  findBlockedRequestById,
  updateBlockedCustomerRequest,
};
