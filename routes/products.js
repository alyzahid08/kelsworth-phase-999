const express = require("express");
const { query } = require("../db");
const { requireCustomer, attachCustomerIfPresent } = require("../middleware/customerAuth");

const router = express.Router();

// Reused by any query that needs per-product rating aggregates alongside the
// row itself — avoids a second round trip or N+1 queries for star ratings.
const RATINGS_JOIN = `
  LEFT JOIN (
    SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
    FROM product_reviews GROUP BY product_id
  ) ratings ON ratings.product_id = p.id
`;

function serializeProduct(row) {
  const stockBySize = row.stock_by_size || {};
  const sizesOutOfStock = (row.sizes || []).filter(
    (s) => Object.prototype.hasOwnProperty.call(stockBySize, s) && Number(stockBySize[s]) <= 0
  );
  const lowStockThreshold = row.low_stock_threshold ?? 5;
  const sizesLowStock = (row.sizes || []).filter((s) => {
    const n = Number(stockBySize[s]);
    return Object.prototype.hasOwnProperty.call(stockBySize, s) && n > 0 && n <= lowStockThreshold;
  });
  const gallery = Array.isArray(row.images) && row.images.length ? row.images : [row.image];

  return {
    id: row.slug,
    dbId: row.id,
    name: row.name,
    category: row.category,
    fit: row.fit,
    color: row.color,
    price: row.price,
    salePrice: row.sale_price,
    sizes: row.sizes,
    sizesOutOfStock,
    sizesLowStock,
    stockBySize,
    image: row.image,
    images: gallery,
    videoUrl: row.video_url || null,
    badge: row.badge,
    description: row.description,
    fabric: row.fabric,
    care: row.care,
    inStock: row.stock > 0 && sizesOutOfStock.length < (row.sizes || []).length,
    tags: row.tags || [],
    sku: row.sku || row.slug.toUpperCase(),
    skuBySize: row.sku_by_size || {},
    styleCode: row.style_code || null,
    sizeType: row.size_type || "standard",
    lowStockThreshold,
    completeTheLook: row.complete_the_look || [],
    frequentlyBoughtWith: row.frequently_bought_with || [],
    estimatedDelivery: row.estimated_delivery,
    returnPolicy: row.return_policy,
    material: row.material,
    stretch: row.stretch || "none",
    collection: row.collection || null,
    isBestseller: Boolean(row.is_bestseller),
    rating: row.rating_avg ? Number(row.rating_avg) : 0,
    reviewCount: row.review_count ? Number(row.review_count) : 0,
  };
}

function lightProductCard(row) {
  const stockBySize = row.stock_by_size || {};
  const firstAvailableSize =
    (row.sizes || []).find((s) => !Object.prototype.hasOwnProperty.call(stockBySize, s) || Number(stockBySize[s]) > 0) ||
    (row.sizes || [])[0] ||
    null;
  return {
    id: row.slug,
    name: row.name,
    category: row.category,
    color: row.color,
    price: row.price,
    salePrice: row.sale_price,
    image: row.image,
    badge: row.badge,
    defaultSize: firstAvailableSize,
    rating: row.rating_avg ? Number(row.rating_avg) : 0,
    reviewCount: row.review_count ? Number(row.review_count) : 0,
  };
}

