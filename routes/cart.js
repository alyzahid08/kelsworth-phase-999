const express = require("express");
const { query } = require("../db");
const { attachCustomerIfPresent } = require("../middleware/customerAuth");
const { sendAbandonedCartEmail } = require("../lib/email");
const { sendAbandonedCartWhatsApp } = require("../lib/whatsapp");

const router = express.Router();

// ABANDONED_CART_THRESHOLD_HOURS: if a cart hasn't been updated in this many
// hours, it's considered "abandoned" and eligible for a reminder.
const ABANDONED_CART_THRESHOLD_HOURS = 2;

// POST /api/cart/save — save or update the customer's cart state.
// Called from the frontend on cart changes (add/remove/update qty).
// Uses an upsert pattern keyed on customer_id or email.
router.post("/save", attachCustomerIfPresent, async (req, res) => {
  const { items, customer } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ ok: true }); // empty cart, nothing to track
  }

  const customerId = req.customer ? req.customer.sub : null;
  const email = (customer?.email || req.customer?.email || "").trim().toLowerCase();
  const phone = customer?.phone || "";

  if (!email && !customerId) {
    return res.json({ ok: true }); // can't track without any identifier
  }

  // Compute subtotal from client data (for tracking purposes only —
  // actual prices are revalidated server-side at checkout)
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);

  const cartData = JSON.stringify({ items, subtotal, currency: "PKR" });

  try {
    await query(
      `INSERT INTO abandoned_carts (customer_id, email, phone, cart_data, last_updated, reminder_sent, recovered)
       VALUES ($1, $2, $3, $4, now(), false, false)
       ON CONFLICT ON CONSTRAINT abandoned_carts_pkey DO UPDATE
         SET cart_data = EXCLUDED.cart_data,
             last_updated = now(),
             email = COALESCE(EXCLUDED.email, abandoned_carts.email),
             phone = COALESCE(EXCLUDED.phone, abandoned_carts.phone),
             reminder_sent = false
       -- Note: no unique constraint yet, so use a different approach
      `, 
      [customerId, email || null, phone || null, cartData]
    ).catch(() => {
      // If the upsert fails (no unique constraint), just insert a new row
      return query(
        `INSERT INTO abandoned_carts (customer_id, email, phone, cart_data)
         VALUES ($1, $2, $3, $4)`,
        [customerId, email || null, phone || null, cartData]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    // Never fail the cart save — it's a background tracking feature
    res.json({ ok: true });
  }
});

// POST /api/cart/recover — mark an abandoned cart as recovered (after checkout).
// Called internally by the orders route after a successful checkout.
router.post("/recover", async (req, res) => {
  const { email, customerId, orderId } = req.body || {};
  if (!email && !customerId) return res.json({ ok: true });

  try {
    const clauses = ["recovered = false"];
    const params = [];
    if (customerId) {
      params.push(customerId);
      clauses.push(`customer_id = $${params.length}`);
    }
    if (email) {
      params.push(email);
      clauses.push(`email = $${params.length}`);
    }
    if (!params.length) return res.json({ ok: true });

    params.push(orderId || null);
    await query(
      `UPDATE abandoned_carts SET recovered = true, recovered_order_id = $${params.length}
       WHERE ${clauses.join(" AND ")}
       ORDER BY last_updated DESC LIMIT 1`,
      params
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.json({ ok: true });
  }
});

/**
 * Cron-style function to send abandoned cart reminders.
 * Call this from a scheduler (e.g., node-cron, external cron job calling an API).
 * Finds carts older than the threshold that haven't had a reminder sent.
 */
async function sendAbandonedCartReminders() {
  console.log("[abandoned-cart] Checking for abandoned carts...");
  try {
    const { rows } = await query(
      `SELECT * FROM abandoned_carts
       WHERE recovered = false
         AND reminder_sent = false
         AND last_updated < now() - interval '${ABANDONED_CART_THRESHOLD_HOURS} hours'
       ORDER BY last_updated ASC
       LIMIT 50`
    );

    if (!rows.length) {
      console.log("[abandoned-cart] No abandoned carts to remind.");
      return;
    }

    console.log(`[abandoned-cart] Found ${rows.length} abandoned cart(s) to remind.`);
    for (const cart of rows) {
      // Send email reminder
      sendAbandonedCartEmail(cart);

      // Send WhatsApp reminder if phone is available
      if (cart.phone) {
        sendAbandonedCartWhatsApp(cart.phone, cart.cart_data);
      }

      // Mark as reminded
      await query(
        "UPDATE abandoned_carts SET reminder_sent = true, reminder_sent_at = now() WHERE id = $1",
        [cart.id]
      );
    }

    console.log(`[abandoned-cart] Sent reminders for ${rows.length} cart(s).`);
  } catch (err) {
    console.error("[abandoned-cart] Reminder job failed:", err.message);
  }
}

module.exports = router;
module.exports.sendAbandonedCartReminders = sendAbandonedCartReminders;
