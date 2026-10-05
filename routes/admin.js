const express = require("express");
const Job = require("../models/Job");
const { authenticate, requireRole } = require("../middleware/auth");
const R = require("../utils/jobRules");

const router = express.Router();
router.use(authenticate, requireRole("admin"));      // EVERY route below is admin-only

// GET /api/admin/jobs/pending - the moderation queue
router.get("/jobs/pending", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "pending" }).sort({ createdAt: 1 }).limit(100)
      .populate("postedBy", "firstName lastName email").lean();
    res.json(jobs.map((j) => ({
      id: String(j._id), title: j.title, company: j.company, location: j.location, type: j.type,
      description: j.description, skills: j.skills, applyUrl: j.applyUrl, createdAt: j.createdAt,
      postedBy: j.postedBy ? `${j.postedBy.firstName} ${j.postedBy.lastName} <${j.postedBy.email}>` : "",
    })));
  } catch (err) {
    res.status(500).json({ error: "Could not load pending jobs." });
  }
});

// PATCH /api/admin/jobs/:id/moderate  { action: "approve" | "reject" }
router.patch("/jobs/:id/moderate", async (req, res) => {
  if (!R.isObjectId(req.params.id)) return res.status(404).json({ error: "Job not found." });
  const action = req.body && req.body.action;
  if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "Action must be approve or reject." });
  try {
    // Atomic: only a job that is STILL pending can be moderated (no double-moderation races).
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { status: action === "approve" ? "published" : "rejected" }, { new: true });
    if (!job) return res.status(409).json({ error: "Job not found or already moderated." });
    res.json({ message: `Job ${job.status}.`, status: job.status });
  } catch (err) {
    res.status(500).json({ error: "Could not moderate job." });
  }
});

module.exports = router;
