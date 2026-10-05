// The Express APP (no network, no database connection here).
// Keeping this separate from server.js lets tests import the app and call it
// directly, without opening a port. This is a standard testability pattern.
const cfg           = require("./config");
const express       = require("express");
const mongoose      = require("mongoose");
const cors          = require("cors");
const helmet        = require("helmet");
const cookieParser  = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");

const authRoutes   = require("./routes/auth");
const alumniRoutes = require("./routes/alumni");
const eventRoutes  = require("./routes/events");
const jobRoutes    = require("./routes/jobs");
const applicationRoutes = require("./routes/applications");
const adminRoutes  = require("./routes/admin");
const { registerLimiter, bookingLimiter, loginLimiter } = require("./middleware/rateLimiter");
const { originGuard } = require("./middleware/originGuard");

const app = express();

// Behind Render's proxy: use the real client IP for rate limiting.
app.set("trust proxy", 1);

// ─── Security middleware (order matters) ──────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: cfg.allowedOrigins, methods: ["GET", "POST", "PATCH"], credentials: true }));
app.use(originGuard(cfg.allowedOrigins));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use(mongoSanitize());

// ─── Health checks ────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", message: "IgwebuIke API is running ✅" }));
// Readiness: 200 only if the database is connected. Used by Docker/orchestrators.
app.get("/healthz", (req, res) =>
  mongoose.connection.readyState === 1 ? res.json({ status: "ready" }) : res.status(503).json({ status: "db-unavailable" }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth/login",      loginLimiter);
app.use("/api/alumni/register", registerLimiter);
app.use("/api/events/book",     bookingLimiter);

app.use("/api/auth",   authRoutes);
app.use("/api/alumni", alumniRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/jobs",         jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/admin",        adminRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found." }));

// Global error handler. Client mistakes (bad JSON, body too large) are 4xx, not 500.
// Details are logged privately; the client never sees stack traces or internals.
app.use((err, req, res, next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error("Unhandled error:", err.message);
  const msg = status === 413 ? "Request too large." : status < 500 ? "Bad request." : "An unexpected error occurred.";
  res.status(status).json({ error: msg });
});

module.exports = app;
