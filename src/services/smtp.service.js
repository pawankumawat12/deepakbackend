const nodemailer = require("nodemailer");

/**
 * Returns SMTP configuration strictly from environment variables.
 */
function getActiveSmtpConfig() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure =
    String(process.env.SMTP_SECURE).toLowerCase() === "true" || port === 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || "";
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || "";
  const from_email =
    process.env.SMTP_FROM_EMAIL || process.env.EMAIL_USER || user || "noreply@sfccafe.com";
  const from_name = process.env.SMTP_FROM_NAME || "SFC Cafe";

  return {
    host,
    port,
    secure,
    user,
    pass,
    from_email,
    from_name,
    is_enabled: true,
  };
}

/**
 * Creates a Nodemailer transport directly using SMTP host and credentials.
 * Note: Never uses `service: "gmail"`; connects directly to the specified host.
 */
function createTransporter(config = null) {
  const activeConfig = config || getActiveSmtpConfig();

  const transportOptions = {
    host: activeConfig.host,
    port: Number(activeConfig.port),
    secure: Boolean(activeConfig.secure),
    auth: {
      user: activeConfig.user,
      pass: activeConfig.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  };

  return nodemailer.createTransport(transportOptions);
}

/**
 * Send an email using .env SMTP configuration.
 */
async function sendMail({ to, subject, text, html, customConfig = null }) {
  const config = customConfig || getActiveSmtpConfig();

  if (!config.user || !config.pass) {
    throw new Error(
      "SMTP credentials (SMTP_USER and SMTP_PASS) are not configured in .env."
    );
  }

  const transporter = createTransporter(config);

  const fromAddress = config.from_name
    ? `"${config.from_name}" <${config.from_email || config.user}>`
    : config.from_email || config.user;

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    text,
    html:
      html ||
      (text
        ? `<p style="font-family: sans-serif; font-size: 14px; color: #333;">${text.replace(
            /\n/g,
            "<br/>"
          )}</p>`
        : ""),
  };

  return await transporter.sendMail(mailOptions);
}

/**
 * Verify SMTP connection using .env configuration or custom config.
 */
async function testSmtpConnection({ to, customConfig = null } = {}) {
  const config = customConfig || getActiveSmtpConfig();

  if (!config.user || !config.pass) {
    throw new Error("SMTP username and password are required in .env.");
  }

  const transporter = createTransporter(config);

  await transporter.verify();

  if (to) {
    const fromAddress = config.from_name
      ? `"${config.from_name}" <${config.from_email || config.user}>`
      : config.from_email || config.user;

    const testResult = await transporter.sendMail({
      from: fromAddress,
      to,
      subject: "SFC Cafe - SMTP Test Email Successful!",
      text: `Hello,\n\nThis is a test email sent from SFC Cafe using environment SMTP settings.\n\nSMTP Host: ${config.host}\nSMTP Port: ${config.port}\nEncryption: ${config.secure ? "SSL/TLS (Port 465)" : "STARTTLS (Port 587)"}\nSender: ${config.from_name} <${config.from_email || config.user}>\n\nYour SMTP server is configured and working perfectly!\n\nBest regards,\nSFC Cafe Team`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; padding: 10px 16px; background-color: #dcfce7; color: #166534; font-weight: 800; border-radius: 12px; font-size: 16px;">
              SMTP Configuration Active (.env)
            </div>
          </div>
          <h2 style="color: #111827; margin: 0 0 10px 0; text-align: center; font-size: 20px;">SMTP Connection Verified!</h2>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
            This email confirms that your outgoing mail server settings in <strong>.env</strong> are properly configured and operational.
          </p>
          <div style="background-color: #f9fafb; border-radius: 12px; padding: 16px; font-size: 13px; color: #374151; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280;">SMTP Host:</span>
              <strong style="font-family: monospace;">${config.host}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280;">SMTP Port:</span>
              <strong>${config.port} (${config.secure ? "SSL/TLS" : "STARTTLS"})</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280;">Username / Account:</span>
              <strong>${config.user}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #6b7280;">From Sender:</span>
              <strong>${config.from_name} &lt;${config.from_email || config.user}&gt;</strong>
            </div>
          </div>
          <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
            Sent automatically via SFC Cafe · ${new Date().toLocaleString("en-IN")}
          </p>
        </div>
      `,
    });

    return {
      success: true,
      message: `Test email successfully sent to ${to}!`,
      messageId: testResult.messageId,
    };
  }

  return {
    success: true,
    message: "SMTP connection verified successfully!",
  };
}

module.exports = {
  getActiveSmtpConfig,
  createTransporter,
  sendMail,
  testSmtpConnection,
};
