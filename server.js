// Entry point: connect to the database, start listening, shut down cleanly.
const cfg      = require("./config");
const mongoose = require("mongoose");
const app      = require("./app");

mongoose.connect(cfg.mongoUri)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    const server = app.listen(cfg.port, () => console.log(`🚀 Server running on port ${cfg.port}`));

    // Graceful shutdown: Docker/Render send SIGTERM on redeploy. Finish in-flight
    // requests, close the DB, then exit - instead of dropping users mid-request.
    const shutdown = () => {
      console.log("Shutting down...");
      server.close(() => mongoose.disconnect().then(() => process.exit(0)));
      setTimeout(() => process.exit(1), 10000).unref();   // hard stop if it hangs
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((err) => { console.error("❌ MongoDB connection failed:", err.message); process.exit(1); });
