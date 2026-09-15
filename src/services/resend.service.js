const { Resend } = require("resend");

/**
 * Infer email type based on subject or content if not explicitly provided
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
  if (combined.includes("test")) return "test_resend";
  return "general";
}

/**
 * Returns Resend configuration by inspecting database settings with fallback to environment variables.
 */
async function getActiveEmailConfig() {
  let dbConfig = null;
  try {
    const { getSetting } = require("../models/settings.model");
    dbConfig = await getSetting("resend_settings");
  } catch (err) {
    // Database may be initializing or model not yet available
  }

  const envApiKey = (process.env.RESEND_API_KEY || "").trim();
  const envFromEmail = (process.env.RESEND_FROM_EMAIL || "noreply@sfcbakers.com").trim();
  const envFromName = (process.env.RESEND_FROM_NAME || "SFC Bakers").trim();
  const envEmailActive = (process.env.EMAIL_ACTIVE || "true").trim().toLowerCase() !== "false";

  const apiKey = (dbConfig?.api_key || envApiKey || "").trim();
  const fromEmail = (dbConfig?.from_email || envFromEmail || "noreply@sfcbakers.com").trim();
  const fromName = (dbConfig?.from_name || envFromName || "SFC Bakers").trim();
  const isEnabled = envEmailActive && (dbConfig?.is_enabled !== undefined ? Boolean(dbConfig.is_enabled) : true);

  return {
    api_key: apiKey,
    from_email: fromEmail,
    from_name: fromName,
    is_enabled: isEnabled,
  };
}

/**
 * Synchronous quick check for environment bypass flag
 */
function isEnvEmailActive() {
  return (process.env.EMAIL_ACTIVE || "true").trim().toLowerCase() !== "false";
}

/**
 * Check whether email sending is enabled (combines env flag and database toggle)
 */
async function isEmailActive() {
  if (!isEnvEmailActive()) return false;
  try {
    const config = await getActiveEmailConfig();
    return Boolean(config.is_enabled);
  } catch (err) {
    return isEnvEmailActive();
  }
}

/**
 * Create a Resend client instance with given or active API key
 */
function createResendClient(apiKey) {
  if (!apiKey) {
    throw new Error("Resend API key is required to create Resend client.");
  }
  return new Resend(apiKey);
}

/**
 * Send an email using Resend SDK with centralized logging and bypass support.
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
  const config = customConfig || (await getActiveEmailConfig());
  const fromAddress = config.from_name
    ? `${config.from_name} <${config.from_email}>`
    : config.from_email;

  const resolvedHtml =
    html ||
    (text
      ? `<p style="font-family: sans-serif; font-size: 14px; color: #333;">${text.replace(
          /\n/g,
          "<br/>"
        )}</p>`
      : "");

  const resolvedEmailType = inferEmailType(
    subject,
    resolvedHtml,
    text,
    emailType
  );

  // Centralized Bypass check: If EMAIL_ACTIVE=false or email disabled, do not send network request
  if (!config.is_enabled || !isEnvEmailActive()) {
    console.log(
      `[EMAIL_ACTIVE=false] Resend email to ${to} skipped (email disabled). Subject: "${subject}"`
    );

    try {
      const EmailLogModel = require("../models/emailLog.model");
      await EmailLogModel.createEmailLog({
        recipient: Array.isArray(to) ? to.join(", ") : to,
        sender: fromAddress,
        subject,
        email_type: resolvedEmailType,
        status: "disabled",
        body_html: resolvedHtml,
        body_text: text || null,
        error_message: "Email sending skipped: EMAIL_ACTIVE is set to false or email service is disabled.",
        message_id: "email-disabled",
        user_id: userId,
        metadata,
      });
    } catch (logErr) {
      console.warn("[Resend Logger] Non-blocking bypass log error:", logErr.message);
    }

    return {
      id: "email-disabled",
      messageId: "email-disabled",
      skipped: true,
      success: true,
    };
  }

  if (!config.api_key) {
    const errorMsg =
      "Resend API key is not configured. Please set RESEND_API_KEY in environment or Admin Settings.";
    console.error(`[Resend Error] ${errorMsg}`);

    try {
      const EmailLogModel = require("../models/emailLog.model");
      await EmailLogModel.createEmailLog({
        recipient: Array.isArray(to) ? to.join(", ") : to,
        sender: fromAddress,
        subject,
        email_type: resolvedEmailType,
        status: "failed",
        body_html: resolvedHtml,
        body_text: text || null,
        error_message: errorMsg,
        message_id: null,
        user_id: userId,
        metadata,
      });
    } catch (logErr) {
      console.warn("[Resend Logger] Non-blocking failure log error:", logErr.message);
    }

    throw new Error(errorMsg);
  }

  const resend = createResendClient(config.api_key);
  const recipientList = Array.isArray(to) ? to : [to];

  let sendResult = null;
  let sendError = null;

  try {
    const payload = {
      from: fromAddress,
      to: recipientList,
      subject,
      html: resolvedHtml,
    };
    if (text) {
      payload.text = text;
    }

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      sendError = new Error(error.message || "Unknown error from Resend API");
    } else {
      sendResult = data;
    }
  } catch (err) {
    sendError = err;
  }

  // Centralized logging: persist exact email content and message ID safely
  try {
    const EmailLogModel = require("../models/emailLog.model");
    await EmailLogModel.createEmailLog({
      recipient: recipientList.join(", "),
      sender: fromAddress,
      subject,
      email_type: resolvedEmailType,
      status: sendError ? "failed" : "sent",
      body_html: resolvedHtml,
      body_text: text || null,
      error_message: sendError ? sendError.message : null,
      message_id: sendResult ? sendResult.id : null,
      user_id: userId,
      metadata,
    });
  } catch (logErr) {
    console.warn("[Resend Logger] Non-blocking audit log error:", logErr.message);
  }

  if (sendError) {
    throw sendError;
  }

  return {
    id: sendResult?.id,
    messageId: sendResult?.id,
    success: true,
  };
}

/**
 * Diagnostic test method to verify Resend credentials and send a test email.
 */
