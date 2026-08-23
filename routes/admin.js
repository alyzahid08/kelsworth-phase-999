const express = require("express");
const { query } = require("../db");
const { requireAdminApi, requireRole } = require("../middleware/auth");
const { sendOrderStatusUpdate } = require("../lib/email");
const { sendWhatsAppNotification } = require("../lib/whatsapp");

const router = express.Router();
router.use(requireAdminApi);

/* ---------------------------- Orders ---------------------------- */

// GET /api/admin/orders?status=pending&q=search
router.get("/orders", requireRole("orders", "read"), async (req, res) => {
  const { status, q } = req.query;
  const clauses = [];
  const params = [];

  if (status && status !== "all") {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(
      `(order_number ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length} OR (first_name || ' ' || last_name) ILIKE $${params.length})`
    );
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const { rows } = await query(
      `SELECT id, order_number, first_name, last_name, email, phone, city, total, status, payment_method, payment_status, confirmation_status, created_at
       FROM orders ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load orders" });
  }
});

// GET /api/admin/orders/:id — full order detail with line items
router.get("/orders/:id", requireRole("orders", "read"), async (req, res) => {
  try {
    const { rows: orderRows } = await query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    if (!orderRows.length) return res.status(404).json({ error: "Order not found" });
    const { rows: items } = await query(
      "SELECT product_name, size, qty, unit_price FROM order_items WHERE order_id = $1",
      [req.params.id]
    );
    res.json({ ...orderRows[0], items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load order" });
  }
});

const VALID_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

// PATCH /api/admin/orders/:id — update order status
router.patch("/orders/:id", requireRole("orders", "update"), async (req, res) => {
  const { status, trackingNumber } = req.body || {};
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  try {
    const sets = [];
    const params = [];
    if (status) {
      params.push(status);
      sets.push(`status = $${params.length}`);
    }
    if (trackingNumber !== undefined) {
      params.push(String(trackingNumber).trim() || null);
      sets.push(`tracking_number = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE orders SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });

    // Best-effort email + WhatsApp notification
    const order = rows[0];
    sendOrderStatusUpdate(order);
    sendWhatsAppNotification(order, "status_update");

    res.json({ id: order.id, status: order.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update order" });
  }
});

// POST /api/admin/orders/:id/confirm — manual override, e.g. after calling
// the customer directly instead of waiting on a WhatsApp reply.
router.post("/orders/:id/confirm", requireRole("orders", "update"), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE orders SET confirmation_status = 'confirmed', confirmed_at = now()
       WHERE id = $1 AND confirmation_status IN ('pending', 'expired')
       RETURNING id, order_number, confirmation_status`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found or doesn't need confirmation" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not confirm order" });
  }
});

/* --------------------------- Products --------------------------- */

// GET /api/admin/products — includes inactive products, unlike the public API
router.get("/products", requireRole("products", "read"), async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM products ORDER BY id ASC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load products" });
  }
});

function validateProductBody(body) {
  const required = ["slug", "name", "category", "fit", "color", "price", "sizes", "image"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return `Missing required field: ${field}`;
    }
  }
  if (!Array.isArray(body.sizes) || body.sizes.length === 0) {
    return "Sizes must be a non-empty list";
  }
  if (isNaN(Number(body.price))) return "Price must be a number";
  return null;
}

function sumStockBySize(stockBySize) {
  if (!stockBySize || typeof stockBySize !== "object") return null;
  return Object.values(stockBySize).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

// POST /api/admin/products — create
router.post("/products", requireRole("products", "create"), async (req, res) => {
  const body = req.body || {};
  const error = validateProductBody(body);
  if (error) return res.status(400).json({ error });

  const stockBySize = body.stockBySize && typeof body.stockBySize === "object" ? body.stockBySize : {};
  const totalStock = body.stock !== undefined ? Number(body.stock) : sumStockBySize(stockBySize) ?? 100;
  const images = Array.isArray(body.images) ? body.images : [];
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const skuBySize = body.skuBySize && typeof body.skuBySize === "object" ? body.skuBySize : {};
  const completeTheLook = Array.isArray(body.completeTheLook) ? body.completeTheLook : [];
  const frequentlyBoughtWith = Array.isArray(body.frequentlyBoughtWith) ? body.frequentlyBoughtWith : [];

  try {
    const { rows } = await query(
      `INSERT INTO products
        (slug, name, category, fit, color, price, sale_price, sizes, image, badge, description, fabric, care, stock, stock_by_size, active,
         images, video_url, tags, sku, sku_by_size, style_code, size_type, low_stock_threshold, complete_the_look, frequently_bought_with,
         estimated_delivery, return_policy, material, stretch, collection, is_bestseller)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
               COALESCE($27, '3–5 working days in major cities, 5–7 elsewhere'),
               COALESCE($28, 'Free exchange within 14 days of delivery, tags attached and unworn.'),
               $29, $30, $31, $32)
       RETURNING *`,
      [
        body.slug, body.name, body.category, body.fit, body.color,
        Number(body.price), body.salePrice ? Number(body.salePrice) : null,
        JSON.stringify(body.sizes), body.image, body.badge || null,
        body.description || "", body.fabric || "", body.care || "",
        totalStock, JSON.stringify(stockBySize),
        body.active !== undefined ? Boolean(body.active) : true,
        JSON.stringify(images), body.videoUrl || null, JSON.stringify(tags),
        body.sku || null, JSON.stringify(skuBySize), body.styleCode || null,
        body.sizeType || "standard", body.lowStockThreshold !== undefined ? Number(body.lowStockThreshold) : 5,
        JSON.stringify(completeTheLook), JSON.stringify(frequentlyBoughtWith),
        body.estimatedDelivery || null, body.returnPolicy || null,
        body.material || null, body.stretch || "none", body.collection || null,
        Boolean(body.isBestseller),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") return res.status(409).json({ error: "A product with that slug already exists" });
    res.status(500).json({ error: "Could not create product" });
  }
});

// PATCH /api/admin/products/:id — update any subset of fields
router.patch("/products/:id", requireRole("products", "update"), async (req, res) => {
  const body = req.body || {};
  const fieldMap = {
    slug: "slug", name: "name", category: "category", fit: "fit", color: "color",
    price: "price", salePrice: "sale_price", image: "image", badge: "badge",
    description: "description", fabric: "fabric", care: "care", active: "active",
    videoUrl: "video_url", sku: "sku", styleCode: "style_code", sizeType: "size_type",
    lowStockThreshold: "low_stock_threshold", estimatedDelivery: "estimated_delivery",
    returnPolicy: "return_policy", material: "material", stretch: "stretch", collection: "collection",
    isBestseller: "is_bestseller",
  };
  const jsonFieldMap = {
    images: "images", tags: "tags", skuBySize: "sku_by_size",
    completeTheLook: "complete_the_look", frequentlyBoughtWith: "frequently_bought_with",
  };
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(fieldMap)) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  for (const [key, column] of Object.entries(jsonFieldMap)) {
    if (body[key] !== undefined) {
      params.push(JSON.stringify(body[key]));
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (body.sizes !== undefined) {
    params.push(JSON.stringify(body.sizes));
    sets.push(`sizes = $${params.length}`);
  }
  if (body.stockBySize !== undefined) {
    params.push(JSON.stringify(body.stockBySize));
    sets.push(`stock_by_size = $${params.length}`);
    if (body.stock === undefined) {
      params.push(sumStockBySize(body.stockBySize) ?? 0);
      sets.push(`stock = $${params.length}`);
    }
  }
  if (body.stock !== undefined) {
    params.push(Number(body.stock));
    sets.push(`stock = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: "No fields to update" });

  params.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE products SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") return res.status(409).json({ error: "A product with that slug already exists" });
    res.status(500).json({ error: "Could not update product" });
  }
});

