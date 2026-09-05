const db = require("../../config/db");
const {
  renderEmailTemplate,
  sendTemplatedMail,
} = require("../services/emailTemplate.service");

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

const logDisabledTemplateEmail = async ({ email, templateSlug, emailType, variables }) => {
  const rendered = await renderEmailTemplate(templateSlug, variables);
  try {
    const EmailLogModel = require("./emailLog.model");
    await EmailLogModel.createEmailLog({
      recipient: email,
      subject: rendered.subject,
      email_type: emailType,
      status: "disabled",
      body_html: rendered.html,
      body_text: rendered.text,
    });
  } catch { }
  return { messageId: "email-disabled" };
};

const sendOtp = async ({
  email,
  otp,
  userName = "there",
  templateSlug = "login-verification-otp",
  emailType = "otp",
}) => {
  const emailActive =
    (process.env.EMAIL_ACTIVE || "true").toLowerCase() !== "false";
  const variables = { otp, userName, email };

  if (!emailActive) {
    console.log(`[EMAIL_ACTIVE=false] ${templateSlug} for ${email} (email skipped)`);
    return logDisabledTemplateEmail({ email, templateSlug, emailType, variables });
  }

  try {
    return await sendTemplatedMail({
      to: email,
      templateSlug,
      variables,
      emailType,
    });
  } catch (error) {
    console.error("Templated OTP email error:", error);
    throw error;
  }
};

const sendEmailChangeOtp = async ({ email, otp, userName = "there" }) => {
  const emailActive =
    (process.env.EMAIL_ACTIVE || "true").toLowerCase() !== "false";
  const templateSlug = "email-change-verification";
  const emailType = "email_change_otp";
  const variables = { otp, userName, email };

  if (!emailActive) {
    console.log(`[EMAIL_ACTIVE=false] ${templateSlug} for ${email} (email skipped)`);
    return logDisabledTemplateEmail({ email, templateSlug, emailType, variables });
  }

  try {
    return await sendTemplatedMail({
      to: email,
      templateSlug,
      variables,
      emailType,
    });
  } catch (error) {
    console.error("Templated email change OTP error:", error);
    throw error;
  }
};

const sendPasswordResetEmail = async ({ email, resetUrl, userName = "there" }) => {
  const emailActive =
    (process.env.EMAIL_ACTIVE || "true").toLowerCase() !== "false";
  const templateSlug = "password-reset";
  const emailType = "password_reset";
  const variables = { resetUrl, userName, email };

  if (!emailActive) {
    console.log(`[EMAIL_ACTIVE=false] ${templateSlug} for ${email} (email skipped)`);
    return logDisabledTemplateEmail({ email, templateSlug, emailType, variables });
  }

  try {
    return await sendTemplatedMail({
      to: email,
      templateSlug,
      variables,
      emailType,
    });
  } catch (error) {
    console.error("Templated password reset email error:", error);
    throw error;
  }
};

async function listCustomers({
  page = 1,
  limit = 10,
  search = "",
  status = "",
} = {}) {
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
    baseQuery = baseQuery.where({
      "users.is_active": true,
      "users.is_blocked": false,
    });
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

async function listBlockedCustomerRequests({
  page = 1,
  limit = 10,
  status,
} = {}) {
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
