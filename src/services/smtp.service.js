const nodemailer = require("nodemailer");
const dns = require("dns").promises;
const net = require("net");

/**
 * Resolves a hostname to a direct IPv4 IP address.
 * Cloud containers on Render lack outbound IPv6 routing; resolving directly to IPv4
 * prevents Node's net.connect from attempting IPv6 connections (ENETUNREACH).
 */
async function resolveIpv4Host(hostname) {
  if (!hostname || net.isIP(hostname)) {
    return hostname;
  }
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses && addresses.length > 0) {
      return addresses[0];
    }
  } catch (err) {
    console.warn(
      `[SMTP] DNS IPv4 resolution warning for ${hostname}: ${err.message}`
    );
  }
  return hostname;
}

/**
 * Returns SMTP configuration strictly from environment variables.
 * Default: smtp.gmail.com, port 587, secure: false (STARTTLS).
 */
function getActiveSmtpConfig() {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const rawPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const port = isNaN(rawPort) || rawPort <= 0 ? 587 : rawPort;

  const secureRaw = process.env.SMTP_SECURE;
  const secure =
    secureRaw !== undefined
      ? String(secureRaw).toLowerCase() === "true"
      : port === 465;

  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || "").trim();
  const from_email = (
    process.env.SMTP_FROM_EMAIL ||
    process.env.EMAIL_USER ||
    user ||
    "noreply@sfccafe.com"
  ).trim();
  const from_name = (process.env.SMTP_FROM_NAME || "SFC Cafe").trim();

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


async function createTransporter(config = null) {
  const activeConfig = config || getActiveSmtpConfig();

  // Explicitly resolve to IPv4 address to eliminate Render IPv6 ENETUNREACH errors
  const ipv4Address = await resolveIpv4Host(activeConfig.host);

  const transportOptions = {
    host: ipv4Address,
    port: Number(activeConfig.port) || 587,
    secure: Boolean(activeConfig.secure),
    auth: {
      user: activeConfig.user,
      pass: activeConfig.pass,
    },
    tls: {
      servername: activeConfig.host,
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  };

  return nodemailer.createTransport(transportOptions);
}

/**
 * Auto-infer email type based on subject or content if not explicitly provided
 */
function inferEmailType(subject, html, text, explicitType) {
  if (explicitType) return explicitType;
  const combined = `${subject || ""} ${text || ""} ${html || ""}`.toLowerCase();
  if (combined.includes("change") && combined.includes("otp")) return "email_change_otp";
  if (combined.includes("reset") || combined.includes("password")) return "password_reset";
  if (
    combined.includes("otp") ||
    combined.includes("one-time password") ||
    combined.includes("verification code") ||
    combined.includes("verification")
  ) {
    return "otp";
  }
  if (combined.includes("test")) return "test_smtp";
  return "general";
}

/**
 * Send an email using environment-driven SMTP over IPv4 with centralized logging.
 */
async function sendMail({
  to,
  subject,
  text,
  html,
  customConfig = null,
  emailType = null,
  userId = null,
  metadata = null,
}) {
  const config = customConfig || getActiveSmtpConfig();

  if (!config.user || !config.pass) {
    throw new Error(
      "SMTP credentials (SMTP_USER and SMTP_PASS) are not configured in environment variables."
    );
  }

  const transporter = await createTransporter(config);

  const fromAddress = config.from_name
    ? `"${config.from_name}" <${config.from_email || config.user}>`
    : config.from_email || config.user;

  const resolvedHtml =
    html ||
    (text
      ? `<p style="font-family: sans-serif; font-size: 14px; color: #333;">${text.replace(
          /\n/g,
          "<br/>"
        )}</p>`
      : "");

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    text,
    html: resolvedHtml,
  };

  const resolvedEmailType = inferEmailType(
    subject,
    resolvedHtml,
    text,
    emailType
  );

  let sendResult = null;
  let sendError = null;

  try {
    sendResult = await transporter.sendMail(mailOptions);
  } catch (err) {
    sendError = err;
  }

  // Centralized logging: persist exact email content safely
  try {
    const EmailLogModel = require("../models/emailLog.model");
    await EmailLogModel.createEmailLog({
      recipient: to,
      sender: fromAddress,
      subject,
      email_type: resolvedEmailType,
      status: sendError ? "failed" : "sent",
      body_html: resolvedHtml,
      body_text: text || null,
      error_message: sendError ? sendError.message : null,
      message_id: sendResult ? sendResult.messageId : null,
      user_id: userId,
      metadata,
    });
  } catch (logErr) {
    console.warn("[SMTP Logger] Non-blocking log error:", logErr.message);
  }

  if (sendError) {
    throw sendError;
  }

  return sendResult;
}


async function testSmtpConnection({ to, customConfig = null } = {}) {
  const config = customConfig || getActiveSmtpConfig();

  if (!config.user || !config.pass) {
    throw new Error(
      "SMTP username and password are required in environment variables."
    );
  }

  const transporter = await createTransporter(config);
  await transporter.verify();

  if (to) {
    const fromAddress = config.from_name
      ? `"${config.from_name}" <${config.from_email || config.user}>`
      : config.from_email || config.user;

    const { renderEmailTemplate } = require("./emailTemplate.service");
    const rendered = await renderEmailTemplate("smtp-test", {
      smtpHost: config.host,
      smtpPort: config.port,
      encryption: config.secure ? "SSL/TLS" : "STARTTLS (Port 587)",
      sender: `${config.from_name} <${config.from_email || config.user}>`,
      testedAt: new Date().toLocaleString("en-IN"),
    });
    const testSubject = rendered.subject;
    const testText = rendered.text;
    const testHtml = rendered.html;
    const testResult = await transporter.sendMail({
      from: fromAddress,
      to,
      subject: testSubject,
      text: testText,
      html: testHtml,
    });

    try {
      const EmailLogModel = require("../models/emailLog.model");
      await EmailLogModel.createEmailLog({
        recipient: to,
        sender: fromAddress,
        subject: testSubject,
        email_type: "test_smtp",
        status: "sent",
        body_html: testHtml,
        body_text: testText,
        message_id: testResult.messageId,
      });
    } catch (logErr) {
      console.warn("[SMTP Logger] Test email log error:", logErr.message);
    }

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
