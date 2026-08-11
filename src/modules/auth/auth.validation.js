function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).toLowerCase());
}

function validatePassword(password) {
  if (typeof password !== "string") return false;
  const lengthOk = password.length >= 8 && password.length <= 128;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return lengthOk && hasUpper && hasLower && hasNumber && hasSpecial;
}

function validateRegister({ name, email, password }) {
  const errors = {};

  if (!name || typeof name !== "string" || name.trim().length < 3) {
    errors.name = "Name is required and must be at least 3 characters.";
  }

  if (!email || typeof email !== "string" || !validateEmail(email)) {
    errors.email = "A valid email address is required.";
  }

  if (!password || !validatePassword(password)) {
    errors.password =
      "Password must be 8+ chars and include upper, lower, number, and special character.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateLogin({ email, password }) {
  const errors = {};

  if (!email || typeof email !== "string" || !validateEmail(email)) {
    errors.email = "A valid email address is required.";
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    errors.password = "Password is required and must be at least 8 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

module.exports = { validateRegister, validateLogin };
