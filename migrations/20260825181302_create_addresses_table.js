exports.up = function(knex) {
  return knex.schema.createTable('addresses', table => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('receiver_name').notNullable();
    table.string('phone_number').notNullable();
    table.string('house_number').notNullable(); 
    table.string('building_name');
    table.string('floor');
    table.string('landmark');
    table.string('formatted_address').notNullable();
    table.string('city').notNullable();
    table.string('state').notNullable();
    table.string('pincode').notNullable();
    table.decimal('latitude', 10, 7).notNullable();
    table.decimal('longitude', 10, 7).notNullable();
    table.string('label').defaultTo('Home');
    table.boolean('is_default').defaultTo(false);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('addresses');
};
