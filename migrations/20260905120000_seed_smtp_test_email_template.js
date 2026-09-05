exports.up = async function (knex) {
  if (!(await knex.schema.hasTable("email_templates"))) return;

  await knex("email_templates")
    .insert({
      name: "SMTP Test",
      slug: "smtp-test",
      subject: "SFC Cafe - SMTP Test Email Successful!",
      description: "Diagnostic email sent from the admin SMTP settings test.",
      body: `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background: #ffffff;"><h2 style="color: #111827;">SMTP Connection Verified!</h2><p>This email confirms that the outgoing mail server is configured and working.</p><p><strong>SMTP Host:</strong> {{smtpHost}}</p><p><strong>SMTP Port:</strong> {{smtpPort}}</p><p><strong>Encryption:</strong> {{encryption}}</p><p><strong>Sender:</strong> {{sender}}</p><p style="font-size: 12px; color: #9ca3af;">Sent automatically via SFC Cafe at {{testedAt}}</p></div>`,
      is_active: true,
    })
    .onConflict("slug")
    .ignore();
};

exports.down = async function (knex) {
  await knex("email_templates").where({ slug: "smtp-test" }).del();
};