// DELETE /api/admin/products/:id
router.delete("/products/:id", requireRole("products", "delete"), async (req, res) => {
  try {
    const { rows } = await query("DELETE FROM products WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete product" });
  }
});

/* --------------------------- Contact Messages --------------------------- */

router.get("/contact-messages", requireRole("contact_messages", "read"), async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load messages" });
  }
});

router.patch("/contact-messages/:id", requireRole("contact_messages", "update"), async (req, res) => {
  const { isRead } = req.body || {};
  try {
    const { rows } = await query(
      "UPDATE contact_messages SET is_read = $1 WHERE id = $2 RETURNING id",
      [Boolean(isRead), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Message not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update message" });
  }
});

router.delete("/contact-messages/:id", requireRole("contact_messages", "delete"), async (req, res) => {
  try {
    const { rows } = await query("DELETE FROM contact_messages WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Message not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete message" });
  }
});

/* --------------------------- Reviews (moderation) --------------------------- */

router.get("/reviews", requireRole("reviews", "read"), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, p.name AS product_name, p.slug AS product_slug
       FROM product_reviews r JOIN products p ON p.id = r.product_id
       ORDER BY r.created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load reviews" });
  }
});

router.delete("/reviews/:id", requireRole("reviews", "delete"), async (req, res) => {
  try {
    const { rows } = await query("DELETE FROM product_reviews WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Review not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete review" });
  }
});

/* -------------------------- Promo Codes -------------------------- */

