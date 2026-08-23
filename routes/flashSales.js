const express = require("express");
const { query } = require("../db");

const router = express.Router();

// GET /api/flash-sales — public endpoint: returns currently active flash sales
// with their discounted product prices applied on the fly.
router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const { rows } = await query(
      `SELECT * FROM flash_sales
       WHERE active = true AND starts_at <= $1 AND ends_at > $1
       ORDER BY ends_at ASC`,
      [now]
    );

    // Auto-expire any that just ended (best-effort, idempotent)
    await query(
      `UPDATE flash_sales SET active = false
       WHERE active = true AND ends_at <= $1`,
      [now]
    );

    if (!rows.length) {
      return res.json({ flashSales: [], flashProductPrices: {} });
    }

    // Gather all product IDs across all active flash sales
    const allProductIds = new Set();
    for (const sale of rows) {
      for (const pid of sale.product_ids || []) {
        allProductIds.add(pid);
      }
    }

    // Fetch all affected products in one query
    const { rows: products } = await query(
      `SELECT id, slug, price, sale_price FROM products WHERE id = ANY($1::int[]) AND active = true`,
      [Array.from(allProductIds)]
    );
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

    // Build the flash price map: { "slug": { flashPrice, originalPrice, discountLabel } }
    const flashProductPrices = {};
    const flashSales = rows.map((sale) => {
      const saleProducts = (sale.product_ids || [])
        .map((pid) => productMap[pid])
        .filter(Boolean)
        .map((p) => {
          const originalPrice = p.sale_price ?? p.price;
          let flashPrice = originalPrice;
          let discountLabel = "";

          if (sale.discount_type === "percent") {
            flashPrice = Math.round(originalPrice * (1 - sale.discount_value / 100));
            discountLabel = `${sale.discount_value}% OFF`;
          } else {
            flashPrice = Math.max(0, originalPrice - sale.discount_value);
            discountLabel = `Rs. ${sale.discount_value} OFF`;
          }

          flashProductPrices[p.slug] = {
            flashPrice,
            originalPrice,
            discountLabel,
            saleName: sale.name,
            saleEndsAt: sale.ends_at,
          };

          return {
            slug: p.slug,
            name: p.name,
            image: p.image,
            originalPrice: p.price,
            currentPrice: p.sale_price,
            flashPrice,
            discountLabel,
          };
        });

      return {
        id: sale.id,
        name: sale.name,
        description: sale.description,
        bannerImage: sale.banner_image,
        discountLabel: sale.discount_type === "percent" ? `${sale.discount_value}% OFF` : `Rs. ${sale.discount_value} OFF`,
        startsAt: sale.starts_at,
        endsAt: sale.ends_at,
        products: saleProducts,
      };
    });

    res.set("Cache-Control", "public, max-age=30");
    res.json({ flashSales, flashProductPrices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load flash sales" });
  }
});

module.exports = router;
