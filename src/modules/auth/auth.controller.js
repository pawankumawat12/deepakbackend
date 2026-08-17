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
} = require("../../models/auth.model");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../../../config/helper");

const sendotp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await findUserByEmail(email);

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expireAt = new Date(Date.now() + 15 * 60 * 1000);

    await updateUser(user.id, {
      otp,
      expire_at: expireAt,
    });

    const result = await sendOtp({
      email,
      otp,
    });

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

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        message: "Email is not registered",
      });
    }

    if (!user.expire_at || new Date() > new Date(user.expire_at)) {
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
    });

    return res.status(200).json({
      message: "OTP verified successfully",
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

    // Check email if provided
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
    });

    return res.status(201).json({
      message: "User registered successfully",
      user,
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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
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
    });
  } catch (error) {
    console.error("Refresh token error:", error);

    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
};

module.exports = {
  sendotp,
  register,
  registerAdmin,
  login,
  verifyOtp,
  refreshAccessToken,
};
