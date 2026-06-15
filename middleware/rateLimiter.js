const rateLimit = require("express-rate-limit");

// Limit registration attempts: max 10 per IP per 15 minutes
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many registration attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit booking attempts: max 20 per IP per 15 minutes
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many booking attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { registerLimiter, bookingLimiter };
