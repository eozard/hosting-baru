/*
 * ============================================================================
 * ROUTES: MIGRASI UPLOADS (sementara, default NONAKTIF)
 * ============================================================================
 * Endpoint untuk memindahkan file uploads lama (server/uploads/) ke
 * Railway Volume setelah deploy pertama.
 *
 * KEAMANAN:
 * - Hanya aktif kalau env MIGRATION_SECRET di-set (di Railway: Variables).
 * - Setiap request wajib header x-migration-secret yang cocok.
 * - Setelah migrasi selesai: HAPUS variabel MIGRATION_SECRET di Railway
 *   supaya endpoint ini mati lagi.
 *
 * CARA PAKAI (dari laptop, setelah deploy):
 *   node server/scripts/restore_uploads.js https://<domain-railway> <secret>
 * ============================================================================
 */

import express from "express";
import multer from "multer";
import { uploadFile } from "../config/storage.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // maks 50MB per file
});

router.post("/migrate-uploads", upload.single("file"), async (req, res) => {
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || req.headers["x-migration-secret"] !== secret) {
    return res
      .status(403)
      .json({ success: false, message: "Migration secret tidak valid / fitur nonaktif" });
  }

  const relPath = req.body?.path;
  if (!relPath || typeof relPath !== "string") {
    return res.status(400).json({ success: false, message: "Field path wajib diisi" });
  }

  // Validasi path: harus relatif, tanpa ".." (cegah path traversal)
  const norm = relPath.replace(/\\/g, "/");
  if (norm.startsWith("/") || norm.split("/").includes("..") || norm.includes(":")) {
    return res.status(400).json({ success: false, message: "Path tidak valid" });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: "File wajib diupload" });
  }

  const result = await uploadFile(norm, req.file.buffer, req.file.mimetype);
  if (!result.ok) {
    return res.status(500).json({ success: false, message: "Gagal menyimpan file" });
  }

  return res.json({ success: true, path: norm, size: req.file.size });
});

export default router;