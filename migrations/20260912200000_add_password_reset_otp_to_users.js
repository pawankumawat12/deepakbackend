exports.up = async function (knex) {
  // 1. Add OTP tracking columns to users table
  const hasTable = await knex.schema.hasTable("users");
  if (hasTable) {
    const hasOtp = await knex.schema.hasColumn("users", "password_reset_otp");
    if (!hasOtp) {
      await knex.schema.alterTable("users", (table) => {
        table.string("password_reset_otp", 255).nullable();
        table.timestamp("password_reset_sent_at").nullable();
        table.integer("password_reset_attempts").defaultTo(0);
        table.integer("password_reset_resend_count").defaultTo(0);
        table.timestamp("password_reset_locked_until").nullable();
        table.string("password_reset_verified_token", 255).nullable();
      });
    }
  }

  // 2. Update password-reset template to OTP-based format
  const hasTemplates = await knex.schema.hasTable("email_templates");
  if (hasTemplates) {
    const existingTemplate = await knex("email_templates")
      .where({ slug: "password-reset" })
      .first();

    const newBody = `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 16px; background: #ffffff;">
  <h2 style="color: #4f7d16; margin: 0 0 8px;">Password Reset Code</h2>
  <p style="font-size: 14px; color: #333;">Hello {{userName}},</p>
  <p style="font-size: 14px; color: #555;">We received a request to reset your SFC Bakers password. Use this 6-digit verification code to proceed:</p>
  <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3a1e; background: #f4f8ec; border: 1px dashed #4f7d16; padding: 16px 20px; border-radius: 12px; text-align: center; margin: 24px 0;">{{otp}}</div>
  <p style="font-size: 12px; color: #777;">This code is valid for 15 minutes. For security, never share this code with anyone. If you did not request a password reset, you can safely ignore this email.</p>
</div>`;

    if (existingTemplate) {
      await knex("email_templates")
        .where({ slug: "password-reset" })
        .update({
          subject: "Your SFC Bakers password reset code",
          description: "One-time password (OTP) sent to verify a password reset request.",
          body: newBody,
          updated_at: knex.fn.now(),
        });
    } else {
      await knex("email_templates").insert({
        name: "Password Reset",
        slug: "password-reset",
        subject: "Your SFC Bakers password reset code",
        description: "One-time password (OTP) sent to verify a password reset request.",
        body: newBody,
        is_active: true,
      });
    }

    // 3. Seed or update resend-test template
    const testTemplate = await knex("email_templates")
      .where({ slug: "resend-test" })
      .first();

    const testBody = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background: #ffffff;">
  <h2 style="color: #111827; margin-top: 0;">Resend Email Service Verified!</h2>
  <p style="font-size: 14px; color: #374151;">This email confirms that your Resend API integration is properly configured and delivering emails successfully.</p>
  <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px 16px; margin: 18px 0; border-radius: 6px;">
    <p style="margin: 0 0 6px; font-size: 13px; color: #4b5563;"><strong>Sender:</strong> {{sender}}</p>
    <p style="margin: 0 0 6px; font-size: 13px; color: #4b5563;"><strong>Delivery Service:</strong> Resend API</p>
    <p style="margin: 0; font-size: 13px; color: #4b5563;"><strong>Tested At:</strong> {{testedAt}}</p>
  </div>
  <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">Sent automatically via SFC Bakers Admin Panel.</p>
</div>`;

    if (!testTemplate) {
      await knex("email_templates").insert({
        name: "Resend Diagnostic Test",
        slug: "resend-test",
        subject: "SFC Bakers - Resend Email Delivery Test Successful!",
        description: "Diagnostic test email sent from admin email settings.",
        body: testBody,
        is_active: true,
      });
    }
  }
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("users");
  if (hasTable) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("password_reset_otp");
      table.dropColumn("password_reset_sent_at");
      table.dropColumn("password_reset_attempts");
      table.dropColumn("password_reset_resend_count");
      table.dropColumn("password_reset_locked_until");
      table.dropColumn("password_reset_verified_token");
    });
  }
};

