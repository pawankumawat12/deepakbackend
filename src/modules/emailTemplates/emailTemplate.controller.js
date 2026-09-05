const emailTemplateModel = require("../../models/emailTemplate.model");

async function listEmailTemplates(req, res) {
  try {
    const result = await emailTemplateModel.listEmailTemplates(req.query);
    return res.status(200).json({ success: true, data: result.templates, pagination: result.pagination });
  } catch (error) {
    console.error("List email templates error:", error);
    return res.status(500).json({ success: false, message: "Failed to load email templates" });
  }
}

async function getEmailTemplate(req, res) {
  try {
    const template = await emailTemplateModel.findEmailTemplateById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: "Email template not found" });
    return res.status(200).json({ success: true, data: template });
  } catch (error) {
    console.error("Get email template error:", error);
    return res.status(500).json({ success: false, message: "Failed to load email template" });
  }
}

async function createEmailTemplate(req, res) {
  try {
    const template = await emailTemplateModel.createEmailTemplate(req.body || {});
    return res.status(201).json({ success: true, message: "Email template created successfully", data: template });
  } catch (error) {
    console.error("Create email template error:", error);
    return res.status(400).json({ success: false, message: error.message || "Failed to create email template" });
  }
}

async function updateEmailTemplate(req, res) {
  try {
    const template = await emailTemplateModel.updateEmailTemplate(req.params.id, req.body || {});
    return res.status(200).json({ success: true, message: "Email template updated successfully", data: template });
  } catch (error) {
    console.error("Update email template error:", error);
    return res.status(400).json({ success: false, message: error.message || "Failed to update email template" });
  }
}

async function deleteEmailTemplate(req, res) {
  try {
    const deleted = await emailTemplateModel.deleteEmailTemplate(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Email template not found" });
    return res.status(200).json({ success: true, message: "Email template deleted successfully" });
  } catch (error) {
    console.error("Delete email template error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete email template" });
  }
}

module.exports = {
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
};
