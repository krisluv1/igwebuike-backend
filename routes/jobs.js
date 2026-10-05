const express = require("express");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Alumni = require("../models/Alumni");
const { authenticate } = require("../middleware/auth");
const { jobPostLimiter, applyLimiter } = require("../middleware/rateLimiter");
const R = require("../utils/jobRules");
const cfg = require("../config");
const RecEvent = require("../models/RecEvent");
const { createMlClient } = require("../utils/mlClient");
const { fallbackRank } = require("../utils/fallbackRank");
const { eventLimiter } = require("../middleware/rateLimiter");

const ml = createMlClient({ url: cfg.mlServiceUrl, key: cfg.mlInternalKey });

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;

const isOwner = (job, user) => String(job.postedBy) === String(user._id);
const canManage = (job, user) => user.role === "admin" || isOwner(job, user);

// Public view of a job: no emails, poster shown as "Ada O."
const publicJob = (j) => ({
  id: String(j._id), title: j.title, company: j.company, location: j.location, type: j.type,
  description: j.description, skills: j.skills, applyUrl: j.applyUrl,
  postedBy: j.postedBy && j.postedBy.firstName ? `${j.postedBy.firstName} ${j.postedBy.lastName.charAt(0)}.` : "",
  createdAt: j.createdAt, expiresAt: j.expiresAt,
});

// ─── GET /api/jobs  (public: published, unexpired jobs only) ─────────────────
router.get("/", async (req, res) => {
  try {
    const { page, limit, skip } = R.parsePagination(req.query);
    const filter = { status: "published", expiresAt: { $gt: new Date() } };

    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    if (q) filter.$text = { $search: q };
    if (typeof req.query.type === "string" && R.JOB_TYPES.includes(req.query.type)) filter.type = req.query.type;
    if (typeof req.query.skill === "string") {
      const s = R.normalizeSkills([req.query.skill]);
      if (s && s.length) filter.skills = s[0];
    }
    if (typeof req.query.location === "string" && req.query.location.trim()) {
      filter.location = new RegExp(R.escapeRegex(req.query.location.trim().slice(0, 40)), "i");
    }

    const [items, total] = await Promise.all([
      Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
         .populate("postedBy", "firstName lastName").lean(),
      Job.countDocuments(filter),
    ]);
    res.json({ jobs: items.map(publicJob), page, limit, total });
  } catch (err) {
    console.error("List jobs error:", err.message);
    res.status(500).json({ error: "Could not load jobs." });
  }
});

// ─── POST /api/jobs  (any logged-in user) ────────────────────────────────────
// Employers/admins publish immediately. EVERYONE ELSE is moderated: otherwise the
// portal becomes a channel for fake jobs and phishing aimed at your own alumni.
router.post("/", authenticate, jobPostLimiter, async (req, res) => {
  const parsed = R.validateJob(req.body);
  if (parsed.errors) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
  try {
    const trusted = ["employer", "admin"].includes(req.user.role);
    const job = await Job.create({
      ...parsed.value,
      status: trusted ? "published" : "pending",     // server decides, never the client
      postedBy: req.user._id,                        // owner = the session user, never the body
      expiresAt: new Date(Date.now() + 60 * DAY),
    });
    res.status(201).json({
      id: String(job._id), status: job.status,
      message: trusted ? "Job published." : "Thanks! Your job will appear once an administrator approves it.",
    });
  } catch (err) {
    console.error("Create job error:", err.message);
    res.status(500).json({ error: "Could not create job." });
  }
});

