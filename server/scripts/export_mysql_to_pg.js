/*
 * ============================================================================
 * EXPORT SCRIPT: MySQL (Laragon) → PostgreSQL INSERT file (Supabase)
 * ============================================================================
 * Cara pakai (sekali saat migrasi):
 *   1. Nyalakan MySQL Laragon, pastikan database `pkl` ada
 *   2. node server/scripts/export_mysql_to_pg.js
 *   3. Hasil: database_postgres_data.sql di root project
 *   4. Import schema dulu (database_postgres.sql), lalu file hasil export
 *      ke Supabase SQL Editor (atau via script import_pg_data.js)
 *
 * Butuh package mysql2 (devDependency di server/package.json).
 * Script ini TIDAK dipakai saat runtime aplikasi.
 * ============================================================================
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(rootDir, ".env") });

// Urutan tabel: parent dulu sebelum child (foreign key)
const TABLES = [
  "users",
  "admin_pendaftaran",
  "holidays",
  "grading_indicators",
  "pendaftar",
  "attendances",
  "device_bindings",
  "logbook",
  "pendaftar_files",
  "student_grades",
  "certificates",
  "tugas_akhir",
  "tugas_mingguan",
  "tugas_mingguan_submissions",
];

const CHUNK = 200; // baris per statement INSERT

/** Escape nilai JS menjadi literal SQL PostgreSQL yang aman. */
const pgLiteral = (val) => {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (val instanceof Date) {
    // Seharusnya tidak terjadi (dateStrings: true), tapi jaga-jaga
    return "'" + val.toISOString().slice(0, 19).replace("T", " ") + "'";
  }
  if (typeof val === "object") {
    // Kolom JSON (devices) → string JSONB
    return "'" + JSON.stringify(val).replace(/'/g, "''") + "'";
  }
  // string: kutip tunggal digandakan; backslash dibiarkan literal
  // (standard_conforming_strings = on di PostgreSQL)
  return "'" + String(val).replace(/'/g, "''") + "'";
};

/**
 * Bersihkan nilai khas MySQL yang tidak valid di PostgreSQL:
 * - zero-date ("0000-00-00", "0000-00-00 00:00:00") → NULL
 * - khusus attendances.login_time (NOT NULL): zero-date diisi tanggal + 00:00:00
 */
const cleanRow = (table, r) => {
  const out = { ...r };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && /^0000-00-00/.test(v)) out[k] = null;
  }
  if (table === "attendances" && out.login_time === null) {
    out.login_time = (out.tanggal || "1970-01-01") + " 00:00:00";
  }
  return out;
};

const main = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "pkl",
    dateStrings: true,
    timezone: "+07:00",
  });

  console.log("✅ Terhubung ke MySQL, mulai export...\n");

  const lines = [];
  lines.push("-- ============================================================================");
  lines.push("-- DATA EXPORT: MySQL `pkl` (Laragon) → PostgreSQL (Supabase)");
  lines.push("-- Di-generate otomatis oleh server/scripts/export_mysql_to_pg.js");
  lines.push("-- Tanggal export: " + new Date().toISOString());
  lines.push("-- Import SETELAH database_postgres.sql dijalankan.");
  lines.push("-- ============================================================================");
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");

  const summary = [];

  for (const table of TABLES) {
    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    summary.push(`${table}: ${rows.length} baris`);

    if (rows.length === 0) {
      lines.push(`-- ${table}: kosong`);
      lines.push("");
      continue;
    }

    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(", ");

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => cleanRow(table, r));
      const tuples = chunk.map(
        (r) => "  (" + cols.map((c) => pgLiteral(r[c])).join(", ") + ")",
      );
      lines.push(`INSERT INTO "${table}" (${colList}) VALUES`);
      lines.push(tuples.join(",\n") + ";");
      lines.push("");
    }

    // Sinkronkan identity sequence dengan id terbesar
    lines.push(
      `SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), ` +
        `COALESCE((SELECT MAX(id) FROM "${table}"), 1), ` +
        `(SELECT COUNT(*) > 0 FROM "${table}"));`,
    );
    lines.push("");
  }

  lines.push("COMMIT;");
  lines.push("");
  lines.push("-- SELESAI");

  const outPath = path.join(rootDir, "database_postgres_data.sql");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(summary.join("\n"));
  console.log(`\n✅ Export selesai → ${outPath}`);
  console.log(`   Ukuran: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

  await conn.end();
};

main().catch((err) => {
  console.error("❌ Export gagal:", err);
  process.exit(1);
});