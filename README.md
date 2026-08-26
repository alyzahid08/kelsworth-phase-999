# AL-QUTUZ — Full Store (Backend + Admin Panel)

This is the complete, order-taking version of the site: a Node.js backend
with a real database, sitting behind the storefront — plus an admin panel
to manage products, stock, orders, and promo codes.

> Note: the npm package name (`kelsworth-backend`) and the Render service
> name in `render.yaml` were intentionally left unchanged during the
> AL-QUTUZ rebrand — renaming either would change deploy URLs/slugs for an
> already-provisioned service. Rename them only if you're setting up a
> fresh deployment.

```
server.js               App entry point
db.js                    Database connection + transaction helper
schema.sql                Table definitions (run automatically by the seed script)
seed.js                    Creates tables, demo products, your first admin login,
                            and backfills stock for products that predate stock tracking
routes/                    API endpoints
  products.js                Public product listing/detail/search/reviews/variants
  orders.js                   Checkout, stock decrement, order lookup
  customers.js                 Register/login/order history/addresses/wishlist
  contact.js                    Public contact form submissions
  promo.js                      Public promo code validation (cart preview)
  adminAuth.js                   Admin login/logout/change password
  admin.js                        Admin CRUD: orders, products, promo codes,
                                   analytics, contact messages, review moderation
middleware/
  auth.js                    Admin login/session handling
  customerAuth.js             Customer login/session handling (separate from admin)
lib/
  email.js                   Order confirmation/status/welcome emails (optional)
  promo.js                    Shared promo code validation logic
public/                    The storefront
  index.html                  Home — new arrivals, best sellers, testimonials
  collection.html               Full catalog with live search + multi-filters
  product.html                    Gallery, variants, reviews, cross-sell
  cart.html, checkout.html          Cart and checkout (guest or logged in)
  account.html                       Orders, wishlist, addresses, profile
  track.html                          Order tracking (order number + email)
  about.html, contact.html, faq.html,   Business/trust pages
  shipping.html, refund.html,
  privacy.html
  robots.txt                          Crawler rules (sitemap.xml is generated
                                       dynamically by server.js, not a static file)
admin/                     The admin panel
  login.html, index.html (orders), dashboard.html (analytics), products.html,
  promo-codes.html, messages.html (contact form submissions)
```

## 1. What you need before starting
- **Node.js** installed on your computer (v18 or newer) — from nodejs.org
- A place to run this and a database. Recommended, and genuinely free to
  start: **Render** (web service) + **Neon** (Postgres) — see below.

