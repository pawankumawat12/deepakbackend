const db = require("../../config/db");

const DashboardModel = {
  /**
   * Get all core KPIs with comparisons
   */
  async getKpis() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    const [
      totalOrdersRow,
      totalRevenueRow,
      todayStatsRow,
      yesterdayStatsRow,
      pendingOrdersRow,
      deliveredOrdersRow,
      cancelledOrdersRow,
      totalCustomersRow,
      totalProductsRow,
    ] = await Promise.all([
      // Total orders
      db("orders").count("id as count").first(),

      // Total revenue (non-cancelled)
      db("orders")
        .whereRaw("LOWER(status) != 'cancelled'")
        .sum("total_amount as revenue")
        .first(),

      // Today sales & orders
      db("orders")
        .where("created_at", ">=", todayStart)
        .whereRaw("LOWER(status) != 'cancelled'")
        .select(
          db.raw("COUNT(id) as today_orders"),
          db.raw("COALESCE(SUM(total_amount), 0) as today_sales")
        )
        .first(),

      // Yesterday sales & orders
      db("orders")
        .where("created_at", ">=", yesterdayStart)
        .where("created_at", "<", yesterdayEnd)
        .whereRaw("LOWER(status) != 'cancelled'")
        .select(
          db.raw("COUNT(id) as yesterday_orders"),
          db.raw("COALESCE(SUM(total_amount), 0) as yesterday_sales")
        )
        .first(),

      // Pending orders (Preparing, Out for Delivery, Placed, etc.)
      db("orders")
        .whereRaw("LOWER(status) NOT IN ('delivered', 'cancelled')")
        .count("id as count")
        .first(),

      // Delivered orders
      db("orders").whereRaw("LOWER(status) = 'delivered'").count("id as count").first(),

      // Cancelled orders
      db("orders").whereRaw("LOWER(status) = 'cancelled'").count("id as count").first(),

      // Total customers (users with role 'user' or 'customer')
      db("users").whereIn("role", ["user", "customer"]).count("id as count").first(),

      // Total products
      db("products").where("is_active", true).count("id as count").first(),
    ]);

    const totalRevenue = Number(totalRevenueRow?.revenue || 0);
    const totalOrders = Number(totalOrdersRow?.count || 0);
    const todaySales = Number(todayStatsRow?.today_sales || 0);
    const todayOrders = Number(todayStatsRow?.today_orders || 0);
    const yesterdaySales = Number(yesterdayStatsRow?.yesterday_sales || 0);
    const pendingOrders = Number(pendingOrdersRow?.count || 0);
    const deliveredOrders = Number(deliveredOrdersRow?.count || 0);
    const cancelledOrders = Number(cancelledOrdersRow?.count || 0);
    const totalCustomers = Number(totalCustomersRow?.count || 0);
    const totalProducts = Number(totalProductsRow?.count || 0);

    let salesGrowth = 0;
    if (yesterdaySales > 0) {
      salesGrowth = Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100);
    } else if (todaySales > 0) {
      salesGrowth = 100;
    }

    return {
      totalRevenue,
      totalOrders,
      todaySales,
      todayOrders,
      yesterdaySales,
      salesGrowth,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      totalCustomers,
      totalProducts,
    };
  },

  /**
   * Get Revenue and Order count trends for various timeframes
   */
  async getRevenueAndOrderTrends(timeframe = "weekly") {
    const now = new Date();
    const dataPoints = [];

    if (timeframe === "daily" || timeframe === "today") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const rows = await db("orders")
        .where("created_at", ">=", todayStart)
        .whereRaw("LOWER(status) != 'cancelled'")
        .select(
          db.raw("EXTRACT(HOUR FROM created_at) as hour"),
          db.raw("COUNT(id) as orders_count"),
          db.raw("COALESCE(SUM(total_amount), 0) as revenue")
        )
        .groupByRaw("EXTRACT(HOUR FROM created_at)")
        .orderByRaw("EXTRACT(HOUR FROM created_at) ASC");

      const hourMap = new Map(rows.map((r) => [Number(r.hour), r]));
      for (let h = 8; h <= 22; h += 2) {
        const item = hourMap.get(h) || hourMap.get(h + 1);
        const label = `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`;
        dataPoints.push({
          label,
          orders: Number(item?.orders_count || 0),
          revenue: Number(item?.revenue || 0),
        });
      }
    } else if (timeframe === "yearly") {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const oneYearAgo = new Date();
      oneYearAgo.setMonth(oneYearAgo.getMonth() - 11);
      oneYearAgo.setDate(1);
      oneYearAgo.setHours(0, 0, 0, 0);

      const rows = await db("orders")
        .where("created_at", ">=", oneYearAgo)
        .whereRaw("LOWER(status) != 'cancelled'")
        .select(
          db.raw("EXTRACT(YEAR FROM created_at) as year"),
          db.raw("EXTRACT(MONTH FROM created_at) as month"),
          db.raw("COUNT(id) as orders_count"),
          db.raw("COALESCE(SUM(total_amount), 0) as revenue")
        )
        .groupByRaw("EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at)")
        .orderByRaw("EXTRACT(YEAR FROM created_at) ASC, EXTRACT(MONTH FROM created_at) ASC");

      const monthMap = new Map(
        rows.map((r) => [`${Number(r.year)}-${Number(r.month)}`, r])
      );

      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const key = `${y}-${m}`;
        const item = monthMap.get(key);
        dataPoints.push({
          label: `${monthNames[m - 1]} ${String(y).slice(2)}`,
          orders: Number(item?.orders_count || 0),
          revenue: Number(item?.revenue || 0),
        });
      }
    } else if (timeframe === "monthly") {
      // Last 30 days in 5-day intervals
      for (let i = 28; i >= 0; i -= 4) {
        const dStart = new Date();
        dStart.setDate(dStart.getDate() - i);
        dStart.setHours(0, 0, 0, 0);
        const dEnd = new Date(dStart);
        dEnd.setDate(dEnd.getDate() + 4);

        const row = await db("orders")
          .where("created_at", ">=", dStart)
          .where("created_at", "<", dEnd)
          .whereRaw("LOWER(status) != 'cancelled'")
          .select(
            db.raw("COUNT(id) as orders_count"),
            db.raw("COALESCE(SUM(total_amount), 0) as revenue")
          )
          .first();

        const label = `${dStart.getDate()} ${dStart.toLocaleString("en-US", { month: "short" })}`;
        dataPoints.push({
          label,
          orders: Number(row?.orders_count || 0),
          revenue: Number(row?.revenue || 0),
        });
      }
    } else {
      // Weekly: Last 7 days
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (let i = 6; i >= 0; i--) {
        const dStart = new Date();
        dStart.setDate(dStart.getDate() - i);
        dStart.setHours(0, 0, 0, 0);
        const dEnd = new Date(dStart);
        dEnd.setDate(dEnd.getDate() + 1);

        const row = await db("orders")
          .where("created_at", ">=", dStart)
          .where("created_at", "<", dEnd)
          .whereRaw("LOWER(status) != 'cancelled'")
          .select(
            db.raw("COUNT(id) as orders_count"),
            db.raw("COALESCE(SUM(total_amount), 0) as revenue")
          )
          .first();

        const label = `${dayNames[dStart.getDay()]} (${dStart.getDate()}/${dStart.getMonth() + 1})`;
        dataPoints.push({
          label,
          orders: Number(row?.orders_count || 0),
          revenue: Number(row?.revenue || 0),
        });
      }
    }

    return dataPoints;
  },

  /**
   * Get order status breakdown
   */
  async getOrderStatusDistribution() {
    const rows = await db("orders")
      .select("status")
      .count("id as count")
      .groupBy("status");

    const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
    const distribution = {
      preparing: 0,
      out_for_delivery: 0,
      delivered: 0,
      cancelled: 0,
      total,
    };

    for (const r of rows) {
      const key = (r.status || "").toLowerCase().replace(/\s+/g, "_");
      if (key in distribution) {
        distribution[key] = Number(r.count || 0);
      } else {
        distribution[key] = Number(r.count || 0);
      }
    }

    return distribution;
  },

  /**
   * Top selling products by volume and revenue
   */
  async getTopSellingProducts(limit = 5) {
    const rows = await db("order_items")
      .join("orders", "order_items.order_id", "orders.id")
      .leftJoin("products", "order_items.product_id", "products.id")
      .leftJoin("categories", "products.category_id", "categories.id")
      .whereRaw("LOWER(orders.status) != 'cancelled'")
      .select(
        db.raw("COALESCE(products.id, order_items.product_id, 0) as id"),
        db.raw("COALESCE(products.name, order_items.product_name) as name"),
        db.raw("COALESCE(products.price, order_items.price) as price"),
        "products.images",
        "order_items.image as item_image",
        db.raw("COALESCE(products.stock, 50) as stock"),
        db.raw("COALESCE(categories.name, 'Specialty') as category_name"),
        db.raw("COALESCE(SUM(order_items.quantity), 0) as total_sold"),
        db.raw("COALESCE(SUM(order_items.total), 0) as total_revenue")
      )
      .groupByRaw(
        "COALESCE(products.id, order_items.product_id, 0), COALESCE(products.name, order_items.product_name), COALESCE(products.price, order_items.price), products.images, order_items.image, products.stock, categories.name"
      )
      .orderBy("total_sold", "desc")
      .limit(limit);

    return rows.map((r, index) => {
      let image = r.item_image || null;
      if (r.images) {
        try {
          const parsed = typeof r.images === "string" ? JSON.parse(r.images) : r.images;
          image = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          image = r.images;
        }
      }
      return {
        rank: index + 1,
        id: Number(r.id),
        name: r.name || "Cafe Special",
        price: Number(r.price),
        stock: Number(r.stock || 0),
        category: r.category_name || "Specialty",
        image: image || "/images/placeholder.png",
        totalSold: Number(r.total_sold || 0),
        totalRevenue: Number(r.total_revenue || 0),
      };
    });
  },

  /**
   * Category-wise sales distribution
   */
  async getCategorySalesDistribution() {
    const rows = await db("order_items")
      .join("orders", "order_items.order_id", "orders.id")
      .leftJoin("products", "order_items.product_id", "products.id")
      .leftJoin("categories", "products.category_id", "categories.id")
      .whereRaw("LOWER(orders.status) != 'cancelled'")
      .select(
        db.raw("COALESCE(categories.name, 'Popular Bites') as category_name"),
        db.raw("COALESCE(SUM(order_items.quantity), 0) as items_sold"),
        db.raw("COALESCE(SUM(order_items.total), 0) as revenue")
      )
      .groupByRaw("COALESCE(categories.name, 'Popular Bites')")
      .orderBy("revenue", "desc")
      .limit(6);

    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue || 0), 0);

    return rows.map((r) => {
      const revenue = Number(r.revenue || 0);
      const percentage = totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100) : 0;
      return {
        name: r.category_name,
        itemsSold: Number(r.items_sold || 0),
        revenue,
        percentage,
      };
    });
  },

  /**
   * Get latest recent orders
   */
  async getRecentOrders(limit = 6) {
    const rows = await db("orders")
      .select(
        "id",
        "order_number",
        "customer_name",
        "customer_email",
        "total_amount",
        "payment_method",
        "payment_status",
        "status",
        "created_at"
      )
      .orderBy("created_at", "desc")
      .limit(limit);

    return rows.map((r) => ({
      id: Number(r.id),
      orderNumber: r.order_number,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      totalAmount: Number(r.total_amount),
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      status: r.status,
      createdAt: r.created_at,
    }));
  },

  /**
   * Get recent customer activity feed
   */
  async getRecentActivities(limit = 6) {
    const [recentOrders, recentReviews, recentInquiries] = await Promise.all([
      db("orders")
        .select("id", "order_number", "customer_name", "total_amount", "created_at")
        .orderBy("created_at", "desc")
        .limit(3),
      db("reviews")
        .join("users", "reviews.user_id", "users.id")
        .select("reviews.id", "users.name as user_name", "reviews.rating", "reviews.created_at")
        .orderBy("reviews.created_at", "desc")
        .limit(3),
      db("contact_queries")
        .select("id", "name", "subject", "created_at")
        .orderBy("created_at", "desc")
        .limit(3),
    ]);

    const activities = [
      ...recentOrders.map((o) => ({
        type: "order",
        title: `Order #${o.order_number} Placed`,
        description: `${o.customer_name} placed an order worth ₹${Number(o.total_amount).toLocaleString("en-IN")}`,
        createdAt: o.created_at,
      })),
      ...recentReviews.map((r) => ({
        type: "review",
        title: `New ${r.rating}★ Review`,
        description: `${r.user_name} reviewed a cafe item`,
        createdAt: r.created_at,
      })),
      ...recentInquiries.map((q) => ({
        type: "inquiry",
        title: `Customer Inquiry from ${q.name}`,
        description: `Subject: "${q.subject}"`,
        createdAt: q.created_at,
      })),
    ];

    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return activities.slice(0, limit);
  },
};

module.exports = DashboardModel;
