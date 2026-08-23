// WhatsApp Business API integration for order notifications.
// Uses the Meta Cloud API (formerly Facebook Graph API) for WhatsApp Business.
// Falls back gracefully if not configured — same pattern as email.

const https = require("https");
const { query } = require("../db");

function isConfigured() {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  );
}

const STATUS_TEMPLATES = {
  pending: {
    template: "order_confirmation",
    body: (order) =>
      `Assalam o Alaikum ${order.first_name}! Your Kelsworth order #${order.order_number} has been received. Total: Rs. ${Number(order.total).toLocaleString("en-PK")}. We'll keep you updated!`,
  },
  processing: {
    template: "order_update",
    body: (order) =>
      `Hi ${order.first_name}, your order #${order.order_number} is being prepared and will be shipped soon. Stay tuned!`,
  },
  shipped: {
    template: "order_shipped",
    body: (order) =>
      `Great news ${order.first_name}! Your order #${order.order_number} has been shipped and is on its way to you. Track it on our website.`,
  },
  delivered: {
    template: "order_delivered",
    body: (order) =>
      `${order.first_name}, your order #${order.order_number} has been delivered! We hope you love your Kelsworth gear. Leave a review on our website!`,
  },
};

/**
 * Send a WhatsApp message to the customer.
 * Uses the Cloud API's text message endpoint.
 */
// Normalize a Pakistani phone number to bare E.164 digits (no leading +),
// e.g. "0300-1234567" -> "923001234567". Used both for outbound sends and
// for matching inbound webhook replies back to an order.
function normalizePkPhone(phone) {
  let digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  if (!digits.startsWith("92")) digits = "92" + digits;
  return digits;
}

async function sendWhatsAppMessage(phone, messageText, orderNumber) {
  if (!isConfigured()) {
    console.log(`[whatsapp] Not configured — skipped WhatsApp for ${phone}`);
    return { status: "skipped", response: "Not configured" };
  }

  // Meta's Cloud API wants the bare MSISDN (e.g. "923001234567") as the
  // recipient — no "@c.us" suffix, which is a whatsapp-web.js/Baileys
  // convention and would silently fail against the real Graph API.
  const normalizedPhone = normalizePkPhone(phone);

  const payload = JSON.stringify({
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "text",
    text: { body: messageText },
  });

  const options = {
    hostname: "graph.facebook.com",
    path: `/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const parsed = data ? JSON.parse(data) : {};
        resolve({ status: res.statusCode >= 200 && res.statusCode < 300 ? "sent" : "failed", response: data });
      });
    });
    req.on("error", (err) => {
      resolve({ status: "failed", response: err.message });
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Log the WhatsApp send result to the database.
 */
async function logWhatsAppSend(phone, messageType, orderNumber, result) {
  try {
    await query(
      `INSERT INTO whatsapp_logs (phone, message_type, order_number, status, response)
       VALUES ($1, $2, $3, $4, $5)`,
      [phone, messageType, orderNumber || null, result.status, result.response || null]
    );
  } catch (err) {
    console.error("[whatsapp] Failed to log:", err.message);
  }
}

/**
 * Main entry point: send a WhatsApp notification for an order event.
 * Best-effort — never blocks or fails the calling operation.
 */
async function sendWhatsAppNotification(order, eventType) {
  if (!order.phone) return;

  const template = STATUS_TEMPLATES[order.status];
  if (!template) return;

  const messageText = template.body(order);
  const result = await sendWhatsAppMessage(order.phone, messageText, order.order_number);
  await logWhatsAppSend(order.phone, eventType, order.order_number, result);

  if (result.status === "sent") {
    console.log(`[whatsapp] Sent ${eventType} to ${order.phone} for order ${order.order_number}`);
  } else {
    console.log(`[whatsapp] ${result.status} ${eventType} for order ${order.order_number}: ${result.response}`);
  }
}

/**
 * Send the anti-fraud confirmation request for a fresh COD order.
 * Asks the customer to reply YES or tap a link — order isn't packed until
 * one of those happens. Best-effort, same pattern as sendWhatsAppNotification.
 */
async function sendOrderConfirmationRequest(order, confirmUrl) {
  if (!order.phone) return { status: "skipped", response: "No phone on order" };

  const hours = Number(process.env.WHATSAPP_CONFIRM_WINDOW_HOURS) || 6;
  const messageText =
    `Assalam o Alaikum ${order.first_name}! Please confirm your Kelsworth order #${order.order_number} ` +
    `(Rs. ${Number(order.total).toLocaleString("en-PK")}, Cash on Delivery) by replying "YES" to this ` +
    `message, or tapping: ${confirmUrl}\n\nIf we don't hear back within ${hours} hours the order may be ` +
    `held for review before it ships.`;

  const result = await sendWhatsAppMessage(order.phone, messageText, order.order_number);
  await logWhatsAppSend(order.phone, "order_confirmation_request", order.order_number, result);

  if (result.status === "sent") {
    console.log(`[whatsapp] Sent confirmation request to ${order.phone} for order ${order.order_number}`);
  } else {
    console.log(`[whatsapp] ${result.status} confirmation request for order ${order.order_number}: ${result.response}`);
  }
  return result;
}

/**
 * Send an abandoned cart WhatsApp reminder.
 */
async function sendAbandonedCartWhatsApp(phone, cartData) {
  if (!phone) return;
  const itemCount = (cartData.items || []).length;
  const subtotal = Number(cartData.subtotal || 0);
  const messageText = `Hi! You left ${itemCount} item(s) worth Rs. ${subtotal.toLocaleString("en-PK")} in your Kelsworth cart. Complete your order now before they sell out! Shop at kelsworth.com`;

  const result = await sendWhatsAppMessage(phone, messageText, null);
  await logWhatsAppSend(phone, "abandoned_cart", null, result);
  return result;
}

module.exports = {
  sendWhatsAppNotification,
  sendOrderConfirmationRequest,
  sendAbandonedCartWhatsApp,
  normalizePkPhone,
  isConfigured,
};
