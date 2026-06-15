const express = require("express");
const Booking = require("../models/Booking");
const Alumni  = require("../models/Alumni");

const router = express.Router();

// ─── POST /api/events/book ────────────────────────────────────────────────────
// Books a spot for an event after verifying the alumni code exists.
router.post("/book", async (req, res) => {
  try {
    const { eventName, fullName, alumniCode, phone } = req.body;

    // --- Validation ---
    if (!eventName || !fullName || !alumniCode || !phone) {
      return res.status(400).json({ error: "Please fill in all fields." });
    }

    // --- Verify alumni code exists in database ---
    const alumniExists = await Alumni.findOne({ alumniCode: alumniCode.trim() });
    if (!alumniExists) {
      return res.status(404).json({
        error: "Alumni code not found. Please register first or check the code."
      });
    }

    // --- Prevent duplicate bookings for the same event ---
    const duplicate = await Booking.findOne({
      eventName,
      alumniCode: alumniCode.trim(),
    });
    if (duplicate) {
      return res.status(409).json({
        error: `You have already booked a spot for "${eventName}".`
      });
    }

    // --- Save booking ---
    const booking = new Booking({ eventName, fullName, alumniCode, phone });
    await booking.save();

    return res.status(201).json({
      message: `Booking confirmed! Your spot for "${eventName}" has been reserved.`,
      name:    fullName,
      event:   eventName,
    });

  } catch (err) {
    console.error("Booking error:", err.message);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ─── GET /api/events/bookings ─────────────────────────────────────────────────
// Returns all bookings (admin view — protect this in production with auth).
router.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ error: "Could not fetch bookings." });
  }
});

module.exports = router;
