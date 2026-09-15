/**
 * Legacy SMTP Service compatibility bridge.
 * Nodemailer and SMTP direct transports have been migrated to the official Resend SDK.
 * All calls are safely forwarded to resend.service.js.
 */
const {
  sendMail,
  getActiveEmailConfig,
  testResendConnection,
  isEmailActive,
} = require("./resend.service");

async function getActiveSmtpConfig() {
  const config = await getActiveEmailConfig();
  return {
    host: "resend.api",
    port: 443,
    secure: true,
    user: config.from_email,
    pass: config.api_key ? "••••••••" : "",
    from_email: config.from_email,
    from_name: config.from_name,
    is_enabled: config.is_enabled,
  };
}

async function createTransporter() {
  console.warn(
    "[Deprecated] createTransporter() called. Nodemailer has been replaced with Resend SDK."
  );
  return {
    sendMail: (options) => sendMail(options),
    verify: async () => true,
  };
}

async function testSmtpConnection(options) {
  return await testResendConnection(options);
}

module.exports = {
  getActiveSmtpConfig,
  createTransporter,
  sendMail,
  testSmtpConnection,
  isEmailActive,
};
