const db = require("../../config/db");

function normalizeTemplate(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    subject: row.subject,
    description: row.description || "",
    body: row.body,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateTemplate(data) {
  const name = String(data.name || "").trim();
  const slug = normalizeSlug(data.slug || name);
  const subject = String(data.subject || "").trim();
  const body = String(data.body || "").trim();

  if (!name) throw new Error("Template name is required");
  if (!slug) throw new Error("Template slug is required");
  if (!subject) throw new Error("Template subject is required");
  if (!body) throw new Error("Template body is required");

  return {
    name,
    slug,
    subject,
    description: data.description == null ? null : String(data.description).trim() || null,
    body: String(data.body),
    is_active: data.isActive !== false,
  };
}

async function listEmailTemplates({ page = 1, limit = 10, search = "" } = {}) {
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(limit) || 10));
  const offset = (currentPage - 1) * pageSize;
  let query = db("email_templates");

  if (String(search).trim()) {
    const term = `%${String(search).trim()}%`;
    query = query.where(function () {
      this.whereILike("name", term)
        .orWhereILike("slug", term)
        .orWhereILike("subject", term)
        .orWhereILike("description", term);
    });
  }

  const [{ count }] = await query.clone().clearSelect().count("id as count");
  const rows = await query.orderBy("created_at", "desc").limit(pageSize).offset(offset);
  const total = Number(count || 0);

  return {
    templates: rows.map(normalizeTemplate),
    pagination: {
      page: currentPage,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

async function findEmailTemplateById(id) {
  return normalizeTemplate(await db("email_templates").where({ id }).first());
}

async function createEmailTemplate(data) {
  const payload = validateTemplate(data);
  const duplicate = await db("email_templates").where({ slug: payload.slug }).first();
  if (duplicate) throw new Error(`A template with slug "${payload.slug}" already exists`);

  const [row] = await db("email_templates").insert(payload).returning("*");
  return normalizeTemplate(row);
}

async function updateEmailTemplate(id, data) {
  const current = await findEmailTemplateById(id);
  if (!current) throw new Error("Email template not found");

  const payload = validateTemplate({
    name: data.name ?? current.name,
    slug: data.slug ?? current.slug,
    subject: data.subject ?? current.subject,
    description: data.description ?? current.description,
    body: data.body ?? current.body,
    isActive: data.isActive ?? current.isActive,
  });
  const duplicate = await db("email_templates")
    .where({ slug: payload.slug })
    .whereNot({ id })
    .first();
  if (duplicate) throw new Error(`A template with slug "${payload.slug}" already exists`);

  const [row] = await db("email_templates")
    .where({ id })
    .update({ ...payload, updated_at: db.fn.now() })
    .returning("*");
  return normalizeTemplate(row);
}

async function deleteEmailTemplate(id) {
  return db("email_templates").where({ id }).del();
}

module.exports = {
  listEmailTemplates,
  findEmailTemplateById,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
};
