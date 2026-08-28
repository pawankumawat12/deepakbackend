const { findProductById } = require("../../models/product.model");
const {
  getCartItems,
  findCartItem,
  upsertCartItem,
  removeCartItem,
  clearCart,
} = require("../../models/cart.model");
const { getAddressesByUserId, getAddressById } = require("../../models/address.model");
const { calculateCartAndOrderPricing } = require("../../utils/pricing.util");

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseImages(images) {
  if (Array.isArray(images)) return images;
  if (typeof images === "string") {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function respondWithCart(res, userId, message = "Success", options = {}) {
  const rawItems = await getCartItems(userId);

  const items = rawItems.map((item) => {
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    const stock = Number(item.stock) || 0;
    const itemTotal = price * quantity;
    const images = parseImages(item.images);
    const availabilityType = item.availability_type || "IN_STOCK";
    const isMadeToOrder = availabilityType === "MADE_TO_ORDER";

    const isOutOfStock = !item.is_active || (!isMadeToOrder && stock <= 0);
    const exceedsStock = !isMadeToOrder && quantity > stock;
    const isMaxStockReached = !isMadeToOrder && quantity >= stock && stock > 0;

    let stockMessage = null;
    if (!item.is_active) {
      stockMessage = "Unavailable";
    } else if (isMadeToOrder) {
      stockMessage = "Made to Order";
    } else if (stock <= 0) {
      stockMessage = "Out of stock";
    } else if (exceedsStock) {
      stockMessage = `Only ${stock} left in stock. Please reduce quantity to proceed.`;
    } else if (isMaxStockReached) {
      stockMessage = `Max stock reached (Only ${stock} available)`;
    } else if (stock <= 5) {
      stockMessage = `Only ${stock} left in stock`;
    }

    return {
      id: item.product_id,
      cart_item_id: item.cart_item_id,
      product_id: item.product_id,
      name: item.name,
      description: item.description,
      price,
      stock,
      availableStock: isMadeToOrder ? null : stock,
      availability_type: availabilityType,
      isMadeToOrder,
      images,
      image: images[0] || null,
      is_active: Boolean(item.is_active),
      category_id: item.category_id,
      category_name: item.category_name || "Menu",
      quantity,
      itemTotal,
      isOutOfStock,
      exceedsStock,
      isMaxStockReached,
      stockMessage,
      added_at: item.added_at,
      updated_at: item.updated_at,
    };
  });

  // Get delivery address for distance calculations
  let deliveryAddress = null;
  if (options.addressId) {
    deliveryAddress = await getAddressById(options.addressId, userId);
  }
  if (!deliveryAddress) {
    const userAddresses = await getAddressesByUserId(userId);
    deliveryAddress = userAddresses.find((a) => a.is_default) || userAddresses[0] || null;
  }

  // Calculate pricing completely on the backend
  const pricing = await calculateCartAndOrderPricing({
    items,
    deliveryAddress,
    paymentMethod: options.paymentMethod || "Cash on Delivery",
  });

  const stockProblemItems = items.filter((it) => it.isOutOfStock || it.exceedsStock);

  const summary = {
    totalItems: pricing.total_items,
    itemTypesCount: pricing.item_types_count,
    subtotal: pricing.subtotal,
    discountPercent: pricing.discount_percent,
    discount: pricing.discount,
    discountedSubtotal: pricing.discounted_subtotal,

    gstPercent: pricing.gst_percent,
    taxInclusive: pricing.tax_inclusive,
    taxAmount: pricing.tax_amount,
    taxAddedToTotal: pricing.tax_added_to_total,
    taxLabel: pricing.tax_label,

    deliveryChargeType: pricing.delivery_charge_type,
    deliveryChargeValue: pricing.delivery_charge_value,
    deliveryFee: pricing.delivery_fee,
    isFreeDelivery: pricing.is_free_delivery,
    freeDeliveryThreshold: pricing.free_delivery_threshold,
    freeDeliverySavings: pricing.free_delivery_savings,
    freeDeliveryShortfall: pricing.free_delivery_shortfall,

    distanceKm: pricing.distance_km,
    maxDeliveryDistance: pricing.max_delivery_distance,
    isOutOfRange: pricing.is_out_of_range,

    packagingFee: pricing.packaging_fee,
    platformFee: pricing.platform_fee,
    codFee: pricing.cod_fee,
    isCod: pricing.is_cod,

    minimumOrderAmount: pricing.minimum_order_amount,
    isBelowMinimumOrder: pricing.is_below_minimum_order,
    minimumOrderShortfall: pricing.minimum_order_shortfall,

    grandTotal: pricing.grand_total,
    hasOutOfStockItems: stockProblemItems.length > 0,
    outOfStockCount: stockProblemItems.length,

    timer: {
      calculatedAt: pricing.calculated_at,
      expiresAt: pricing.expires_at,
      validForSeconds: pricing.valid_for_seconds,
    },
  };

  return res.status(200).json({
    success: true,
    message,
    data: {
      items,
      summary,
      pricing,
      deliveryAddress,
    },
  });
}

async function getCart(req, res) {
  try {
    const addressId = req.query.addressId ? Number(req.query.addressId) : null;
    const paymentMethod = req.query.paymentMethod || "Cash on Delivery";
    return await respondWithCart(res, req.user.id, "Cart fetched successfully", {
      addressId,
      paymentMethod,
    });
  } catch (error) {
    console.error("Get cart error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function addCartItem(req, res) {
  try {
    const productId = parsePositiveInteger(req.body?.productId);
    const quantity = parsePositiveInteger(req.body?.quantity || 1);

    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        message: "productId and quantity must be positive integers",
      });
    }

    const product = await findProductById(productId);
    if (!product || !product.is_active) {
      return res.status(404).json({
        success: false,
        message: "This product is currently not available",
      });
    }

    const isMadeToOrder = product.availability_type === "MADE_TO_ORDER";
    const productStock = Number(product.stock) || 0;
    const current = await findCartItem(req.user.id, productId);
    const currentQty = Number(current?.quantity) || 0;
    const requestedTotal = currentQty + quantity;

    if (!isMadeToOrder) {
      if (productStock <= 0) {
        return res.status(400).json({
          success: false,
          message: "This item is currently out of stock",
          availableStock: 0,
        });
      }

      if (currentQty >= productStock) {
        return res.status(400).json({
          success: false,
          message: `Maximum available stock (${productStock} items) already reached in your cart`,
          availableStock: productStock,
          currentQuantityInCart: currentQty,
        });
      }

      if (requestedTotal > productStock) {
        return res.status(400).json({
          success: false,
          message: `Only ${productStock} item(s) are available in stock. You already have ${currentQty} in your cart.`,
          availableStock: productStock,
          currentQuantityInCart: currentQty,
          canAdd: productStock - currentQty,
        });
      }
    }

    await upsertCartItem(req.user.id, productId, requestedTotal);
    return await respondWithCart(res, req.user.id, "Item added to cart");
  } catch (error) {
    console.error("Add cart item error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function updateCartItem(req, res) {
  try {
    const productId = parsePositiveInteger(req.params.productId);
    const quantity = Number(req.body?.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "quantity must be a non-negative integer",
      });
    }

    if (quantity === 0) {
      await removeCartItem(req.user.id, productId);
      return await respondWithCart(res, req.user.id, "Item removed from cart");
    }

    const product = await findProductById(productId);
    if (!product || !product.is_active) {
      return res.status(404).json({
        success: false,
        message: "Product is not available",
      });
    }

    const isMadeToOrder = product.availability_type === "MADE_TO_ORDER";
    const productStock = Number(product.stock) || 0;

    if (!isMadeToOrder) {
      if (productStock <= 0) {
        return res.status(400).json({
          success: false,
          message: "This item is currently out of stock",
          availableStock: 0,
        });
      }

      if (quantity > productStock) {
        return res.status(400).json({
          success: false,
          message: `Only ${productStock} item(s) are available in stock`,
          availableStock: productStock,
        });
      }
    }

    await upsertCartItem(req.user.id, productId, quantity);
    return await respondWithCart(res, req.user.id, "Cart item updated");
  } catch (error) {
    console.error("Update cart item error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function deleteCartItem(req, res) {
  try {
    const productId = parsePositiveInteger(req.params.productId);
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Invalid product id",
      });
    }

    await removeCartItem(req.user.id, productId);
    return await respondWithCart(res, req.user.id, "Item removed from cart");
  } catch (error) {
    console.error("Delete cart item error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function deleteCart(req, res) {
  try {
    await clearCart(req.user.id);
    return await respondWithCart(res, req.user.id, "Cart cleared successfully");
  } catch (error) {
    console.error("Clear cart error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  deleteCartItem,
  deleteCart,
};
