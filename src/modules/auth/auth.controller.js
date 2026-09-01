const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../../../config/db");
const {
  validateRegister,
  validateLogin,
  validatePassword,
  validateUpdateProfile,
} = require("./auth.validation");
const {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  countAdmins,
  createUser,
  sendOtp: sendOtpEmail,
  sendEmailChangeOtp,
  sendPasswordResetEmail,
  updateUser,
  deleteUser,
  listCustomers,
  createBlockedCustomerRequest,
  listBlockedCustomerRequests,
  findBlockedRequestById,
  updateBlockedCustomerRequest,
} = require("../../models/auth.model");
const notificationModel = require("../../models/notification.model");
const { emitToAdmin, emitToUser } = require("../../socket/socket.service");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../../../config/helper");

const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_RESEND_LIMIT = 4;
const OTP_RESEND_LOCK_MS = 10 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MS = 15 * 60 * 1000;

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const findValidPasswordResetUser = async (token) => {
  if (!token || typeof token !== "string") return null;

  const user = await db("users")
    .where({ password_reset_token: hashResetToken(token) })
    .where("password_reset_expires_at", ">", new Date())
    .first();
  return user || null;
};

const secondsRemaining = (date) =>
  Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / 1000));

const issueVerificationOtp = async (
  registration,
  email,
  updateRegistration,
  { resetResendPolicy = false } = {}
) => {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  // Keep the existing OTP lifetime unchanged.
  const expireAt = new Date(Date.now() + 15 * 60 * 1000);

  const now = new Date();
  await updateRegistration(registration.id, {
    otp,
    expire_at: expireAt,
    otp_sent_at: now,
    ...(resetResendPolicy
      ? { otp_resend_count: 0, otp_resend_locked_until: null }
      : {}),
  });

  return sendOtpEmail({ email, otp });
};

