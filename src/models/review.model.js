const db = require("../../config/db");

async function createReview(data) {
  const [created] = await db("reviews")
    .insert({
      user_id: data.user_id,
      product_id: data.product_id || null,
      type: data.type || (data.product_id ? "product" : "site"),
      rating: Number(data.rating),
      title: data.title ? data.title.trim() : null,
      comment: data.comment.trim(),
      is_hidden: false,
      status: "published",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*");

  return findReviewById(created.id);
}

function findReviewById(id) {
  return db("reviews")
    .leftJoin("users", "reviews.user_id", "users.id")
    .leftJoin("products", "reviews.product_id", "products.id")
    .select(
      "reviews.*",
      "users.name as user_name",
      "users.email as user_email",
      "users.image as user_image",
      "products.name as product_name",
      "products.images as product_images"
    )
    .where("reviews.id", id)
    .first();
}

async function updateReview(id, data) {
  const updatePayload = {
    updated_at: new Date(),
  };

  if (typeof data.rating !== "undefined") {
    updatePayload.rating = Number(data.rating);
  }
  if (typeof data.title !== "undefined") {
    updatePayload.title = data.title ? data.title.trim() : null;
  }
  if (typeof data.comment !== "undefined") {
    updatePayload.comment = data.comment.trim();
  }

  await db("reviews").where({ id }).update(updatePayload);
  return findReviewById(id);
}

function deleteReview(id) {
  return db("reviews").where({ id }).del();
}

async function toggleVisibility(id, is_hidden) {
  const hiddenBool = Boolean(is_hidden);
  await db("reviews").where({ id }).update({
    is_hidden: hiddenBool,
    status: hiddenBool ? "hidden" : "published",
    updated_at: new Date(),
  });
  return findReviewById(id);
}

async function getProductReviews(productId, { page = 1, limit = 10, currentUserId = null } = {}) {
  const pId = Number(productId);
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(50, Number(limit) || 10));
  const offset = (p - 1) * l;

  // Base condition: not hidden OR authored by current user
  let query = db("reviews")
    .leftJoin("users", "reviews.user_id", "users.id")
    .select(
      "reviews.id",
      "reviews.user_id",
      "reviews.product_id",
      "reviews.type",
      "reviews.rating",
      "reviews.title",
      "reviews.comment",
      "reviews.is_hidden",
      "reviews.status",
      "reviews.created_at",
      "reviews.updated_at",
      "users.name as user_name",
      "users.image as user_image"
    )
    .where("reviews.product_id", pId)
    .where((builder) => {
      builder.where("reviews.is_hidden", false);
      if (currentUserId) {
        builder.orWhere("reviews.user_id", Number(currentUserId));
      }
    });

  // Calculate rating summary
  const summaryRow = await db("reviews")
    .where({ product_id: pId, is_hidden: false })
    .select(
      db.raw("COUNT(id) as total_reviews"),
      db.raw("COALESCE(AVG(rating), 0) as average_rating"),
      db.raw("COUNT(CASE WHEN rating = 5 THEN 1 END) as star_5"),
      db.raw("COUNT(CASE WHEN rating = 4 THEN 1 END) as star_4"),
      db.raw("COUNT(CASE WHEN rating = 3 THEN 1 END) as star_3"),
      db.raw("COUNT(CASE WHEN rating = 2 THEN 1 END) as star_2"),
      db.raw("COUNT(CASE WHEN rating = 1 THEN 1 END) as star_1")
    )
    .first();

  const totalReviews = Number(summaryRow?.total_reviews || 0);
  const averageRating = Number(Number(summaryRow?.average_rating || 0).toFixed(1));

  const ratingDistribution = {
    5: Number(summaryRow?.star_5 || 0),
    4: Number(summaryRow?.star_4 || 0),
    3: Number(summaryRow?.star_3 || 0),
    2: Number(summaryRow?.star_2 || 0),
    1: Number(summaryRow?.star_1 || 0),
  };

  const [countRow] = await query.clone().clearSelect().count("reviews.id as count");
  const filteredCount = Number(countRow?.count || 0);

  const totalPages = Math.ceil(filteredCount / l) || 1;
  const hasMore = p < totalPages;

  const reviews = await query
    .orderBy("reviews.created_at", "desc")
    .limit(l)
    .offset(offset);

  return {
    reviews,
    summary: {
      totalReviews,
      averageRating,
      ratingDistribution,
    },
    pagination: {
      page: p,
      limit: l,
      total: filteredCount,
      totalPages,
      hasMore,
    },
  };
}

async function getSiteReviews({ page = 1, limit = 10, currentUserId = null } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(50, Number(limit) || 10));
  const offset = (p - 1) * l;

  let query = db("reviews")
    .leftJoin("users", "reviews.user_id", "users.id")
    .select(
      "reviews.id",
      "reviews.user_id",
      "reviews.type",
      "reviews.rating",
      "reviews.title",
      "reviews.comment",
      "reviews.is_hidden",
      "reviews.status",
      "reviews.created_at",
      "reviews.updated_at",
      "users.name as user_name",
      "users.image as user_image"
    )
    .where("reviews.type", "site")
    .where((builder) => {
      builder.where("reviews.is_hidden", false);
      if (currentUserId) {
        builder.orWhere("reviews.user_id", Number(currentUserId));
      }
    });

  const summaryRow = await db("reviews")
    .where({ type: "site", is_hidden: false })
    .select(
      db.raw("COUNT(id) as total_reviews"),
      db.raw("COALESCE(AVG(rating), 0) as average_rating"),
      db.raw("COUNT(CASE WHEN rating = 5 THEN 1 END) as star_5"),
      db.raw("COUNT(CASE WHEN rating = 4 THEN 1 END) as star_4"),
      db.raw("COUNT(CASE WHEN rating = 3 THEN 1 END) as star_3"),
      db.raw("COUNT(CASE WHEN rating = 2 THEN 1 END) as star_2"),
      db.raw("COUNT(CASE WHEN rating = 1 THEN 1 END) as star_1")
    )
    .first();

  const totalReviews = Number(summaryRow?.total_reviews || 0);
  const averageRating = Number(Number(summaryRow?.average_rating || 0).toFixed(1));

  const ratingDistribution = {
    5: Number(summaryRow?.star_5 || 0),
    4: Number(summaryRow?.star_4 || 0),
    3: Number(summaryRow?.star_3 || 0),
    2: Number(summaryRow?.star_2 || 0),
    1: Number(summaryRow?.star_1 || 0),
  };

  const [countRow] = await query.clone().clearSelect().count("reviews.id as count");
  const filteredCount = Number(countRow?.count || 0);

  const reviews = await query.orderBy("reviews.created_at", "desc").limit(l).offset(offset);

  return {
    reviews,
    summary: {
      totalReviews,
      averageRating,
      ratingDistribution,
    },
    pagination: {
      page: p,
      limit: l,
      total: filteredCount,
      totalPages: Math.ceil(filteredCount / l) || 1,
    },
  };
}

