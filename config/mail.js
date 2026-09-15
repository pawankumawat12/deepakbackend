const {
  sendMail,
  getActiveEmailConfig,
  isEmailActive,
} = require("../src/services/resend.service");

// Environment-driven Transporter Bridge for Resend
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
    return await getActiveEmailConfig();
  },
  isEmailActive: async function () {
    return await isEmailActive();
  },
};

module.exports = transporter;