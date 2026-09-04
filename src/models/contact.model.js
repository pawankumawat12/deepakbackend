const db = require("../../config/db");

const ContactModel = {
  /**
   * Create a new contact query
   */
  async createQuery(data) {
    const insertRes = await db("contact_queries")
      .insert({
        user_id: data.user_id || null,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        subject: data.subject,
        message: data.message,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    let id;
    if (Array.isArray(insertRes)) {
      id = typeof insertRes[0] === "object" ? insertRes[0]?.id : insertRes[0];
    } else if (typeof insertRes === "object" && insertRes !== null) {
      id = insertRes.id;
    } else {
      id = insertRes;
    }

    return this.getQueryById(id);
  },

  /**
   * Get query by ID
   */
  async getQueryById(id) {
    return db("contact_queries")
      .select(
        "contact_queries.*",
        "users.name as registered_user_name",
        "users.email as registered_user_email",
        "admin_user.name as admin_responder_name"
      )
      .leftJoin("users", "contact_queries.user_id", "users.id")
      .leftJoin("users as admin_user", "contact_queries.admin_id", "admin_user.id")
      .where("contact_queries.id", id)
      .first();
  },

  /**
   * List contact queries with pagination, status filter, and search
   */
  async getQueries({ page = 1, limit = 10, status, search }) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const baseQuery = db("contact_queries");

    if (status && status !== "all") {
      baseQuery.where("contact_queries.status", status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      baseQuery.where((builder) => {
        builder
          .where("contact_queries.name", "like", q)
          .orWhere("contact_queries.email", "like", q)
          .orWhere("contact_queries.phone", "like", q)
          .orWhere("contact_queries.subject", "like", q)
          .orWhere("contact_queries.message", "like", q);
      });
    }

    const countQuery = baseQuery.clone().count("contact_queries.id as total").first();

    const dataQuery = baseQuery
      .clone()
      .select(
        "contact_queries.*",
        "users.name as registered_user_name",
        "users.email as registered_user_email",
        "admin_user.name as admin_responder_name"
      )
      .leftJoin("users", "contact_queries.user_id", "users.id")
      .leftJoin("users as admin_user", "contact_queries.admin_id", "admin_user.id")
      .orderBy("contact_queries.created_at", "desc")
      .limit(limitNum)
      .offset(offset);

    const [countResult, queries] = await Promise.all([countQuery, dataQuery]);
    const total = Number(countResult?.total || 0);
    const totalPages = Math.ceil(total / limitNum) || 1;

    return {
      queries,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
    };
  },

  /**
   * Update status, admin notes, and admin reply
   */
  async updateQuery(id, { status, admin_notes, admin_reply, replied_at, admin_id }) {
    const updateData = {
      updated_at: new Date(),
    };

    if (status) {
      updateData.status = status;
    }

    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    if (admin_reply !== undefined) {
      updateData.admin_reply = admin_reply;
      updateData.replied_at = replied_at || new Date();
    }

    if (admin_id !== undefined) {
      updateData.admin_id = admin_id;
    }

    await db("contact_queries").where("id", id).update(updateData);
    return this.getQueryById(id);
  },

  /**
   * Get queries submitted by a specific customer (by user_id or email)
   */
  async getUserQueries({ userId, email }) {
    let query = db("contact_queries");

    if (userId && email) {
      query = query.where((builder) => {
        builder
          .where("contact_queries.user_id", userId)
          .orWhereRaw("LOWER(contact_queries.email) = LOWER(?)", [email]);
      });
    } else if (userId) {
      query = query.where("contact_queries.user_id", userId);
    } else if (email) {
      query = query.whereRaw("LOWER(contact_queries.email) = LOWER(?)", [email]);
    } else {
      return [];
    }

    return query
      .select(
        "contact_queries.*",
        "admin_user.name as admin_responder_name"
      )
      .leftJoin("users as admin_user", "contact_queries.admin_id", "admin_user.id")
      .orderBy("contact_queries.created_at", "desc");
  },

  /**
   * Delete query
   */
  async deleteQuery(id) {
    return db("contact_queries").where("id", id).del();
  },

  /**
   * Get query summary counts
   */
  async getStats() {
    const [totalRes, pendingRes, inProgressRes, resolvedRes] = await Promise.all([
      db("contact_queries").count("id as count").first(),
      db("contact_queries").where("status", "pending").count("id as count").first(),
      db("contact_queries").where("status", "in_progress").count("id as count").first(),
      db("contact_queries").where("status", "resolved").count("id as count").first(),
    ]);

    return {
      total: Number(totalRes?.count || 0),
      pending: Number(pendingRes?.count || 0),
      in_progress: Number(inProgressRes?.count || 0),
      resolved: Number(resolvedRes?.count || 0),
    };
  },
};

module.exports = ContactModel;
