const templates = [
  {
    name: "Registration Verification",
    slug: "registration-verification",
    subject: "Verify your SFC Cafe account",
    description: "Verification code sent after customer registration.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
  <h2 style="color: #4f7d16; margin-top: 0;">Welcome to SFC Cafe</h2>
  <p style="font-size: 14px; color: #555;">Hello {{userName}}, use this verification code to activate your account:</p>
  <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #111; background: #f4f8ec; padding: 12px 20px; border-radius: 8px; text-align: center; margin: 20px 0;">{{otp}}</div>
  <p style="font-size: 12px; color: #888;">This code is valid for 15 minutes. If you did not create this account, please ignore this email.</p>
</div>`,
  },
  {
    name: "Login Verification OTP",
    slug: "login-verification-otp",
    subject: "Your SFC Cafe login verification code",
    description: "OTP used when a customer or admin login requires verification.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
  <h2 style="color: #4f7d16; margin-top: 0;">Login Verification</h2>
  <p style="font-size: 14px; color: #555;">Hello {{userName}}, use the following one-time password to complete your login:</p>
  <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #111; background: #f4f8ec; padding: 12px 20px; border-radius: 8px; text-align: center; margin: 20px 0;">{{otp}}</div>
  <p style="font-size: 12px; color: #888;">This code is valid for 15 minutes. If you did not request it, please secure your account.</p>
</div>`,
  },
  {
    name: "Email Change Verification",
    slug: "email-change-verification",
    subject: "Verify your new SFC Cafe email address",
    description: "OTP used to confirm an email address change.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 16px; background: #ffffff;">
  <h2 style="color: #4f7d16; margin: 0 0 8px;">Email Change Request</h2>
  <p style="font-size: 14px; color: #333;">We received a request to update your account email to <strong>{{email}}</strong>.</p>
  <p style="font-size: 14px; color: #555;">Use this one-time password to confirm the change:</p>
  <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3a1e; background: #f4f8ec; border: 1px dashed #4f7d16; padding: 16px 20px; border-radius: 12px; text-align: center; margin: 24px 0;">{{otp}}</div>
  <p style="font-size: 12px; color: #777;">This code is valid for 10 minutes. If you did not request this change, please ignore this email.</p>
</div>`,
  },
  {
    name: "Password Reset",
    slug: "password-reset",
    subject: "Reset your SFC Cafe password",
    description: "Password reset link sent after a forgot-password request.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
  <h2 style="color: #4f7d16; margin-top: 0;">Password Reset Request</h2>
  <p style="font-size: 14px; color: #555;">Hello {{userName}}, we received a request to reset your SFC Cafe password.</p>
  <p style="margin: 24px 0;"><a href="{{resetUrl}}" style="background-color: #4f7d16; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a></p>
  <p style="font-size: 12px; color: #888;">This link expires in 15 minutes. If you did not request this, you can safely ignore this email.</p>
</div>`,
  },
  {
    name: "Contact Reply",
    slug: "contact-reply",
    subject: "Reply to your inquiry: {{inquirySubject}}",
    description: "Reply sent by support after a contact inquiry is resolved.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #1e293b; margin-top: 0;">Response to Your Inquiry</h2>
  <p>Hello <strong>{{userName}}</strong>,</p>
  <p>We have reviewed your query regarding: <em>"{{inquirySubject}}"</em>.</p>
  <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;"><p style="margin: 0 0 8px; font-size: 13px; color: #64748b; font-weight: bold;">Support Team Reply:</p><p style="margin: 0; color: #1e293b; white-space: pre-wrap;">{{adminReply}}</p></div>
  <div style="background-color: #f1f5f9; padding: 12px; border-radius: 4px; font-size: 13px; color: #475569;"><p style="margin: 0 0 5px;"><strong>Your Original Message:</strong></p><p style="margin: 0; font-style: italic;">"{{originalMessage}}"</p></div>
</div>`,
  },
  {
    name: "Welcome",
    slug: "welcome",
    subject: "Welcome to SFC Cafe, {{userName}}",
    description: "Reserved template for a future post-verification welcome email.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;"><h2>Welcome to SFC Cafe, {{userName}}!</h2><p>Thank you for joining us.</p></div>`,
  },
  {
    name: "Order Confirmation",
    slug: "order-confirmation",
    subject: "Order {{orderId}} confirmed",
    description: "Reserved template. No order confirmation email is currently sent by the backend.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;"><h2>Order confirmed</h2><p>Thank you for your order <strong>{{orderId}}</strong>.</p><p>Total: <strong>{{amount}}</strong></p></div>`,
  },
  {
    name: "Payment Update",
    slug: "payment-update",
    subject: "Payment update for order {{orderId}}",
    description: "Reserved template. No payment email is currently sent by the backend.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;"><h2>Payment update</h2><p>Your payment for order <strong>{{orderId}}</strong> is <strong>{{paymentStatus}}</strong>.</p><p>Amount: <strong>{{amount}}</strong></p></div>`,
  },
  {
    name: "Order Status Update",
    slug: "order-status-update",
    subject: "Order {{orderId}} status update: {{orderStatus}}",
    description: "Reserved template. Current order status changes use in-app notifications only.",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;"><h2>Order status update</h2><p>Your order <strong>{{orderId}}</strong> is now <strong>{{orderStatus}}</strong>.</p><p>{{deliveryMessage}}</p></div>`,
  },
];

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable("email_templates"))) return;

  for (const template of templates) {
    await knex("email_templates")
      .insert({ ...template, is_active: true })
      .onConflict("slug")
      .ignore();
  }
};

exports.down = async function (knex) {
  await knex("email_templates")
    .whereIn("slug", templates.map((template) => template.slug))
    .del();
};