const resendVerificationOtp = async (
  registration,
  email,
  updateRegistration
) => {
  const now = new Date();

  if (
    registration.otp_resend_locked_until &&
    new Date(registration.otp_resend_locked_until) > now
  ) {
    const retryAfter = secondsRemaining(registration.otp_resend_locked_until);
    const error = new Error(
      `Resend limit reached. Try again in ${retryAfter} seconds.`
    );
    error.status = 429;
    error.retryAfter = retryAfter;
    error.lockedUntil = registration.otp_resend_locked_until;
    throw error;
  }

  let resendCount = Number(registration.otp_resend_count || 0);
  if (
    registration.otp_resend_locked_until &&
    new Date(registration.otp_resend_locked_until) <= now
  ) {
    resendCount = 0;
  }

  if (registration.otp_sent_at) {
    const nextAllowedAt = new Date(
      new Date(registration.otp_sent_at).getTime() + OTP_RESEND_COOLDOWN_MS
    );
    if (nextAllowedAt > now) {
      const retryAfter = secondsRemaining(nextAllowedAt);
      const error = new Error(
        `Please wait ${retryAfter} seconds before resending the OTP.`
      );
      error.status = 429;
      error.retryAfter = retryAfter;
      throw error;
    }
  }

  if (resendCount >= OTP_RESEND_LIMIT) {
    const lockedUntil = new Date(now.getTime() + OTP_RESEND_LOCK_MS);
    await updateRegistration(registration.id, {
      otp_resend_locked_until: lockedUntil,
    });
    const error = new Error(
      "You have used all 4 resend attempts. Try again in 10 minutes."
    );
    error.status = 429;
    error.retryAfter = Math.ceil(OTP_RESEND_LOCK_MS / 1000);
    error.lockedUntil = lockedUntil;
    throw error;
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  const expireAt = new Date(now.getTime() + 15 * 60 * 1000);
  const nextCount = resendCount + 1;
  await updateRegistration(registration.id, {
    otp,
    expire_at: expireAt,
    otp_sent_at: now,
    otp_resend_count: nextCount,
    otp_resend_locked_until: null,
  });
  const result = await sendOtpEmail({ email, otp });
  return {
    result,
    resendCount: nextCount,
    attemptsRemaining: OTP_RESEND_LIMIT - nextCount,
  };
};

const forgotPassword = async (req, res) => {
  try {
    const email = req.body?.email?.trim().toLowerCase();
    const requestedRole = req.body?.role?.trim().toLowerCase();

    if (!email) return res.status(400).json({ message: "Email is required" });
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({ message: "Email does not exist" });
    }

    // Role-based authorization: prevent admin accounts from resetting via customer frontend, and vice-versa
    const origin = String(req.headers.origin || req.headers.referer || "");
    const isAdminSource = requestedRole === "admin" || origin.includes("5173");

    if (isAdminSource) {
      if (user.role !== "admin") {
        return res.status(403).json({
          message: "Email does not exist",
        });
      }
    } else {
      // Customer frontend source
      if (user.role === "admin") {
        return res.status(403).json({
          message: "Email does not exist",
        });
      }
    }

    const resetToken = crypto.randomBytes(32).toString("base64url");
    const resetUrlBase =
      user.role === "admin"
        ? process.env.ADMIN_URL || "http://localhost:5173"
        : process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${resetUrlBase}/reset-password?token=${encodeURIComponent(
      resetToken
    )}`;

    await updateUser(user.id, {
      password_reset_token: hashResetToken(resetToken),
      password_reset_expires_at: new Date(
        Date.now() + PASSWORD_RESET_EXPIRY_MS
      ),
    });
    await sendPasswordResetEmail({ email, resetUrl });

    return res.status(200).json({
      message:
        "A password reset link has been sent to your email. Please check your inbox.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res
      .status(500)
      .json({ message: "Failed to send password reset link" });
  }
};

const verifyPasswordResetToken = async (req, res) => {
  try {
    const user = await findValidPasswordResetUser(req.params.accessToken);
    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired password reset link" });
    }

    return res.status(200).json({ message: "Password reset link is valid" });
  } catch (error) {
    console.error("Verify password reset token error:", error);
    return res
      .status(500)
      .json({ message: "Unable to verify password reset link" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { accessToken } = req.params;
    const { password } = req.body || {};
    if (!accessToken || !password)
      return res
        .status(400)
        .json({ message: "Access token and password are required" });
    if (!validatePassword(password))
      return res
        .status(400)
        .json({
          message:
            "Password must be 8+ characters and include upper, lower, number, and special character",
        });
    const user = await findValidPasswordResetUser(accessToken);
    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired password reset link" });
    }
    await updateUser(user.id, {
      password: await bcrypt.hash(password, 10),
      access_token: null,
      password_reset_token: null,
      password_reset_expires_at: null,
    });
    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Unable to reset password" });
  }
};

const sendOtp = async (req, res) => {
  try {
    let email =
      typeof req.body === "string"
        ? req.body
        : req.body?.email || req.query?.email;
    if (typeof email === "string") {
      email = email.trim().toLowerCase();
    }

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({ message: "Invalid Credentials" });
    }

    const resend = await resendVerificationOtp(user, email, updateUser);

    return res.status(200).json({
      message: "OTP resent successfully",
      data: {
        messageId: resend.result.messageId,
        resendCount: resend.resendCount,
        attemptsRemaining: resend.attemptsRemaining,
        retryAfter: OTP_RESEND_COOLDOWN_MS / 1000,
      },
    });
  } catch (error) {
    console.error("Send OTP error:", error);

    return res.status(error.status || 500).json({
      message: error.message || "Failed to send OTP",
      retryAfter: error.retryAfter,
      lockedUntil: error.lockedUntil,
    });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(404).json({
        message: "Invalid Credentials",
      });
    }

    if (!user.expire_at || new Date() > new Date(user.expire_at)) {
      return res.status(400).json({
        message: "OTP has expired. Please click resend to get a new code.",
      });
    }

    if (String(user.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        message: "Invalid OTP code. Please check and try again.",
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // store into cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 1000,
    });

    await updateUser(user.id, {
      otp: null,
      expire_at: null,
      access_token: accessToken,
      is_email_verified: true,
    });

    return res.status(200).json({
      message: "OTP verified successfully. Your account is now active!",
      token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        image: user.image,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);

    return res.status(500).json({
      message: "Failed to verify OTP",
    });
  }
};

async function register(req, res) {
  try {
    const { name, email, phone, password } = req.body || {};

    const { valid, errors } = validateRegister({
      name,
      email,
      phone,
      password,
    });

    if (!valid) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedEmail = email ? email.trim().toLowerCase() : null;

    if (normalizedEmail) {
      const existingUser = await findUserByEmail(normalizedEmail);

      if (existingUser) {
        // If email is ALREADY VERIFIED, it is permanently registered
        if (existingUser.is_email_verified) {
          return res.status(400).json({
            message: "Email is already registered. Please log in.",
          });
        }

        // If email was submitted previously but NOT verified, update the credentials and issue fresh OTP
        await updateUser(existingUser.id, {
          name: name ? name.trim() : existingUser.name,
          phone: phone ? phone.trim() : existingUser.phone,
          password: hashedPassword,
        });

        const result = await issueVerificationOtp(
          existingUser,
          normalizedEmail,
          updateUser,
          { resetResendPolicy: true }
        );

        return res.status(200).json({
          message: "Verification code sent to your email.",
          data: {
            messageId: result.messageId,
            email: normalizedEmail,
            requiresVerification: true,
          },
        });
      }
    }

    // Check phone if provided
    if (phone) {
      const existingUser = await findUserByPhone(phone);

      if (existingUser && existingUser.is_email_verified) {
        return res.status(400).json({
          message: "Phone number is already associated with another account",
        });
      }
    }

    const user = await createUser({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone || null,
      password: hashedPassword,
      role: "user",
      is_email_verified: false,
    });

    const result = await issueVerificationOtp(user, normalizedEmail, updateUser, {
      resetResendPolicy: true,
    });

    return res.status(201).json({
      message: "User registered successfully. Verification code sent to your email.",
      data: {
        messageId: result.messageId,
        email: normalizedEmail,
        requiresVerification: true,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
}
// REGISTER ADMIN
async function registerAdmin(req, res) {
  try {
    const { name, email, password } = req.body;
    const { valid, errors } = validateRegister({ name, email, password });

    if (!valid) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const adminCount = await countAdmins();
    if (adminCount > 0) {
      return res
        .status(403)
        .json({ message: "Only one admin account is allowed." });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await createUser({
      name,
      email,
      password,
      role: "admin",
      is_email_verified: true,
    });

    res.status(201).json({ message: "Admin registered successfully", admin });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
}

async function login(req, res) {
  try {
    const { email, phone, password } = req.body || {};
    const { valid, errors } = validateLogin({ email, password, phone });

    if (!valid) {
      return res.status(400).json({ message: "Validation failed", errors });
    }
    let user;
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      user = await findUserByEmail(normalizedEmail);

      if (!user) {
        return res.status(400).json({
          message: "Invalid Credentials",
        });
      }
    }

    if (!user || user.role !== "user") {
      return res.status(404).json({ message: "Invalid credentials" });
    }

    // Check phone if provided
    if (phone) {
      user = await findUserByPhone(phone);

      if (!user) {
        return res.status(400).json({
          message: "Phone number is not registered",
        });
      }
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // If user's email is NOT verified, generate fresh OTP, send it, and prompt verification!
    if (!user.is_email_verified) {
      const otpResult = await issueVerificationOtp(
        user,
        user.email,
        updateUser
      );
      return res.status(403).json({
        requiresVerification: true,
        email: user.email,
        message:
          "Your email is not verified yet. A fresh verification OTP has been sent to your email.",
        data: {
          email: user.email,
          messageId: otpResult.messageId,
        },
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    await updateUser(user.id, { access_token: accessToken });

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        token: accessToken,
        phone: user.phone,
        role: user.role,
        image: user.image,
        is_active: user.is_active !== false,
        is_blocked: Boolean(user.is_blocked),
        block_reason: user.block_reason || null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
}

async function adminLogin(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    const admin = await findUserByEmail(email);
    if (
      !admin ||
      admin.role !== "admin" ||
      !(await bcrypt.compare(password, admin.password))
    )
      return res.status(404).json({ message: "Invalid admin credentials" });
    const result = await issueVerificationOtp(admin, email, updateUser);
    return res.status(200).json({
      message: "Credentials verified. OTP sent.",
      data: { messageId: result.messageId },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Unable to start admin login" });
  }
}

const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(404).json({
        message: "Refresh token not found. Please login again",
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const newAccessToken = generateAccessToken(user);

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Access token refreshed",
      accessToken: newAccessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        image: user.image,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);

    return res.status(404).json({
      message: "Invalid or expired refresh token",
    });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        image: user.image,
        is_active: user.is_active !== false,
        is_blocked: Boolean(user.is_blocked),
        block_reason: user.block_reason || null,
      },
    });
  } catch (error) {
    console.error("Get me error:", error);
    return res.status(500).json({ message: "Failed to load user" });
  }
};

const logout = (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
  return res.status(200).json({ message: "Logged out successfully" });
};

const requestEmailChange = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { newEmail } = req.body || {};
    if (!newEmail || typeof newEmail !== "string" || !newEmail.trim()) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const normalizedEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: "Please provide a valid email format" });
    }

    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.email && user.email.toLowerCase() === normalizedEmail) {
      return res.status(400).json({
        message: "This is already your current registered email address",
      });
    }

    // Prevent duplicate emails
    const existingUser = await db("users")
      .where({ email: normalizedEmail })
      .whereNot({ id: userId })
      .first();

    if (existingUser) {
      return res.status(400).json({
        message: "This email address is already associated with another account.",
      });
    }

    const now = new Date();

    // Check resend lock
    if (
      user.pending_email_resend_locked_until &&
      new Date(user.pending_email_resend_locked_until) > now
    ) {
      const retryAfter = secondsRemaining(user.pending_email_resend_locked_until);
      return res.status(429).json({
        message: `Too many verification requests. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    // Check 30-second cooldown
    if (
      user.pending_email_sent_at &&
      user.pending_email === normalizedEmail &&
      now.getTime() - new Date(user.pending_email_sent_at).getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      const retryAfter = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS -
          (now.getTime() - new Date(user.pending_email_sent_at).getTime())) /
          1000
      );
      return res.status(429).json({
        message: `Please wait ${retryAfter} seconds before requesting a new code.`,
        retryAfter,
      });
    }

    let resendCount = Number(user.pending_email_resend_count || 0);
    let lockedUntil = null;

    if (user.pending_email === normalizedEmail) {
      resendCount += 1;
      if (resendCount >= OTP_RESEND_LIMIT) {
        lockedUntil = new Date(now.getTime() + OTP_RESEND_LOCK_MS);
      }
    } else {
      resendCount = 1;
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expireAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    await db("users")
      .where({ id: userId })
      .update({
        pending_email: normalizedEmail,
        pending_email_otp: otp,
        pending_email_expire_at: expireAt,
        pending_email_sent_at: now,
        pending_email_resend_count: resendCount,
        pending_email_resend_locked_until: lockedUntil,
      });

    await sendEmailChangeOtp({ email: normalizedEmail, otp });

    return res.status(200).json({
      success: true,
      message: `Verification code sent to ${normalizedEmail}`,
      pendingEmail: normalizedEmail,
      retryAfter: OTP_RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.error("Request email change error:", error);
    return res.status(500).json({
      message: "Failed to send verification code. Please check email configuration.",
    });
  }
};

const resendEmailChangeOtp = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await findUserById(userId);
    if (!user || !user.pending_email) {
      return res.status(400).json({
        message: "No pending email change request found. Please enter your new email again.",
      });
    }

    const pendingEmail = user.pending_email;
    const now = new Date();

    if (
      user.pending_email_resend_locked_until &&
      new Date(user.pending_email_resend_locked_until) > now
    ) {
      const retryAfter = secondsRemaining(user.pending_email_resend_locked_until);
      return res.status(429).json({
        message: `Too many requests. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    if (
      user.pending_email_sent_at &&
      now.getTime() - new Date(user.pending_email_sent_at).getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      const retryAfter = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS -
          (now.getTime() - new Date(user.pending_email_sent_at).getTime())) /
          1000
      );
      return res.status(429).json({
        message: `Please wait ${retryAfter} seconds before requesting a new code.`,
        retryAfter,
      });
    }

    let resendCount = Number(user.pending_email_resend_count || 0) + 1;
    let lockedUntil = null;
    if (resendCount >= OTP_RESEND_LIMIT) {
      lockedUntil = new Date(now.getTime() + OTP_RESEND_LOCK_MS);
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expireAt = new Date(now.getTime() + 10 * 60 * 1000);

    await db("users")
      .where({ id: userId })
      .update({
        pending_email_otp: otp,
        pending_email_expire_at: expireAt,
        pending_email_sent_at: now,
        pending_email_resend_count: resendCount,
        pending_email_resend_locked_until: lockedUntil,
      });

    await sendEmailChangeOtp({ email: pendingEmail, otp });

    return res.status(200).json({
      success: true,
      message: `New verification code resent to ${pendingEmail}`,
      pendingEmail,
      retryAfter: OTP_RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.error("Resend email change error:", error);
    return res.status(500).json({ message: "Failed to resend verification code" });
  }
};

const verifyEmailChange = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { otp, newEmail } = req.body || {};
    if (!otp || !String(otp).trim()) {
      return res.status(400).json({ message: "Verification code (OTP) is required" });
    }

    const user = await findUserById(userId);
    if (!user || !user.pending_email) {
      return res.status(400).json({
        message: "No pending email change request found. Please request a new verification code.",
      });
    }

    if (newEmail && user.pending_email.toLowerCase() !== newEmail.trim().toLowerCase()) {
      return res.status(400).json({
        message: "Email mismatch. Please request a new verification code for this email.",
      });
    }

    if (
      !user.pending_email_expire_at ||
      new Date() > new Date(user.pending_email_expire_at)
    ) {
      return res.status(400).json({
        message: "Verification code has expired. Please click resend to receive a new code.",
      });
    }

    if (String(user.pending_email_otp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        message: "Invalid verification code. Please check and try again.",
      });
    }

    // Double check email uniqueness before final update
    const existingUser = await db("users")
      .where({ email: user.pending_email })
      .whereNot({ id: userId })
      .first();

    if (existingUser) {
      return res.status(400).json({
        message: "This email address was recently registered with another account.",
      });
    }

    const newVerifiedEmail = user.pending_email;

    const updatedUsers = await db("users")
      .where({ id: userId })
      .update({
        email: newVerifiedEmail,
        is_email_verified: true,
        pending_email: null,
        pending_email_otp: null,
        pending_email_expire_at: null,
        pending_email_sent_at: null,
        pending_email_resend_count: 0,
        pending_email_resend_locked_until: null,
        updated_at: new Date(),
      })
      .returning([
        "id",
        "name",
        "email",
        "phone",
        "role",
        "image",
      ]);

    const updatedUser = Array.isArray(updatedUsers) ? updatedUsers[0] : updatedUsers;

    const accessToken = generateAccessToken(updatedUser);
    const refreshToken = generateRefreshToken(updatedUser);

    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
    };

    res.cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Email address changed and verified successfully! 🎉",
      token: accessToken,
      accessToken,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        image: updatedUser.image,
      },
    });
  } catch (error) {
    console.error("Verify email change error:", error);
    return res.status(500).json({ message: "Failed to verify email change" });
  }
};

const cancelEmailChange = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await db("users")
      .where({ id: userId })
      .update({
        pending_email: null,
        pending_email_otp: null,
        pending_email_expire_at: null,
        pending_email_sent_at: null,
        pending_email_resend_count: 0,
        pending_email_resend_locked_until: null,
      });

    return res.status(200).json({
      success: true,
      message: "Email change request cancelled",
    });
  } catch (error) {
    console.error("Cancel email change error:", error);
    return res.status(500).json({ message: "Failed to cancel email change request" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { name, email, phone } = req.body || {};
    const { valid, errors } = validateUpdateProfile({ name, email, phone });

    if (!valid) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const currentUser = await findUserById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email ? email.trim().toLowerCase() : null;
    const trimmedPhone = phone ? phone.trim() : null;

    // Check if phone is already taken by another user
    if (trimmedPhone && trimmedPhone !== currentUser.phone) {
      const existingPhoneUser = await db("users")
        .where({ phone: trimmedPhone })
        .whereNot({ id: userId })
        .first();
      if (existingPhoneUser) {
        return res
          .status(400)
          .json({ message: "Phone number already registered with another account" });
      }
    }

    const isEmailChanging = trimmedEmail && trimmedEmail !== (currentUser.email || "").toLowerCase();

    // Check if new email is already registered by another account
    if (isEmailChanging) {
      const existingEmailUser = await db("users")
        .where({ email: trimmedEmail })
        .whereNot({ id: userId })
        .first();
      if (existingEmailUser) {
        return res.status(400).json({
          message: "This email address is already associated with another account.",
        });
      }
    }

    const updateData = {
      name: trimmedName,
      phone: trimmedPhone,
      // Note: we KEEP current email until verified via OTP if email was changed!
      email: isEmailChanging ? currentUser.email : trimmedEmail,
      updated_at: new Date(),
    };

    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }

    const updatedUsers = await updateUser(userId, updateData);
    const updatedUser = Array.isArray(updatedUsers)
      ? updatedUsers[0]
      : updatedUsers;

    // If customer entered a new email, trigger the OTP verification process automatically
    if (isEmailChanging) {
      const now = new Date();
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const expireAt = new Date(now.getTime() + 10 * 60 * 1000);

      await db("users")
        .where({ id: userId })
        .update({
          pending_email: trimmedEmail,
          pending_email_otp: otp,
          pending_email_expire_at: expireAt,
          pending_email_sent_at: now,
          pending_email_resend_count: 1,
          pending_email_resend_locked_until: null,
        });

      await sendEmailChangeOtp({ email: trimmedEmail, otp });

      return res.status(200).json({
        success: true,
        message: `Profile updated. A 4-digit verification code was sent to ${trimmedEmail} to complete your email change.`,
        requiresEmailOtp: true,
        pendingEmail: trimmedEmail,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: currentUser.email, // stays current until verified
          phone: updatedUser.phone,
          role: updatedUser.role,
          image: updatedUser.image,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        image: updatedUser.image,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
};

const getCustomers = async (req, res) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await listCustomers({ page, limit, search, status });
    return res.status(200).json({
      success: true,
      message: "Customers fetched successfully",
      data: result.customers,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get customers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customers",
    });
  }
};

async function editCustomer(req, res) {
  try {
    const customerId = Number(req.params.id);
    const { name, email, phone } = req.body || {};

    const existing = await findUserById(customerId);
    if (!existing || existing.role === "admin") {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const updated = await updateUser(customerId, {
      name: name ? name.trim() : existing.name,
      email: email ? email.trim().toLowerCase() : existing.email,
      phone: phone ? phone.trim() : existing.phone,
      updated_at: new Date(),
    });

    const updatedUser = Array.isArray(updated) ? updated[0] : updated;

    return res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Edit customer error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update customer" });
  }
}

async function removeCustomer(req, res) {
  try {
    const customerId = Number(req.params.id);
    const existing = await findUserById(customerId);
    if (!existing || existing.role === "admin") {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    await deleteUser(customerId);
    return res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    console.error("Delete customer error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete customer" });
  }
}

async function toggleCustomerStatus(req, res) {
  try {
    const customerId = Number(req.params.id);
    const { is_active, is_blocked, block_reason } = req.body || {};

    const existing = await findUserById(customerId);
    if (!existing || existing.role === "admin") {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const nextBlocked =
      typeof is_blocked === "boolean" ? is_blocked : !existing.is_blocked;
    const nextActive =
      typeof is_active === "boolean" ? is_active : !nextBlocked;

    const updated = await updateUser(customerId, {
      is_blocked: nextBlocked,
      is_active: nextActive,
      block_reason: nextBlocked
        ? block_reason || "Account deactivated by administrator."
        : null,
      blocked_at: nextBlocked ? new Date() : null,
      updated_at: new Date(),
    });

    const updatedUser = Array.isArray(updated) ? updated[0] : updated;

    // Real-time notification to the customer via Socket.IO
    emitToUser(customerId, "customer_status_changed", {
      userId: customerId,
      is_blocked: nextBlocked,
      is_active: nextActive,
      block_reason: updatedUser.block_reason,
    });

    // Notify all admins
    emitToAdmin("admin_customer_status_updated", {
      customerId,
      customerName: existing.name,
      is_blocked: nextBlocked,
      is_active: nextActive,
    });

    return res.status(200).json({
      success: true,
      message: nextBlocked
        ? "Customer blocked successfully"
        : "Customer unblocked and activated",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Toggle customer status error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update customer status" });
  }
}

async function submitBlockedSupportRequest(req, res) {
  try {
    const { name, email, phone, message } = req.body || {};
    if (!email || !message) {
      return res
        .status(400)
        .json({ success: false, message: "Email and message are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    const supportReq = await createBlockedCustomerRequest({
      user_id: user ? user.id : null,
      name: (name || user?.name || "Customer").trim(),
      email: normalizedEmail,
      phone: phone || user?.phone || null,
      message: message.trim(),
      status: "pending",
    });

    // Notify Admin via Notification model & Socket.IO
    await notificationModel.createNotification({
      role: "admin",
      type: "customer_unblock_request",
      title: `Unblock Request from ${supportReq.name}`,
      message: supportReq.message.slice(0, 120),
      dataJson: supportReq,
    });

    emitToAdmin("new_blocked_support_request", {
      requestId: supportReq.id,
      userId: supportReq.user_id,
      name: supportReq.name,
      email: supportReq.email,
      phone: supportReq.phone,
      message: supportReq.message,
      createdAt: supportReq.created_at,
    });

    return res.status(201).json({
      success: true,
      message:
        "Your request has been submitted to the admin. We will review it shortly.",
      data: supportReq,
    });
  } catch (error) {
    console.error("Blocked support request error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit request" });
  }
}

async function getBlockedSupportRequests(req, res) {
  try {
    const { page, limit, status } = req.query || {};
    const result = await listBlockedCustomerRequests({ page, limit, status });
    return res.status(200).json({
      success: true,
      message: "Support requests fetched successfully",
      data: result.requests,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get blocked requests error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch requests" });
  }
}

async function resolveBlockedSupportRequest(req, res) {
  try {
    const requestId = Number(req.params.id);
    const { status, admin_response } = req.body || {};

    if (!["approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Status must be approved or rejected" });
    }

    const request = await findBlockedRequestById(requestId);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    const resolved = await updateBlockedCustomerRequest(requestId, {
      status,
      admin_response:
        admin_response ||
        (status === "approved"
          ? "Your account has been unblocked by the administrator."
          : "Your unblock request was rejected."),
      resolved_at: new Date(),
    });

    // If approved, unblock the user!
    if (status === "approved" && request.user_id) {
      await updateUser(request.user_id, {
        is_blocked: false,
        is_active: true,
        block_reason: null,
        blocked_at: null,
      });

      emitToUser(request.user_id, "customer_status_changed", {
        userId: request.user_id,
        is_blocked: false,
        is_active: true,
        message: "Your account has been unblocked by the administrator.",
      });
    }

    emitToAdmin("blocked_request_resolved", resolved);

    return res.status(200).json({
      success: true,
      message:
        status === "approved"
          ? "Request approved and customer unblocked"
          : "Request rejected",
      data: resolved,
    });
  } catch (error) {
    console.error("Resolve blocked request error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to resolve request" });
  }
}

module.exports = {
  forgotPassword,
  verifyPasswordResetToken,
  resetPassword,
  sendOtp,
  register,
  registerAdmin,
  login,
  adminLogin,
  verifyOtp,
  refreshAccessToken,
  getMe,
  logout,
  updateProfile,
  requestEmailChange,
  resendEmailChangeOtp,
  verifyEmailChange,
  cancelEmailChange,
  getCustomers,
  editCustomer,
  removeCustomer,
  toggleCustomerStatus,
  submitBlockedSupportRequest,
  getBlockedSupportRequests,
  resolveBlockedSupportRequest,
};

