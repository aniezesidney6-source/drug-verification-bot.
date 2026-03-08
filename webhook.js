/**
 * routes/webhook.js
 * Handles incoming WhatsApp messages from Twilio's webhook.
 *
 * Twilio sends a POST request with the following key fields:
 *   - Body:  The text the user sent
 *   - From:  Sender's WhatsApp number (e.g. "whatsapp:+2348012345678")
 *   - To:    Your Twilio sandbox number
 *
 * This route:
 *   1. Parses the incoming message
 *   2. Determines intent (greeting | help | report | nafdac lookup | fallback)
 *   3. Calls the appropriate service
 *   4. Returns a TwiML XML response Twilio sends back to the user
 */

const express = require("express");
const router = express.Router();
const twilio = require("twilio");

const { lookupDrug } = require("../services/drugLookup");
const { saveReport } = require("../services/reportService");
const {
  welcomeMessage,
  helpMessage,
  verifiedMessage,
  notFoundMessage,
  suspiciousMessage,
  invalidFormatMessage,
  reportReceivedMessage,
  fallbackMessage,
} = require("../services/messageBuilder");
const { logVerification, logReport, logEvent, logError } = require("../services/logger");

// ─── Intent Detection ────────────────────────────────────────────────────────

/** Keywords that trigger the welcome/greeting flow */
const GREETING_KEYWORDS = ["hi", "hello", "hey", "start", "helo", "hii", "hy", "yo", "sup"];

/** Detect if a message is a greeting */
function isGreeting(text) {
  return GREETING_KEYWORDS.includes(text.toLowerCase().trim());
}

/** Detect if a message is a HELP command */
function isHelpCommand(text) {
  return text.trim().toUpperCase() === "HELP";
}

/**
 * Detect if a message is a REPORT command.
 * Format: "REPORT A4-1234" or just "REPORT"
 *
 * @returns {{ isReport: boolean, nafdacNo: string }}
 */
function parseReportCommand(text) {
  const upper = text.trim().toUpperCase();
  if (!upper.startsWith("REPORT")) return { isReport: false, nafdacNo: "" };

  // Extract everything after "REPORT"
  const parts = text.trim().split(/\s+/);
  const nafdacNo = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { isReport: true, nafdacNo };
}

// ─── TwiML Helper ────────────────────────────────────────────────────────────

/**
 * Wraps a message string in a TwiML MessagingResponse and returns the XML.
 * Twilio requires this format to send a reply.
 *
 * @param {string} message
 * @returns {string} TwiML XML string
 */
function buildTwimlResponse(message) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  return twiml.toString();
}

// ─── Main Webhook Handler ────────────────────────────────────────────────────

/**
 * POST /webhook
 * Entry point for all incoming WhatsApp messages.
 */
router.post("/", (req, res) => {
  try {
    // Extract fields from Twilio's POST body
    const rawBody = req.body.Body || "";
    const from = req.body.From || "unknown";
    const body = rawBody.trim();

    // Always log the incoming message
    logEvent("INCOMING_MSG", from, `body="${body}"`);

    let replyText = "";

    // ── 1. Empty message ──────────────────────────────────────────────
    if (!body) {
      logEvent("EMPTY_MSG", from);
      replyText = welcomeMessage();

    // ── 2. Greeting ───────────────────────────────────────────────────
    } else if (isGreeting(body)) {
      logEvent("GREETING", from);
      replyText = welcomeMessage();

    // ── 3. HELP command ───────────────────────────────────────────────
    } else if (isHelpCommand(body)) {
      logEvent("HELP_CMD", from);
      replyText = helpMessage();

    // ── 4. REPORT command ─────────────────────────────────────────────
    } else if (parseReportCommand(body).isReport) {
      const { nafdacNo } = parseReportCommand(body);
      logReport(from, nafdacNo);

      const { success } = saveReport(from, nafdacNo, body);
      replyText = success
        ? reportReceivedMessage(nafdacNo)
        : "⚠️ Sorry, we couldn't save your report right now. Please try again later.";

    // ── 5. NAFDAC number lookup ───────────────────────────────────────
    } else {
      const result = lookupDrug(body);
      const { status, drug, normalizedNo } = result;

      logVerification(from, body, normalizedNo, status);

      switch (status) {
        case "verified":
          replyText = verifiedMessage(drug);
          break;

        case "suspicious":
          replyText = suspiciousMessage(drug);
          break;

        case "not_found":
          replyText = notFoundMessage(normalizedNo);
          break;

        case "invalid_format":
          replyText = invalidFormatMessage(body);
          break;

        default:
          replyText = fallbackMessage();
      }
    }

    // Send TwiML response back to Twilio
    res.set("Content-Type", "text/xml");
    res.send(buildTwimlResponse(replyText));

  } catch (err) {
    logError("webhook.post", err);
    // Even on error, return a valid TwiML so Twilio doesn't retry indefinitely
    res.set("Content-Type", "text/xml");
    res.send(
      buildTwimlResponse(
        "⚠️ Sorry, something went wrong on our end. Please try again in a moment."
      )
    );
  }
});

// ─── Health Check for Webhook Route ──────────────────────────────────────────

/**
 * GET /webhook
 * Simple health check so you can verify the route is reachable.
 * Twilio sends a GET before registering a webhook URL.
 */
router.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "DrugCheck Nigeria WhatsApp Bot",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
