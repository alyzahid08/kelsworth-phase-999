const express = require("express");
const { query } = require("../db");
const { requireCustomer, attachCustomerIfPresent } = require("../middleware/customerAuth");
const {
  isStripeConfigured,
  createStripePaymentIntent,
  verifyStripeWebhook,
  isLocalGatewayConfigured,
  createLocalPayment,
  verifyLocalGatewayCallback,
  isPayFastConfigured,
  buildPayFastForm,
  verifyPayFastCallback,
  isValidPaymentMethod,
  getAvailablePaymentMethods,
} = require("../lib/payment");
const { sendWhatsAppNotification } = require("../lib/whatsapp");

const router = express.Router();

// GET /api/payment/methods — list available payment methods
router.get("/methods", (req, res) => {
  res.json(getAvailablePaymentMethods());
});

// POST /api/payment/create-intent — create a payment intent for an order total
// This is called before placing the actual order, to get a clientSecret for the frontend.
router.post("/create-intent", async (req, res) => {
  const { amount, paymentMethod, orderNumber, email, phone } = req.body || {};

  if (!amount || !paymentMethod) {
    return res.status(400).json({ error: "Amount and payment method are required" });
  }
  if (!isValidPaymentMethod(paymentMethod)) {
    return res.status(400).json({ error: "Unsupported payment method" });
  }
  if (paymentMethod === "cod") {
    return res.json({ paymentMethod: "cod", clientSecret: null });
  }

  try {
    if (paymentMethod === "stripe") {
      if (!isStripeConfigured()) {
        return res.status(400).json({ error: "Stripe payments are not available" });
      }
      const result = await createStripePaymentIntent(amount, orderNumber, email);
      return res.json({
        paymentMethod: "stripe",
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
      });
    }

    if (paymentMethod === "jazzcash" || paymentMethod === "easypaisa") {
      if (!isLocalGatewayConfigured()) {
        return res.status(400).json({ error: `${paymentMethod} payments are not available` });
      }
      const result = await createLocalPayment(amount, orderNumber, phone, paymentMethod);
      return res.json({
        paymentMethod,
        gatewayUrl: result.gatewayUrl,
        formFields: result.formFields,
        transactionId: result.transactionId,
      });
    }

    if (paymentMethod === "payfast") {
      if (!isPayFastConfigured()) {
        return res.status(400).json({ error: "PayFast payments are not available" });
      }
      const result = await buildPayFastForm(amount, orderNumber, email, phone, req.ip);
      return res.json({
        paymentMethod: "payfast",
        gatewayUrl: result.gatewayUrl,
        formFields: result.formFields,
        transactionId: result.transactionId,
      });
    }

    res.status(400).json({ error: "Unsupported payment method" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create payment" });
  }
});

// POST /api/payment/webhook/stripe — Stripe webhook endpoint
// Stripe sends events here when payment succeeds/fails.
// Requires raw body for signature verification.
router.post("/webhook/stripe", express.json({ type: 'application/json' }), async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).json({ error: "Missing signature" });

  try {
    const event = verifyStripeWebhook(req.rawBody || JSON.stringify(req.body), sig);

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const orderNumber = paymentIntent.metadata?.orderNumber;

      if (orderNumber) {
        await query(
          `UPDATE orders
           SET payment_status = 'paid', payment_intent_id = $1
           WHERE order_number = $2 AND payment_method = 'stripe' AND payment_status = 'pending'`,
          [paymentIntent.id, orderNumber]
        );
        console.log(`[payment] Stripe payment succeeded for order ${orderNumber}`);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const orderNumber = paymentIntent.metadata?.orderNumber;
      if (orderNumber) {
        await query(
          `UPDATE orders
           SET payment_status = 'failed'
           WHERE order_number = $2 AND payment_method = 'stripe' AND payment_status = 'pending'`,
          [paymentIntent.id, orderNumber]
        );
        console.log(`[payment] Stripe payment failed for order ${orderNumber}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[payment] Stripe webhook error:", err.message);
    res.status(400).json({ error: "Webhook signature verification failed" });
  }
});

// Renders a tiny HTML page that immediately forwards the customer's browser
// to the friendly result page, while still returning HTTP 200 to the
// gateway's own POST (some gateways treat non-200 as "retry the callback").
function bounceToResultPage(res, orderNumber, status) {
  const origin = (process.env.SITE_ORIGIN || "https://www.kelsworth.com").replace(/\/$/, "");
  const url = `${origin}/payment-return.html?order=${encodeURIComponent(orderNumber || "")}&status=${status}`;
  res.status(200).send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body>Redirecting… <a href="${url}">Click here if you are not redirected.</a></body></html>`);
}

// POST /api/payment/webhook/jazzcash — this is JazzCash's pp_ReturnURL.
// JazzCash's hosted checkout POSTs the payment result directly here (it
// serves as both the server-to-server confirmation AND the browser bounce
// target), so we verify the hash, update the order, then forward the
// customer's browser to a friendly result page.
router.post("/webhook/jazzcash", express.urlencoded({ extended: true }), async (req, res) => {
  const orderNumber = req.body.pp_BillReference;
  try {
    const result = await verifyLocalGatewayCallback(req.body, "jazzcash");
    if (!result.valid) {
      console.error("[payment] JazzCash callback rejected:", result.error);
      return bounceToResultPage(res, orderNumber, "failed");
    }
    const { rows } = await query(
      `UPDATE orders
       SET payment_status = 'paid', gateway_transaction_id = $1
       WHERE order_number = $2 AND payment_method = 'jazzcash' AND payment_status = 'pending'
       RETURNING *`,
      [result.transactionId, orderNumber]
    );
    if (rows.length) sendWhatsAppNotification(rows[0], "order_confirmation");
    bounceToResultPage(res, orderNumber, "paid");
  } catch (err) {
    console.error("[payment] JazzCash webhook error:", err.message);
    bounceToResultPage(res, orderNumber, "failed");
  }
});

// POST /api/payment/webhook/easypaisa — this is EasyPaisa's postBackURL.
router.post("/webhook/easypaisa", express.urlencoded({ extended: true }), async (req, res) => {
  const orderNumber = req.body.orderRefNum;
  try {
    const result = await verifyLocalGatewayCallback(req.body, "easypaisa");
    if (!result.valid) {
      console.error("[payment] EasyPaisa callback rejected:", result.error);
      return bounceToResultPage(res, orderNumber, "failed");
    }
    const { rows } = await query(
      `UPDATE orders
       SET payment_status = 'paid', gateway_transaction_id = $1
       WHERE order_number = $2 AND payment_method = 'easypaisa' AND payment_status = 'pending'
       RETURNING *`,
      [result.transactionId, orderNumber]
    );
    if (rows.length) sendWhatsAppNotification(rows[0], "order_confirmation");
    bounceToResultPage(res, orderNumber, "paid");
  } catch (err) {
    console.error("[payment] EasyPaisa webhook error:", err.message);
    bounceToResultPage(res, orderNumber, "failed");
  }
});

// POST /api/payment/webhook/payfast — this is PayFast's SUCCESS_URL/FAILURE_URL.
// PayFast bounces the browser here with the result; we look up the order's
// real amount ourselves (never trust an amount the callback claims) before
// recomputing the signature, so a tampered POST can't mark an order paid.
router.post("/webhook/payfast", express.urlencoded({ extended: true }), async (req, res) => {
  const orderNumber = req.body.BASKET_ID || req.body.basket_id || req.body.order_id;
  try {
    const { rows: orderRows } = await query(
      `SELECT total FROM orders WHERE order_number = $1 AND payment_method = 'payfast' AND payment_status = 'pending'`,
      [orderNumber]
    );
    if (!orderRows.length) {
      console.error("[payment] PayFast callback for unknown or already-settled order:", orderNumber);
      return bounceToResultPage(res, orderNumber, "failed");
    }

    const result = await verifyPayFastCallback(req.body, orderRows[0].total);
    if (!result.valid) {
      console.error("[payment] PayFast callback rejected:", result.error);
      return bounceToResultPage(res, orderNumber, "failed");
    }
    const { rows } = await query(
      `UPDATE orders
       SET payment_status = 'paid', gateway_transaction_id = $1
       WHERE order_number = $2 AND payment_method = 'payfast' AND payment_status = 'pending'
       RETURNING *`,
      [result.transactionId, orderNumber]
    );
    if (rows.length) sendWhatsAppNotification(rows[0], "order_confirmation");
    bounceToResultPage(res, orderNumber, "paid");
  } catch (err) {
    console.error("[payment] PayFast webhook error:", err.message);
    bounceToResultPage(res, orderNumber, "failed");
  }
});

module.exports = router;
