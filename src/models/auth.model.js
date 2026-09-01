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

// Ensure pending_email columns exist in users table
const ensurePendingEmailColumns = async () => {
  try {
    const hasCol = await db.schema.hasColumn("users", "pending_email");
    if (!hasCol) {
      await db.schema.alterTable("users", (table) => {
        table.string("pending_email").nullable();
        table.string("pending_email_otp").nullable();
        table.timestamp("pending_email_expire_at").nullable();
        table.timestamp("pending_email_sent_at").nullable();
        table.integer("pending_email_resend_count").notNullable().defaultTo(0);
        table.timestamp("pending_email_resend_locked_until").nullable();
      });
    }
  } catch (err) {
    // Ignore if table doesn't exist yet during initial setup
  }
};
ensurePendingEmailColumns();

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

const sendEmailChangeOtp = async ({ email, otp }) => {
  try {
    const { sendMail } = require("../services/smtp.service");
    const result = await sendMail({
      to: email,
      subject: "Verify your new email address - SFC Cafe",
      text: `Your OTP for changing your SFC Cafe account email is ${otp}. This code is valid for 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 16px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #4f7d16; margin: 0; font-size: 22px;">SFC Cafe</h2>
            <p style="font-size: 13px; color: #666; margin: 4px 0 0;">Email Verification Request</p>
          </div>
          <p style="font-size: 14px; color: #333; line-height: 1.5;">
            We received a request to update your SFC Cafe account email to <strong>${email}</strong>.
          </p>
          <p style="font-size: 14px; color: #555;">Use the following One-Time Password (OTP) to complete this verification:</p>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3a1e; background: #f4f8ec; border: 1px dashed #4f7d16; padding: 16px 20px; border-radius: 12px; text-align: center; margin: 24px 0;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #777; line-height: 1.4;">
            ⏱️ This verification code is valid for <strong>10 minutes</strong>. If you did not request this email change, please ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 11px; color: #aaa; text-align: center; margin: 0;">
            Secure Food Cafe (SFC Cafe) • Fast & Fresh Delivery
          </p>
        </div>
      `,
    });
    return result;
  } catch (error) {
    console.error("Dynamic SMTP Email Change OTP error:", error);
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

async function listCustomers({ page = 1, limit = 10, search = "", status = "" } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(100, Number(limit) || 10));
  const offset = (p - 1) * l;

  let baseQuery = db("users").where("users.role", "!=", "admin");

  if (search && String(search).trim()) {
    const s = `%${String(search).trim()}%`;
    baseQuery = baseQuery.where((builder) => {
      builder
        .whereILike("users.name", s)
        .orWhereILike("users.email", s)
        .orWhereILike("users.phone", s);
    });
  }

  if (status === "active") {
    baseQuery = baseQuery.where({ "users.is_active": true, "users.is_blocked": false });
  } else if (status === "blocked") {
    baseQuery = baseQuery.where({ "users.is_blocked": true });
  }

  // Count total matching customers
  const countRow = await baseQuery.clone().count("users.id as count").first();
  const total = Number(countRow?.count || 0);

  if (total === 0) {
    return {
      customers: [],
      pagination: {
        total: 0,
        page: p,
        limit: l,
        totalPages: 1,
      },
    };
  }

  const query = baseQuery
    .clone()
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
    .groupBy("users.id")
    .orderBy("users.created_at", "desc")
    .limit(l)
    .offset(offset);

  const customers = await query;

  return {
    customers,
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
    },
  };
}

// Blocked Support Requests
function createBlockedCustomerRequest(data) {
  return db("blocked_customer_requests")
    .insert(data)
    .returning("*")
    .then((rows) => rows[0]);
}

async function listBlockedCustomerRequests({ page = 1, limit = 10, status } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(100, Number(limit) || 10));
  const offset = (p - 1) * l;

  let query = db("blocked_customer_requests");
  if (status && status !== "all") {
    query = query.where({ status });
  }

  const [requests, countRow] = await Promise.all([
    query.clone().orderBy("created_at", "desc").limit(l).offset(offset),
    query.clone().count("id as count").first(),
  ]);

  const total = Number(countRow?.count || 0);

  return {
    requests,
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
    },
  };
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
  sendEmailChangeOtp,
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