router.get("/promo-codes", requireRole("promo_codes", "read"), async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM promo_codes ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load promo codes" });
  }
});

router.post("/promo-codes", requireRole("promo_codes", "create"), async (req, res) => {
  const { code, discountPercent, minSubtotal, expiresAt, active } = req.body || {};
  if (!code || !String(code).trim()) return res.status(400).json({ error: "Code is required" });
  const pct = Number(discountPercent);
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    return res.status(400).json({ error: "Discount percent must be between 1 and 100" });
  }
  try {
    const { rows } = await query(
      `INSERT INTO promo_codes (code, discount_percent, min_subtotal, expires_at, active)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        String(code).trim().toUpperCase(),
        pct,
        minSubtotal ? Number(minSubtotal) : 0,
        expiresAt || null,
        active !== undefined ? Boolean(active) : true,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") return res.status(409).json({ error: "That code already exists" });
    res.status(500).json({ error: "Could not create promo code" });
  }
});

router.patch("/promo-codes/:id", requireRole("promo_codes", "update"), async (req, res) => {
  const { active } = req.body || {};
  if (active === undefined) return res.status(400).json({ error: "Nothing to update" });
  try {
    const { rows } = await query(
      "UPDATE promo_codes SET active = $1 WHERE id = $2 RETURNING *",
      [Boolean(active), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Promo code not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update promo code" });
  }
});

router.delete("/promo-codes/:id", requireRole("promo_codes", "delete"), async (req, res) => {
  try {
    const { rows } = await query("DELETE FROM promo_codes WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Promo code not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete promo code" });
  }
});

/* ---------------------------- Analytics ---------------------------- */

router.get("/analytics", requireRole("analytics", "read"), async (req, res) => {
  try {
    const [
      { rows: totalsRows },
      { rows: dailyRows },
      { rows: bestSellers },
      { rows: customerTotals },
      { rows: topCustomers },
      { rows: stockRows },
    ] = await Promise.all([
      query(`
        SELECT
          COALESCE(SUM(total) FILTER (WHERE status != 'cancelled'), 0)::int AS total_revenue,
          COALESCE(SUM(total) FILTER (WHERE status != 'cancelled' AND created_at >= date_trunc('month', now())), 0)::int AS revenue_this_month,
          COALESCE(SUM(total) FILTER (WHERE status != 'cancelled' AND created_at >= date_trunc('day', now())), 0)::int AS revenue_today,
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_orders,
          COUNT(*) FILTER (WHERE status = 'shipped')::int AS shipped_orders,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
          COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::int AS account_orders,
          COUNT(*) FILTER (WHERE customer_id IS NULL)::int AS guest_orders,
          COALESCE(AVG(total) FILTER (WHERE status != 'cancelled'), 0)::int AS avg_order_value
        FROM orders
      `),
      query(`
        SELECT date_trunc('day', created_at)::date AS day,
               COALESCE(SUM(total), 0)::int AS revenue,
               COUNT(*)::int AS orders
        FROM orders
        WHERE status != 'cancelled' AND created_at >= now() - interval '30 days'
        GROUP BY day
        ORDER BY day
      `),
      query(`
        SELECT oi.product_name,
               SUM(oi.qty)::int AS units_sold,
               SUM(oi.qty * oi.unit_price)::int AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status != 'cancelled'
        GROUP BY oi.product_name
        ORDER BY units_sold DESC
        LIMIT 8
      `),
      query(`
        SELECT COUNT(*)::int AS total_customers,
               COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS new_this_month
        FROM customers
      `),
      query(`
        SELECT c.first_name, c.last_name, c.email,
               COUNT(o.id)::int AS order_count,
               SUM(o.total)::int AS total_spent
        FROM customers c
        JOIN orders o ON o.customer_id = c.id AND o.status != 'cancelled'
        GROUP BY c.id
        ORDER BY total_spent DESC
        LIMIT 5
      `),
      query(`
        SELECT id, name, slug, sizes, stock_by_size, low_stock_threshold
        FROM products WHERE active = true
      `),
    ]);

    const dailyMap = new Map(dailyRows.map((r) => [r.day.toISOString().slice(0, 10), r]));
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = dailyMap.get(key);
      daily.push({ day: key, revenue: found ? found.revenue : 0, orders: found ? found.orders : 0 });
    }

    const lowStockProducts = [];
    for (const p of stockRows) {
      const stockBySize = p.stock_by_size || {};
      const threshold = p.low_stock_threshold ?? 5;
      const sizes = p.sizes || [];
      const lowSizes = sizes.filter((s) => Number(stockBySize[s] ?? 0) <= threshold);
      if (lowSizes.length) {
        lowStockProducts.push({
          name: p.name,
          slug: p.slug,
          lowSizes: lowSizes.map((s) => ({ size: s, stock: Number(stockBySize[s] ?? 0) })),
        });
      }
    }
    lowStockProducts.sort((a, b) => Math.min(...a.lowSizes.map((s) => s.stock)) - Math.min(...b.lowSizes.map((s) => s.stock)));

    res.json({
      ...totalsRows[0],
      ...customerTotals[0],
      dailyRevenue: daily,
      bestSellers,
      topCustomers,
      lowStockProducts: lowStockProducts.slice(0, 12),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load analytics" });
  }
});

/* ===================== FEATURE: Flash Sales ===================== */

// GET /api/admin/flash-sales — list all flash sales
router.get("/flash-sales", requireRole("flash_sales", "read"), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT fs.*, 
              json_agg(json_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'price', p.price, 'sale_price', p.sale_price, 'image', p.image)) AS products
       FROM flash_sales fs
       LEFT JOIN LATERAL jsonb_array_elements_text(fs.product_ids) AS pid_text ON true
       LEFT JOIN products p ON p.id = pid_text::int
       GROUP BY fs.id
       ORDER BY fs.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load flash sales" });
  }
});

// POST /api/admin/flash-sales — create a new flash sale
router.post("/flash-sales", requireRole("flash_sales", "create"), async (req, res) => {
  const { name, description, bannerImage, discountType, discountValue, startsAt, endsAt, productIds } = req.body || {};
  if (!name || !startsAt || !endsAt || !productIds?.length) {
    return res.status(400).json({ error: "Name, start/end times, and at least one product are required" });
  }
  const dt = ["percent", "fixed"].includes(discountType) ? discountType : "percent";
  const dv = Number(discountValue);
  if (isNaN(dv) || dv <= 0) return res.status(400).json({ error: "Discount value must be a positive number" });

  try {
    const { rows } = await query(
      `INSERT INTO flash_sales (name, description, banner_image, discount_type, discount_value, starts_at, ends_at, product_ids, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        name.trim(), (description || "").trim(), bannerImage || null,
        dt, dv, startsAt, endsAt, JSON.stringify(productIds),
        req.admin.sub,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create flash sale" });
  }
});

// PATCH /api/admin/flash-sales/:id
router.patch("/flash-sales/:id", requireRole("flash_sales", "update"), async (req, res) => {
  const body = req.body || {};
  const fieldMap = {
    name: "name", description: "description", bannerImage: "banner_image",
    discountType: "discount_type", discountValue: "discount_value",
    startsAt: "starts_at", endsAt: "ends_at", active: "active",
  };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (body.productIds !== undefined) {
    params.push(JSON.stringify(body.productIds));
    sets.push(`product_ids = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE flash_sales SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "Flash sale not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update flash sale" });
  }
});

// DELETE /api/admin/flash-sales/:id
router.delete("/flash-sales/:id", requireRole("flash_sales", "delete"), async (req, res) => {
  try {
    const { rows } = await query("DELETE FROM flash_sales WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Flash sale not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete flash sale" });
  }
});

/* ================ FEATURE: Abandoned Cart Recovery ================ */

// GET /api/admin/abandoned-carts — list abandoned carts
router.get("/abandoned-carts", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ac.*, 
              (ac.cart_data->>'subtotal')::int AS subtotal,
              jsonb_array_length(ac.cart_data->'items') AS item_count
       FROM abandoned_carts ac
       WHERE ac.recovered = false
       ORDER BY ac.last_updated DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load abandoned carts" });
  }
});

// POST /api/admin/abandoned-carts/:id/remind — manually trigger reminder email
router.post("/abandoned-carts/:id/remind", async (req, res) => {
  try {
    const { rows } = await query(
      "UPDATE abandoned_carts SET reminder_sent = true, reminder_sent_at = now() WHERE id = $1 AND recovered = false RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Cart not found or already recovered" });
    const cart = rows[0];
    const { sendAbandonedCartEmail } = require("../lib/email");
    sendAbandonedCartEmail(cart);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send reminder" });
  }
});

// GET /api/admin/abandoned-carts/stats — recovery stats
router.get("/abandoned-carts/stats", async (req, res) => {
  try {
    const { rows: stats } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE recovered = false) AS active_abandoned,
        COUNT(*) FILTER (WHERE recovered = true) AS recovered,
        COUNT(*) FILTER (WHERE reminder_sent = true AND recovered = false) AS reminded,
        COALESCE(SUM((cart_data->>'subtotal')::int) FILTER (WHERE recovered = false), 0)::int AS potential_revenue
      FROM abandoned_carts
    `);
    res.json(stats[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load abandoned cart stats" });
  }
});

module.exports = router;
