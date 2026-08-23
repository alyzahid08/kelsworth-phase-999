const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db");
const {
  signAdminToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdminApi,
  requireRole,
} = require("../middleware/auth");

const router = express.Router();

const VALID_ROLES = ["super_admin", "manager", "order_manager", "viewer"];

// POST /api/admin/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  try {
    const { rows } = await query("SELECT * FROM admin_users WHERE username = $1", [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Incorrect username or password" });
    if (!user.is_active) return res.status(401).json({ error: "Account is deactivated" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Incorrect username or password" });

    const token = signAdminToken(user);
    setAuthCookie(res, token);
    res.json({
      username: user.username,
      role: user.role || "super_admin",
      fullName: user.full_name || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/admin/logout
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/admin/me — used by the admin panel to check if the session is valid
router.get("/me", requireAdminApi, (req, res) => {
  res.json({
    username: req.admin.username,
    role: req.admin.role || "super_admin",
  });
});

// POST /api/admin/change-password
router.post("/change-password", requireAdminApi, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  try {
    const { rows } = await query("SELECT * FROM admin_users WHERE id = $1", [req.admin.sub]);
    const user = rows[0];
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    await query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change password" });
  }
});

/* ------------------------ Staff Management ------------------------ */
// Only super_admin can manage staff accounts.

// GET /api/admin/staff — list all admin users (super_admin only)
router.get("/staff", requireAdminApi, requireRole("staff", "read"), async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, username, role, full_name, is_active, created_at FROM admin_users ORDER BY id ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load staff" });
  }
});

// POST /api/admin/staff — create a new staff account (super_admin only)
router.post("/staff", requireAdminApi, requireRole("staff", "create"), async (req, res) => {
  const { username, password, role, fullName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const chosenRole = VALID_ROLES.includes(role) ? role : "viewer";
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO admin_users (username, password_hash, role, full_name)
       VALUES ($1,$2,$3,$4) RETURNING id, username, role, full_name, is_active, created_at`,
      [username.trim(), hash, chosenRole, (fullName || "").trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") return res.status(409).json({ error: "That username already exists" });
    res.status(500).json({ error: "Could not create staff account" });
  }
});

// PATCH /api/admin/staff/:id — update role, name, or active status
router.patch("/staff/:id", requireAdminApi, requireRole("staff", "update"), async (req, res) => {
  const { role, fullName, isActive, password } = req.body || {};
  const sets = [];
  const params = [];

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    params.push(role);
    sets.push(`role = $${params.length}`);
  }
  if (fullName !== undefined) {
    params.push((fullName || "").trim() || null);
    sets.push(`full_name = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    sets.push(`is_active = $${params.length}`);
  }
  if (password !== undefined) {
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    // Will be hashed below
  }

  if (!sets.length && !password) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  try {
    // Prevent a super_admin from deactivating the last super_admin
    if (isActive === false || role !== undefined) {
      const targetId = Number(req.params.id);
      if (targetId === req.admin.sub) {
        return res.status(400).json({ error: "You cannot modify your own account this way" });
      }
    }

    let hash = null;
    if (password !== undefined) {
      hash = await bcrypt.hash(String(password), 10);
      params.push(hash);
      sets.push(`password_hash = $${params.length}`);
    }

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE admin_users SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING id, username, role, full_name, is_active, created_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "Staff member not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update staff" });
  }
});

// DELETE /api/admin/staff/:id — remove a staff member (super_admin only)
router.delete("/staff/:id", requireAdminApi, requireRole("staff", "delete"), async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.admin.sub) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  try {
    const { rows } = await query(
      "DELETE FROM admin_users WHERE id = $1 RETURNING id",
      [targetId]
    );
    if (!rows.length) return res.status(404).json({ error: "Staff member not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete staff member" });
  }
});

module.exports = router;
