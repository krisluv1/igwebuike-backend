const express = require("express");
const Application = require("../models/Application");
const Job = require("../models/Job");
const { authenticate } = require("../middleware/auth");
const R = require("../utils/jobRules");

const router = express.Router();

// GET /api/applications/mine - an applicant's own applications and their status.
router.get("/mine", authenticate, async (req, res) => {
  try {
    const apps = await Application.find({ applicant: req.user._id }).sort({ createdAt: -1 }).limit(100)
      .populate("job", "title company status").lean();
    res.json(apps.map((a) => ({
      id: String(a._id), status: a.status, createdAt: a.createdAt,
      job: a.job ? { id: String(a.job._id), title: a.job.title, company: a.job.company } : null,
    })));
  } catch (err) {
    res.status(500).json({ error: "Could not load your applications." });
  }
});

// PATCH /api/applications/:id/status - ONLY the job's owner (or an admin), and only legal transitions.
router.patch("/:id/status", authenticate, async (req, res) => {
  if (!R.isObjectId(req.params.id)) return res.status(404).json({ error: "Application not found." });
  const to = req.body && req.body.status;
  if (typeof to !== "string" || !R.STATUSES.includes(to)) return res.status(400).json({ error: "Invalid status." });
  try {
    const app = await Application.findById(req.params.id);
    const job = app && await Job.findById(app.job).select("postedBy");
    // Applicant tries to change their own application, or a stranger guesses an ID => 404 (IDOR defence).
    if (!app || !job || (req.user.role !== "admin" && String(job.postedBy) !== String(req.user._id))) {
      return res.status(404).json({ error: "Application not found." });
    }
    if (!R.canTransition(app.status, to)) {
      return res.status(409).json({ error: `Cannot move an application from "${app.status}" to "${to}".` });
    }
    app.status = to;
    await app.save();
    res.json({ message: "Status updated.", status: to });
  } catch (err) {
    res.status(500).json({ error: "Could not update status." });
  }
});

module.exports = router;
