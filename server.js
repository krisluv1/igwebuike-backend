// =============================================
//  IgwebuIke Alumni Network — Express Backend
// =============================================

require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");

const alumniRoutes  = require("./routes/alumni");
const eventRoutes   = require("./routes/events");
const { registerLimiter, bookingLimiter } = require("./middleware/rateLimiter");

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// CORS: allow requests from your frontend URL
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
  ],
  methods: ["GET", "POST"],
  credentials: true,
}));

app.use(express.json());         // parse JSON request bodies
app.use(express.urlencoded({ extended: false }));

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check — useful for Render to confirm the server is alive
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "IgwebuIke API is running ✅" });
});

// Apply rate limiters to the sensitive routes only
app.use("/api/alumni/register", registerLimiter);
app.use("/api/events/book",     bookingLimiter);

// Mount route handlers
app.use("/api/alumni", alumniRoutes);
app.use("/api/events", eventRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "An unexpected error occurred." });
});

// ─── Connect to MongoDB, then start server ────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
