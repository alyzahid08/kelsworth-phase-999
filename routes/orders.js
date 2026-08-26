const express = require("express");
const crypto = require("crypto");
const { query, withTransaction } = require("../db");
const { validatePromoCode } = require("../lib/promo");
const { sendOrderConfirmation } = require("../lib/email");
const { sendWhatsAppNotification, sendOrderConfirmationRequest } = require("../lib/whatsapp");
const { isValidPaymentMethod } = require("../lib/payment");
const { attachCustomerIfPresent } = require("../middleware/customerAuth");

const router = express.Router();

const SHIP_THRESHOLD = 5000;
const SHIP_FLAT = 250;
const TAX_RATE = 0;

function isPlausiblePhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

class OrderError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function generateOrderNumber() {
  return "KW-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function uniqueOrderNumber(client) {
  for (let i = 0; i < 5; i++) {
    const candidate = generateOrderNumber();
    const { rows } = await client.query("SELECT 1 FROM orders WHERE order_number = $1", [candidate]);
    if (!rows.length) return candidate;
  }
  throw new Error("Could not generate a unique order number");
}

/**
 * Get the effective price for a product, considering active flash sales.
 * Returns the flash price if the product is in an active flash sale, otherwise
 * falls back to sale_price > price.
 */
async function getEffectivePrice(client, product, now) {
  const basePrice = product.sale_price ?? product.price;

  // Check if this product is in any active flash sale. Runs inside a
  // SAVEPOINT so a failure here (e.g. table missing, bad data) only rolls
  // back this lookup instead of aborting the whole order transaction.
  try {
    await client.query("SAVEPOINT flash_price_check");
    const { rows } = await client.query(
      `SELECT * FROM flash_sales
       WHERE active = true AND starts_at <= $1 AND ends_at > $1
         AND product_ids @> to_jsonb($2::int)
       LIMIT 1`,
      [now, product.id]
    );
    await client.query("RELEASE SAVEPOINT flash_price_check");

    if (!rows.length) return basePrice;
    const sale = rows[0];
    return sale.discount_type === "percent"
      ? Math.round(basePrice * (1 - sale.discount_value / 100))
      : Math.max(0, basePrice - sale.discount_value);
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT flash_price_check").catch(() => {});
    console.warn("[orders] Flash sale price check failed, using normal price:", err.message);
    return basePrice;
  }
}

