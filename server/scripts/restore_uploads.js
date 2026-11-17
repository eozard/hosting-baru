/*
 * ============================================================================
 * RESTORE UPLOADS: kirim file server/uploads/ lokal ke server production
 * ============================================================================
 * Dipakai sekali setelah deploy Railway (Volume masih kosong), supaya
 * PDF pendaftar / tugas / sertifikat lama tidak hilang.
 *
 * Cara pakai:
 *   1. Di Railway Variables, set MIGRATION_SECRET=<string acak panjang>
 *   2. Tunggu redeploy selesai
 *   3. node server/scripts/restore_uploads.js https://<domain> <secret>
 *   4. Setelah selesai, HAPUS MIGRATION_SECRET dari Railway Variables
 *
 * Butuh Node 18+ (fetch/FormData bawaan).
 * ============================================================================
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET = process.argv[2];
const SECRET = process.argv[3];

if (!TARGET || !SECRET) {
  console.error("Cara pakai: node server/scripts/restore_uploads.js <URL> <MIGRATION_SECRET>");
  console.error("Contoh:    node server/scripts/restore_uploads.js https://pkl.up.railway.app rahasia-acak-123");
  process.exit(1);
}

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");

const mimeOf = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".zip") return "application/zip";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
};

const walk = async (dir, base = dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full, base)));
    else files.push({ full, rel: path.relative(base, full).split(path.sep).join("/") });
  }
  return files;
};

const main = async () => {
  const files = await walk(UPLOADS_DIR);
  console.log(`📦 ${files.length} file ditemukan di ${UPLOADS_DIR}`);
  console.log(`🎯 Target: ${TARGET}\n`);

  let ok = 0;
  let gagal = 0;
  for (const f of files) {
    const buffer = await fs.readFile(f.full);
    const form = new FormData();
    form.append("path", f.rel);
    form.append("file", new Blob([buffer], { type: mimeOf(f.full) }), path.basename(f.full));

    try {
      const res = await fetch(`${TARGET}/api/admin/migrate-uploads`, {
        method: "POST",
        headers: { "x-migration-secret": SECRET },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        ok++;
        console.log(`  ✅ ${f.rel} (${(buffer.length / 1024).toFixed(0)} KB)`);
      } else {
        gagal++;
        console.log(`  ❌ ${f.rel} → ${res.status} ${data.message || ""}`);
      }
    } catch (err) {
      gagal++;
      console.log(`  ❌ ${f.rel} → ${err.message}`);
    }
  }

  console.log(`\nSelesai: ${ok} sukses, ${gagal} gagal dari ${files.length} file.`);
  if (gagal === 0 && ok > 0) {
    console.log("👉 Sekarang HAPUS variabel MIGRATION_SECRET di Railway agar endpoint migrasi nonaktif lagi.");
  }
  process.exit(gagal > 0 ? 1 : 0);
};

main();