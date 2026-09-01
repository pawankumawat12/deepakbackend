const ContactModel = require("../../models/contact.model");
const {
  validateContactSubmission,
  validateStatusUpdate,
} = require("./contact.validation");

/**
 * 1. Submit contact query (Public or Authenticated Customer)
 */
async function submitContactQuery(req, res) {
  try {
    const validation = validateContactSubmission(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || "Validation failed",
        errors: validation.errors,
      });
    }

    const { name, email, phone, subject, message } = req.body;
    const userId = req.user?.id || null;

    const newQuery = await ContactModel.createQuery({
      user_id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      subject: subject.trim(),
      message: message.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Thank you for reaching out! Your message has been sent successfully. We'll get back to you soon.",
      data: newQuery,
    });
  } catch (error) {
    console.error("Submit contact query error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit your message. Please try again later.",
    });
  }
}

/**
 * 2. Get all contact queries for Admin (Paginated, filtered, searchable)
 */
async function getAdminContactQueries(req, res) {
  try {
    const { page, limit, status, search } = req.query;

    const result = await ContactModel.getQueries({
      page,
      limit,
      status,
      search,
    });

    return res.status(200).json({
      success: true,
      data: result.queries,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get admin contact queries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve contact queries",
    });
  }
}

/**
 * 3. Get Contact Stats for Admin
 */
async function getAdminContactStats(req, res) {
  try {
    const stats = await ContactModel.getStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get admin contact stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve contact statistics",
    });
  }
}

/**
 * 4. Update query status & admin notes (Admin)
 */
async function updateAdminContactQuery(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid query ID",
      });
    }

    const existing = await ContactModel.getQueryById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Contact query not found",
      });
    }

    const validation = validateStatusUpdate(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || "Validation failed",
        errors: validation.errors,
      });
    }

    const { status, admin_notes } = req.body;

    const updated = await ContactModel.updateQuery(id, {
      status,
      admin_notes,
    });

    return res.status(200).json({
      success: true,
      message: "Contact query updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update admin contact query error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update contact query",
    });
  }
}

/**
 * 5. Delete query (Admin)
 */
async function deleteAdminContactQuery(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid query ID",
      });
    }

    const existing = await ContactModel.getQueryById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Contact query not found",
      });
    }

    await ContactModel.deleteQuery(id);

    return res.status(200).json({
      success: true,
      message: "Contact query deleted successfully",
    });
  } catch (error) {
    console.error("Delete admin contact query error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete contact query",
    });
  }
}

module.exports = {
  submitContactQuery,
  getAdminContactQueries,
  getAdminContactStats,
  updateAdminContactQuery,
  deleteAdminContactQuery,
};

