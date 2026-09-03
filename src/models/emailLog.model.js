const db = require("../../config/db");

let tableEnsured = false;
async function ensureEmailLogsTable() {
  if (tableEnsured) return;
  try {
    const hasTable = await db.schema.hasTable("email_logs");
    if (!hasTable) {
      await db.schema.createTable("email_logs", (table) => {
        table.increments("id").primary();
        table.string("recipient", 255).notNullable();
        table.string("sender", 255).nullable();
        table.string("subject", 500).notNullable();
        table.string("email_type", 50).notNullable().defaultTo("general");
        table.string("status", 25).notNullable().defaultTo("sent");
        table.text("body_html").nullable();
        table.text("body_text").nullable();
        table.text("error_message").nullable();
        table.string("message_id", 255).nullable();
        table
          .integer("user_id")
          .unsigned()
          .nullable()
          .references("id")
          .inTable("users")
          .onDelete("SET NULL");
        table.jsonb("metadata").nullable();
        table.timestamps(true, true);

        table.index(["created_at"]);
        table.index(["recipient"]);
        table.index(["email_type"]);
        table.index(["status"]);
      });
      console.log("[EmailLogs] Created email_logs table successfully.");
    }
    tableEnsured = true;
  } catch (err) {
    console.warn("[EmailLogs] ensureEmailLogsTable check warning:", err.message);
  }
}

// Initial ensure call
ensureEmailLogsTable().catch(() => {});

const EmailLogModel = {
  /**
   * Create an email log entry. Wrapped in fail-safe try/catch so
   * mail transport is never broken if logging fails.
   */
  async createEmailLog({
    recipient,
    sender,
    subject,
    email_type = "general",
    status = "sent",
    body_html,
    body_text,
    error_message,
    message_id,
    user_id = null,
    metadata = null,
  }) {
    try {
      await ensureEmailLogsTable();

      const insertRes = await db("email_logs")
        .insert({
          recipient: String(recipient || "").trim().toLowerCase(),
          sender: sender ? String(sender).trim() : null,
          subject: String(subject || "").trim(),
          email_type: String(email_type || "general").trim().toLowerCase(),
          status: String(status || "sent").trim().toLowerCase(),
          body_html: body_html || null,
          body_text: body_text || null,
          error_message: error_message ? String(error_message).trim() : null,
          message_id: message_id ? String(message_id).trim() : null,
          user_id: user_id ? Number(user_id) : null,
          metadata: metadata ? JSON.stringify(metadata) : null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      let id;
      if (Array.isArray(insertRes) && insertRes.length > 0) {
        id = typeof insertRes[0] === "object" ? insertRes[0]?.id : insertRes[0];
      } else if (typeof insertRes === "object" && insertRes !== null) {
        id = insertRes.id;
      } else {
        id = insertRes;
      }

      return id;
    } catch (err) {
      console.error("[EmailLogs] Failed to create email log:", err.message);
      return null;
    }
  },

  /**
   * Get single email log by ID (includes complete body_html for detail preview)
   */
  async getEmailLogById(id) {
    await ensureEmailLogsTable();
    return db("email_logs")
      .select(
        "email_logs.*",
        "users.name as user_name",
        "users.role as user_role"
      )
      .leftJoin("users", "email_logs.user_id", "users.id")
      .where("email_logs.id", id)
      .first();
  },

  /**
   * Get paginated email logs with search, filters, and sorting
   */
  async getEmailLogs({
    page = 1,
    limit = 10,
    search = "",
    email_type = "all",
    status = "all",
    sort_by = "created_at",
    sort_order = "desc",
    from_date = null,
    to_date = null,
  }) {
    await ensureEmailLogsTable();

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const baseQuery = db("email_logs");

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      baseQuery.where((builder) => {
        builder
          .whereRaw("LOWER(email_logs.recipient) LIKE ?", [q])
          .orWhereRaw("LOWER(email_logs.subject) LIKE ?", [q])
          .orWhereRaw("LOWER(email_logs.body_text) LIKE ?", [q]);
      });
    }

    if (email_type && email_type !== "all") {
      baseQuery.where("email_logs.email_type", email_type.toLowerCase());
    }

    if (status && status !== "all") {
      baseQuery.where("email_logs.status", status.toLowerCase());
    }

    if (from_date) {
      baseQuery.where("email_logs.created_at", ">=", new Date(from_date));
    }

    if (to_date) {
      const endOfDay = new Date(to_date);
      endOfDay.setHours(23, 59, 59, 999);
      baseQuery.where("email_logs.created_at", "<=", endOfDay);
    }

    // Total count query
    const totalResult = await baseQuery.clone().count("email_logs.id as count").first();
    const total = Number(totalResult?.count || 0);

    // Allowed sort columns
    const allowedSortCols = {
      created_at: "email_logs.created_at",
      recipient: "email_logs.recipient",
      subject: "email_logs.subject",
      email_type: "email_logs.email_type",
      status: "email_logs.status",
    };
    const orderColumn = allowedSortCols[sort_by] || "email_logs.created_at";
    const direction = String(sort_order).toLowerCase() === "asc" ? "asc" : "desc";

    // Query records (we omit full body_html in list view for performance, but return preview text snippet)
    const logs = await baseQuery
      .clone()
      .select(
        "email_logs.id",
        "email_logs.recipient",
        "email_logs.sender",
        "email_logs.subject",
        "email_logs.email_type",
        "email_logs.status",
        "email_logs.message_id",
        "email_logs.error_message",
        "email_logs.user_id",
        "email_logs.metadata",
        "email_logs.created_at",
        "email_logs.updated_at",
        db.raw("SUBSTRING(email_logs.body_text FROM 1 FOR 160) as preview_text"),
        "users.name as user_name"
      )
      .leftJoin("users", "email_logs.user_id", "users.id")
      .orderBy(orderColumn, direction)
      .limit(limitNum)
      .offset(offset);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return {
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    };
  },

  /**
   * Delete single email log
   */
  async deleteEmailLog(id) {
    await ensureEmailLogsTable();
    return db("email_logs").where({ id }).del();
  },

  /**
   * Bulk delete email logs by ID list
   */
  async bulkDeleteEmailLogs(ids = []) {
    await ensureEmailLogsTable();
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    return db("email_logs").whereIn("id", ids).del();
  },

  /**
   * Aggregate statistics for Email Logs overview
   */
  async getEmailLogStats() {
    await ensureEmailLogsTable();

    const [totalRow, sentRow, failedRow, otpRow, resetRow] = await Promise.all([
      db("email_logs").count("id as count").first(),
      db("email_logs").where({ status: "sent" }).count("id as count").first(),
      db("email_logs").where({ status: "failed" }).count("id as count").first(),
      db("email_logs").where({ email_type: "otp" }).count("id as count").first(),
      db("email_logs").where({ email_type: "password_reset" }).count("id as count").first(),
    ]);

    return {
      total: Number(totalRow?.count || 0),
      sent: Number(sentRow?.count || 0),
      failed: Number(failedRow?.count || 0),
      otp: Number(otpRow?.count || 0),
      password_reset: Number(resetRow?.count || 0),
    };
  },
};

module.exports = EmailLogModel;

