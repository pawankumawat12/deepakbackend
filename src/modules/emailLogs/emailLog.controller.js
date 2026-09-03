const EmailLogModel = require("../../models/emailLog.model");

/**
 * 1. Get paginated email logs with search, filters, and sorting
 */
async function getEmailLogs(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      email_type = "all",
      status = "all",
      sort_by = "created_at",
      sort_order = "desc",
      from_date = null,
      to_date = null,
    } = req.query;

    const result = await EmailLogModel.getEmailLogs({
      page,
      limit,
      search,
      email_type,
      status,
      sort_by,
      sort_order,
      from_date,
      to_date,
    });

    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[EmailLogs] Get logs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve email logs",
    });
  }
}

/**
 * 2. Get aggregate statistics for email logs
 */
async function getEmailLogStats(req, res) {
  try {
    const stats = await EmailLogModel.getEmailLogStats();
    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("[EmailLogs] Get stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve email log statistics",
    });
  }
}

/**
 * 3. Get single email log detail (includes full body_html for preview)
 */
async function getEmailLogById(req, res) {
  try {
    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid email log ID",
      });
    }

    const log = await EmailLogModel.getEmailLogById(Number(id));
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Email log not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error("[EmailLogs] Get single log error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve email log details",
    });
  }
}

/**
 * 4. Delete a single email log
 */
async function deleteEmailLog(req, res) {
  try {
    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid email log ID",
      });
    }

    const deleted = await EmailLogModel.deleteEmailLog(Number(id));
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Email log not found or already deleted",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Email log deleted successfully",
    });
  } catch (error) {
    console.error("[EmailLogs] Delete log error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete email log",
    });
  }
}

/**
 * 5. Bulk delete multiple email logs
 */
async function bulkDeleteEmailLogs(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of email log IDs to delete",
      });
    }

    const validIds = ids.map(Number).filter((n) => !isNaN(n) && n > 0);
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid IDs provided",
      });
    }

    const count = await EmailLogModel.bulkDeleteEmailLogs(validIds);

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${count} email log(s)`,
      count,
    });
  } catch (error) {
    console.error("[EmailLogs] Bulk delete error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to perform bulk deletion",
    });
  }
}

module.exports = {
  getEmailLogs,
  getEmailLogStats,
  getEmailLogById,
  deleteEmailLog,
  bulkDeleteEmailLogs,
};

