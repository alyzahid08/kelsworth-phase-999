// Receives inbound WhatsApp messages from Meta's Cloud API so a customer
// can confirm their COD order by simply replying "YES" — no link tap needed.
// This is optional infrastructure: the confirmation link sent by
// lib/whatsapp.js works standalone even if this webhook is never configured
// on Meta's side. Set WHATSAPP_VERIFY_TOKEN and point your Meta app's
// webhook at POST/GET /api/webhooks/whatsapp to enable it.
const express = require("express");
const { query } = require("../db");
const { normalizePkPhone } = require("../lib/whatsapp");

const router = express.Router();

const CONFIRM_PATTERN = /^\s*(yes|y|haan|han|ok|okay|confirm(ed)?)\s*[.!]?\s*$/i;

// GET /api/webhooks/whatsapp — Meta's one-time subscription handshake.
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/webhooks/whatsapp — inbound message events.
// Must always respond 200 quickly, or Meta will retry/disable the webhook.
router.post("/", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const messages = value?.messages;
    if (!messages || !messages.length) return; // status callbacks, etc. — nothing to do

    for (const msg of messages) {
      if (msg.type !== "text") continue;
      const from = normalizePkPhone(msg.from);
      const body = msg.text?.body || "";
      if (!CONFIRM_PATTERN.test(body)) continue;

      // Confirm the customer's most recent still-pending COD order on this phone.
      const { rows } = await query(
        `UPDATE orders SET confirmation_status = 'confirmed', confirmed_at = now()
         WHERE id = (
           SELECT id FROM orders
           WHERE confirmation_status = 'pending'
             AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || right($1, 10)
           ORDER BY created_at DESC LIMIT 1
         )
         RETURNING order_number`,
        [from]
      );
      if (rows.length) {
        console.log(`[whatsapp] Order ${rows[0].order_number} confirmed by WhatsApp reply from ${from}`);
      }
    }
  } catch (err) {
    console.error("[whatsapp webhook] Failed to process inbound message:", err.message);
  }
});

module.exports = router;
