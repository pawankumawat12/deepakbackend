exports.up = async function (knex) {
  const tableExists = await knex.schema.hasTable("pending_registrations");
  if (!tableExists) return;

  // Preserve unverified registrations before removing the legacy staging table.
  // If an email or phone already exists in users, the users record remains the
  // authoritative one because those values are unique there.
  await knex.raw(`
    INSERT INTO users (
      name, email, phone, password, role, is_email_verified, otp, expire_at,
      otp_sent_at, otp_resend_count, otp_resend_locked_until, created_at, updated_at
    )
    SELECT
      name, email, phone, password, 'user', false, otp, expire_at,
      otp_sent_at, otp_resend_count, otp_resend_locked_until, created_at, updated_at
    FROM pending_registrations
    ON CONFLICT DO NOTHING
  `);

  await knex.schema.dropTable("pending_registrations");
};

exports.down = function (knex) {
  return knex.schema.createTable("pending_registrations", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("email").notNullable().unique();
    table.string("phone").unique();
    table.string("password").notNullable();
    table.string("otp").nullable();
    table.timestamp("expire_at").nullable();
    table.timestamp("otp_sent_at").nullable();
    table.integer("otp_resend_count").notNullable().defaultTo(0);
    table.timestamp("otp_resend_locked_until").nullable();
    table.timestamps(true, true);
  });
};
