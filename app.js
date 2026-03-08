/**
 * app.js
 * DrugCheck Nigeria — WhatsApp Drug Verification Bot
 *
 * Entry point. Sets up Express, middleware, and routes.
 *
 * How it works:
 *   1. Twilio receives a WhatsApp message from a user
 *   2. Twilio POSTs the message payload to /webhook on this server
 *   3. We parse the NAFDAC number, look it up, and reply with TwiML XML
 *   4. Twilio sends the reply back to the user on WhatsApp
 */

require("dotenv").config(); // Load .env variables first

const express = require("express");
const webhookRouter = require("./routes/webhook");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Parse URL-encoded form data — Twilio sends POST bodies in this format
app.use(express.urlencoded({ extended: false }));

// Parse JSON bodies as well (useful for testing via curl/Postman)
app.use(express.json());

// Simple request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Root health check — confirms the server is running
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "DrugCheck Nigeria",
    version: "1.0.0",
    description: "WhatsApp Drug Verification Bot powered by NAFDAC data",
    endpoints: {
      health: "GET /",
      webhook: "POST /webhook  (Twilio WhatsApp webhook)",
    },
  });
});

// Twilio WhatsApp webhook route
app.use("/webhook", webhookRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] UNHANDLED ERROR →`, err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("════════════════════════════════════════════");
  console.log("  DrugCheck Nigeria — WhatsApp Bot Server");
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Webhook URL: http://localhost:${PORT}/webhook`);
  console.log("════════════════════════════════════════════");
});

module.exports = app; // Export for testing
