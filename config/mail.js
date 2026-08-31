const { sendMail, getActiveSmtpConfig } = require("../src/services/smtp.service");

// Dynamic Transporter Bridge (delegates sendMail to the database-driven smtp.service)
const transporter = {
  sendMail: async function (options) {
    return await sendMail({
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  },
  getConfig: async function () {
    return await getActiveSmtpConfig();
  },
};

module.exports = transporter;