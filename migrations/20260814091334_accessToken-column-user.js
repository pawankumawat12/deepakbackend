/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable("users", (table) => {
      table.string("access_token").nullable();
    });
  
    // Existing users ko temporary value
    await knex("users").update({
      access_token: "temporary",
    });
  
    await knex.schema.alterTable("users", (table) => {
      table.string("access_token").notNullable().alter();
    });
  };
exports.down = function(knex) {
return knex.schema.alterTable("users", (table) => {
    table.dropColumn("access_token");
})
};