## 2. Recommended hosting: Render + Neon (free)
Render's free web service tier and Neon's free Postgres tier are both
enough to run this store — no card required to start. They're two separate
signups (Render doesn't keep a no-cost Postgres option anymore), but it
only takes a few minutes total.

**2a. Database — Neon:**
1. Go to **neon.tech**, sign up, create a project.
2. Copy the **connection string** it gives you (starts with
   `postgresql://...`) — that's your `DATABASE_URL`.

**2b. App — Render:**
1. Push this folder to a GitHub repository if you haven't already.
2. Go to **render.com**, sign up, click **New +** → **Web Service**, and
   connect that repo. Render reads `render.yaml` in this folder
   automatically and pre-fills the build/start commands and health check —
   you can also set these up manually if you'd rather not use the blueprint.
3. Under **Environment**, add:
   - `DATABASE_URL` — the Neon connection string from step 2a
   - `JWT_SECRET` — any long random string (generate one locally with
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `ADMIN_INITIAL_USERNAME` / `ADMIN_INITIAL_PASSWORD`
   - `NODE_ENV` — `production`
   - Optional email/payment gateway variables — see the relevant sections
     below
4. Deploy. Render gives you a free `*.onrender.com` URL, or connect your
   own domain under **Settings → Custom Domains**.
5. The **first deploy** needs the database tables created. Render's free
   tier doesn't include a separate pre-deploy step, so either:
   - run `npm run seed` once yourself against the Neon `DATABASE_URL` from
     your own computer (`DATABASE_URL=<paste> npm run seed`), before or
     after the first deploy, **or**
   - temporarily change Render's **Start Command** to
     `npm run seed && npm start` for the first deploy, then change it back
     to `npm start` afterwards (see section 4 below for why you don't need
     to keep it there).

**Worth knowing about the free tiers:**
- Render's free web service **spins down after 15 minutes with no
  traffic** and takes ~30–50 seconds to wake back up on the next request —
  fine for a low-traffic store, but the first visitor after a quiet spell
  waits a bit. The background scheduler in `server.js` (abandoned-cart
  reminders, order/payment timeouts) only runs while the service is awake,
  so those checks effectively pause during sleep and resume next time
  someone hits the site — not a correctness problem, just a delay.
- Neon's free tier is a genuinely persistent database (no "deleted after
  90 days" catch), with generous storage for a store this size.
- Both are worth checking at signup time — free-tier terms on hosting
  platforms change fairly often.

**Alternative:** Fly.io is a solid option too if you'd rather have one
account for both app and database (it can host Postgres too), though its
free allowance is smaller and it asks for a card up front. Railway also
works well if you'd rather pay a few dollars a month for a no-sleep,
single-dashboard setup.

## 3. Running it on your own computer first (recommended before deploying)
1. `npm install`
2. Get a database connection string — a free Postgres database at
   **neon.tech** or **supabase.com** takes under a minute to set up.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `JWT_SECRET`,
   `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`.
4. `npm run seed` — sets up tables, demo products, and your admin login.
5. `npm start`
6. Open **http://localhost:3000** for the storefront, and
   **http://localhost:3000/admin/login.html** for the admin panel.

## 4. Updating an already-live store (important)
This project's database schema will keep growing as new features are added.
`schema.sql` and `seed.js` are both written to be **safe to re-run any
time** — every statement either checks "does this already exist?" first, or
only fills in what's missing (like backfilling starter stock for products
that existed before per-size stock tracking did). Re-running never deletes
or overwrites data you already have.

**Practical takeaway:** after pulling any future update from me, run
`npm run seed` once against your live `DATABASE_URL` (from your own
computer, same as step 2b) before or after redeploying. If you're on a host
with a pre-deploy/release-command setting (Railway, for instance), pointing
that at `npm run seed` makes this automatic on every deploy.

## 5. Logging into the admin panel
`/admin/login.html` — log in with your `ADMIN_INITIAL_USERNAME` /
`ADMIN_INITIAL_PASSWORD`. You'll land on the **Dashboard**. From there:
- **Dashboard** — revenue (today/this month/all-time), order status
  breakdown, a 30-day revenue chart, best-selling products, top customers
  by spend, and low-stock alerts. All computed directly in the database, so
  it stays fast as orders grow.
- **Orders** — every order lands here. Search, filter by status, view full
  details, update status (Pending → Processing → Shipped → Delivered —
  each status change emails the customer if SMTP is configured), export
  the current filtered list to CSV.
- **Products** — add, edit, delete, or hide products. Each size gets its
  own stock number — set a size to 0 to show it as sold out on the
  storefront without deleting the product. Low/out-of-stock items are
  flagged in the list, and a checkbox flags a product for the homepage
  Best Sellers row.
- **Promo Codes** — create percentage-off codes, optionally with a minimum
  order value and an expiry date. Disable a code any time without deleting
  it (so past orders that used it stay accurate).
- **Messages** — every contact form submission from `/contact.html` lands
  here (and is saved even if you haven't set up SMTP yet — email is just a
  notification on top, the database is always the source of truth).

**Change your password** after first login — no UI button for this yet, but
the API supports it: `POST /api/admin/change-password` with
`{"currentPassword": "...", "newPassword": "..."}` while logged in.

## 6. Turning on transactional emails (optional)
Without any setup, the store still works fine — emails just don't send (the
order/message is still saved either way). To turn emails on:

1. Sign up for a free transactional email provider — **Brevo** (brevo.com)
   is a solid free option (300 emails/day free).
2. In Brevo: **SMTP & API** settings → copy your SMTP login details.
3. Add these to your `.env` (or Railway Variables):
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
   - Optionally `CONTACT_TO_EMAIL` if you want contact form notifications
     sent somewhere other than `SMTP_USER`
4. Redeploy — that's it, no code changes needed.

Once configured, four emails send automatically: order confirmation
(checkout), order status updates (whenever an admin changes an order's
status), a welcome email (new account signup), and contact form
notifications (with reply-to set to the sender, so you can just hit reply).

## 7. Customer accounts vs. guest checkout
Customers can check out as a guest (no account needed) or create an account
at `/account.html` for order history and faster checkout next time. Both
paths save real orders — an account just links future orders to that
customer and lets them see past ones.

