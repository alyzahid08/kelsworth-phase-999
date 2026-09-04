const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { query } = require("../db");
const { requireAdminApi, requireRole } = require("../middleware/auth");

const router = express.Router();
const mediaDir = path.join(__dirname, "..", "public", "media", "videos");
fs.mkdirSync(mediaDir, { recursive: true });

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `video-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
    },
  }),
  limits: { files: 1, fileSize: 120 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Public storefront feed: only intentionally published media is returned.
router.get("/videos", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, title, description, category, video_url, poster_url, featured, created_at
       FROM store_videos WHERE active = true ORDER BY featured DESC, sort_order ASC, created_at DESC LIMIT 12`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load videos" });
  }
});

router.use("/admin", requireAdminApi);

router.get("/admin/videos", requireRole("media", "read"), async (_req, res) => {
  try {
    const { rows } = await query("SELECT * FROM store_videos ORDER BY featured DESC, sort_order ASC, created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load video library" });
  }
});

router.post("/admin/videos/upload", requireRole("media", "create"), videoUpload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an MP4, WebM, MOV, or M4V video" });
  const body = req.body || {};
  if (!String(body.title || "").trim()) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "A video title is required" });
  }
  try {
    const { rows } = await query(
      `INSERT INTO store_videos (title, description, category, video_url, poster_url, featured, active, sort_order, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        String(body.title).trim(), String(body.description || "").trim(),
        ["product", "store-update", "marketing"].includes(body.category) ? body.category : "product",
        `/media/videos/${req.file.filename}`, String(body.posterUrl || "").trim() || null,
        body.featured === "true", body.active !== "false", Number(body.sortOrder) || 0, req.admin.sub,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error(err);
    res.status(500).json({ error: "Could not save video" });
  }
});

router.patch("/admin/videos/:id", requireRole("media", "update"), async (req, res) => {
  const body = req.body || {};
  const fields = [];
  const params = [];
  const add = (sql, value) => { params.push(value); fields.push(`${sql} = $${params.length}`); };
  if (body.title !== undefined) add("title", String(body.title).trim());
  if (body.description !== undefined) add("description", String(body.description).trim());
  if (body.category !== undefined && ["product", "store-update", "marketing"].includes(body.category)) add("category", body.category);
  if (body.posterUrl !== undefined) add("poster_url", String(body.posterUrl).trim() || null);
  if (body.featured !== undefined) add("featured", Boolean(body.featured));
  if (body.active !== undefined) add("active", Boolean(body.active));
  if (body.sortOrder !== undefined) add("sort_order", Number(body.sortOrder) || 0);
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  try {
    const { rows } = await query(`UPDATE store_videos SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ error: "Video not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update video" });
  }
});

router.delete("/admin/videos/:id", requireRole("media", "delete"), async (req, res) => {
  try {
    const { rows } = await query("DELETE FROM store_videos WHERE id = $1 RETURNING video_url", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Video not found" });
    const filePath = path.join(__dirname, "..", "public", rows[0].video_url.replace(/^\//, ""));
    fs.unlink(filePath, () => {});
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete video" });
  }
});

module.exports = router;
