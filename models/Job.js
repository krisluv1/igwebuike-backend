const mongoose = require("mongoose");
const { JOB_TYPES } = require("../utils/jobRules");

const jobSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true, maxlength: 100 },
    company:     { type: String, required: true, trim: true, maxlength: 80 },
    location:    { type: String, required: true, trim: true, maxlength: 80 },
    type:        { type: String, required: true, enum: JOB_TYPES },
    description: { type: String, required: true, maxlength: 5000 },
    skills:      { type: [String], default: [] },            // normalised; reused by the ML matcher
    applyUrl:    { type: String, default: "" },               // optional external link (https only)
    // pending = awaiting admin review; published = visible; rejected; closed = by owner/admin
    status:      { type: String, enum: ["pending", "published", "rejected", "closed"], default: "pending" },
    postedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "Alumni", required: true, index: true },
    expiresAt:   { type: Date, required: true },
  },
  { timestamps: true }
);

// Full-text search (title weighted highest). $text takes the query as DATA, so users
// cannot inject regex or operators the way they could with a hand-built RegExp.
jobSchema.index({ title: "text", company: "text", description: "text", skills: "text" },
                { weights: { title: 5, skills: 4, company: 3, description: 1 } });
jobSchema.index({ status: 1, expiresAt: 1, createdAt: -1 });

module.exports = mongoose.model("Job", jobSchema);
