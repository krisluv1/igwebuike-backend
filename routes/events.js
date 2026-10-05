const express = require("express");
const Booking = require("../models/Booking");
const { authenticate, requireRole } = require("../middleware/auth");
const { str } = require("../utils/validators");

const router = express.Router();

// POST /api/events/book  - must be logged in.
// Identity comes from the VERIFIED session (req.user), never from the request body.
// Before, anyone who knew/guessed an alumni code could book as that person.
router.post("/book", authenticate, async (req, res) => {
  const eventName = str(req.body.eventName, 100);
  const phone     = str(req.body.phone, 20);
  if (!eventName || !phone) return res.status(400).json({ error: "Please provide the event and a valid phone number." });

  try {
    await Booking.create({
      eventName, phone,
      fullName:   `${req.user.firstName} ${req.user.lastName}`,
      alumniCode: req.user.alumniCode,
    });
    return res.status(201).json({
      message: `Booking confirmed! Your spot for "${eventName}" has been reserved.`,
      name: req.user.firstName, event: eventName,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `You have already booked a spot for "${eventName}".` });
    console.error("Booking error:", err.message);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// GET /api/events/bookings  - ADMIN ONLY (was completely open before).
router.get("/bookings", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ createdAt: -1 }).limit(500);
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ error: "Could not fetch bookings." });
  }
});

module.exports = router;
