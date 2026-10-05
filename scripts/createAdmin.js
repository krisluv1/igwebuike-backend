// Admin accounts can NEVER be made through the public API (prevents privilege escalation).
// Run once from your own machine:
//   ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='a long passphrase' node scripts/createAdmin.js
const cfg = require("../config");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Alumni = require("../models/Alumni");
const { validatePassword } = require("../utils/password");

(async () => {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || "";
  const problem = !email ? "ADMIN_EMAIL is required." : validatePassword(pw, { email });
  if (problem) { console.error(problem); process.exit(1); }

  await mongoose.connect(cfg.mongoUri);
  await Alumni.create({
    firstName: "Site", lastName: "Admin", email, password: await bcrypt.hash(pw, 12),
    gradYear: new Date().getFullYear(), department: "Administration",
    alumniCode: "IWU-ADM-00-0000", role: "admin", consentAt: new Date(),
  });
  console.log("Admin created:", email);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
