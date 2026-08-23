const jwt = require("jsonwebtoken");

const COOKIE_NAME = "vw_customer_token";
const TOKEN_TTL = "30d";

function signCustomerToken(customer) {
  return jwt.sign({ sub: customer.id, email: customer.email }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function readCustomerToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function setCustomerCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearCustomerCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Blocks routes that require a logged-in customer (e.g. order history).
function requireCustomer(req, res, next) {
  const payload = readCustomerToken(req);
  if (!payload) return res.status(401).json({ error: "Not logged in" });
  req.customer = payload;
  next();
}

// Attaches req.customer if a valid cookie is present, but never blocks —
// used at checkout so guest checkout keeps working for everyone else.
function attachCustomerIfPresent(req, res, next) {
  req.customer = readCustomerToken(req);
  next();
}

module.exports = {
  COOKIE_NAME,
  signCustomerToken,
  readCustomerToken,
  setCustomerCookie,
  clearCustomerCookie,
  requireCustomer,
  attachCustomerIfPresent,
};
