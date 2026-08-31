const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../../config/db");

const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(process.env.JWT_SECRET || "sfc_cafe_default_secret_key_32_bytes")
  .digest(); // 32 bytes
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

function decrypt(text) {
  if (!text) return "";
  try {
    const parts = text.split(":");
    if (parts.length !== 2) return text;
    const iv = Buffer.from(parts[0], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(parts[1], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return text;
  }
}

const DEFAULT_SMTP = {
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  user: process.env.EMAIL_USER || "",
  pass: process.env.EMAIL_PASS ? encrypt(process.env.EMAIL_PASS) : "",
  from_email: process.env.EMAIL_USER || "noreply@sfccafe.com",
  from_name: "SFC Cafe",
  is_enabled: true,
};

async function getRawSmtpSettingsFromDb() {
  const row = await db("settings").where({ key: "smtp" }).first();
  if (!row) {
    const initial = { ...DEFAULT_SMTP };
    const serialized = JSON.stringify(initial);
    await db("settings").insert({
      key: "smtp",
      value: serialized,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
    return initial;
  }

  let data = row.value;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = DEFAULT_SMTP;
    }
  }
  return { ...DEFAULT_SMTP, ...data };
}

async function getActiveSmtpConfig() {
  const raw = await getRawSmtpSettingsFromDb();
  return {
    host: raw.host || "smtp.gmail.com",
    port: Number(raw.port) || 587,
    secure: Boolean(raw.secure),
    user: raw.user || "",
    pass: decrypt(raw.pass),
    from_email: raw.from_email || raw.user || "noreply@sfccafe.com",
    from_name: raw.from_name || "SFC Cafe",
    is_enabled: raw.is_enabled !== false,
  };
}

function createTransporter(config) {
  const isGmail = (config.host || "").toLowerCase().includes("gmail");
  
  const transportOptions = {
    host: config.host || "smtp.gmail.com",
    port: Number(config.port) || 587,
    secure: Boolean(config.secure),
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  };

  if (isGmail && (!config.host || config.host === "smtp.gmail.com")) {
    transportOptions.service = "gmail";
  }

  return nodemailer.createTransport(transportOptions);
}

async function sendMail({ to, subject, text, html, customConfig = null }) {
  const config = customConfig || (await getActiveSmtpConfig());

  if (!config.is_enabled) {
    throw new Error("SMTP email sending is currently disabled in Admin Settings.");
  }

  if (!config.user || !config.pass) {
    throw new Error("SMTP credentials (username and password) are not configured.");
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
    html: html || (text ? `<p style="font-family: sans-serif; font-size: 14px; color: #333;">${text.replace(/\n/g, "<br/>")}</p>` : ""),
  };

  return await transporter.sendMail(mailOptions);
}

async function testSmtpConnection({ to, customConfig = null }) {
  const config = customConfig || (await getActiveSmtpConfig());

  if (!config.user || !config.pass) {
    throw new Error("SMTP username and password are required to test connection.");
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
      subject: "✅ SFC Cafe - SMTP Test Email Successful!",
      text: `Hello,\n\nThis is a test email sent from SFC Cafe Admin Dashboard.\n\nSMTP Host: ${config.host}\nSMTP Port: ${config.port}\nEncryption: ${config.secure ? "SSL/TLS (Port 465)" : "STARTTLS (Port 587)"}\nSender: ${config.from_name} <${config.from_email || config.user}>\n\nYour SMTP server is configured and working perfectly!\n\nBest regards,\nSFC Cafe Team`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; padding: 10px 16px; background-color: #dcfce7; color: #166534; font-weight: 800; border-radius: 12px; font-size: 16px;">
              ✅ SMTP Configuration Active
            </div>
          </div>
          <h2 style="color: #111827; margin: 0 0 10px 0; text-align: center; font-size: 20px;">SMTP Connection Verified!</h2>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
            This email confirms that your outgoing mail server settings in <strong>SFC Cafe Admin Dashboard</strong> are properly configured and operational.
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
            Sent automatically via SFC Cafe Admin Settings · ${new Date().toLocaleString("en-IN")}
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
  encrypt,
  decrypt,
  getActiveSmtpConfig,
  getRawSmtpSettingsFromDb,
  sendMail,
  testSmtpConnection,
};

