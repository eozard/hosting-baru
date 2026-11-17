/*
 * ============================================================================
 * IMPORT SCHEMA / DATA KE POSTGRESQL (Supabase)
 * ============================================================================
 * Menjalankan file .sql ke database yang ditunjuk DATABASE_URL di .env.
 *
 * Cara pakai:
 *   node server/scripts/import_pg_data.js
 *     → import database_postgres.sql lalu database_postgres_data.sql (default)
 *
 *   node server/scripts/import_pg_data.js path/ke/file.sql [file2.sql ...]
 *     → import file tertentu saja
 *
 * Catatan: database_postgres.sql berisi DROP TABLE IF EXISTS — import ulang
 * akan MENGHAPUS data yang ada lalu membuat schema baru. Untuk import data
 * saja, jalankan file data-nya sendiri (hati-hati duplikat primary key).
 * ============================================================================
 */

import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(rootDir, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL belum di-set di .env");
  process.exit(1);
}

const files =
  process.argv.length > 2
    ? process.argv.slice(2).map((f) => path.resolve(f))
    : [
        path.join(rootDir, "database_postgres.sql"),
        path.join(rootDir, "database_postgres_data.sql"),
      ];

const TABLES = [
  "users", "attendances", "device_bindings", "logbook", "pendaftar",
  "pendaftar_files", "admin_pendaftaran", "holidays", "grading_indicators",
  "student_grades", "certificates", "tugas_akhir", "tugas_mingguan",
  "tugas_mingguan_submissions",
];

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("✅ Terhubung ke PostgreSQL\n");

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`❌ File tidak ditemukan: ${file}`);
      process.exit(1);
    }
    const sql = fs.readFileSync(file, "utf8");
    console.log(`📥 Import ${path.basename(file)} (${(sql.length / 1024).toFixed(0)} KB)...`);
    await client.query(sql);
    console.log("   ✅ Sukses\n");
  }

  console.log("📊 Verifikasi jumlah baris:");
  for (const t of TABLES) {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    console.log(`   ${t}: ${r.rows[0].n}`);
  }

  const tz = await client.query("SELECT current_setting('TimeZone') AS tz, NOW()::text AS now");
  console.log(`\n🕒 Timezone sesi: ${tz.rows[0].tz} | NOW(): ${tz.rows[0].now}`);
  console.log("\n🎉 Import selesai.");
} catch (err) {
  console.error("\n❌ Import gagal:", err.message);
  process.exit(1);
} finally {
  await client.end();
}