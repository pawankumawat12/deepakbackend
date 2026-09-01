const DashboardModel = require("../../models/dashboard.model");

/**
 * Get comprehensive overview dashboard metrics
 */
async function getDashboardOverview(req, res) {
  try {
    const timeframe = req.query.timeframe || "weekly";

    const [
      kpis,
      trends,
      statusDistribution,
      topProducts,
      categorySales,
      recentOrders,
      recentActivities,
    ] = await Promise.all([
      DashboardModel.getKpis(),
      DashboardModel.getRevenueAndOrderTrends(timeframe),
      DashboardModel.getOrderStatusDistribution(),
      DashboardModel.getTopSellingProducts(5),
      DashboardModel.getCategorySalesDistribution(),
      DashboardModel.getRecentOrders(6),
      DashboardModel.getRecentActivities(6),
    ]);

    return res.status(200).json({
      success: true,
      message: "Dashboard analytics fetched successfully",
      data: {
        kpis,
        trends,
        statusDistribution,
        topProducts,
        categorySales,
        recentOrders,
        recentActivities,
      },
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard metrics",
    });
  }
}

/**
 * Get granular trends data
 */
async function getDashboardTrends(req, res) {
  try {
    const timeframe = req.query.timeframe || "weekly";
    const trends = await DashboardModel.getRevenueAndOrderTrends(timeframe);

    return res.status(200).json({
      success: true,
      data: trends,
    });
  } catch (error) {
    console.error("Dashboard trends error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch trend data",
    });
  }
}

module.exports = {
  getDashboardOverview,
  getDashboardTrends,
};

