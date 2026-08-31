const { getOrderPricingSettings } = require("../models/settings.model");

/**
 * Calculates haversine distance between two coordinates in Kilometers
 */
function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);

  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) {
    return null;
  }

  // If coordinates are 0,0 (placeholder)
  if (numLat1 === 0 && numLon1 === 0) return null;
  if (numLat2 === 0 && numLon2 === 0) return null;

  const R = 6371; // Radius of the Earth in km
  const dLat = ((numLat2 - numLat1) * Math.PI) / 180;
  const dLon = ((numLon2 - numLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((numLat1 * Math.PI) / 180) *
      Math.cos((numLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 100) / 100;
}

/**
 * Computes the full pricing breakdown using getOrderPricingSettings()
 */
async function calculateCartAndOrderPricing({
  items = [],
  deliveryAddress = null,
  paymentMethod = "Cash on Delivery",
  pricingSettings = null,
}) {
  const settings = pricingSettings || (await getOrderPricingSettings());

  // 1. Subtotal
  let rawSubtotal = 0;
  let totalQuantity = 0;

  for (const item of items) {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 1;
    rawSubtotal += price * qty;
    totalQuantity += qty;
  }
  rawSubtotal = Math.round(rawSubtotal * 100) / 100;

  // 2. Discount
  const discountPercent = Number(settings.discount_percent) || 0;
  const discount =
    discountPercent > 0
      ? Math.round(((rawSubtotal * discountPercent) / 100) * 100) / 100
      : 0;
  const discountedSubtotal = Math.max(0, Math.round((rawSubtotal - discount) * 100) / 100);

  // 3. Minimum Order Check
  const minimumOrderAmount = Number(settings.minimum_order_amount) || 0;
  const isBelowMinimumOrder = rawSubtotal > 0 && rawSubtotal < minimumOrderAmount;
  const minimumOrderShortfall = isBelowMinimumOrder
    ? Math.round((minimumOrderAmount - rawSubtotal) * 100) / 100
    : 0;

  // 4. Distance Calculation
  let distanceKm = null;
  if (
    deliveryAddress &&
    deliveryAddress.latitude != null &&
    deliveryAddress.longitude != null &&
    settings.store_latitude != null &&
    settings.store_longitude != null
  ) {
    distanceKm = calculateDistanceInKm(
      settings.store_latitude,
      settings.store_longitude,
      deliveryAddress.latitude,
      deliveryAddress.longitude
    );
  }

  const maxDeliveryDistance = Number(settings.max_delivery_distance) || 0;
  const isOutOfRange =
    maxDeliveryDistance > 0 && distanceKm != null
      ? distanceKm > maxDeliveryDistance
      : false;

  // 5. Delivery Fee Calculation
  const freeDeliveryThreshold = Number(settings.free_delivery_threshold) || 0;
  const deliveryChargeType = settings.delivery_charge_type || "fixed";
  const deliveryChargeValue = Number(settings.delivery_charge_value) || 0;

  let baseDeliveryCharge = deliveryChargeValue;
  if (deliveryChargeType === "per_km" && distanceKm != null && distanceKm > 0) {
    baseDeliveryCharge = Math.max(
      deliveryChargeValue,
      Math.round(distanceKm * deliveryChargeValue * 100) / 100
    );
  }

  const isFreeDelivery =
    freeDeliveryThreshold > 0 && rawSubtotal >= freeDeliveryThreshold && rawSubtotal > 0;

  const deliveryFee = rawSubtotal === 0 ? 0 : (isFreeDelivery ? 0 : baseDeliveryCharge);
  const freeDeliverySavings = isFreeDelivery ? baseDeliveryCharge : 0;
  const freeDeliveryShortfall =
    !isFreeDelivery && freeDeliveryThreshold > 0 && rawSubtotal > 0
      ? Math.max(0, Math.round((freeDeliveryThreshold - rawSubtotal) * 100) / 100)
      : 0;

  // 6. GST / Tax Calculation
  const gstPercent = Number(settings.gst_percent) || 0;
  const taxInclusive = Boolean(settings.tax_inclusive);

  let taxAmount = 0;
  let taxAddedToTotal = 0;

  if (rawSubtotal > 0 && gstPercent > 0) {
    if (taxInclusive) {
      // Tax included in product price
      taxAmount =
        Math.round(
          (discountedSubtotal - discountedSubtotal / (1 + gstPercent / 100)) * 100
        ) / 100;
      taxAddedToTotal = 0;
    } else {
      // Tax added on top
      taxAmount =
        Math.round(((discountedSubtotal * gstPercent) / 100) * 100) / 100;
      taxAddedToTotal = taxAmount;
    }
  }

  // 7. Fees (Packaging, Platform, COD)
  const packagingFee = rawSubtotal > 0 ? Number(settings.packaging_fee) || 0 : 0;
  const platformFee = rawSubtotal > 0 ? Number(settings.platform_fee) || 0 : 0;
  const isCod = true;
  const codFee = rawSubtotal > 0 ? Number(settings.cod_fee) || 0 : 0;

  // 8. Grand Total
  let grandTotal = 0;
  if (rawSubtotal > 0) {
    grandTotal = Math.max(
      0,
      Math.round(
        (discountedSubtotal +
          taxAddedToTotal +
          deliveryFee +
          packagingFee +
          platformFee +
          codFee) *
          100
      ) / 100
    );
  }

  // Timer / validity window
  const now = new Date();
  const validitySeconds = 900; // 15 minutes quote lock
  const expiresAt = new Date(now.getTime() + validitySeconds * 1000);

  return {
    subtotal: rawSubtotal,
    total_items: totalQuantity,
    item_types_count: items.length,

    // Discount
    discount_percent: discountPercent,
    discount,
    discounted_subtotal: discountedSubtotal,

    // Tax
    gst_percent: gstPercent,
    tax_inclusive: taxInclusive,
    tax_amount: taxAmount,
    tax_added_to_total: taxAddedToTotal,
    tax_label: taxInclusive ? "Inclusive of all taxes" : `GST (${gstPercent}%)`,

    // Delivery & Distance
    delivery_charge_type: deliveryChargeType,
    delivery_charge_value: deliveryChargeValue,
    delivery_fee: deliveryFee,
    is_free_delivery: isFreeDelivery,
    free_delivery_threshold: freeDeliveryThreshold,
    free_delivery_savings: freeDeliverySavings,
    free_delivery_shortfall: freeDeliveryShortfall,

    distance_km: distanceKm,
    max_delivery_distance: maxDeliveryDistance,
    is_out_of_range: isOutOfRange,

    // Additional Fees
    packaging_fee: packagingFee,
    platform_fee: platformFee,
    cod_fee: codFee,
    is_cod: isCod,

    // Minimum Order
    minimum_order_amount: minimumOrderAmount,
    is_below_minimum_order: isBelowMinimumOrder,
    minimum_order_shortfall: minimumOrderShortfall,

    // Grand Total
    grand_total: grandTotal,

    // Store Location snapshot
    store_latitude: settings.store_latitude,
    store_longitude: settings.store_longitude,

    // Timer & Metadata
    currency: "INR",
    currency_symbol: "₹",
    calculated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    valid_for_seconds: validitySeconds,
  };
}

module.exports = {
  calculateDistanceInKm,
  calculateCartAndOrderPricing,
};