// ─── GET /api/jobs/mine  (must be declared BEFORE "/:id") ────────────────────
router.get("/mine", authenticate, async (req, res) => {
  try {
    const jobs = await Job.find({ postedBy: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    const counts = await Application.aggregate([
      { $match: { job: { $in: jobs.map((j) => j._id) } } },
      { $group: { _id: "$job", n: { $sum: 1 } } },
    ]);
    const byJob = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json(jobs.map((j) => ({ ...publicJob(j), status: j.status, applicationCount: byJob[String(j._id)] || 0 })));
  } catch (err) {
    res.status(500).json({ error: "Could not load your jobs." });
  }
});

// ─── GET /api/jobs/recommended  (must be declared BEFORE "/:id") ──────────────
// Ranks open jobs for the logged-in user. Only skills/occupation/bio text goes to the ML service
// (no name, email or id). If the service is down/slow, we fall back to keyword matching.
router.get("/recommended", authenticate, async (req, res) => {
  try {
    const me = await Alumni.findById(req.user._id).select("skills bio occupation").lean();
    const profile = { skills: (me && me.skills) || [], occupation: (me && me.occupation) || "", bio: (me && me.bio) || "" };
    if (!profile.skills.length && !profile.bio && !profile.occupation) {
      return res.json({ recommendations: [], needsProfile: true, model: null });
    }
    const applied = await Application.distinct("job", { applicant: req.user._id });
    const candidates = await Job.find({ status: "published", expiresAt: { $gt: new Date() },
        postedBy: { $ne: req.user._id }, _id: { $nin: applied } })
      .sort({ createdAt: -1 }).limit(300).populate("postedBy", "firstName lastName").lean();
    const payload = candidates.map((j) => ({ id: String(j._id), title: j.title, skills: j.skills, description: j.description }));

    let ranked = await ml.rank({ profile, jobs: payload, k: 10 });
    let model;
    if (ranked) { model = ranked.model; }
    else { ranked = { results: fallbackRank(profile, payload, 10) }; model = "fallback-keyword"; }

    const byId = new Map(candidates.map((j) => [String(j._id), j]));
    res.json({
      model, needsProfile: false,
      recommendations: ranked.results.map((r, i) => ({ rank: i + 1, score: r.score, matched: r.matched, job: publicJob(byId.get(r.id)) })),
    });
  } catch (err) {
    console.error("Recommend error:", err.message);
    res.status(500).json({ error: "Could not load recommendations." });
  }
});

// ─── POST /api/jobs/recommendations/events  { jobId, action, rank, model } ───
router.post("/recommendations/events", authenticate, eventLimiter, async (req, res) => {
  const { jobId, action, rank, model } = req.body || {};
  if (!R.isObjectId(jobId) || !["view", "apply", "dismiss"].includes(action) ||
      !Number.isInteger(rank) || rank < 1 || rank > 50 || typeof model !== "string" || !model || model.length > 60) {
    return res.status(400).json({ error: "Invalid event." });
  }
  try {
    await RecEvent.create({ user: req.user._id, job: jobId, action, rank, model });
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Could not record event." });
  }
});

// ─── GET /api/jobs/:id  (public, published only) ─────────────────────────────
router.get("/:id", async (req, res) => {
  if (!R.isObjectId(req.params.id)) return res.status(404).json({ error: "Job not found." });
  try {
    const job = await Job.findOne({ _id: req.params.id, status: "published", expiresAt: { $gt: new Date() } })
      .populate("postedBy", "firstName lastName").lean();
    if (!job) return res.status(404).json({ error: "Job not found." });
    res.json(publicJob(job));
  } catch (err) {
    res.status(500).json({ error: "Could not load job." });
  }
});

// ─── PATCH /api/jobs/:id/close  (owner or admin) ─────────────────────────────
// Not-yours and does-not-exist both return 404, so attackers cannot probe which IDs exist (IDOR).
router.patch("/:id/close", authenticate, async (req, res) => {
  if (!R.isObjectId(req.params.id)) return res.status(404).json({ error: "Job not found." });
  try {
    const job = await Job.findById(req.params.id);
    if (!job || !canManage(job, req.user)) return res.status(404).json({ error: "Job not found." });
    job.status = "closed";
    await job.save();
    res.json({ message: "Job closed." });
  } catch (err) {
    res.status(500).json({ error: "Could not close job." });
  }
});

// ─── POST /api/jobs/:id/apply ────────────────────────────────────────────────
router.post("/:id/apply", authenticate, applyLimiter, async (req, res) => {
  if (!R.isObjectId(req.params.id)) return res.status(404).json({ error: "Job not found." });
  const parsed = R.validateApplication(req.body);
  if (parsed.errors) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
  try {
    const job = await Job.findOne({ _id: req.params.id, status: "published", expiresAt: { $gt: new Date() } });
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (isOwner(job, req.user)) return res.status(400).json({ error: "You cannot apply to your own job." });

    let referrer = null;
    if (parsed.value.referrerCode) {
      const ref = await Alumni.findOne({ alumniCode: parsed.value.referrerCode }).select("_id");
      if (!ref) return res.status(400).json({ error: "Referrer code not found." });
      if (String(ref._id) === String(req.user._id)) return res.status(400).json({ error: "You cannot refer yourself." });
      referrer = ref._id;
    }

    await Application.create({
      job: job._id, applicant: req.user._id, referrer,
      coverNote: parsed.value.coverNote, cvUrl: parsed.value.cvUrl,
    });
    res.status(201).json({ message: "Application submitted." });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "You have already applied to this job." });
    console.error("Apply error:", err.message);
    res.status(500).json({ error: "Could not submit application." });
  }
});

// ─── GET /api/jobs/:id/applications  (owner or admin) ────────────────────────
router.get("/:id/applications", authenticate, async (req, res) => {
  if (!R.isObjectId(req.params.id)) return res.status(404).json({ error: "Job not found." });
  try {
    const job = await Job.findById(req.params.id).select("postedBy");
    if (!job || !canManage(job, req.user)) return res.status(404).json({ error: "Job not found." });

    const apps = await Application.find({ job: job._id }).sort({ createdAt: -1 }).limit(200)
      .populate("applicant", "firstName lastName email department gradYear occupation location")
      .populate("referrer", "firstName lastName alumniCode").lean();
    res.json(apps.map((a) => ({
      id: String(a._id), status: a.status, coverNote: a.coverNote, cvUrl: a.cvUrl, createdAt: a.createdAt,
      applicant: a.applicant && {
        name: `${a.applicant.firstName} ${a.applicant.lastName}`, email: a.applicant.email,
        department: a.applicant.department, gradYear: a.applicant.gradYear,
        occupation: a.applicant.occupation, location: a.applicant.location,
      },
      referrer: a.referrer ? `${a.referrer.firstName} ${a.referrer.lastName.charAt(0)}. (${a.referrer.alumniCode})` : null,
    })));
  } catch (err) {
    res.status(500).json({ error: "Could not load applications." });
  }
});

module.exports = router;
