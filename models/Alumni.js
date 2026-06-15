const mongoose = require("mongoose");

const alumniSchema = new mongoose.Schema(
  {
    firstName:  { type: String, required: true, trim: true },
    lastName:   { type: String, required: true, trim: true },
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:   { type: String, required: true },          // bcrypt hash
    gradYear:   { type: Number, required: true },
    department: { type: String, required: true, trim: true },
    phone:      { type: String, default: "" },
    location:   { type: String, default: "Nigeria" },
    occupation: { type: String, default: "" },
    alumniCode: { type: String, required: true, unique: true },
  },
  { timestamps: true }   // adds createdAt, updatedAt automatically
);

module.exports = mongoose.model("Alumni", alumniSchema);