## 8. Adding real product photos
Products currently use flat illustrated placeholders. Drop real photos into
`public/images/`, then set each product's **Image path or URL** field in
the admin Products page to `/images/your-file.jpg`. For a store with many
photos, cloud image storage (e.g. Cloudinary) is worth adding later instead
of storing files on the server — ask me when you're ready.

## 9. What's real vs. what's next
**Real and working right now:**
- Full product experience — image gallery with zoom/lightbox/swipe, color
  and waist×length variants, fabric/care/shipping info, SKU and stock/low-
  stock indicators, tags, share buttons
- Live search (instant suggestions, thumbnails, keyboard nav, recent
  searches) and multi-filter browsing (price, size, color, material,
  stretch, collection, fit, availability)
- Star ratings and a full review system (verified purchase badges, photo/
  video uploads, helpful votes, sorting/filtering) — shown on the product
  page and as a summary on every product card sitewide
- Complete the Look, Frequently Bought Together, and Related Products
- Cart: free shipping progress bar, save for later, recommendations,
  estimated shipping/tax, auto-revalidated promo codes
- Checkout: guest checkout, saved addresses with autofill, city
  autocomplete, phone validation, delivery notes, gift messages
- Customer accounts: order history with reorder + printable invoice,
  wishlist, recently viewed, saved addresses, profile photo, notification
  preferences
- Product catalog with per-size stock tracking — checkout blocks orders
  that would oversell a size, and decrements stock safely even if two
  people check out for the last unit at the same moment
- Promo/discount codes, validated both in the cart and again at checkout
- Admin panel: order management (search/filter/status/CSV export), product
  management (with low-stock badges and a bestseller flag), promo codes,
  contact message inbox, review moderation, and an analytics dashboard
  (revenue, 30-day trend, best sellers, top customers, low-stock alerts)
- Emails (once SMTP is configured — see section 6): order confirmation,
  order status updates, welcome email on signup, contact form notifications
- Business pages: About, Contact (working form), FAQ, Shipping, Refund &
  Returns, Privacy Policy — plus trust badges and an honest payment note
  (Cash on Delivery only; no fake card logos)
- SEO: Open Graph/Twitter tags and canonical URLs on every page, a
  dynamically generated `/sitemap.xml` (includes every active product,
  regenerated on each request — no rebuild step needed), `robots.txt`,
  and JSON-LD structured data (Organization/WebSite on the homepage,
  Product/AggregateRating/BreadcrumbList on product pages)
- Accessibility: skip-to-content link, visible keyboard focus states
  everywhere, `aria-live` announcements for actions like "added to cart,"
  `role="alert"` on form errors, `prefers-reduced-motion` support
- Mobile: bottom tab bar, sticky add-to-cart/checkout bars, larger tap
  targets, skeleton loading states, lazy-loaded images

**Known limitations worth knowing about:**
- Review photos and profile pictures are stored as base64 in Postgres —
  fine at this scale, but swap for real object storage (S3/Cloudinary)
  before it grows much further
- "Invoices" are a print-ready HTML page (browser's own Print → Save as
  PDF), not a generated PDF file — there's no PDF library in this project
- City autocomplete at checkout is a plain list of major Pakistani cities,
  not full street-address lookup (that needs a paid Places API key)
- The social share image (`public/images/og-banner.svg`) is an SVG — most
  platforms handle this fine, but WhatsApp/Facebook previews are most
  reliable with a real JPG/PNG. Swap that file for an exported PNG
  (1200×630) whenever you have one, no code changes needed

**Still ahead** (happy to start any of these next):
- Flash sales, abandoned-cart recovery, courier tracking integration
- WhatsApp notifications/support
- Staff roles/permissions (currently a single admin login with full access)
- Real generated PDF invoices, and full address autocomplete

Tell me which of those you want next and I'll pick it up the same way as
everything else here — incrementally, without touching what already works.

## 10. Reducing fake / prank COD orders (WhatsApp confirmation)
Every Cash on Delivery order now gets held as **"Awaiting reply"** until the
customer confirms it — either by replying `YES` on WhatsApp or tapping a
confirmation link — instead of going straight to fulfillment. Prepaid orders
(card/JazzCash/Easypaisa/PayFast) skip this entirely, since payment already
proves intent.

