const mongoose = require("mongoose");

// Feedback log for recommendations (view / apply / dismiss). This is the data that will let us
// evaluate the matcher on REAL behaviour later (offline metrics -> online metrics).
// Stored: who (id only), which job, which rank, which model version. No text content.
const recEventSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: "Alumni", required: true },
  job:    { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  action: { type: String, enum: ["view", "apply", "dismiss"], required: true },
  rank:   { type: Number, min: 1, max: 50, required: true },
  model:  { type: String, maxlength: 60, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
recEventSchema.index({ user: 1, createdAt: -1 });
recEventSchema.index({ model: 1, action: 1 });

module.exports = mongoose.model("RecEvent", recEventSchema);
