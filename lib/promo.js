const { query } = require("../db");

// Looks up a promo code and checks it against the given subtotal.
// Returns { valid: true, code, discountPercent, discountAmount } or { valid: false, error }.
async function validatePromoCode(rawCode, subtotal) {
  if (!rawCode || !String(rawCode).trim()) {
    return { valid: false, error: "Enter a promo code" };
  }
  const code = String(rawCode).trim().toUpperCase();

  const { rows } = await query("SELECT * FROM promo_codes WHERE code = $1", [code]);
  const promo = rows[0];
  if (!promo) return { valid: false, error: "That code isn't valid" };
  if (!promo.active) return { valid: false, error: "That code is no longer active" };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { valid: false, error: "That code has expired" };
  }
  if (subtotal < promo.min_subtotal) {
    return {
      valid: false,
      error: `This code needs a subtotal of at least Rs. ${Number(promo.min_subtotal).toLocaleString("en-PK")}`,
    };
  }

  const discountAmount = Math.round((subtotal * promo.discount_percent) / 100);
  return { valid: true, code, discountPercent: promo.discount_percent, discountAmount };
}

module.exports = { validatePromoCode };