**How it works:**
1. Customer places a COD order → they immediately get a WhatsApp message
   asking them to reply YES or tap a link.
2. Tapping the link hits `/confirm-order.html`, which calls
   `GET /api/orders/confirm?token=...` and marks the order confirmed.
3. Replying "YES" (or "y", "ok", "confirm") on WhatsApp does the same thing,
   if you've connected the inbound webhook (see below) — otherwise the link
   alone still works fine.
4. Orders left unconfirmed for `WHATSAPP_CONFIRM_WINDOW_HOURS` (default 6)
   are automatically marked **"Unconfirmed"** by a background sweep that
   runs every 30 minutes — nothing is auto-cancelled, it just flags the
   order so an admin can call the customer, cancel it, or ask for advance
   payment before shipping.
5. The Orders page in the admin panel shows a confirmation badge per order
   (🟢 Confirmed / 🟡 Awaiting reply / 🔴 Unconfirmed / — Prepaid), and lets
   an admin manually mark an order confirmed (e.g. after calling the
   customer directly) from the order detail view.

**Setup:**
- This reuses the same WhatsApp Business (Meta Cloud API) credentials as
  your existing order-status notifications — `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`. Without these
  set, WhatsApp sends are skipped (logged, not failed) and customers can
  still confirm via the link if you surface it another way — but for the
  message to go out at all, WhatsApp needs to be configured.
- To let customers confirm by replying "YES" (instead of only the link),
  point your Meta app's webhook at `https://yourdomain.com/api/webhooks/whatsapp`
  and set `WHATSAPP_VERIFY_TOKEN` to whatever verify token you choose in the
  Meta dashboard. This step is optional — the link-based flow works without it.
- Optional: `WHATSAPP_CONFIRM_WINDOW_HOURS` (default `6`) controls how long
  an order waits before being flagged unconfirmed.
- `SITE_ORIGIN` (already used for the sitemap) is reused to build the
  confirmation link, so make sure it's set to your real domain in production.

## 11. Debit/credit card payments (JazzCash & EasyPaisa)
Checkout now offers JazzCash and EasyPaisa alongside COD (Stripe was already
wired up from before, but isn't realistic for a Pakistan-settled business —
see the note below). Both are "hosted checkout" gateways: the customer is
redirected to a page hosted by JazzCash/EasyPaisa, enters their **debit or
credit card** (or wallet) there, and is bounced back to us once done. We
never see or store card numbers.

**How it works:**
1. Customer picks JazzCash or EasyPaisa at checkout → the order is created
   immediately as **unpaid** (`payment_status = 'pending'`), same as any
   order, so it has an order number to reference.
2. The browser is redirected (via an auto-submitted form — required, since
   the security hash has to travel as POST data) to the gateway's hosted
   page.
3. Customer pays. The gateway POSTs the result straight back to
   `/api/payment/webhook/jazzcash` or `/api/payment/webhook/easypaisa` on
   our server — this is also the "Return URL" registered with the gateway,
   so it does double duty as both the payment confirmation and the browser
   bounce-back target.
4. We **recompute the secure hash ourselves** and compare it before trusting
   the callback — we never trust a bare "success" flag from an unverified
   POST, since that would let anyone mark any order paid by hitting the URL
   directly.
5. Only once verified does the order flip to `payment_status = 'paid'`, and
   the customer gets their WhatsApp/email confirmation — not before, so
   nobody gets a "your order is confirmed" message for an order they never
   actually paid for.
6. The customer lands on `/payment-return.html` showing whether it went
   through.

**Setup — JazzCash:**
- `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_HASH_KEY` (called
  "Integrity Salt" in some JazzCash docs) — issued when you register as a
  JazzCash merchant.
- `JAZZCASH_MODE=production` when you go live (defaults to their sandbox
  otherwise).
- Register `https://yourdomain.com/api/payment/webhook/jazzcash` as your
  Return URL with JazzCash.

**Setup — EasyPaisa:**
- `EASYPAISA_STORE_ID`, `EASYPAISA_HASH_KEY` (Account Settings > Generate
  Hashkey in their merchant portal).
- `EASYPAISA_MODE=production` when you go live.
- Register `https://yourdomain.com/api/payment/webhook/easypaisa` as your
  postBackURL with EasyPaisa.

