const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    eventName:  { type: String, required: true },
    fullName:   { type: String, required: true, trim: true },
    alumniCode: { type: String, required: true, trim: true },
    phone:      { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
