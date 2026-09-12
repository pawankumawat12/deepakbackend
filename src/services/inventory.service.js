const db = require("../../config/db");
const { createNotification } = require("../models/notification.model");

/**
 * Deduct raw ingredient stock based on product recipes when an order is finalized.
 * Strict Idempotency: Checks `ingredient_stock_deducted` flag to prevent duplicate deductions.
 *
 * @param {number|string} orderId
 * @param {import("knex").Knex.Transaction} [externalTrx]
 */
async function deductIngredientStockForOrder(orderId, externalTrx = null) {
  const runWithTrx = async (trx) => {
    // 1. Fetch order and verify eligibility
    const order = await trx("orders").where({ id: orderId }).forUpdate().first();
    if (!order) {
      console.warn(`[InventoryService] Order #${orderId} not found during ingredient deduction.`);
      return;
    }

    if (order.ingredient_stock_deducted) {
      console.info(`[InventoryService] Stock already deducted for Order #${orderId}. Skipping.`);
      return;
    }

    // 2. Fetch order items
    const orderItems = await trx("order_items").where({ order_id: orderId });
    if (!orderItems || orderItems.length === 0) {
      await trx("orders").where({ id: orderId }).update({ ingredient_stock_deducted: true });
      return;
    }

    // 3. For each order item, find recipe ingredients
    const productIds = [...new Set(orderItems.map((item) => item.product_id))];
    const recipes = await trx("product_ingredients as pi")
      .join("ingredients as i", "pi.ingredient_id", "i.id")
      .whereIn("pi.product_id", productIds)
      .where("i.is_active", true)
      .select(
        "pi.product_id",
        "pi.ingredient_id",
        "pi.quantity as recipe_quantity",
        "pi.unit as recipe_unit",
        "i.name as ingredient_name",
        "i.base_unit",
        "i.current_stock",
        "i.min_stock_threshold",
        "i.purchase_price",
        "i.restore_stock_on_cancel",
        "i.low_stock_notified"
      );

    if (recipes.length === 0) {
      // No ingredients mapped to any product in this order
      await trx("orders").where({ id: orderId }).update({ ingredient_stock_deducted: true });
      return;
    }

    // 4. Map and aggregate total consumption per ingredient
    // Map productId -> recipe ingredients array
    const recipeMap = {};
    for (const r of recipes) {
      if (!recipeMap[r.product_id]) recipeMap[r.product_id] = [];
      recipeMap[r.product_id].push(r);
    }

    // Aggregate consumption by ingredient_id
    const consumptionMap = {};
    for (const item of orderItems) {
      const itemRecipes = recipeMap[item.product_id] || [];
      const itemQty = Number(item.quantity) || 1;

      for (const r of itemRecipes) {
        const requiredPerUnit = Number(r.recipe_quantity) || 0;
        const totalNeeded = itemQty * requiredPerUnit;

        if (!consumptionMap[r.ingredient_id]) {
          consumptionMap[r.ingredient_id] = {
            ingredientId: r.ingredient_id,
            name: r.ingredient_name,
            baseUnit: r.base_unit,
            purchasePrice: Number(r.purchase_price) || 0,
            consumedQty: 0,
          };
        }
        consumptionMap[r.ingredient_id].consumedQty += totalNeeded;
      }
    }

    const lowStockAlertsToSend = [];

    // 5. Update stock and write audit logs
    for (const ingIdStr of Object.keys(consumptionMap)) {
      const ingUsage = consumptionMap[ingIdStr];
      const ingId = ingUsage.ingredientId;
      const consumedQty = Number(ingUsage.consumedQty.toFixed(4));

      if (consumedQty <= 0) continue;

      // Lock row
      const currentIng = await trx("ingredients").where({ id: ingId }).forUpdate().first();
      if (!currentIng) continue;

      const currentStock = Number(currentIng.current_stock);
      const newStock = Math.max(0, Number((currentStock - consumedQty).toFixed(4)));
      const minThreshold = Number(currentIng.min_stock_threshold);
      let lowStockNotified = Boolean(currentIng.low_stock_notified);

      // Check low-stock hysteresis
      const isNowLowStock = newStock <= minThreshold;
      if (isNowLowStock && !lowStockNotified) {
        lowStockNotified = true;
        lowStockAlertsToSend.push({
          ingredientId: ingId,
          name: currentIng.name,
          currentStock: newStock,
          threshold: minThreshold,
          baseUnit: currentIng.base_unit,
        });
      }

      // Update ingredient current_stock
      await trx("ingredients")
        .where({ id: ingId })
        .update({
          current_stock: newStock,
          low_stock_notified: lowStockNotified,
          updated_at: trx.fn.now(),
        });

      // Insert stock log
      await trx("ingredient_stock_logs").insert({
        ingredient_id: ingId,
        order_id: orderId,
        change_type: "ORDER_CONSUMED",
        quantity_changed: -consumedQty,
        stock_after: newStock,
        cost_per_unit: Number(currentIng.purchase_price) || 0,
        reason: `Consumed in Order #${orderId}`,
        created_by: null,
      });
    }

    // 6. Mark order as ingredient_stock_deducted
    await trx("orders").where({ id: orderId }).update({
      ingredient_stock_deducted: true,
      updated_at: trx.fn.now(),
    });

    // 7. Send notifications outside of db locks (or in background)
    for (const alert of lowStockAlertsToSend) {
      try {
        await createNotification({
          role: "admin",
          type: "low_stock",
          title: `Low Stock Alert: ${alert.name}`,
          message: `Stock for ${alert.name} has fallen to ${alert.currentStock} ${alert.baseUnit} (Low-stock threshold: ${alert.threshold} ${alert.baseUnit}).`,
          orderId: null,
          dataJson: {
            ingredientId: alert.ingredientId,
            currentStock: alert.currentStock,
            threshold: alert.threshold,
            baseUnit: alert.baseUnit,
          },
        });
      } catch (notifErr) {
        console.error(`[InventoryService] Failed to send low-stock alert for ${alert.name}:`, notifErr);
      }
    }
  };

  if (externalTrx) {
    return runWithTrx(externalTrx);
  }
  return db.transaction(runWithTrx);
}

