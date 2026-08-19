const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../../../config/db");
const { validateRegister, validateLogin, validatePassword } = require("./auth.validation");
const {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  countAdmins,
  createUser,
  sendOtp: sendOtpEmail,
  sendPasswordResetEmail,
  updateUser,
} = require("../../models/auth.model");
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

const resendVerificationOtp = async (registration, email, updateRegistration) => {
  const now = new Date();

  if (
    registration.otp_resend_locked_until &&
    new Date(registration.otp_resend_locked_until) > now
  ) {
    const retryAfter = secondsRemaining(registration.otp_resend_locked_until);
    const error = new Error(`Resend limit reached. Try again in ${retryAfter} seconds.`);
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
      const error = new Error(`Please wait ${retryAfter} seconds before resending the OTP.`);
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
    const error = new Error("You have used all 4 resend attempts. Try again in 10 minutes.");
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
  return { result, resendCount: nextCount, attemptsRemaining: OTP_RESEND_LIMIT - nextCount };
};

const forgotPassword = async (req, res) => {
  try {
    const email = req.body?.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });
    const user = await findUserByEmail(email);
    // Always use the same response so this endpoint cannot reveal registered emails.
    if (user) {
      const resetToken = crypto.randomBytes(32).toString("base64url");
      const resetUrlBase =
        user.role === "admin"
          ? process.env.ADMIN_URL || "http://localhost:5173"
          : process.env.FRONTEND_URL || "http://localhost:3000";
      const resetUrl = `${resetUrlBase}/reset-password?token=${encodeURIComponent(resetToken)}`;

      await updateUser(user.id, {
        password_reset_token: hashResetToken(resetToken),
        password_reset_expires_at: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
      });
      await sendPasswordResetEmail({ email, resetUrl });
    }

    return res.status(200).json({
      message: "If that email is registered, a password reset link has been sent.",
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
      return res.status(400).json({ message: "Invalid or expired password reset link" });
    }

    return res.status(200).json({ message: "Password reset link is valid" });
  } catch (error) {
    console.error("Verify password reset token error:", error);
    return res.status(500).json({ message: "Unable to verify password reset link" });
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
        .json({ message: "Password must be 8+ characters and include upper, lower, number, and special character" });
    const user = await findValidPasswordResetUser(accessToken);
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired password reset link" });
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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({ message: "Email is not registered" });
    }

    const resend = await resendVerificationOtp(
      user,
      email,
      updateUser
    );

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
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required",
      });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        message: "Email is not registered",
      });
    }

    if (
      !user.expire_at ||
      new Date() > new Date(user.expire_at)
    ) {
      return res.status(400).json({
        message: "OTP expired",
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    //store into cookie
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
      message: "OTP verified successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
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

    if (email) {
      const existingUser = await findUserByEmail(email);

      if (existingUser) {
        return res.status(400).json({
          message: "Email already registered",
        });
      }
    }

    // Check phone if provided
    if (phone) {
      const existingUser = await findUserByPhone(phone);

      if (existingUser) {
        return res.status(400).json({
          message: "Phone number dosen't registered",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await createUser({
      name,
      email: email || null,
      phone: phone || null,
      password: hashedPassword,
      role: "user",
      is_email_verified: false,
    });

    const result = await issueVerificationOtp(
      user,
      email,
      updateUser,
      { resetResendPolicy: true }
    );

    return res.status(201).json({
      message: "User registered successfully",
      data: {
        messageId: result.messageId,
      },
    });
  } catch (error) {
    console.error(error);

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
      password: hashedPassword,
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
    const { email, phone, password } = req.body;
    const { valid, errors } = validateLogin({ email, password, phone });

    if (!valid) {
      return res.status(400).json({ message: "Validation failed", errors });
    }
    let user;
    if (email) {
      user = await findUserByEmail(email);

      if (!user) {
        return res.status(400).json({
          message: "Email dose not registered",
        });
      }
    }

    // Check phone if provided
    if (phone) {
      user = await findUserByPhone(phone);

      if (!user) {
        return res.status(400).json({
          message: "Phone number dose not registered",
        });
      }
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.is_email_verified) {
      return res.status(403).json({
        message: "Please verify your email before logging in",
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
        token: user.accessToken,
        phone: user.phone,
        role: user.role,
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
    return res
      .status(200)
      .json({
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
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
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
};
