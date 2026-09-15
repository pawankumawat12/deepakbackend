const db = require("../../config/db");
const { sendMail } = require("./resend.service");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function replaceVariables(value, variables = {}, { html = false } = {}) {
  return String(value || "").replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key) => {
    const rawValue = variables[key] ?? "";
    return html ? escapeHtml(rawValue) : String(rawValue);
  });
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getTemplateBySlug(slug) {
  return db("email_templates").where({ slug, is_active: true }).first();
}

async function renderEmailTemplate(slug, variables = {}) {
  const template = await getTemplateBySlug(slug);
  if (!template) {
    throw new Error(`Active email template not found: ${slug}`);
  }

  const html = replaceVariables(template.body, variables, { html: true });
  return {
    slug,
    subject: replaceVariables(template.subject, variables),
    html,
    text: htmlToText(html),
  };
}

async function sendTemplatedMail({
  to,
  templateSlug,
  variables = {},
  emailType,
  userId = null,
  metadata = null,
  async = false,
}) {
  if (async) {
    return sendTemplatedMailBackground({
      to,
      templateSlug,
      variables,
      emailType,
      userId,
      metadata,
    });
  }

  const rendered = await renderEmailTemplate(templateSlug, variables);
  return sendMail({
    to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    emailType: emailType || templateSlug,
    userId,
    metadata,
  });
}

async function sendTemplatedMailBackground({
  to,
  templateSlug,
  variables = {},
  emailType,
  userId = null,
  metadata = null,
  maxAttempts = 3,
}) {
  const { enqueueEmail } = require("./emailQueue.service");
  return enqueueEmail({
    to,
    templateSlug,
    variables,
    emailType: emailType || templateSlug,
    userId,
    metadata,
    maxAttempts,
  });
}

module.exports = {
  getTemplateBySlug,
  renderEmailTemplate,
  sendTemplatedMail,
  sendTemplatedMailBackground,
  replaceVariables,
  htmlToText,
};
