const express  = require("express");
const bcrypt   = require("bcryptjs");
const Alumni   = require("../models/Alumni");

const router = express.Router();

// ─── Helper: generate alumni code ─────────────────────────────────────────────
const DEPT_MAP = {
  "computer science":          "CSC",
  "electrical engineering":    "EEE",
  "mechanical engineering":    "MEE",
  "accounting":                "ACC",
  "business administration":   "BUS",
  "computer engineering":      "CME",
  "veterinary medicine":       "VET",
  "industrial chemistry":      "CHM",
  "agricultural engineering":  "AGR",
  "agric economics":           "AEC",
};

function deptAbbrev(dept) {
  const lower = dept.toLowerCase();
  for (const [key, abbr] of Object.entries(DEPT_MAP)) {
    if (lower.includes(key)) return abbr;
  }
  return dept.slice(0, 3).toUpperCase();
}

function generateCode(dept, year) {
  const abbr = deptAbbrev(dept);
  const yr   = String(year).slice(-2);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `IWU-${abbr}-${yr}-${rand}`;
}

// ─── POST /api/alumni/register ────────────────────────────────────────────────
// Registers a new alumni member and returns their alumni code.
router.post("/register", async (req, res) => {
  try {
    const {
      firstName, lastName, email, password,
      gradYear, department, phone, location, occupation,
    } = req.body;

    // --- Basic validation ---
    if (!firstName || !lastName || !email || !password || !gradYear || !department) {
      return res.status(400).json({ error: "Please fill in all required fields." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    // --- Check duplicate email ---
    const existing = await Alumni.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    // --- Hash password ---
    const hashed = await bcrypt.hash(password, 10);

    // --- Generate unique alumni code (retry if collision) ---
    let alumniCode;
    let tries = 0;
    do {
      alumniCode = generateCode(department, gradYear);
      tries++;
    } while ((await Alumni.findOne({ alumniCode })) && tries < 5);

    // --- Save to database ---
    const alumni = new Alumni({
      firstName, lastName, email,
      password: hashed,
      gradYear: parseInt(gradYear),
      department,
      phone:      phone      || "",
      location:   location   || "Nigeria",
      occupation: occupation || "",
      alumniCode,
    });

    await alumni.save();

    // --- Return success (never return the password hash) ---
    return res.status(201).json({
      message:    "Registration successful!",
      alumniCode,
      name:       `${firstName} ${lastName}`,
      department,
      gradYear,
    });

  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ─── GET /api/alumni/recent ───────────────────────────────────────────────────
// Returns the 10 most recently registered alumni for the live timeline.
// Sensitive fields (email, password) are excluded.
router.get("/recent", async (req, res) => {
  try {
    const recent = await Alumni.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select("firstName lastName department gradYear location alumniCode createdAt");

    const result = recent.map((a) => {
      const diffMs   = Date.now() - new Date(a.createdAt).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      return {
        name:       `${a.firstName} ${a.lastName}`,
        dept:       a.department,
        year:       a.gradYear,
        loc:        a.location || "Nigeria",
        code:       a.alumniCode,
        mins:       diffMins,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error("Recent alumni error:", err.message);
    return res.status(500).json({ error: "Could not fetch recent alumni." });
  }
});

module.exports = router;