// GET /api/products — list all active products
router.get("/", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, ratings.avg_rating AS rating_avg, ratings.review_count AS review_count
       FROM products p
       ${RATINGS_JOIN}
       WHERE p.active = true ORDER BY p.id ASC`
    );
    // Short and public: the catalog doesn't change every second, and this
    // response has nothing customer-specific in it, so a brief cache takes
    // real load off the DB on a busy storefront without noticeably delaying
    // an admin's price/stock change from showing up.
    res.set("Cache-Control", "public, max-age=30");
    res.json(rows.map(serializeProduct));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load products" });
  }
});

const CATEGORY_LABELS = {
  jeans: "Jeans",
  jackets: "Jackets",
  shorts: "Shorts",
  polos: "Polos",
  tees: "Tees",
  "drop-shoulder-shirts": "Drop Shoulder Shirts",
  "full-sleeve-shirts": "Full Sleeve Shirts",
  wallets: "Wallets",
  caps: "Caps",
  watches: "Watches",
  bracelets: "Bracelets",
};

// GET /api/products/search?q=...&limit=8 — instant search suggestions.
// Registered before /:slug so "search" itself is never mistaken for a slug.
// The catalog is small enough that fetching active products and ranking in
// memory is simpler (and just as fast) as building this out in SQL.
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 8, 20);
  if (!q) return res.json({ query: "", products: [], categories: [] });

  try {
    const { rows } = await query("SELECT * FROM products WHERE active = true");

    const scored = [];
    for (const row of rows) {
      const name = row.name.toLowerCase();
      const haystacks = [row.category, row.color, row.fit, row.sku, ...(row.tags || [])].join(" ").toLowerCase();
      let score = -1;
      if (name.startsWith(q)) score = 100;
      else if (name.includes(q)) score = 70;
      else if (haystacks.includes(q)) score = 40;
      if (score > 0) scored.push({ row, score });
    }
    scored.sort((a, b) => b.score - a.score || a.row.id - b.row.id);

    const products = scored.slice(0, limit).map(({ row }) => ({
      ...lightProductCard(row),
      matchedName: row.name,
    }));

    const categoryCounts = {};
    for (const row of rows) {
      const label = CATEGORY_LABELS[row.category] || row.category;
      if (row.category.toLowerCase().includes(q) || label.toLowerCase().includes(q)) {
        categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
      }
    }
    const categories = Object.entries(categoryCounts).map(([key, count]) => ({
      key, label: CATEGORY_LABELS[key] || key, count,
    }));

    res.set("Cache-Control", "public, max-age=30");
    res.json({ query: q, products, categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

// GET /api/products/reviews/featured?limit=6 — best reviews across the whole
// catalog, for the homepage testimonials section. "Best" = highest rating,
// then most helpful votes, then most recent. Registered before /:slug so
// "reviews" is never mistaken for a product slug.
router.get("/reviews/featured", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 6, 20);
  try {
    const { rows } = await query(
      `SELECT r.id, r.customer_name, r.rating, r.title, r.body, r.verified_purchase, r.helpful_count, r.created_at,
              p.name AS product_name, p.slug AS product_slug
       FROM product_reviews r
       JOIN products p ON p.id = r.product_id AND p.active = true
       WHERE r.rating >= 4 AND length(r.body) > 20
       ORDER BY r.rating DESC, r.helpful_count DESC, r.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.set("Cache-Control", "public, max-age=60");
    res.json(
      rows.map((r) => ({
        id: r.id,
        customerName: r.customer_name,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verifiedPurchase: r.verified_purchase,
        helpfulCount: r.helpful_count,
        createdAt: r.created_at,
        productName: r.product_name,
        productId: r.product_slug,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load featured reviews" });
  }
});

// GET /api/products/:slug — single product by slug (e.g. vw-101)
router.get("/:slug", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, ratings.avg_rating AS rating_avg, ratings.review_count AS review_count
       FROM products p
       ${RATINGS_JOIN}
       WHERE p.slug = $1 AND p.active = true`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.set("Cache-Control", "public, max-age=30");
    res.json(serializeProduct(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load product" });
  }
});

// GET /api/products/:slug/variants — sibling color variants of the same
// style (products sharing a style_code), plus curated cross-sell products
// (Complete the Look / Frequently Bought Together / category-related).
router.get("/:slug/variants", async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM products WHERE slug = $1 AND active = true",
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    const product = rows[0];

    let colorVariants = [];
    if (product.style_code) {
      const { rows: siblings } = await query(
        "SELECT * FROM products WHERE style_code = $1 AND active = true ORDER BY id ASC",
        [product.style_code]
      );
      colorVariants = siblings.map((s) => ({
        id: s.slug,
        color: s.color,
        image: (Array.isArray(s.images) && s.images.length ? s.images[0] : s.image),
        inStock: s.stock > 0,
      }));
    }

    const wantedSlugs = [
      ...(product.complete_the_look || []),
      ...(product.frequently_bought_with || []),
    ];
    let curated = [];
    if (wantedSlugs.length) {
      const { rows: curatedRows } = await query(
        `SELECT p.*, ratings.avg_rating AS rating_avg, ratings.review_count AS review_count
         FROM products p ${RATINGS_JOIN}
         WHERE p.slug = ANY($1::text[]) AND p.active = true`,
        [wantedSlugs]
      );
      curated = curatedRows;
    }
    const bySlug = Object.fromEntries(curated.map((r) => [r.slug, lightProductCard(r)]));

    const { rows: relatedRows } = await query(
      `SELECT p.*, ratings.avg_rating AS rating_avg, ratings.review_count AS review_count
       FROM products p ${RATINGS_JOIN}
       WHERE p.category = $1 AND p.slug != $2 AND p.active = true ORDER BY p.id ASC LIMIT 8`,
      [product.category, product.slug]
    );

    res.json({
      colorVariants,
      completeTheLook: (product.complete_the_look || []).map((s) => bySlug[s]).filter(Boolean),
      frequentlyBoughtWith: (product.frequently_bought_with || []).map((s) => bySlug[s]).filter(Boolean),
      related: relatedRows.map(lightProductCard),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load related products" });
  }
});

/* ------------------------------- Reviews ------------------------------- */

const REVIEW_SORTS = {
  recent: "created_at DESC",
  helpful: "helpful_count DESC, created_at DESC",
  rating_high: "rating DESC, created_at DESC",
  rating_low: "rating ASC, created_at DESC",
};

// GET /api/products/:slug/reviews?sort=recent&rating=5
router.get("/:slug/reviews", async (req, res) => {
  try {
    const { rows: productRows } = await query("SELECT id FROM products WHERE slug = $1", [req.params.slug]);
    if (!productRows.length) return res.status(404).json({ error: "Product not found" });
    const productId = productRows[0].id;

    const sortKey = REVIEW_SORTS[req.query.sort] ? req.query.sort : "recent";
    const clauses = ["product_id = $1"];
    const params = [productId];
    if (req.query.rating) {
      params.push(Number(req.query.rating));
      clauses.push(`rating = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT * FROM product_reviews WHERE ${clauses.join(" AND ")} ORDER BY ${REVIEW_SORTS[sortKey]}`,
      params
    );
    const { rows: summaryRows } = await query(
      `SELECT rating, COUNT(*)::int AS count FROM product_reviews WHERE product_id = $1 GROUP BY rating`,
      [productId]
    );
    const countsByRating = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;
    summaryRows.forEach((r) => {
      countsByRating[r.rating] = r.count;
      total += r.count;
      sum += r.rating * r.count;
    });

    res.json({
      average: total ? Math.round((sum / total) * 10) / 10 : 0,
      total,
      countsByRating,
      reviews: rows.map((r) => ({
        id: r.id,
        customerName: r.customer_name,
        rating: r.rating,
        title: r.title,
        body: r.body,
        images: r.images || [],
        videoUrl: r.video_url,
        verifiedPurchase: r.verified_purchase,
        helpfulCount: r.helpful_count,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load reviews" });
  }
});

// POST /api/products/:slug/reviews — logged-in customers only
router.post("/:slug/reviews", requireCustomer, async (req, res) => {
  const { rating, title, body, images, videoUrl } = req.body || {};
  const ratingNum = Number(rating);
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: "Rating must be between 1 and 5" });
  }
  try {
    const { rows: productRows } = await query("SELECT id FROM products WHERE slug = $1", [req.params.slug]);
    if (!productRows.length) return res.status(404).json({ error: "Product not found" });
    const productId = productRows[0].id;

    const { rows: customerRows } = await query(
      "SELECT first_name, last_name FROM customers WHERE id = $1",
      [req.customer.sub]
    );
    const customerName = customerRows.length
      ? `${customerRows[0].first_name} ${customerRows[0].last_name.charAt(0)}.`
      : "Verified Shopper";

    const { rows: purchaseRows } = await query(
      `SELECT 1 FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.customer_id = $1 AND oi.product_id = $2 LIMIT 1`,
      [req.customer.sub, productId]
    );
    const verifiedPurchase = purchaseRows.length > 0;

    const { rows } = await query(
      `INSERT INTO product_reviews
        (product_id, customer_id, customer_name, rating, title, body, images, video_url, verified_purchase)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        productId, req.customer.sub, customerName, ratingNum,
        (title || "").slice(0, 120), (body || "").slice(0, 3000),
        JSON.stringify(Array.isArray(images) ? images.slice(0, 6) : []),
        videoUrl || null, verifiedPurchase,
      ]
    );
    const r = rows[0];
    res.status(201).json({
      id: r.id, customerName: r.customer_name, rating: r.rating, title: r.title, body: r.body,
      images: r.images || [], videoUrl: r.video_url, verifiedPurchase: r.verified_purchase,
      helpfulCount: r.helpful_count, createdAt: r.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not submit review" });
  }
});

// POST /api/products/:slug/reviews/:reviewId/helpful — one vote per visitor.
// Logged-in customers vote with their customer id; guests vote with a
// lightweight anonymous id sent from the browser (localStorage-backed), so
// no account is required to mark a review helpful.
router.post("/:slug/reviews/:reviewId/helpful", attachCustomerIfPresent, async (req, res) => {
  const voterKey = req.customer ? `c:${req.customer.sub}` : `a:${(req.body && req.body.anonId) || req.ip}`;
  try {
    const inserted = await query(
      "INSERT INTO review_votes (review_id, voter_key) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id",
      [req.params.reviewId, voterKey]
    );
    if (!inserted.rows.length) {
      const { rows } = await query("SELECT helpful_count FROM product_reviews WHERE id = $1", [req.params.reviewId]);
      return res.json({ helpfulCount: rows[0]?.helpful_count ?? 0, alreadyVoted: true });
    }
    const { rows } = await query(
      "UPDATE product_reviews SET helpful_count = helpful_count + 1 WHERE id = $1 RETURNING helpful_count",
      [req.params.reviewId]
    );
    res.json({ helpfulCount: rows[0]?.helpful_count ?? 0, alreadyVoted: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not register vote" });
  }
});

module.exports = router;
