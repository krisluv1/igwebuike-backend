const jwt = require("jsonwebtoken");
const cfg = require("../config");
const Alumni = require("../models/Alumni");

// AUTHENTICATION: "who are you?"
async function authenticate(req, res, next) {
  try {
    const token = req.cookies && req.cookies[cfg.cookieName];
    if (!token) return res.status(401).json({ error: "Please log in." });

    // Pin the algorithm. Without this, a classic attack swaps in alg:"none".
    const payload = jwt.verify(token, cfg.jwtSecret, { algorithms: ["HS256"] });

    // Look the user up on EVERY request so deleted users / revoked sessions
    // (tokenVersion changed) stop working immediately, not after expiry.
    const user = await Alumni.findById(payload.sub).select("firstName lastName email role alumniCode tokenVersion");
    if (!user || user.tokenVersion !== payload.tv) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

// AUTHORIZATION: "are you allowed to do this?"  (Role-Based Access Control)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
