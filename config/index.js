// Central configuration. Fails FAST at startup if something unsafe is missing,
// instead of running insecurely.
require("dotenv").config();

const isProd = process.env.NODE_ENV === "production";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set and at least 32 characters long.");
}
if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI must be set.");
}

// Only these origins may call the API from a browser.
const allowedOrigins = [process.env.FRONTEND_URL].filter(Boolean);
if (!isProd) allowedOrigins.push("http://localhost:5500", "http://127.0.0.1:5500");

module.exports = {
  isProd,
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: "2h",
  cookieName: "iw_token",
  allowedOrigins,
  // Optional: internal matching service. If unset, recommendations use the keyword fallback.
  mlServiceUrl: process.env.ML_SERVICE_URL || "",
  mlInternalKey: process.env.ML_INTERNAL_KEY || "",
};
