exports.up = function(knex) {
  return knex.schema.alterTable('orders', table => {
    table.string('cancel_reason');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('orders', table => {
    table.dropColumn('cancel_reason');
  });
};
