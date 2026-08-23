require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

const { requireAdminPage } = require("./middleware/auth");
const { query } = require("./db");
const productsRoute = require("./routes/products");
const ordersRoute = require("./routes/orders");
const adminAuthRoute = require("./routes/adminAuth");
const adminRoute = require("./routes/admin");
const customersRoute = require("./routes/customers");
const promoRoute = require("./routes/promo");
const contactRoute = require("./routes/contact");
const flashSalesRoute = require("./routes/flashSales");
const addressesRoute = require("./routes/addresses");
const paymentRoute = require("./routes/payment");
const cartRoute = require("./routes/cart");
const whatsappWebhookRoute = require("./routes/whatsappWebhook");

const app = express();

app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());

// ---- Health check ----
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---- API routes ----
app.use("/api/products", productsRoute);
app.use("/api/orders", ordersRoute);
app.use("/api/customers", customersRoute);
app.use("/api/promo", promoRoute);
app.use("/api/contact", contactRoute);
app.use("/api/admin", adminAuthRoute);
app.use("/api/admin", adminRoute);
app.use("/api/flash-sales", flashSalesRoute);
app.use("/api/addresses", addressesRoute);
app.use("/api/payment", paymentRoute);
app.use("/api/cart", cartRoute);
app.use("/api/webhooks/whatsapp", whatsappWebhookRoute);

// ---- Admin panel (protected static HTML) ----
app.get("/admin/dashboard.html", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "dashboard.html"))
);
app.get("/admin/index.html", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "index.html"))
);
app.get("/admin/products.html", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "products.html"))
);
app.get("/admin/promo-codes.html", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "promo-codes.html"))
);
app.get("/admin/staff.html", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "staff.html"))
);
app.get("/admin/flash-sales.html", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "flash-sales.html"))
);
app.get("/admin/abandoned-carts.html", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "abandoned-carts.html"))
);
app.get("/admin/", requireAdminPage, (req, res) =>
  res.sendFile(path.join(__dirname, "admin", "dashboard.html"))
);
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ---- Public storefront ----
const publicStaticOptions = {
  etag: true,
  setHeaders: (res, filePath) => {
    if (/\.(css|js)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=3600");
    } else if (/\.(svg|png|jpe?g|webp|gif|ico)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=604800");
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
};

// ---- sitemap.xml ----
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.kelsworth.com";
const STATIC_PAGES = [
  "", "collection.html", "about.html", "contact.html", "faq.html",
  "shipping.html", "refund.html", "privacy.html", "track.html",
];

app.get("/sitemap.xml", async (req, res) => {
  try {
    const { rows } = await query("SELECT slug FROM products WHERE active = true ORDER BY id ASC");
    const urls = [
      ...STATIC_PAGES.map((p) => `${SITE_ORIGIN}/${p}`),
      ...rows.map((r) => `${SITE_ORIGIN}/product.html?id=${r.slug}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Could not generate sitemap");
  }
});

app.use(express.static(path.join(__dirname, "public"), publicStaticOptions));

// Friendly JSON 404 for unmatched API routes
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Kelsworth server running on port ${PORT}`);

  // ---- Abandoned Cart Reminder Scheduler ----
  // Runs every 30 minutes to check for abandoned carts and send reminders.
  // In production, you'd use node-cron or an external cron job that
  // hits a dedicated endpoint. This setInterval is simple and effective.
  const { sendAbandonedCartReminders } = require("./routes/cart");
  const { checkExpiredOrderConfirmations, checkExpiredGatewayPayments } = require("./routes/orders");
  setInterval(() => {
    sendAbandonedCartReminders().catch((err) => console.error("[scheduler]", err.message));
    checkExpiredOrderConfirmations().catch((err) => console.error("[scheduler]", err.message));
    checkExpiredGatewayPayments().catch((err) => console.error("[scheduler]", err.message));
  }, 30 * 60 * 1000); // every 30 minutes

  // Run once at startup (with a short delay to let the server warm up)
  setTimeout(() => {
    sendAbandonedCartReminders().catch((err) => console.error("[scheduler]", err.message));
    checkExpiredOrderConfirmations().catch((err) => console.error("[scheduler]", err.message));
    checkExpiredGatewayPayments().catch((err) => console.error("[scheduler]", err.message));
  }, 5000);
});
