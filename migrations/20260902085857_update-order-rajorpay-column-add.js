/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.string("razorpay_order_id").nullable();
    table.string("razorpay_payment_id").nullable();
    table.string("razorpay_signature").nullable();
  })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("razorpay_order_id");
    table.dropColumn("razorpay_payment_id");
    table.dropColumn("razorpay_signature");
  })
};
