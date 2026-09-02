const {
  createTransporter,
  sendMail,
  getActiveSmtpConfig,
} = require("../src/services/smtp.service");

// Environment-driven Transporter Bridge
const transporter = {
  sendMail: async function (options) {
    return await sendMail({
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  },
  getConfig: function () {
    return getActiveSmtpConfig();
  },
  getTransporter: function () {
    return createTransporter();
  },
};

module.exports = transporter;