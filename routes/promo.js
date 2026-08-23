const express = require("express");
const { validatePromoCode } = require("../lib/promo");

const router = express.Router();

// POST /api/promo/validate — { code, subtotal } -> { valid, discountAmount } or { valid:false, error }
// The actual order still re-validates this server-side at checkout, so this
// endpoint is just for showing the discount in the cart before that happens.
router.post("/validate", async (req, res) => {
  const { code, subtotal } = req.body || {};
  if (typeof subtotal !== "number" || subtotal < 0) {
    return res.status(400).json({ error: "Invalid subtotal" });
  }
  try {
    const result = await validatePromoCode(code, subtotal);
    if (!result.valid) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not validate code" });
  }
});

module.exports = router;
