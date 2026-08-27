const db = require("./config/db");
const { createProduct, findProductById, deleteProduct } = require("./src/models/product.model");
const { validateProductCreate } = require("./src/modules/product/product.validation");
const { upsertCartItem, getCartItems, clearCart } = require("./src/models/cart.model");
const { createOrderWithTransaction, findOrdersByUser, updateItemProductionStatus } = require("./src/models/order.model");

async function runE2ETest() {
  console.log("=== STARTING PRODUCT AVAILABILITY & ORDER FULFILLMENT TESTS ===");

  // 0. Ensure test user & category exist
  let testUser = await db("users").where({ email: "fulfillment_test@sfc.com" }).first();
  if (!testUser) {
    const [u] = await db("users").insert({
      name: "Fulfillment Test User",
      email: "fulfillment_test@sfc.com",
      password: "hashedpassword123",
      role: "user",
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning("*");
    testUser = u;
  }

  let testCategory = await db("categories").first();
  if (!testCategory) {
    const [cat] = await db("categories").insert({
      name: "Test Fast Food",
      description: "Fast Food Category",
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning("*");
    testCategory = cat;
  }

  // 1. Validation tests
  console.log("\n1. Testing Validation:");
  // A. In Stock missing stock -> should fail
  const inStockFail = validateProductCreate({
    name: "In Stock Test Dish",
    price: 150,
    images: ["/uploads/dish1.jpg"],
    categoryId: testCategory.id,
    availabilityType: "IN_STOCK",
    stock: "",
  });
  console.log("IN_STOCK missing stock valid?", inStockFail.valid, inStockFail.errors);
  if (inStockFail.valid) throw new Error("IN_STOCK should require stock quantity");

  // B. Made to order without stock -> should succeed
  const mtoPass = validateProductCreate({
    name: "Special Tandoori Pizza (MTO)",
    price: 320,
    images: ["/uploads/pizza.jpg"],
    categoryId: testCategory.id,
    availabilityType: "MADE_TO_ORDER",
  });
  console.log("MADE_TO_ORDER without stock valid?", mtoPass.valid);
  if (!mtoPass.valid) throw new Error("MADE_TO_ORDER should not require stock");

  // 2. Create products in database
  console.log("\n2. Creating test products in PostgreSQL:");
  const inStockProduct = await createProduct({
    name: "Crispy Fries (In Stock)",
    description: "Ready in warming rack",
    price: 80,
    stock: 10,
    availability_type: "IN_STOCK",
    images: ["/uploads/fries.jpg"],
    category_id: testCategory.id,
    is_active: true,
  });

  const mtoProduct = await createProduct({
    name: "Handmade Gourmet Burger (MTO)",
    description: "Cooked fresh on order",
    price: 220,
    stock: 0,
    availability_type: "MADE_TO_ORDER",
    images: ["/uploads/burger.jpg"],
    category_id: testCategory.id,
    is_active: true,
  });

  console.log("Created In-Stock product:", {
    id: inStockProduct.id,
    name: inStockProduct.name,
    stock: inStockProduct.stock,
    type: inStockProduct.availability_type,
  });

  console.log("Created MTO product:", {
    id: mtoProduct.id,
    name: mtoProduct.name,
    stock: mtoProduct.stock,
    type: mtoProduct.availability_type,
  });

  // 3. Add to Cart
  console.log("\n3. Testing Cart Persistence:");
  await clearCart(testUser.id);
  await upsertCartItem(testUser.id, inStockProduct.id, 3);
  await upsertCartItem(testUser.id, mtoProduct.id, 5);

  const cart = await getCartItems(testUser.id);
  console.log("Cart items in database:", cart.map(c => ({
    productId: c.product_id,
    name: c.name,
    qty: c.quantity,
    stock: c.stock,
    type: c.availability_type,
  })));

  // 4. Place Order with Transaction & Stock Reduction
  console.log("\n4. Testing Atomic Order Placement & Stock Decrement:");
  const initialInStock = Number(inStockProduct.stock);
  const order = await createOrderWithTransaction({
    userId: testUser.id,
    customerName: testUser.name,
    customerEmail: testUser.email,
    shippingAddress: "123 Cafe Street, Jaipur",
    paymentMethod: "Cash on Delivery",
  });

  console.log("Order created successfully:", {
    orderNumber: order.order_number,
    total: order.total_amount,
    itemsCount: order.items.length,
  });

  // 5. Verify database stock & production statuses
  console.log("\n5. Verifying DB Product Stock & Order Item Statuses:");
  const updatedInStockProduct = await findProductById(inStockProduct.id);
  const updatedMtoProduct = await findProductById(mtoProduct.id);

  console.log(`In-Stock product stock before: ${initialInStock}, after order (3 ordered): ${updatedInStockProduct.stock}`);
  if (Number(updatedInStockProduct.stock) !== initialInStock - 3) {
    throw new Error(`Expected In-Stock stock to be ${initialInStock - 3}, got ${updatedInStockProduct.stock}`);
  }

  console.log(`MTO product stock before: 0, after order (5 ordered): ${updatedMtoProduct.stock}`);
  if (Number(updatedMtoProduct.stock) !== 0) {
    throw new Error(`Expected MTO stock to stay 0, got ${updatedMtoProduct.stock}`);
  }

  const inStockOrderItem = order.items.find(i => i.product_id === inStockProduct.id);
  const mtoOrderItem = order.items.find(i => i.product_id === mtoProduct.id);

  console.log("In-Stock Order Item Status:", inStockOrderItem.production_status);
  console.log("MTO Order Item Status:", mtoOrderItem.production_status);

  if (inStockOrderItem.production_status !== "COMPLETED") {
    throw new Error(`Expected IN_STOCK production_status to be COMPLETED, got ${inStockOrderItem.production_status}`);
  }
  if (mtoOrderItem.production_status !== "PENDING_PRODUCTION") {
    throw new Error(`Expected MTO production_status to be PENDING_PRODUCTION, got ${mtoOrderItem.production_status}`);
  }

  // 6. Test Admin marking Made-to-Order item as produced
  console.log("\n6. Testing Admin Production Status Update:");
  const updatedMtoItem = await updateItemProductionStatus(mtoOrderItem.id, "PRODUCED");
  console.log("Updated MTO item production_status:", updatedMtoItem.production_status);
  if (updatedMtoItem.production_status !== "PRODUCED") {
    throw new Error("Failed to mark item as PRODUCED");
  }

  // 7. Verify Cart is cleared
  const remainingCart = await getCartItems(testUser.id);
  console.log("Cart items remaining after order:", remainingCart.length);
  if (remainingCart.length !== 0) {
    throw new Error("Cart was not cleared after order placement");
  }

  // Clean up test products
  await deleteProduct(inStockProduct.id);
  await deleteProduct(mtoProduct.id);

  console.log("\n>>> ALL TESTS PASSED WITH 100% SUCCESS! <<<");
  await db.destroy();
}

runE2ETest().catch(async (err) => {
  console.error("TEST FAILED:", err);
  await db.destroy();
  process.exit(1);
});