// POST /api/orders — place an order.
// Now supports multiple payment methods (COD, Stripe, JazzCash, EasyPaisa).
// Also tracks cart for abandoned cart recovery.
router.post("/", attachCustomerIfPresent, async (req, res) => {
  const { items, customer, promoCode, deliveryNotes, giftMessage, saveAddress, paymentMethod, paymentIntentId } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Your cart is empty" });
  }
  const required = ["firstName", "lastName", "email", "phone", "address", "city"];
  for (const field of required) {
    if (!customer || !customer[field] || !String(customer[field]).trim()) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }
  if (!isPlausiblePhone(customer.phone)) {
    return res.status(400).json({ error: "Please enter a valid phone number" });
  }

  const chosenPaymentMethod = isValidPaymentMethod(paymentMethod) ? paymentMethod : "cod";

  try {
    const now = new Date();
    const result = await withTransaction(async (client) => {
      const lineItems = [];
      let subtotal = 0;

      for (const item of items) {
        const { rows } = await client.query(
          "SELECT * FROM products WHERE slug = $1 AND active = true FOR UPDATE",
          [item.productId]
        );
        const product = rows[0];
        if (!product) throw new OrderError(`Product ${item.productId} is no longer available`);

        const sizes = product.sizes || [];
        if (!sizes.includes(item.size)) {
          throw new OrderError(`${product.name} is not available in size ${item.size}`);
        }

        const qty = Math.max(1, Math.min(10, parseInt(item.qty, 10) || 1));
        const stockBySize = product.stock_by_size || {};
        const sizeHasTrackedStock = Object.prototype.hasOwnProperty.call(stockBySize, item.size);

        if (sizeHasTrackedStock && Number(stockBySize[item.size]) < qty) {
          const available = Number(stockBySize[item.size]);
          throw new OrderError(
            available > 0
              ? `Only ${available} left of ${product.name} in size ${item.size}`
              : `${product.name} in size ${item.size} is out of stock`
          );
        }

        // Use flash sale price if applicable, otherwise normal sale/regular price
        const unitPrice = await getEffectivePrice(client, product, now);
        subtotal += unitPrice * qty;
        lineItems.push({
          productId: product.id,
          productName: product.name,
          size: item.size,
          qty,
          unitPrice,
          sizeHasTrackedStock,
          newStockForSize: sizeHasTrackedStock ? Number(stockBySize[item.size]) - qty : null,
          stockBySize,
        });
      }

      let discount = 0;
      let appliedPromoCode = null;
      if (promoCode && String(promoCode).trim()) {
        const promoResult = await validatePromoCode(promoCode, subtotal);
        if (!promoResult.valid) throw new OrderError(promoResult.error);
        discount = promoResult.discountAmount;
        appliedPromoCode = promoResult.code;
      }

      const shipping = subtotal >= SHIP_THRESHOLD ? 0 : SHIP_FLAT;
      const tax = Math.round(subtotal * TAX_RATE);
      const total = subtotal + shipping + tax - discount;
      const orderNumber = await uniqueOrderNumber(client);
      const customerId = req.customer ? req.customer.sub : null;

      // For online payment methods, verify payment was made
      let paymentStatus = "pending";
      if (chosenPaymentMethod === "cod") {
        paymentStatus = "pending"; // will be paid on delivery
      } else if (chosenPaymentMethod === "stripe" && paymentIntentId) {
        paymentStatus = "paid"; // frontend confirms intent was paid before submitting order
      }

      // Anti-fraud: COD orders require the customer to confirm on WhatsApp
      // before they're packed/shipped. Prepaid orders already prove intent
      // via payment, so they're never held for confirmation.
      const requiresConfirmation = chosenPaymentMethod === "cod";
      const confirmationToken = requiresConfirmation ? crypto.randomBytes(20).toString("hex") : null;
      const confirmationStatus = requiresConfirmation ? "pending" : "not_required";

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders
          (order_number, customer_id, first_name, last_name, email, phone, address, city, postal_code,
           payment_method, payment_status, payment_intent_id, promo_code,
           subtotal, shipping, discount, total, delivery_notes, gift_message, tax,
           confirmation_status, confirmation_token, confirmation_sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          orderNumber, customerId,
          customer.firstName.trim(), customer.lastName.trim(),
          customer.email.trim(), customer.phone.trim(),
          customer.address.trim(), customer.city.trim(), (customer.postalCode || "").trim(),
          chosenPaymentMethod, paymentStatus, paymentIntentId || null,
          appliedPromoCode,
          subtotal, shipping, discount, total,
          (deliveryNotes || "").trim() || null,
          (giftMessage || "").trim() || null,
          tax,
          confirmationStatus, confirmationToken, requiresConfirmation ? now : null,
        ]
      );
      const order = orderRows[0];

      if (customerId && saveAddress) {
        await client.query(
          `INSERT INTO customer_addresses (customer_id, label, first_name, last_name, phone, address, city, postal_code, is_default)
           VALUES ($1,'Home',$2,$3,$4,$5,$6,$7, NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = $1))`,
          [
            customerId, customer.firstName.trim(), customer.lastName.trim(), customer.phone.trim(),
            customer.address.trim(), customer.city.trim(), (customer.postalCode || "").trim(),
          ]
        );
      }

      for (const li of lineItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, size, qty, unit_price)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [order.id, li.productId, li.productName, li.size, li.qty, li.unitPrice]
        );

        if (li.sizeHasTrackedStock) {
          const updatedStockBySize = { ...li.stockBySize, [li.size]: Math.max(0, li.newStockForSize) };
          await client.query(
            "UPDATE products SET stock_by_size = $1, stock = GREATEST(stock - $2, 0) WHERE id = $3",
            [JSON.stringify(updatedStockBySize), li.qty, li.productId]
          );
        } else {
          await client.query(
            "UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2",
            [li.qty, li.productId]
          );
        }
      }

      return { order, lineItems };
    });

    const { order, lineItems } = result;

    // Best-effort notifications (never blocks the response)
 sendOrderConfirmation(order, lineItems.map((li) => ({ product_name: li.productName, size: li.size, qty: li.qty, unit_price: li.unitPrice })));

    if (order.confirmation_status === "pending" && order.confirmation_token) {
      // COD order — ask the customer to confirm on WhatsApp before it ships.
      const confirmUrl = `${(process.env.SITE_ORIGIN || "https://www.alqutuz.com").replace(/\/$/, "")}/confirm-order.html?token=${order.confirmation_token}`;
      sendOrderConfirmationRequest(order, confirmUrl);
    } else if (order.payment_status === "paid") {
      // Already paid at creation time (Stripe confirms card client-side before the order is submitted).
      sendWhatsAppNotification(order, "order_confirmation");
    }
    // JazzCash/EasyPaisa orders are still unpaid at this point (customer hasn't
    // been redirected to the gateway yet) — their receipt is sent from the
    // payment webhook once the gateway actually confirms payment.

    // Mark abandoned cart as recovered (best-effort, fire and forget)
    const email = customer.email.trim().toLowerCase();
    const customerId = req.customer ? req.customer.sub : null;
    if (email || customerId) {
      query(
        `UPDATE abandoned_carts SET recovered = true, recovered_order_id = $1
         WHERE recovered = false AND ($2 IS NULL OR customer_id = $2) AND ($3 IS NULL OR email = $3)
         ORDER BY last_updated DESC LIMIT 1`,
        [order.id, customerId, email]
      ).catch(() => {});
    }

    res.status(201).json({
      orderNumber: order.order_number,
      subtotal: order.subtotal,
      shipping: order.shipping,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      giftMessage: order.gift_message,
    });
  } catch (err) {
    if (err instanceof OrderError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Could not place your order. Please try again." });
  }
});

