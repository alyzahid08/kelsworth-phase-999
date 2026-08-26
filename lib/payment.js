// Payment gateway abstraction supporting multiple providers.
// Currently supports: Stripe, JazzCash, EasyPaisa (local Pakistani gateways).
// COD remains the default — payment_method is set in the order.

// ---- Stripe Integration ----
// Uses Stripe Payment Intents API for card payments.
// Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env.

let stripeClient = null;

function getStripeClient() {
  if (!stripeClient && process.env.STRIPE_SECRET_KEY) {
    // eslint-disable-next-line global-require
    stripeClient = require("stripe")(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Create a Stripe PaymentIntent for an order.
 * @param {number} amountPkr - Amount in PKR (whole rupees)
 * @param {string} orderNumber - Order number for metadata
 * @param {string} customerEmail - Customer email
 * @returns {Promise<{clientSecret: string, paymentIntentId: string}>}
 */
async function createStripePaymentIntent(amountPkr, orderNumber, customerEmail) {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");

  // Stripe expects amounts in the smallest currency unit (paisa for PKR)
  // Stripe doesn't natively support PKR, so we convert to USD at a rough rate
  // OR use a custom currency. Most Pakistani merchants use USD-based Stripe accounts.
  // For PKR support, JazzCash/EasyPaisa are better options.
  // Here we'll use USD cents as a practical approach.
  const EXCHANGE_RATE = Number(process.env.STRIPE_PKR_TO_USD || 0.0036); // approximate
  const amountUsdCents = Math.round(amountPkr * EXCHANGE_RATE * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountUsdCents,
    currency: process.env.STRIPE_CURRENCY || "usd",
    metadata: { orderNumber, customerEmail },
    receipt_email: customerEmail,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

/**
 * Verify a Stripe webhook signature and extract the event.
 */
async function verifyStripeWebhook(rawBody, signature) {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

// ---- JazzCash / EasyPaisa Local Gateway Support ----
// Both are "hosted checkout" gateways: the customer is redirected (via an
// auto-submitting HTML form, NOT a simple link) to a page hosted by the
// gateway, pays there, then:
//   1. the gateway calls our server-to-server webhook with the result, and
//   2. the customer's browser is bounced back to our pp_ReturnURL/postBackURL.
// We only trust (1) to mark an order paid — (2) is UX only.

function isLocalGatewayConfigured() {
  return Boolean(process.env.JAZZCASH_MERCHANT_ID || process.env.EASYPAISA_STORE_ID);
}

function isJazzCashConfigured() {
  return Boolean(process.env.JAZZCASH_MERCHANT_ID && process.env.JAZZCASH_PASSWORD && process.env.JAZZCASH_HASH_KEY);
}

function isEasyPaisaConfigured() {
  return Boolean(process.env.EASYPAISA_STORE_ID && process.env.EASYPAISA_HASH_KEY);
}

function timestampNow() {
  // yyyyMMddHHmmss in local (Pakistan) time is what both gateways expect
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function returnUrl(gateway) {
  const origin = (process.env.SITE_ORIGIN || "https://www.alqutuz.com").replace(/\/$/, "");
  // JazzCash/EasyPaisa hosted checkout POSTs the payment result straight to
  // this URL (it doubles as both "webhook" and browser return) — it must be
  // a backend endpoint so we can verify the hash before trusting it, not a
  // static page.
  return `${origin}/api/payment/webhook/${gateway}`;
}

/**
 * JazzCash Hosted Checkout Page (HCP v1.1) secure hash.
 * Sort all pp_ fields (excluding pp_SecureHash itself) alphabetically by key,
 * join their VALUES with "&", prefix with the integrity salt (HashKey), and
 * take an HMAC-SHA256 (hex) keyed by that same HashKey.
 * This is JazzCash's documented HCP algorithm — verify against your own
 * sandbox docs/portal before going live, since JazzCash occasionally revises
 * field requirements per merchant category.
 */
function jazzCashSecureHash(fields, hashKey) {
  const crypto = require("crypto");
  const sortedKeys = Object.keys(fields).sort();
  const joinedValues = sortedKeys.map((k) => fields[k] ?? "").join("&");
  const toBeHashed = `${hashKey}&${joinedValues}`;
  return crypto.createHmac("sha256", hashKey).update(toBeHashed).digest("hex");
}

function buildJazzCashForm(amountPkr, orderNumber, customerPhone) {
  const merchantId = process.env.JAZZCASH_MERCHANT_ID;
  const password = process.env.JAZZCASH_PASSWORD;
  const hashKey = process.env.JAZZCASH_HASH_KEY;
  const crypto = require("crypto");

  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour to complete payment
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  const txnRefNo = `T${fmt(now)}${crypto.randomBytes(2).toString("hex")}`;

  const fields = {
    pp_Version: "1.1",
    pp_TxnType: "", // blank = let the customer pick card/wallet/OTC on JazzCash's page
    pp_Language: "EN",
    pp_MerchantID: merchantId,
    pp_SubMerchantID: "",
    pp_Password: password,
    pp_BankID: "",
    pp_ProductID: "",
    pp_TxnRefNo: txnRefNo,
    pp_Amount: String(Math.round(amountPkr * 100)), // paisa
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: fmt(now),
    pp_BillReference: orderNumber,
    pp_Description: `AL-QUTUZ order ${orderNumber}`,
    pp_TxnExpiryDateTime: fmt(expiry),
    pp_ReturnURL: returnUrl("jazzcash"),
    ppmpf_1: customerPhone || "",
  };
  fields.pp_SecureHash = jazzCashSecureHash(fields, hashKey);

  const isSandbox = process.env.JAZZCASH_MODE !== "production";
  const gatewayUrl = isSandbox
    ? "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/"
    : "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";

  return { transactionId: txnRefNo, gatewayUrl, formFields: fields };
}

/**
 * EasyPaisa hosted checkout (Post Method) form.
 * NOTE: EasyPaisa's exact hash algorithm is documented in the merchant
 * integration PDF they send you on signup (Account Settings > Generate
 * Hashkey), and isn't as consistently published as JazzCash's. This
 * implements the commonly-used HMAC-SHA256-over-sorted-fields pattern as a
 * starting point — confirm it against your actual EasyPaisa merchant guide
 * once you have live credentials, since a mismatch here will show up as
 * every transaction being rejected by EasyPaisa (safe failure — it won't
 * mark unpaid orders as paid).
 */
function easyPaisaHashedRequest(fields, hashKey) {
  const crypto = require("crypto");
  const sortedKeys = Object.keys(fields).sort();
  const joined = sortedKeys.map((k) => `${k}=${fields[k] ?? ""}`).join("&");
  return crypto.createHmac("sha256", hashKey).update(joined).digest("hex");
}

function buildEasyPaisaForm(amountPkr, orderNumber, customerPhone) {
  const storeId = process.env.EASYPAISA_STORE_ID;
  const hashKey = process.env.EASYPAISA_HASH_KEY;

  const fields = {
    amount: amountPkr.toFixed(1), // EasyPaisa wants one decimal place
    storeId,
    postBackURL: returnUrl("easypaisa"),
    orderRefNum: orderNumber,
    paymentMethod: "InitialRequest",
    mobileAccountNo: customerPhone || "",
    emailAddress: "",
  };
  fields.merchantHashedReq = easyPaisaHashedRequest(fields, hashKey);

  const isSandbox = process.env.EASYPAISA_MODE !== "production";
  const gatewayUrl = isSandbox
    ? "https://easypaystg.easypaisa.com.pk/easypay/Index.jsf"
    : "https://easypay.easypaisa.com.pk/easypay/Index.jsf";

  return { transactionId: orderNumber, gatewayUrl, formFields: fields };
}

/**
 * Create a JazzCash/EasyPaisa hosted-checkout payment request.
 * Returns the gateway URL + the exact form fields the frontend needs to
 * POST there (hosted checkout requires a real form submission, not a link —
 * the secure hash has to travel as a POST field).
 */
async function createLocalPayment(amountPkr, orderNumber, customerPhone, gateway = "jazzcash") {
  if (gateway === "easypaisa") {
    if (!isEasyPaisaConfigured()) throw new Error("EasyPaisa is not configured");
    return buildEasyPaisaForm(amountPkr, orderNumber, customerPhone);
  }
  if (!isJazzCashConfigured()) throw new Error("JazzCash is not configured");
  return buildJazzCashForm(amountPkr, orderNumber, customerPhone);
}

/**
 * Verify a local gateway callback/webhook by recomputing the secure hash
 * ourselves and comparing — never trust pp_ResponseCode alone, since that's
 * attacker-controllable on an unverified POST.
 */
async function verifyLocalGatewayCallback(body, gateway = "jazzcash") {
  if (gateway === "easypaisa") {
    if (!isEasyPaisaConfigured()) return { valid: false, error: "EasyPaisa not configured" };
    const { merchantHashedReq, ...rest } = body;
    const expected = easyPaisaHashedRequest(rest, process.env.EASYPAISA_HASH_KEY);
    if (!merchantHashedReq || merchantHashedReq !== expected) {
      return { valid: false, error: "Hash mismatch — callback may not be genuine" };
    }
    if (String(body.responseCode) !== "0000" && String(body.status).toLowerCase() !== "success") {
      return { valid: false, error: "Payment failed or was rejected" };
    }
    return { valid: true, transactionId: body.orderRefNum || body.orderId, amount: body.amount };
  }

  if (!isJazzCashConfigured()) return { valid: false, error: "JazzCash not configured" };
  const { pp_SecureHash, ...rest } = body;
  const expected = jazzCashSecureHash(rest, process.env.JAZZCASH_HASH_KEY);
  if (!pp_SecureHash || pp_SecureHash !== expected) {
    return { valid: false, error: "Hash mismatch — callback may not be genuine" };
  }
  if (body.pp_ResponseCode !== "000") {
    return { valid: false, error: "Payment failed or was rejected" };
  }
  return { valid: true, transactionId: body.pp_TxnRefNo, amount: body.pp_Amount };
}

// ---- PayFast (Pakistan) Hosted Checkout Integration ----
// PayFast's flagship "IPG" product works like JazzCash/EasyPaisa above (an
// auto-submitted form redirects the customer to a PayFast-hosted page, so we
// never see card numbers) but with one extra step in front: PayFast issues a
// short-lived access token from your MERCHANT_ID + SECURED_KEY, which then
// has to be embedded in the signed checkout form alongside everything else.

let payfastTokenCache = null; // { token, expiresAt } — access tokens are short-lived, so cache and reuse until near expiry

function isPayFastConfigured() {
  return Boolean(
    process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_MERCHANT_NAME && process.env.PAYFAST_SECURED_KEY
  );
}

function payfastApiBase() {
  const isSandbox = process.env.PAYFAST_MODE !== "production";
  return isSandbox
    ? process.env.PAYFAST_SANDBOX_URL || "https://ipguat.apps.net.pk/Ecommerce/api"
    : process.env.PAYFAST_API_URL || "https://ipg1.apps.net.pk/Ecommerce/api";
}

function payfastCheckoutUrl() {
  return `${payfastApiBase()}/Transaction/PostTransaction`;
}

/**
 * Fetch (and cache) a PayFast access token. Required before every checkout
 * request — PayFast's token endpoint wants merchant_id + secured_key plus
 * the shopper's IP for its fraud checks.
 */
async function getPayFastAccessToken(customerIp) {
  if (payfastTokenCache && payfastTokenCache.expiresAt > Date.now() + 10_000) {
    return payfastTokenCache.token;
  }
  const params = new URLSearchParams({
    merchant_id: process.env.PAYFAST_MERCHANT_ID,
    secured_key: process.env.PAYFAST_SECURED_KEY,
    grant_type: "client_credentials",
    customer_ip: customerIp || "127.0.0.1",
  });
  const res = await fetch(`${payfastApiBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json().catch(() => null);
  if (!data || !data.token) {
    throw new Error(data?.message || "PayFast did not return an access token");
  }
  payfastTokenCache = { token: data.token, expiresAt: Date.now() + (Number(data.expiry) || 1800) * 1000 };
  return data.token;
}

/**
 * PayFast's documented hosted-checkout signature:
 * md5(merchant_id : merchant_name : amount : order_id)
 * Amount must be formatted exactly the same way both when we build the form
 * and when we later re-verify the callback, or the hashes won't match.
 */
function payfastSignature(amountPkr, orderNumber) {
  const crypto = require("crypto");
  const raw = `${process.env.PAYFAST_MERCHANT_ID}:${process.env.PAYFAST_MERCHANT_NAME}:${Number(amountPkr).toFixed(2)}:${orderNumber}`;
  return crypto.createHash("md5").update(raw).digest("hex");
}

/**
 * Build a PayFast hosted-checkout form: fetches an access token, signs the
 * request, and returns the URL + fields the frontend needs to auto-POST to
 * PayFast's checkout page (same shape as buildJazzCashForm/buildEasyPaisaForm).
 */
async function buildPayFastForm(amountPkr, orderNumber, customerEmail, customerPhone, customerIp) {
  if (!isPayFastConfigured()) throw new Error("PayFast is not configured");

  const token = await getPayFastAccessToken(customerIp);
  const signature = payfastSignature(amountPkr, orderNumber);
  const origin = (process.env.SITE_ORIGIN || "https://www.alqutuz.com").replace(/\/$/, "");
  // PayFast bounces the browser to SUCCESS_URL/FAILURE_URL with the result —
  // point both at our own webhook so we verify before trusting either outcome,
  // same "server verifies, then bounces to a friendly page" shape as JazzCash.
  const returnUrl = `${origin}/api/payment/webhook/payfast`;

  const fields = {
    MERCHANT_ID: process.env.PAYFAST_MERCHANT_ID,
    MERCHANT_NAME: process.env.PAYFAST_MERCHANT_NAME,
    TOKEN: token,
    PROCCODE: "00",
    TXNAMT: Number(amountPkr).toFixed(2),
    CUSTOMER_MOBILE_NO: customerPhone || "",
    CUSTOMER_EMAIL_ADDRESS: customerEmail || "",
    SIGNATURE: signature,
    VERSION: "AL-QUTUZ-1.0",
    TXNDESC: `AL-QUTUZ order ${orderNumber}`,
    SUCCESS_URL: returnUrl,
    FAILURE_URL: returnUrl,
    BASKET_ID: orderNumber,
    ORDER_DATE: new Date().toISOString().slice(0, 19).replace("T", " "),
    CHECKOUT_URL: returnUrl,
  };

  return { transactionId: orderNumber, gatewayUrl: payfastCheckoutUrl(), formFields: fields };
}

/**
 * Verify a PayFast callback by recomputing the signature ourselves — using
 * the amount from OUR order record, not whatever the callback claims, so a
 * tampered POST can't mark an order paid at the wrong amount — and comparing
 * against what PayFast sent back. Never trust a bare success code alone.
 */
async function verifyPayFastCallback(body, expectedAmountPkr) {
  if (!isPayFastConfigured()) return { valid: false, error: "PayFast not configured" };

  const orderNumber = body.BASKET_ID || body.basket_id || body.order_id;
  if (!orderNumber) return { valid: false, error: "Missing order reference in callback" };

  const expectedSignature = payfastSignature(expectedAmountPkr, orderNumber);
  const providedSignature = body.SIGNATURE || body.signature;
  if (!providedSignature || providedSignature.toLowerCase() !== expectedSignature.toLowerCase()) {
    return { valid: false, error: "Signature mismatch — callback may not be genuine" };
  }

  const code = String(body.err_code ?? body.status_code ?? body.code ?? "");
  if (!["00", "0", "000"].includes(code)) {
    return { valid: false, error: "Payment failed or was rejected" };
  }

  return { valid: true, transactionId: body.transaction_id || orderNumber };
}

// ---- Payment method registry ----
const SUPPORTED_METHODS = ["cod", "stripe", "jazzcash", "easypaisa", "payfast"];

function isValidPaymentMethod(method) {
  return SUPPORTED_METHODS.includes(method);
}

function getAvailablePaymentMethods() {
  const methods = [{ id: "cod", label: "Cash on Delivery", description: "Pay when your order arrives" }];

  if (isStripeConfigured()) {
    methods.push({ id: "stripe", label: "Credit / Debit Card (International)", description: "Visa, Mastercard via Stripe" });
  }
  if (isJazzCashConfigured()) {
    methods.push({ id: "jazzcash", label: "JazzCash", description: "Debit/credit card, wallet, or OTC via JazzCash" });
  }
  if (isEasyPaisaConfigured()) {
    methods.push({ id: "easypaisa", label: "EasyPaisa", description: "Debit/credit card or wallet via EasyPaisa" });
  }
  if (isPayFastConfigured()) {
    methods.push({ id: "payfast", label: "PayFast", description: "Debit/credit card or bank account via PayFast" });
  }

  return methods;
}

module.exports = {
  isStripeConfigured,
  createStripePaymentIntent,
  verifyStripeWebhook,
  isLocalGatewayConfigured,
  isJazzCashConfigured,
  isEasyPaisaConfigured,
  createLocalPayment,
  verifyLocalGatewayCallback,
  isPayFastConfigured,
  buildPayFastForm,
  verifyPayFastCallback,
  isValidPaymentMethod,
  getAvailablePaymentMethods,
  SUPPORTED_METHODS,
};
