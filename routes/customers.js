const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db");
const {
  signCustomerToken,
  setCustomerCookie,
  clearCustomerCookie,
  requireCustomer,
} = require("../middleware/customerAuth");
const { sendWelcomeEmail } = require("../lib/email");
const { generateInvoicePDF } = require("../lib/pdfInvoice");

const router = express.Router();

function serializeCustomer(row) {
  return {
    id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, phone: row.phone,
    avatarUrl: row.avatar_url || null,
    notifyOrderUpdates: row.notify_order_updates,
    notifyPromotions: row.notify_promotions,
    notifyNewsletter: row.notify_newsletter,
  };
}

// POST /api/customers/register
router.post("/register", async (req, res) => {
  const { email, password, firstName, lastName, phone } = req.body || {};
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const { rows: existing } = await query("SELECT 1 FROM customers WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "An account with that email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO customers (email, password_hash, first_name, last_name, phone)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [normalizedEmail, hash, firstName.trim(), lastName.trim(), (phone || "").trim()]
    );
    const customer = rows[0];
    setCustomerCookie(res, signCustomerToken(customer));
    sendWelcomeEmail(serializeCustomer(customer));
    res.status(201).json(serializeCustomer(customer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create account" });
  }
});

// POST /api/customers/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  try {
    const { rows } = await query("SELECT * FROM customers WHERE email = $1", [String(email).trim().toLowerCase()]);
    const customer = rows[0];
    if (!customer) return res.status(401).json({ error: "Incorrect email or password" });

    const ok = await bcrypt.compare(password, customer.password_hash);
    if (!ok) return res.status(401).json({ error: "Incorrect email or password" });

    setCustomerCookie(res, signCustomerToken(customer));
    res.json(serializeCustomer(customer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/customers/logout
router.post("/logout", (req, res) => {
  clearCustomerCookie(res);
  res.json({ ok: true });
});

// GET /api/customers/me
router.get("/me", requireCustomer, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM customers WHERE id = $1", [req.customer.sub]);
    if (!rows.length) return res.status(404).json({ error: "Account not found" });
    res.json(serializeCustomer(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load account" });
  }
});

// PATCH /api/customers/me
router.patch("/me", requireCustomer, async (req, res) => {
  const { firstName, lastName, phone, avatarUrl, notifyOrderUpdates, notifyPromotions, notifyNewsletter } = req.body || {};
  const fieldMap = {
    firstName: "first_name", lastName: "last_name", phone: "phone", avatarUrl: "avatar_url",
    notifyOrderUpdates: "notify_order_updates", notifyPromotions: "notify_promotions", notifyNewsletter: "notify_newsletter",
  };
  const body = { firstName, lastName, phone, avatarUrl, notifyOrderUpdates, notifyPromotions, notifyNewsletter };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.customer.sub);
  try {
    const { rows } = await query(
      `UPDATE customers SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "Account not found" });
    res.json(serializeCustomer(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update account" });
  }
});

// GET /api/customers/orders
router.get("/orders", requireCustomer, async (req, res) => {
  try {
    const { rows: orders } = await query(
      "SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC",
      [req.customer.sub]
    );
    const orderIds = orders.map((o) => o.id);
    let itemsByOrder = {};
    if (orderIds.length) {
      const { rows: items } = await query(
        `SELECT * FROM order_items WHERE order_id = ANY($1::int[])`,
        [orderIds]
      );
      itemsByOrder = items.reduce((acc, item) => {
        (acc[item.order_id] = acc[item.order_id] || []).push(item);
        return acc;
      }, {});
    }
    res.json(orders.map((o) => ({ ...o, items: itemsByOrder[o.id] || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load order history" });
  }
});

/* ---------------------------- Saved addresses ---------------------------- */

function serializeAddress(row) {
  return {
    id: row.id,
    label: row.label,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    isDefault: row.is_default,
  };
}

router.get("/addresses", requireCustomer, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC",
      [req.customer.sub]
    );
    res.json(rows.map(serializeAddress));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load saved addresses" });
  }
});

router.post("/addresses", requireCustomer, async (req, res) => {
  const { label, firstName, lastName, phone, address, city, postalCode, isDefault } = req.body || {};
  const required = { firstName, lastName, phone, address, city };
  for (const [key, val] of Object.entries(required)) {
    if (!val || !String(val).trim()) return res.status(400).json({ error: `Missing required field: ${key}` });
  }
  try {
    if (isDefault) {
      await query("UPDATE customer_addresses SET is_default = false WHERE customer_id = $1", [req.customer.sub]);
    }
    const { rows } = await query(
      `INSERT INTO customer_addresses (customer_id, label, first_name, last_name, phone, address, city, postal_code, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.customer.sub, (label || "Home").trim(), firstName.trim(), lastName.trim(), phone.trim(),
        address.trim(), city.trim(), (postalCode || "").trim(), Boolean(isDefault),
      ]
    );
    res.status(201).json(serializeAddress(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save address" });
  }
});

router.delete("/addresses/:id", requireCustomer, async (req, res) => {
  try {
    const { rows } = await query(
      "DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2 RETURNING id",
      [req.params.id, req.customer.sub]
    );
    if (!rows.length) return res.status(404).json({ error: "Address not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete address" });
  }
});

/* ---------------------------- Wishlist ---------------------------- */

router.get("/wishlist", requireCustomer, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.* FROM wishlist_items w JOIN products p ON p.id = w.product_id
       WHERE w.customer_id = $1 AND p.active = true ORDER BY w.created_at DESC`,
      [req.customer.sub]
    );
    res.json(
      rows.map((p) => {
        const stockBySize = p.stock_by_size || {};
        const defaultSize =
          (p.sizes || []).find((s) => !Object.prototype.hasOwnProperty.call(stockBySize, s) || Number(stockBySize[s]) > 0) ||
          (p.sizes || [])[0] || null;
        return {
          id: p.slug, name: p.name, category: p.category, color: p.color,
          price: p.price, salePrice: p.sale_price, image: p.image, badge: p.badge,
          inStock: p.stock > 0, defaultSize,
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load wishlist" });
  }
});

router.post("/wishlist", requireCustomer, async (req, res) => {
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: "productId is required" });
  try {
    const { rows: productRows } = await query("SELECT id FROM products WHERE slug = $1", [productId]);
    if (!productRows.length) return res.status(404).json({ error: "Product not found" });
    await query(
      "INSERT INTO wishlist_items (customer_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [req.customer.sub, productRows[0].id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not add to wishlist" });
  }
});

router.delete("/wishlist/:productId", requireCustomer, async (req, res) => {
  try {
    const { rows: productRows } = await query("SELECT id FROM products WHERE slug = $1", [req.params.productId]);
    if (!productRows.length) return res.status(404).json({ error: "Product not found" });
    await query(
      "DELETE FROM wishlist_items WHERE customer_id = $1 AND product_id = $2",
      [req.customer.sub, productRows[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove from wishlist" });
  }
});

/* ---------------------------- PDF Invoices ---------------------------- */

// GET /api/customers/orders/:id/invoice — generates a real PDF using PDFKit
// Replaces the old print-to-PDF HTML approach.
router.get("/orders/:id/invoice", requireCustomer, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM orders WHERE id = $1 AND customer_id = $2",
      [req.params.id, req.customer.sub]
    );
    if (!rows.length) return res.status(404).send("Order not found");
    const order = rows[0];
    const { rows: items } = await query(
      "SELECT product_name, size, qty, unit_price FROM order_items WHERE order_id = $1",
      [order.id]
    );

    const pdfBuffer = await generateInvoicePDF(order, items);

    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="invoice-${order.order_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Could not generate invoice");
  }
});

module.exports = router;
