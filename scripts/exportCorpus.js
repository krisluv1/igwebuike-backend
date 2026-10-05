// Export an ANONYMISED text corpus for training the matcher: only skills/bio/occupation of members
// and job text. No names, emails, ids. Output is a JSON list of strings for `python -m matcher.train --corpus`.
//   node scripts/exportCorpus.js > corpus.json
const cfg = require("../config");
const mongoose = require("mongoose");
const Alumni = require("../models/Alumni");
const Job = require("../models/Job");

(async () => {
  await mongoose.connect(cfg.mongoUri);
  const people = await Alumni.find({}).select("skills occupation bio -_id").lean();
  const jobs = await Job.find({ status: { $in: ["published", "closed"] } }).select("title skills description -_id").lean();
  const texts = [
    ...people.map((p) => [...(p.skills || []), p.occupation || "", p.bio || ""].join(" ").trim()),
    ...jobs.map((j) => [j.title, ...(j.skills || []), j.description].join(" ").trim()),
  ].filter(Boolean);
  process.stdout.write(JSON.stringify(texts));
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
