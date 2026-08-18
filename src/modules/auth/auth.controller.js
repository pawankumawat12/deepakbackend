const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { validateRegister, validateLogin } = require("./auth.validation");
const {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  countAdmins,
  createUser,
  sendOtp,
  updateUser,
  findPendingRegistrationByEmail,
  findPendingRegistrationByPhone,
  savePendingRegistration,
  updatePendingRegistration,
  deletePendingRegistration,
} = require("../../models/auth.model");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../../../config/helper");

const issueVerificationOtp = async (
  registration,
  email,
  updateRegistration
) => {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  // Keep the existing OTP lifetime unchanged.
  const expireAt = new Date(Date.now() + 15 * 60 * 1000);

  await updateRegistration(registration.id, {
    otp,
    expire_at: expireAt,
  });

  return sendOtp({ email, otp });
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email is required" });
    const user = await findUserByEmail(email);
    if (!user)
      return res.status(404).json({ message: "Email is not registered" });

    const resetToken = jwt.sign(
      { id: user.id, purpose: "password-reset" },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );
    const resetUrl = `${
      process.env.ADMIN_URL || "http://localhost:5173"
    }/reset-password/${resetToken}`;
    await sendOtp({
      email,
      otp: `Reset your password using this link: ${resetUrl}`,
    });
    return res
      .status(200)
      .json({ message: "Password reset link sent", accessToken: resetToken });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res
      .status(500)
      .json({ message: "Failed to send password reset link" });
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
    if (password.length < 8)
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    if (decoded.purpose !== "password-reset")
      return res.status(401).json({ message: "Invalid password reset token" });
    const user = await findUserById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    await updateUser(user.id, {
      password: await bcrypt.hash(password, 10),
      access_token: null,
    });
    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res
      .status(401)
      .json({ message: "Invalid or expired password reset token" });
  }
};

const sendotp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await findUserByEmail(email);
    const pendingRegistration = await findPendingRegistrationByEmail(email);

    if (!pendingRegistration && !user) {
      return res.status(404).json({ message: "Email is not registered" });
    }

    const registration = pendingRegistration || user;
    const updateRegistration = pendingRegistration
      ? updatePendingRegistration
      : updateUser;
    const result = await issueVerificationOtp(
      registration,
      email,
      updateRegistration
    );

    return res.status(200).json({
      message: "OTP sent successfully",
      data: {
        messageId: result.messageId,
      },
    });
  } catch (error) {
    console.error("Send OTP error:", error);

    return res.status(500).json({
      message: "Failed to send OTP",
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

    let user = await findUserByEmail(email);
    const pendingRegistration = user
      ? null
      : await findPendingRegistrationByEmail(email);

    if (!user && !pendingRegistration) {
      return res.status(404).json({
        message: "Email is not registered",
      });
    }

    const registration = user || pendingRegistration;

    if (
      !registration.expire_at ||
      new Date() > new Date(registration.expire_at)
    ) {
      return res.status(400).json({
        message: "OTP expired",
      });
    }

    if (registration.otp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    if (!user) {
      user = await createUser({
        name: pendingRegistration.name,
        email: pendingRegistration.email,
        phone: pendingRegistration.phone,
        password: pendingRegistration.password,
        role: "user",
        is_email_verified: true,
      });
      await deletePendingRegistration(pendingRegistration.id);
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
        // Support registrations left unverified by the previous flow without
        // creating a second account. New registrations are stored only in
        // pending_registrations until their OTP is verified.
        if (!existingUser.is_email_verified) {
          const result = await issueVerificationOtp(
            existingUser,
            email,
            updateUser
          );
          return res.status(200).json({
            message: "Verification OTP sent successfully",
            data: {
              messageId: result.messageId,
            },
          });
        }

        return res.status(400).json({
          message: "Email already registered",
        });
      }
    }

    // Check phone if provided
    if (phone) {
      const existingUser = await findUserByPhone(phone);
      const pendingRegistration = await findPendingRegistrationByPhone(phone);

      if (
        existingUser ||
        (pendingRegistration && pendingRegistration.email !== email)
      ) {
        return res.status(400).json({
          message: "Phone number dosen't registered",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const pendingRegistration = await savePendingRegistration({
      name,
      email: email || null,
      phone: phone || null,
      password: hashedPassword,
    });

    const result = await issueVerificationOtp(
      pendingRegistration,
      email,
      updatePendingRegistration
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

// LOGIN (common for user + admin)
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
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
}

// Admin login validates the password before issuing the OTP.
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
      return res.status(401).json({ message: "Invalid admin credentials" });
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

//refresh token api
const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token not found",
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({
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

    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
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
  resetPassword,
  sendotp,
  register,
  registerAdmin,
  login,
  adminLogin,
  verifyOtp,
  refreshAccessToken,
  logout,
};