**Be honest about before you go live:** I built JazzCash's request/response
signing against their publicly documented Hosted Checkout Page (HCP)
algorithm, which is consistent and well-established across independent
sources — reasonably confident in it, but you should still run a real
sandbox transaction before taking live payments. EasyPaisa's exact hash
algorithm is less consistently documented publicly (it's typically emailed
to merchants directly as a PDF on signup); what's implemented here follows
the common pattern their own integration guides describe, but **you should
verify it against your actual EasyPaisa merchant integration PDF once you
have credentials** — if it's wrong, transactions will simply fail
verification (safe — it won't mark unpaid orders as paid), so worst case is
a broken checkout, not a security hole. Send me that PDF or your sandbox
credentials once you have them and I'll double check the exact fields.

**Why not Stripe:** Stripe requires the merchant to have a business entity
in a country Stripe supports for payouts, and Pakistan isn't one of them —
so even though this codebase has Stripe wired up, it can't actually pay a
Pakistan-based business out. It's left in as an option in case you ever
incorporate somewhere Stripe supports, but JazzCash/EasyPaisa are the real
path for Pakistani debit/credit cards.

**Abandoned payments are handled automatically:** if a customer picks
JazzCash/EasyPaisa and never completes payment on the gateway's page, a
background sweep (same pattern as the COD confirmation sweep, every 30
minutes) cancels the order and gives the reserved stock back after
`GATEWAY_PAYMENT_TIMEOUT_HOURS` (default `2`) with no payment callback.

## 12. Debit/credit card & bank payments (PayFast)
PayFast is now a third checkout option alongside JazzCash/EasyPaisa. It's
also a Pakistani hosted-checkout gateway — same shape as the other two (the
customer pays on PayFast's page, we never see card numbers) — but PayFast
adds one extra step in front: before we can show the checkout form, our
server has to fetch a short-lived **access token** from PayFast using your
merchant credentials.

**How it works:**
1. Customer picks PayFast at checkout → order is created as **unpaid**,
   same as any order.
2. Our server calls PayFast's `/token` endpoint with your `MERCHANT_ID` and
   `SECURED_KEY` to get a short-lived access token (cached and reused until
   it's close to expiring).
3. We sign the request (`md5(merchant_id:merchant_name:amount:order_id)`)
   and the browser is auto-redirected (via a POSTed form — same reason as
   JazzCash: the signature has to travel as form data) to PayFast's hosted
   checkout page, with that token embedded.
4. Customer pays. PayFast bounces the browser back to
   `/api/payment/webhook/payfast` (registered as both `SUCCESS_URL` and
   `FAILURE_URL`) with the result.
5. We look up the order's **actual** total from our own database — not
   whatever the callback claims — and recompute the signature ourselves
   before trusting it, same "verify, don't trust" rule as the other
   gateways.
6. Only once verified does the order flip to `payment_status = 'paid'`, and
   the customer lands on `/payment-return.html`.

**Setup — PayFast:**
- `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_NAME`, `PAYFAST_SECURED_KEY` —
  issued when you sign up as a PayFast merchant at
  [gopayfast.com](https://gopayfast.com).
- `PAYFAST_MODE=production` when you go live (defaults to their sandbox
  otherwise).
- Register `https://yourdomain.com/api/payment/webhook/payfast` as both
  your Success and Failure URL with PayFast.

**Be honest about before you go live:** PayFast's own developer docs cover
their card-level API (where your server would handle raw card numbers —
that needs PCI DSS certification, and isn't what's built here on purpose).
What's implemented is their **hosted checkout** flow instead, so card data
never touches our server — but that flow is far less consistently
documented publicly; I built it from PayFast's docs plus a well-regarded
open-source integration package as a reference, not from an official hosted-
checkout spec sheet. Test a real sandbox transaction and confirm the field
names/signature format against your actual PayFast merchant integration
guide before taking live payments — same "safe failure" story as EasyPaisa:
if something's off, PayFast just rejects the signature rather than letting
an unpaid order slip through as paid.

**Abandoned payments are handled automatically:** if a customer picks
JazzCash/EasyPaisa/PayFast and never completes payment on the gateway's
page, a background sweep (same pattern as the COD confirmation sweep, every
30 minutes) cancels the order and gives the reserved stock back after
`GATEWAY_PAYMENT_TIMEOUT_HOURS` (default `2`) with no payment callback.