/**
 * Conditionally restore ingredient stock when an order is cancelled/refunded.
 * Respects `restore_stock_on_cancel` per ingredient:
 *   - true: increments current_stock and logs 'ORDER_CANCELLED_RESTORE'.
 *   - false: does NOT increment current_stock, logs 'ORDER_CANCELLED_SKIPPED' with explanation.
 * Strict Idempotency: Prevents duplicate restoration via `ingredient_stock_restored`.
 *
 * @param {number|string} orderId
 * @param {import("knex").Knex.Transaction} [externalTrx]
 * @param {string} [reason]
 */
async function restoreIngredientStockForOrder(orderId, externalTrx = null, reason = "Order cancelled") {
  const runWithTrx = async (trx) => {
    // 1. Fetch order with row lock
    const order = await trx("orders").where({ id: orderId }).forUpdate().first();
    if (!order) {
      console.warn(`[InventoryService] Order #${orderId} not found during restoration.`);
      return;
    }

    // Guard: Only restore if stock was deducted AND has not already been restored
    if (!order.ingredient_stock_deducted) {
      console.info(`[InventoryService] Order #${orderId} had no ingredient stock deducted. Skipping restore.`);
      return;
    }

    if (order.ingredient_stock_restored) {
      console.info(`[InventoryService] Order #${orderId} ingredient stock already restored. Skipping duplicate.`);
      return;
    }

    // 2. Fetch original consumption logs for this order
    const consumedLogs = await trx("ingredient_stock_logs as l")
      .join("ingredients as i", "l.ingredient_id", "i.id")
      .where("l.order_id", orderId)
      .where("l.change_type", "ORDER_CONSUMED")
      .select(
        "l.ingredient_id",
        "l.quantity_changed",
        "i.name as ingredient_name",
        "i.base_unit",
        "i.purchase_price",
        "i.restore_stock_on_cancel"
      );

    if (!consumedLogs || consumedLogs.length === 0) {
      await trx("orders").where({ id: orderId }).update({ ingredient_stock_restored: true });
      return;
    }

    // 3. For each consumed ingredient, inspect restore_stock_on_cancel
    for (const log of consumedLogs) {
      const ingId = log.ingredient_id;
      const consumedQty = Math.abs(Number(log.quantity_changed));
      const shouldRestore = Boolean(log.restore_stock_on_cancel);

      const currentIng = await trx("ingredients").where({ id: ingId }).forUpdate().first();
      if (!currentIng) continue;

      const currentStock = Number(currentIng.current_stock);
      const minThreshold = Number(currentIng.min_stock_threshold);
      let lowStockNotified = Boolean(currentIng.low_stock_notified);

      if (shouldRestore) {
        const newStock = Number((currentStock + consumedQty).toFixed(4));

        // Hysteresis re-arming: if stock rises above threshold, re-arm notification
        if (newStock > minThreshold && lowStockNotified) {
          lowStockNotified = false;
        }

        await trx("ingredients")
          .where({ id: ingId })
          .update({
            current_stock: newStock,
            low_stock_notified: lowStockNotified,
            updated_at: trx.fn.now(),
          });

        await trx("ingredient_stock_logs").insert({
          ingredient_id: ingId,
          order_id: orderId,
          change_type: "ORDER_CANCELLED_RESTORE",
          quantity_changed: consumedQty,
          stock_after: newStock,
          cost_per_unit: Number(currentIng.purchase_price) || 0,
          reason: `Restored from Order #${orderId} (${reason})`,
          created_by: null,
        });
      } else {
        // NON-RESTORABLE (e.g. cooked patty, cooking oil, mixed sauce)
        await trx("ingredient_stock_logs").insert({
          ingredient_id: ingId,
          order_id: orderId,
          change_type: "ORDER_CANCELLED_SKIPPED",
          quantity_changed: 0,
          stock_after: currentStock,
          cost_per_unit: Number(currentIng.purchase_price) || 0,
          reason: `Order #${orderId} cancelled: ${log.ingredient_name} is non-restorable upon cancellation (consumed during prep)`,
          created_by: null,
        });
      }
    }

    // 4. Mark order as ingredient_stock_restored
    await trx("orders").where({ id: orderId }).update({
      ingredient_stock_restored: true,
      updated_at: trx.fn.now(),
    });
  };

  if (externalTrx) {
    return runWithTrx(externalTrx);
  }
  return db.transaction(runWithTrx);
}

module.exports = {
  deductIngredientStockForOrder,
  restoreIngredientStockForOrder,
};

