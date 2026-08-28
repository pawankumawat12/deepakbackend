exports.up = async function (knex) {
  // Fix existing messages where sender_name is not 'SFC Cafe' or 'SFC Admin' to be sender_role = 'customer'
  await knex("order_messages")
    .whereNotIn("sender_name", ["SFC Cafe", "SFC Admin", "Admin"])
    .update({
      sender_role: "customer",
    });

  // Fix messages where sender_name is 'SFC Cafe' or 'SFC Admin' to be sender_role = 'admin'
  await knex("order_messages")
    .whereIn("sender_name", ["SFC Cafe", "SFC Admin", "Admin"])
    .update({
      sender_role: "admin",
    });
};

exports.down = async function (knex) {
  // No-op rollback
};

