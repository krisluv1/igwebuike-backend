const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    eventName:  { type: String, required: true, maxlength: 100 },
    fullName:   { type: String, required: true, trim: true },
    alumniCode: { type: String, required: true, trim: true },
    phone:      { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// The DATABASE enforces "one booking per person per event". The old
// "check then insert" code had a race condition: two simultaneous requests
// could both pass the check. A unique index makes that impossible.
bookingSchema.index({ eventName: 1, alumniCode: 1 }, { unique: true });

module.exports = mongoose.model("Booking", bookingSchema);
