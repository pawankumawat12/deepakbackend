exports.up = function(knex) {
  return knex.schema.alterTable('orders', table => {
    table.jsonb('delivery_address_json');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('orders', table => {
    table.dropColumn('delivery_address_json');
  });
};
