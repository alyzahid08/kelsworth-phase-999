/* Kelsworth — cart engine
   The cart itself lives in localStorage (so it survives across pages and
   reloads without needing a login), but product details/prices are always
   looked up fresh from the API so a price change on the backend is reflected
   immediately and can't be spoofed from the browser. */

const CART_KEY = "vw_cart_v1";

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(productId, size, qty) {
  const cart = getCart();
  const existing = cart.find((i) => i.productId === productId && i.size === size);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ productId, size, qty });
  }
  saveCart(cart);
}

function updateCartLine(index, qty) {
  const cart = getCart();
  if (!cart[index]) return;
  if (qty <= 0) {
    cart.splice(index, 1);
  } else {
    cart[index].qty = qty;
  }
  saveCart(cart);
}

function removeCartLine(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
}

function clearCart() {
  saveCart([]);
  clearPromoCode();
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

/* ---------------------------- Save for later ---------------------------- */
// A second localStorage list, same shape as the cart. Moving a line here
// takes it out of the cart (and the order total) without losing it.
const SAVED_KEY = "vw_saved_for_later";

function getSavedForLater() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveSavedForLater(list) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

// Moves a cart line (by its index in getCart()) into the saved-for-later list.
function moveCartLineToSaved(index) {
  const cart = getCart();
  const line = cart[index];
  if (!line) return;
  cart.splice(index, 1);
  saveCart(cart);
  const saved = getSavedForLater();
  const existing = saved.find((i) => i.productId === line.productId && i.size === line.size);
  if (existing) existing.qty += line.qty;
  else saved.push({ productId: line.productId, size: line.size, qty: line.qty });
  saveSavedForLater(saved);
}

// Moves a saved-for-later line (by its index in getSavedForLater()) back into the cart.
function moveSavedLineToCart(index) {
  const saved = getSavedForLater();
  const line = saved[index];
  if (!line) return;
  saved.splice(index, 1);
  saveSavedForLater(saved);
  addToCart(line.productId, line.size, line.qty);
}

function removeSavedLine(index) {
  const saved = getSavedForLater();
  saved.splice(index, 1);
  saveSavedForLater(saved);
}

async function savedForLaterWithProducts() {
  const products = await fetchProducts();
  return getSavedForLater()
    .map((line, index) => {
      const product = products.find((p) => p.id === line.productId);
      if (!product) return null;
      const unit = product.salePrice ?? product.price;
      return { ...line, index, product, unit, lineTotal: unit * line.qty };
    })
    .filter(Boolean);
}

/* ---------------------------- Recently viewed ---------------------------- */
// Device-local, like the cart — no login needed to build up a history, and
// it's what shoppers expect ("recently viewed" tracking their browser, not
// their account). Stores product slugs only, most recent first.
const RECENTLY_VIEWED_KEY = "vw_recently_viewed";

function getRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY)) || []; } catch (e) { return []; }
}

function addRecentlyViewed(productId) {
  const list = [productId, ...getRecentlyViewed().filter((id) => id !== productId)].slice(0, 12);
  localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list));
}

function clearRecentlyViewed() {
  localStorage.removeItem(RECENTLY_VIEWED_KEY);
}

async function recentlyViewedProducts(excludeId) {
  const products = await fetchProducts();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  return getRecentlyViewed()
    .filter((id) => id !== excludeId)
    .map((id) => byId[id])
    .filter(Boolean);
}

/* ---------------------------- Promo code ---------------------------- */
// Stores only the code itself — the discount amount is always recomputed
// from the server (on the cart page for preview, and again at checkout),
// never trusted from anything saved in the browser.
const PROMO_KEY = "vw_promo_code";

function getAppliedPromoCode() {
  return localStorage.getItem(PROMO_KEY) || null;
}

function setAppliedPromoCode(code) {
  localStorage.setItem(PROMO_KEY, code);
}

function clearPromoCode() {
  localStorage.removeItem(PROMO_KEY);
}

// Async because product data now comes from the API, not a static array.
async function cartLinesWithProducts() {
  const products = await fetchProducts();
  return getCart()
    .map((line, index) => {
      const product = products.find((p) => p.id === line.productId);
      if (!product) return null;
      const unit = product.salePrice ?? product.price;
      return { ...line, index, product, unit, lineTotal: unit * line.qty };
    })
    .filter(Boolean);
}

async function cartSubtotal() {
  const lines = await cartLinesWithProducts();
  return lines.reduce((sum, l) => sum + l.lineTotal, 0);
}

function formatPKR(amount) {
  return "Rs. " + amount.toLocaleString("en-PK");
}

function updateCartBadge() {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    const count = cartCount();
    el.textContent = count;
    el.style.display = count > 0 ? "flex" : "none";
  });
}

document.addEventListener("DOMContentLoaded", updateCartBadge);
