exports.up = async function (knex) {
  for (const tableName of ["users", "pending_registrations"]) {
    await knex.schema.alterTable(tableName, (table) => {
      table.timestamp("otp_sent_at").nullable();
      table.integer("otp_resend_count").notNullable().defaultTo(0);
      table.timestamp("otp_resend_locked_until").nullable();
    });
  }
};

exports.down = async function (knex) {
  for (const tableName of ["pending_registrations", "users"]) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn("otp_sent_at");
      table.dropColumn("otp_resend_count");
      table.dropColumn("otp_resend_locked_until");
    });
  }
};
