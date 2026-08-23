-- Kelsworth — database schema (PostgreSQL)
-- Run automatically by `npm run seed` — you don't need to run this by hand.
-- Safe to re-run any time: every statement uses IF NOT EXISTS, so re-running
-- this after a code update will only add what's missing, never touch existing data.

CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,       -- jeans | jackets | shorts | polos | tees | drop-shoulder-shirts | full-sleeve-shirts | wallets | watches | caps | bracelets
  fit           TEXT NOT NULL,       -- slim | straight | regular | relaxed | skinny
  color         TEXT NOT NULL,
  price         INTEGER NOT NULL,    -- PKR, whole rupees
  sale_price    INTEGER,             -- null when not on sale
  sizes         JSONB NOT NULL DEFAULT '[]',
  image         TEXT NOT NULL,
  badge         TEXT,                -- "New" | "Sale" | null
  description   TEXT NOT NULL DEFAULT '',
  fabric        TEXT NOT NULL DEFAULT '',
  care          TEXT NOT NULL DEFAULT '',
  stock         INTEGER NOT NULL DEFAULT 100,   -- legacy total; stock_by_size is now the source of truth
  stock_by_size JSONB NOT NULL DEFAULT '{}',    -- e.g. {"30": 12, "32": 8}
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id             SERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  phone          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  order_number    TEXT UNIQUE NOT NULL,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL, -- null = guest checkout
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  postal_code     TEXT,
  payment_method  TEXT NOT NULL DEFAULT 'cod',
  promo_code      TEXT,
  subtotal        INTEGER NOT NULL,
  shipping        INTEGER NOT NULL DEFAULT 0,
  discount        INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | processing | shipped | delivered | cancelled
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,   -- snapshot, so renaming/deleting a product later doesn't corrupt past orders
  size          TEXT NOT NULL,
  qty           INTEGER NOT NULL,
  unit_price    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id             SERIAL PRIMARY KEY,
  username       TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id                SERIAL PRIMARY KEY,
  code              TEXT UNIQUE NOT NULL,       -- stored uppercase
  discount_percent  INTEGER NOT NULL,           -- e.g. 10 = 10% off
  active            BOOLEAN NOT NULL DEFAULT true,
  expires_at        TIMESTAMPTZ,                -- null = never expires
  min_subtotal      INTEGER NOT NULL DEFAULT 0, -- order must be at least this much (in PKR) to qualify
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Migrations for databases created before these columns existed ----
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_by_size JSONB NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code TEXT;

-- ---- Phase 1: product detail page + variants ----
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku_by_size JSONB NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS style_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS size_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS complete_the_look JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS frequently_bought_with JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS estimated_delivery TEXT NOT NULL DEFAULT '3–5 working days in major cities, 5–7 elsewhere';
ALTER TABLE products ADD COLUMN IF NOT EXISTS return_policy TEXT NOT NULL DEFAULT 'Free exchange within 14 days of delivery, tags attached and unworn.';

-- ---- Phase 2: search + filtering ----
ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stretch TEXT NOT NULL DEFAULT 'none';
ALTER TABLE products ADD COLUMN IF NOT EXISTS collection TEXT;

-- ---- Phase 3: saved addresses + checkout extras ----
CREATE TABLE IF NOT EXISTS customer_addresses (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT 'Home',
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  address      TEXT NOT NULL,
  city         TEXT NOT NULL,
  postal_code  TEXT NOT NULL DEFAULT '',
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax NUMERIC NOT NULL DEFAULT 0;

-- ---- Phase 4: customer account (wishlist, profile, notifications) ----
CREATE TABLE IF NOT EXISTS wishlist_items (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_customer_id ON wishlist_items(customer_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notify_order_updates BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notify_promotions BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notify_newsletter BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_style_code ON products(style_code);

-- ---- Reviews ----
CREATE TABLE IF NOT EXISTS product_reviews (
  id                 SERIAL PRIMARY KEY,
  product_id         INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name      TEXT NOT NULL,
  rating             INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title              TEXT NOT NULL DEFAULT '',
  body               TEXT NOT NULL DEFAULT '',
  images             JSONB NOT NULL DEFAULT '[]',
  video_url          TEXT,
  verified_purchase  BOOLEAN NOT NULL DEFAULT false,
  helpful_count      INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_votes (
  id          SERIAL PRIMARY KEY,
  review_id   INTEGER NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
  voter_key   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ---- Phase 6: business readiness ----
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS contact_messages (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT 'General Inquiry',
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at);

-- ==================================================================
-- WHAT'S NEXT FEATURES — New tables and columns
-- ==================================================================

-- ---- Feature 1: Staff Roles ----
-- Adds role-based access control to admin_users.
-- Roles: super_admin (full access), manager (products + orders + reviews),
--        order_manager (orders only), viewer (read-only analytics).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'super_admin';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ---- Feature 2: Payment Gateway ----
-- Stripe payment intent tracking per order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
-- For local gateway methods (JazzCash/EasyPaisa)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- ---- Feature 4: Flash Sales ----
CREATE TABLE IF NOT EXISTS flash_sales (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  banner_image  TEXT,                           -- optional banner URL
  discount_type TEXT NOT NULL DEFAULT 'percent', -- 'percent' or 'fixed'
  discount_value INTEGER NOT NULL,              -- e.g. 20 for 20% or 500 for Rs.500 off
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  product_ids   JSONB NOT NULL DEFAULT '[]',    -- product IDs included in this sale
  created_by    INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flash_sales_ends_at ON flash_sales(ends_at);
CREATE INDEX IF NOT EXISTS idx_flash_sales_active ON flash_sales(active);

-- ---- Feature 5: Abandoned Cart Recovery ----
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  email           TEXT,
  phone           TEXT,
  cart_data       JSONB NOT NULL DEFAULT '{}',    -- { items: [...], subtotal: N, currency: "PKR" }
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminder_sent   BOOLEAN NOT NULL DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  recovered       BOOLEAN NOT NULL DEFAULT false,
  recovered_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_reminder ON abandoned_carts(reminder_sent) WHERE recovered = false;

-- ---- Feature 6: WhatsApp Notification Log ----
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id            SERIAL PRIMARY KEY,
  phone         TEXT NOT NULL,
  message_type  TEXT NOT NULL,       -- 'order_confirmation' | 'status_update' | 'abandoned_cart'
  order_number  TEXT,
  status        TEXT NOT NULL,       -- 'sent' | 'failed' | 'skipped'
  response      TEXT,                -- API response or error message
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at ON whatsapp_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON whatsapp_logs(status);

-- ---- Feature 7: WhatsApp Order Confirmation (anti-fraud / anti-prank) ----
-- COD orders are held as "pending" confirmation until the customer replies YES
-- on WhatsApp or taps the confirmation link. Orders that go unconfirmed past
-- the window are marked "expired" so admins can review/cancel/require advance
-- payment instead of shipping blind. Prepaid orders don't need this (payment
-- itself is the confirmation), so they stay 'not_required'.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_status TEXT NOT NULL DEFAULT 'not_required'; -- not_required | pending | confirmed | expired
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_status ON orders(confirmation_status);