async function testResendConnection({ to, customConfig = null } = {}) {
  const config = customConfig || (await getActiveEmailConfig());

  if (!config.api_key) {
    throw new Error(
      "Resend API key is required. Please provide an API key in environment variables or Settings."
    );
  }

  const recipient = to || "pawan@yopmail.com";
  const fromAddress = config.from_name
    ? `${config.from_name} <${config.from_email}>`
    : config.from_email;

  let testSubject = "Resend Email Service Test - SFC Bakers";
  let testHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; borderRadius: 8px;">
      <h2 style="color: #7c3aed; margin-bottom: 8px;">Resend Configuration Verified!</h2>
      <p style="color: #4b5563; font-size: 14px;">Your Resend email delivery configuration is working correctly.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Sender:</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: 600;">${fromAddress}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Recipient:</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: 600;">${recipient}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Timestamp:</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: 600;">${new Date().toLocaleString("en-IN")}</td></tr>
      </table>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Sent via Resend Official Node.js SDK.</p>
    </div>
  `;
  let testText = `Resend Configuration Verified!\nSender: ${fromAddress}\nRecipient: ${recipient}\nTimestamp: ${new Date().toLocaleString("en-IN")}`;

  try {
    const { renderEmailTemplate } = require("./emailTemplate.service");
    const rendered = await renderEmailTemplate("resend-test", {
      fromEmail: config.from_email,
      fromName: config.from_name,
      testedAt: new Date().toLocaleString("en-IN"),
    });
    if (rendered) {
      testSubject = rendered.subject;
      testHtml = rendered.html;
      testText = rendered.text;
    }
  } catch (templateErr) {
    // If template is not found, fallback content defined above will be used
  }

  const result = await sendMail({
    to: recipient,
    subject: testSubject,
    html: testHtml,
    text: testText,
    customConfig: config,
    emailType: "test_resend",
  });

  return {
    success: true,
    message: result.skipped
      ? `Email delivery is currently bypassed (EMAIL_ACTIVE=false). Test logged.`
      : `Test email successfully dispatched via Resend to ${recipient}!`,
    messageId: result.id,
    skipped: Boolean(result.skipped),
  };
}

module.exports = {
  getActiveEmailConfig,
  isEmailActive,
  isEnvEmailActive,
  createResendClient,
  sendMail,
  testResendConnection,
};

