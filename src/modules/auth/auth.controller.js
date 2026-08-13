const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
  validateRegister,
  validateLogin,
} = require("./auth.validation");
const {
  findUserByEmail,
  findUserByPhone,
  countAdmins,
  createUser,
  sendOtp,
} = require("../../models/auth.model");



const sendotp = async (req, res) => {
  try {
    const { phone } = req.body;
    const otp = Math.floor(Math.random() * 9999) + 1000;
    if (!phone) {
      return res.status(400).json({
        message: "Phone number is required",
      });
    }

    const result = await sendOtp({phone, otp});

    return res.status(200).json({
      message: "OTP sent successfully",
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to send OTP",
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

      if (!existingUser) {
        return res.status(400).json({
          message: "Email already registered",
        });
      }
    }

    // Check phone if provided
    if (phone) {
      const existingUser = await findUserByPhone(phone);

      if (!existingUser) {
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
      return res.status(403).json({ message: "Only one admin account is allowed." });
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
  let user ;
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
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
}


module.exports = {sendotp, register, registerAdmin, login };