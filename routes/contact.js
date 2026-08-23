const express = require("express");
const { query } = require("../db");
const { sendContactNotification } = require("../lib/email");

const router = express.Router();

// POST /api/contact — stored in the DB regardless of whether email is
// configured, so a message is never lost just because SMTP isn't set up yet.
router.post("/", async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
  if (!email || !String(email).trim()) return res.status(400).json({ error: "Email is required" });
  if (!message || !String(message).trim()) return res.status(400).json({ error: "Message is required" });
  if (String(message).length > 5000) return res.status(400).json({ error: "Message is too long" });

  const cleaned = {
    name: String(name).trim().slice(0, 200),
    email: String(email).trim().slice(0, 200),
    subject: (subject && String(subject).trim().slice(0, 200)) || "General Inquiry",
    message: String(message).trim(),
  };

  try {
    const { rows } = await query(
      `INSERT INTO contact_messages (name, email, subject, message) VALUES ($1,$2,$3,$4) RETURNING id`,
      [cleaned.name, cleaned.email, cleaned.subject, cleaned.message]
    );
    sendContactNotification(cleaned);
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send your message — please try again." });
  }
});

module.exports = router;