async function getMyReviews(userId, { page = 1, limit = 20 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(50, Number(limit) || 20));
  const offset = (p - 1) * l;

  const query = db("reviews")
    .leftJoin("products", "reviews.product_id", "products.id")
    .select(
      "reviews.*",
      "products.name as product_name",
      "products.images as product_images"
    )
    .where("reviews.user_id", Number(userId));

  const [countRow] = await query.clone().clearSelect().count("reviews.id as count");
  const total = Number(countRow?.count || 0);

  const reviews = await query.orderBy("reviews.created_at", "desc").limit(l).offset(offset);

  return {
    reviews,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l) || 1,
    },
  };
}

async function getAllReviewsAdmin({ page = 1, limit = 20, type, status, rating, search } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(100, Number(limit) || 20));
  const offset = (p - 1) * l;

  let query = db("reviews")
    .leftJoin("users", "reviews.user_id", "users.id")
    .leftJoin("products", "reviews.product_id", "products.id")
    .select(
      "reviews.*",
      "users.name as user_name",
      "users.email as user_email",
      "users.image as user_image",
      "products.name as product_name",
      "products.images as product_images"
    );

  if (type) {
    query = query.where("reviews.type", type);
  }

  if (status) {
    query = query.where("reviews.status", status);
  }

  if (rating) {
    query = query.where("reviews.rating", Number(rating));
  }

  if (search) {
    query = query.where((builder) => {
      builder
        .whereILike("users.name", `%${search}%`)
        .orWhereILike("users.email", `%${search}%`)
        .orWhereILike("products.name", `%${search}%`)
        .orWhereILike("reviews.comment", `%${search}%`)
        .orWhereILike("reviews.title", `%${search}%`);
    });
  }

  const [countRow] = await query.clone().clearSelect().count("reviews.id as count");
  const total = Number(countRow?.count || 0);

  const reviews = await query.orderBy("reviews.created_at", "desc").limit(l).offset(offset);

  return {
    reviews,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l) || 1,
    },
  };
}

async function getReviewStats() {
  const stats = await db("reviews")
    .select(
      db.raw("COUNT(id) as total_reviews"),
      db.raw("COUNT(CASE WHEN type = 'product' THEN 1 END) as product_reviews"),
      db.raw("COUNT(CASE WHEN type = 'site' THEN 1 END) as site_reviews"),
      db.raw("COUNT(CASE WHEN is_hidden = false THEN 1 END) as published_reviews"),
      db.raw("COUNT(CASE WHEN is_hidden = true THEN 1 END) as hidden_reviews"),
      db.raw("COALESCE(AVG(rating), 0) as average_rating")
    )
    .first();

  return {
    totalReviews: Number(stats?.total_reviews || 0),
    productReviews: Number(stats?.product_reviews || 0),
    siteReviews: Number(stats?.site_reviews || 0),
    publishedReviews: Number(stats?.published_reviews || 0),
    hiddenReviews: Number(stats?.hidden_reviews || 0),
    averageRating: Number(Number(stats?.average_rating || 0).toFixed(1)),
  };
}

module.exports = {
  createReview,
  findReviewById,
  updateReview,
  deleteReview,
  toggleVisibility,
  getProductReviews,
  getSiteReviews,
  getMyReviews,
  getAllReviewsAdmin,
  getReviewStats,
};