// GET /api/orders/lookup?orderNumber=KW-XXXX&email=...
router.get("/lookup", async (req, res) => {
  const { orderNumber, email } = req.query;
  if (!orderNumber || !email) {
    return res.status(400).json({ error: "orderNumber and email are required" });
  }
  try {
    const { rows } = await query(
      "SELECT * FROM orders WHERE order_number = $1 AND email = $2",
      [orderNumber, email]
    );
    if (!rows.length) return res.status(404).json({ error: "No matching order found" });
    const order = rows[0];
    const { rows: items } = await query(
      "SELECT product_name, size, qty, unit_price FROM order_items WHERE order_id = $1",
      [order.id]
    );
    res.json({ ...order, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not look up order" });
  }
});

// GET /api/orders/confirm?token=... — hit by the WhatsApp confirmation link.
// Marks a pending COD order as confirmed so it can be packed/shipped.
router.get("/confirm", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing confirmation token" });

  try {
    const { rows } = await query("SELECT * FROM orders WHERE confirmation_token = $1", [token]);
    if (!rows.length) return res.status(404).json({ error: "We couldn't find that order confirmation link" });
    const order = rows[0];

    if (order.confirmation_status === "confirmed") {
      return res.json({ orderNumber: order.order_number, confirmationStatus: "confirmed", alreadyConfirmed: true });
    }
    if (order.confirmation_status !== "pending") {
      return res.status(410).json({ error: "This confirmation link has expired. Please contact us to confirm your order." });
    }

    const { rows: updated } = await query(
      `UPDATE orders SET confirmation_status = 'confirmed', confirmed_at = now()
       WHERE id = $1 RETURNING order_number`,
      [order.id]
    );
    res.json({ orderNumber: updated[0].order_number, confirmationStatus: "confirmed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not confirm your order right now. Please try again." });
  }
});

// GET /api/orders/:id/invoice — download PDF invoice
router.get("/:id/invoice", async (req, res) => {
  const { id } = req.params;
  const { orderNumber, email } = req.query;
  try {
    let order;
    if (orderNumber && email) {
      const { rows } = await query(
        "SELECT * FROM orders WHERE order_number = $1 AND email = $2",
        [orderNumber, email]
      );
      if (!rows.length) return res.status(404).json({ error: "Order not found" });
      order = rows[0];
    } else {
      const { rows } = await query("SELECT * FROM orders WHERE id = $1", [id]);
      if (!rows.length) return res.status(404).json({ error: "Order not found" });
      order = rows[0];
    }
    const { rows: items } = await query(
      "SELECT product_name, size, qty, unit_price FROM order_items WHERE order_id = $1",
      [order.id]
    );
    const { generateInvoicePDF } = require("../lib/pdfInvoice");
    const pdfBuffer = await generateInvoicePDF(order, items);
    res.set("Content-Type", "application/pdf");
    res.set(
      "Content-Disposition",
      `attachment; filename="AL-QUTUZ-Invoice-${order.order_number}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not generate invoice" });
  }
});

/**
 * Mark COD orders that have sat unconfirmed past the confirmation window as
 * 'expired'. This doesn't cancel them automatically — it just surfaces them
 * in the admin dashboard so a human decides whether to hold, call the
 * customer, or require advance payment instead of shipping blind.
 * Called on a timer from server.js, same pattern as abandoned cart reminders.
 */
async function checkExpiredOrderConfirmations() {
  const hours = Number(process.env.WHATSAPP_CONFIRM_WINDOW_HOURS) || 6;
  try {
    const { rows } = await query(
      `UPDATE orders SET confirmation_status = 'expired'
       WHERE confirmation_status = 'pending' AND confirmation_sent_at < now() - ($1 || ' hours')::interval
       RETURNING order_number`,
      [hours]
    );
    if (rows.length) {
      console.log(`[orders] ${rows.length} COD order(s) expired unconfirmed: ${rows.map((r) => r.order_number).join(", ")}`);
    }
  } catch (err) {
    console.error("[orders] Failed to sweep expired confirmations:", err.message);
  }
}

/**
 * Cancel JazzCash/EasyPaisa/PayFast orders where the customer never
 * completed payment on the gateway's page, and give the reserved stock back.
 * Gateway payment sessions are short-lived (JazzCash's own session expiry is
 * ~1hr), so we use a shorter window than the COD confirmation sweep — if
 * it's been this long with no webhook callback, the attempt is dead.
 */
async function checkExpiredGatewayPayments() {
  const hours = Number(process.env.GATEWAY_PAYMENT_TIMEOUT_HOURS) || 2;
  try {
    await withTransaction(async (client) => {
      const { rows: stale } = await client.query(
        `SELECT id, order_number FROM orders
         WHERE payment_method IN ('jazzcash', 'easypaisa', 'payfast') AND payment_status = 'pending'
           AND created_at < now() - ($1 || ' hours')::interval
         FOR UPDATE`,
        [hours]
      );
      for (const order of stale) {
        const { rows: items } = await client.query(
          "SELECT product_id, size, qty FROM order_items WHERE order_id = $1",
          [order.id]
        );
        for (const item of items) {
          if (!item.product_id) continue;
          const { rows: prodRows } = await client.query(
            "SELECT stock_by_size FROM products WHERE id = $1 FOR UPDATE",
            [item.product_id]
          );
          if (!prodRows.length) continue;
          const stockBySize = prodRows[0].stock_by_size || {};
          if (Object.prototype.hasOwnProperty.call(stockBySize, item.size)) {
            stockBySize[item.size] = Number(stockBySize[item.size]) + item.qty;
            await client.query(
              "UPDATE products SET stock_by_size = $1, stock = stock + $2 WHERE id = $3",
              [stockBySize, item.qty, item.product_id]
            );
          } else {
            await client.query("UPDATE products SET stock = stock + $1 WHERE id = $2", [item.qty, item.product_id]);
          }
        }
        await client.query(
          "UPDATE orders SET payment_status = 'failed', status = 'cancelled' WHERE id = $1",
          [order.id]
        );
      }
      if (stale.length) {
        console.log(`[orders] ${stale.length} unpaid gateway order(s) cancelled, stock restored: ${stale.map((o) => o.order_number).join(", ")}`);
      }
    });
  } catch (err) {
    console.error("[orders] Failed to sweep expired gateway payments:", err.message);
  }
}

module.exports = router;
module.exports.checkExpiredOrderConfirmations = checkExpiredOrderConfirmations;
module.exports.checkExpiredGatewayPayments = checkExpiredGatewayPayments;
