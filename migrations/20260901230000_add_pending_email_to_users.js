exports.up = async function (knex) {
  const hasPendingEmail = await knex.schema.hasColumn("users", "pending_email");
  if (!hasPendingEmail) {
    await knex.schema.alterTable("users", (table) => {
      table.string("pending_email").nullable();
      table.string("pending_email_otp").nullable();
      table.timestamp("pending_email_expire_at").nullable();
      table.timestamp("pending_email_sent_at").nullable();
      table.integer("pending_email_resend_count").notNullable().defaultTo(0);
      table.timestamp("pending_email_resend_locked_until").nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasPendingEmail = await knex.schema.hasColumn("users", "pending_email");
  if (hasPendingEmail) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("pending_email");
      table.dropColumn("pending_email_otp");
      table.dropColumn("pending_email_expire_at");
      table.dropColumn("pending_email_sent_at");
      table.dropColumn("pending_email_resend_count");
      table.dropColumn("pending_email_resend_locked_until");
    });
  }
};
