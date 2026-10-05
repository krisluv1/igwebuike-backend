const express = require("express");
const bcrypt  = require("bcryptjs");
const Alumni  = require("../models/Alumni");
const { validateLogin } = require("../utils/validators");
const { setAuthCookie, clearAuthCookie } = require("../utils/tokens");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const MAX_FAILS = 5;
const LOCK_MS   = 15 * 60 * 1000;
const GENERIC   = { error: "Invalid email or password, or account temporarily locked." };

// A real bcrypt hash of a random string. Used so that "unknown email" takes the
// same TIME as "wrong password" - otherwise response speed reveals which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-" + Math.random(), 12);

const publicUser = (u) => ({
  name: `${u.firstName} ${u.lastName}`, email: u.email, role: u.role, alumniCode: u.alumniCode,
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const parsed = validateLogin(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { email, password } = parsed.value;

  try {
    const user = await Alumni.findOne({ email }).select("+password");
    const hashToCheck = user ? user.password : DUMMY_HASH;
    const passwordOk  = await bcrypt.compare(password, hashToCheck);

    if (!user) return res.status(401).json(GENERIC);

    // Locked? Same generic answer (don't confirm the account exists).
    if (user.lockUntil && user.lockUntil > new Date()) return res.status(401).json(GENERIC);

    if (!passwordOk) {
      // Atomic increment: safe even if an attacker fires many requests at once.
      const updated = await Alumni.findByIdAndUpdate(user._id, { $inc: { failedLogins: 1 } }, { new: true });
      if (updated.failedLogins >= MAX_FAILS) {
        await Alumni.findByIdAndUpdate(user._id, { lockUntil: new Date(Date.now() + LOCK_MS), failedLogins: 0 });
      }
      return res.status(401).json(GENERIC);
    }

    await Alumni.findByIdAndUpdate(user._id, { failedLogins: 0, lockUntil: null });
    setAuthCookie(res, user);
    return res.json({ message: "Logged in.", user: publicUser(user) });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// POST /api/auth/logout  - invalidates ALL of this user's sessions (tokenVersion++),
// so a stolen token dies too. Clearing the cookie alone would not do that.
router.post("/logout", async (req, res) => {
  try {
    const cfg = require("../config");
    const jwt = require("jsonwebtoken");
    const token = req.cookies && req.cookies[cfg.cookieName];
    if (token) {
      try {
        const p = jwt.verify(token, cfg.jwtSecret, { algorithms: ["HS256"] });
        await Alumni.findByIdAndUpdate(p.sub, { $inc: { tokenVersion: 1 } });
      } catch (_) { /* expired/invalid token: just clear the cookie */ }
    }
    clearAuthCookie(res);
    return res.json({ message: "Logged out." });
  } catch (err) {
    return res.status(500).json({ error: "Server error." });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
