const mongoose = require("mongoose");
const { STATUSES } = require("../utils/jobRules");

const applicationSchema = new mongoose.Schema(
  {
    job:       { type: mongoose.Schema.Types.ObjectId, ref: "Job",    required: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: "Alumni", required: true },
    referrer:  { type: mongoose.Schema.Types.ObjectId, ref: "Alumni", default: null },  // alumni referral
    coverNote: { type: String, required: true, maxlength: 2000 },
    cvUrl:     { type: String, default: "" },
    status:    { type: String, enum: STATUSES, default: "submitted" },
  },
  { timestamps: true }
);

// One application per person per job, enforced by the DATABASE (no race conditions).
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });
applicationSchema.index({ applicant: 1, createdAt: -1 });

module.exports = mongoose.model("Application", applicationSchema);
