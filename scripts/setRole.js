// Promote/demote a user. Only someone with server access can run this - there is deliberately no API for it.
//   ROLE_EMAIL=company@x.com ROLE=employer npm run set-role      (employer = jobs publish without review)
const cfg = require("../config");
const mongoose = require("mongoose");
const Alumni = require("../models/Alumni");

(async () => {
  const email = (process.env.ROLE_EMAIL || "").toLowerCase();
  const role = process.env.ROLE;
  if (!email || !["alumni", "employer", "admin"].includes(role)) {
    console.error("Set ROLE_EMAIL and ROLE (alumni | employer | admin)."); process.exit(1);
  }
  await mongoose.connect(cfg.mongoUri);
  // tokenVersion++ also ends their existing sessions, so the change is felt immediately.
  const u = await Alumni.findOneAndUpdate({ email }, { role, $inc: { tokenVersion: 1 } }, { new: true });
  console.log(u ? `${email} is now ${u.role}` : "No such user.");
  process.exit(u ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
