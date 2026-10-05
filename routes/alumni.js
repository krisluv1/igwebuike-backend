const express = require("express");
const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const Alumni  = require("../models/Alumni");
const { validateRegistration } = require("../utils/validators");
const { setAuthCookie } = require("../utils/tokens");
const { authenticate } = require("../middleware/auth");
const { validateProfileUpdate } = require("../utils/profileRules");

const router = express.Router();

const DEPT_MAP = {
  "computer science": "CSC", "electrical engineering": "EEE", "mechanical engineering": "MEE",
  "accounting": "ACC", "business administration": "BUS", "computer engineering": "CME",
  "veterinary medicine": "VET", "industrial chemistry": "CHM",
  "agricultural engineering": "AGR", "agric economics": "AEC",
};

function deptAbbrev(dept) {
  const lower = dept.toLowerCase();
  for (const [key, abbr] of Object.entries(DEPT_MAP)) if (lower.includes(key)) return abbr;
  return dept.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
}

// crypto.randomInt is cryptographically secure; Math.random() is predictable.
// The code is now just an identifier, NOT a credential (login is by password).
function generateCode(dept, year) {
  return `IWU-${deptAbbrev(dept)}-${String(year).slice(-2)}-${crypto.randomInt(1000, 10000)}`;
}

// POST /api/alumni/register
router.post("/register", async (req, res) => {
  const parsed = validateRegistration(req.body);
  if (parsed.errors) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
  const v = parsed.value;

  try {
    const hashed = await bcrypt.hash(v.password, 12); // cost 12 = ~250ms: fine for users, slow for attackers

    // Retry on the (rare) alumniCode collision. The unique index is the real guard.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const alumni = await Alumni.create({
          firstName: v.firstName, lastName: v.lastName, email: v.email, password: hashed,
          gradYear: v.gradYear, department: v.department, phone: v.phone,
          location: v.location, occupation: v.occupation,
          alumniCode: generateCode(v.department, v.gradYear),
          role: "alumni",              // ALWAYS server-decided
          consentAt: new Date(),
        });
        setAuthCookie(res, alumni);    // log them in straight away
        return res.status(201).json({
          message: "Registration successful!", alumniCode: alumni.alumniCode,
          name: `${v.firstName} ${v.lastName}`, department: v.department, gradYear: v.gradYear,
        });
      } catch (err) {
        if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
          return res.status(409).json({ error: "An account with this email already exists." });
        }
        if (err.code !== 11000) throw err; // duplicate alumniCode => loop and try again
      }
    }
    return res.status(500).json({ error: "Could not generate an alumni code. Try again." });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// GET /api/alumni/recent  (public)
// DATA MINIMISATION: this is public, so it must not expose real people's full
// names or IDs. Show "Adaeze N.", department, year; mask the code.
router.get("/recent", async (req, res) => {
  try {
    const recent = await Alumni.find({}).sort({ createdAt: -1 }).limit(10)
      .select("firstName lastName department gradYear alumniCode createdAt");
    return res.json(recent.map((a) => ({
      name: `${a.firstName} ${a.lastName.charAt(0)}.`,
      dept: a.department,
      year: a.gradYear,
      code: a.alumniCode.replace(/\d{4}$/, "••••"),
      mins: Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 60000),
    })));
  } catch (err) {
    console.error("Recent alumni error:", err.message);
    return res.status(500).json({ error: "Could not fetch recent alumni." });
  }
});

// GET /api/alumni/me - my own matching profile
router.get("/me", authenticate, async (req, res) => {
  const me = await Alumni.findById(req.user._id).select("skills occupation bio").lean();
  res.json({ skills: me.skills || [], occupation: me.occupation || "", bio: me.bio || "" });
});

// PATCH /api/alumni/me - update skills / occupation / bio (only these fields, only for yourself)
router.patch("/me", authenticate, async (req, res) => {
  const parsed = validateProfileUpdate(req.body);
  if (parsed.errors) return res.status(400).json({ error: parsed.errors[0] });
  try {
    const me = await Alumni.findByIdAndUpdate(req.user._id, { $set: parsed.value }, { new: true }).select("skills occupation bio").lean();
    res.json({ skills: me.skills, occupation: me.occupation, bio: me.bio });
  } catch (err) {
    res.status(500).json({ error: "Could not update profile." });
  }
});

module.exports = router;
