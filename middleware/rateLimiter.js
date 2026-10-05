const rateLimit = require("express-rate-limit");

const make = (max, message, extra = {}) =>
  rateLimit({ windowMs: 15 * 60 * 1000, max, message: { error: message },
              standardHeaders: true, legacyHeaders: false,
              // Only integration tests (which create many users quickly) turn this off.
              skip: () => process.env.DISABLE_RATE_LIMIT === "true", ...extra });

const registerLimiter = make(10, "Too many registration attempts. Please try again in 15 minutes.");
const bookingLimiter  = make(20, "Too many booking attempts. Please try again later.");
// Per-IP brute-force limit on login. Only FAILED attempts count, so normal users aren't punished.
const loginLimiter    = make(10, "Too many login attempts. Please try again in 15 minutes.",
                             { skipSuccessfulRequests: true });

module.exports = { registerLimiter, bookingLimiter, loginLimiter };

// Job-portal limiters (appended). Posting is limited hourly to blunt spam; applying is limited per 15 min.
const jobPostLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10,
  message: { error: "Too many job posts. Please try again later." }, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.DISABLE_RATE_LIMIT === "true" });
const applyLimiter = make(30, "Too many applications. Please slow down.");
module.exports.jobPostLimiter = jobPostLimiter;
module.exports.applyLimiter = applyLimiter;

module.exports.eventLimiter = make(120, "Too many requests. Please slow down.");
