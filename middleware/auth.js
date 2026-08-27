const jwt = require("jsonwebtoken");

const COOKIE_NAME = "alqutuz_admin_token";
const TOKEN_TTL = "7d";

// Role hierarchy: each role inherits all permissions of roles below it.
// super_admin > manager > order_manager > viewer
const ROLE_PERMISSIONS = {
  super_admin: {
    products: ["read", "create", "update", "delete"],
    orders: ["read", "update"],
    promo_codes: ["read", "create", "update", "delete"],
    reviews: ["read", "delete"],
    contact_messages: ["read", "update", "delete"],
    staff: ["read", "create", "update", "delete"],
    flash_sales: ["read", "create", "update", "delete"],
    analytics: ["read"],
    settings: ["read", "update"],
  },
  manager: {
    products: ["read", "create", "update", "delete"],
    orders: ["read", "update"],
    promo_codes: ["read", "create", "update", "delete"],
    reviews: ["read", "delete"],
    contact_messages: ["read", "update", "delete"],
    flash_sales: ["read", "create", "update", "delete"],
    analytics: ["read"],
  },
  order_manager: {
    products: ["read"],
    orders: ["read", "update"],
    analytics: ["read"],
  },
  viewer: {
    products: ["read"],
    orders: ["read"],
    analytics: ["read"],
  },
};

function signAdminToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role || "super_admin" },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function readToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Blocks API routes with a 401 JSON response if not logged in.
function requireAdminApi(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ error: "Not authenticated" });
  req.admin = payload;
  next();
}

// Blocks admin HTML pages by redirecting to the login page if not logged in.
function requireAdminPage(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.redirect("/admin/login.html");
  req.admin = payload;
  next();
}

// Role-based access middleware factory.
// Usage: router.get('/products', requireRole('products', 'read'), handler)
function requireRole(resource, action) {
  return (req, res, next) => {
    const role = req.admin?.role || "viewer";
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return res.status(403).json({ error: "Unknown role" });
    const resourcePerms = perms[resource];
    if (!resourcePerms || !resourcePerms.includes(action)) {
      return res.status(403).json({ error: "You don't have permission for this action" });
    }
    next();
  };
}

// Convenience: require at least manager level (not viewer/order_manager)
function requireManager(req, res, next) {
  const role = req.admin?.role || "viewer";
  if (role !== "super_admin" && role !== "manager") {
    return res.status(403).json({ error: "Manager access required" });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  signAdminToken,
  readToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdminApi,
  requireAdminPage,
  requireRole,
  requireManager,
  ROLE_PERMISSIONS,
};
