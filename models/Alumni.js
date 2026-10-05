const mongoose = require("mongoose");

const alumniSchema = new mongoose.Schema(
  {
    firstName:  { type: String, required: true, trim: true, maxlength: 50 },
    lastName:   { type: String, required: true, trim: true, maxlength: 50 },
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select:false => the hash is NEVER returned by a query unless we explicitly
    // ask for it (.select("+password")). Prevents accidental leaks in API responses.
    password:   { type: String, required: true, select: false },
    gradYear:   { type: Number, required: true },
    department: { type: String, required: true, trim: true },
    phone:      { type: String, default: "" },
    location:   { type: String, default: "Nigeria" },
    occupation: { type: String, default: "" },
    skills:     { type: [String], default: [] },                 // normalised; used for job matching
    bio:        { type: String, default: "", maxlength: 500 },
    alumniCode: { type: String, required: true, unique: true },

    // --- Security fields ---
    role:         { type: String, enum: ["alumni", "employer", "admin"], default: "alumni" },
    failedLogins: { type: Number, default: 0 },          // brute-force counter
    lockUntil:    { type: Date,   default: null },       // temporary account lock
    tokenVersion: { type: Number, default: 0 },          // bump to revoke all sessions
    consentAt:    { type: Date,   required: true },      // when they accepted the privacy policy
  },
  { timestamps: true }
);

module.exports = mongoose.model("Alumni", alumniSchema);
