/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable("users", (table) => {
      table.string("otp").nullable();
      table.timestamp("expire_at").nullable();
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function (knex) {
    return knex.schema.alterTable("users", (table) => {
      table.string("otp").nullable();
      table.dropColumn("expire_at");
    });
  };