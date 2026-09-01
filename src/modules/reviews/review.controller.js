const reviewModel = require("../../models/review.model");
const db = require("../../../config/db");

// 1. Submit Product Review (Customer)
async function createProductReview(req, res) {
  try {
    const userId = req.user?.id;
    const productId = Number(req.params.productId);
    const { rating, title, comment } = req.body || {};

    if (!productId || isNaN(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5 stars",
      });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot be empty",
      });
    }

    // Verify product exists
    const product = await db("products").where({ id: productId }).first();
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const review = await reviewModel.createReview({
      user_id: userId,
      product_id: productId,
      type: "product",
      rating: numRating,
      title: title || null,
      comment: comment.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully!",
      data: review,
    });
  } catch (error) {
    console.error("Create product review error:", error);
    return res.status(500).json({ success: false, message: "Failed to submit review" });
  }
}

// 2. Submit Site / Store Review (Customer)
async function createSiteReview(req, res) {
  try {
    const userId = req.user?.id;
    const { rating, title, comment } = req.body || {};

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5 stars",
      });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot be empty",
      });
    }

    const review = await reviewModel.createReview({
      user_id: userId,
      product_id: null,
      type: "site",
      rating: numRating,
      title: title || null,
      comment: comment.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Store review submitted successfully! Thank you for your feedback.",
      data: review,
    });
  } catch (error) {
    console.error("Create site review error:", error);
    return res.status(500).json({ success: false, message: "Failed to submit store review" });
  }
}

// 3. Update Review (Customer Owner or Admin)
async function updateReview(req, res) {
  try {
    const reviewId = Number(req.params.id);
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { rating, title, comment } = req.body || {};

    const existing = await reviewModel.findReviewById(reviewId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    // Permission check: only author or admin
    if (existing.user_id !== userId && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Permission denied: You can only edit your own reviews",
      });
    }

    if (typeof rating !== "undefined") {
      const numRating = Number(rating);
      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5 stars",
        });
      }
    }

    if (typeof comment !== "undefined" && !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot be empty",
      });
    }

    const updated = await reviewModel.updateReview(reviewId, {
      rating,
      title,
      comment,
    });

    return res.status(200).json({
      success: true,
      message: "Review updated successfully!",
      data: updated,
    });
  } catch (error) {
    console.error("Update review error:", error);
    return res.status(500).json({ success: false, message: "Failed to update review" });
  }
}

// 4. Delete Review (Customer Owner or Admin)
async function deleteReview(req, res) {
  try {
    const reviewId = Number(req.params.id);
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const existing = await reviewModel.findReviewById(reviewId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    // Permission check
    if (existing.user_id !== userId && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Permission denied: You can only delete your own reviews",
      });
    }

    await reviewModel.deleteReview(reviewId);

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Delete review error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete review" });
  }
}

// 5. Toggle Review Visibility / Hide / Unhide (Admin Only)
async function toggleReviewVisibility(req, res) {
  try {
    const reviewId = Number(req.params.id);
    const { is_hidden } = req.body || {};

    const existing = await reviewModel.findReviewById(reviewId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const nextHidden = typeof is_hidden === "boolean" ? is_hidden : !existing.is_hidden;
    const updated = await reviewModel.toggleVisibility(reviewId, nextHidden);

    return res.status(200).json({
      success: true,
      message: nextHidden ? "Review hidden from customers" : "Review published and visible",
      data: updated,
    });
  } catch (error) {
    console.error("Toggle review visibility error:", error);
    return res.status(500).json({ success: false, message: "Failed to toggle visibility" });
  }
}

// 6. Get Product Reviews (Public + Current User Status)
async function getProductReviews(req, res) {
  try {
    const productId = Number(req.params.productId);
    const { page, limit } = req.query;
    const currentUserId = req.user?.id || null;

    const result = await reviewModel.getProductReviews(productId, {
      page,
      limit,
      currentUserId,
    });
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get product reviews error:", error);
    return res.status(500).json({ success: false, message: "Failed to load product reviews" });
  }
}

// 7. Get Site Reviews (Public)
async function getSiteReviews(req, res) {
  try {
    const { page, limit } = req.query;
    const currentUserId = req.user?.id || null;

    const result = await reviewModel.getSiteReviews({
      page,
      limit,
      currentUserId,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get site reviews error:", error);
    return res.status(500).json({ success: false, message: "Failed to load site reviews" });
  }
}

// 8. Get Logged-In Customer's Own Reviews
async function getMyReviews(req, res) {
  try {
    const userId = req.user?.id;
    const { page, limit } = req.query;

    const result = await reviewModel.getMyReviews(userId, { page, limit });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get my reviews error:", error);
    return res.status(500).json({ success: false, message: "Failed to load your reviews" });
  }
}

// 9. Admin List All Reviews (with filters)
async function getAllReviewsForAdmin(req, res) {
  try {
    const { page, limit, type, status, rating, search } = req.query;

    const result = await reviewModel.getAllReviewsAdmin({
      page,
      limit,
      type,
      status,
      rating,
      search,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Admin get reviews error:", error);
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
}

// 10. Review Statistics
async function getReviewStats(req, res) {
  try {
    const stats = await reviewModel.getReviewStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error("Get review stats error:", error);
    return res.status(500).json({ success: false, message: "Failed to load review stats" });
  }
}

module.exports = {
  createProductReview,
  createSiteReview,
  updateReview,
  deleteReview,
  toggleReviewVisibility,
  getProductReviews,
  getSiteReviews,
  getMyReviews,
  getAllReviewsForAdmin,
  getReviewStats,
};

