/*
 * ============================================================================
 * KONFIGURASI POSTGRESQL CONNECTION POOL (Supabase)
 * ============================================================================
 * File ini menginisialisasi koneksi PostgreSQL menggunakan package `pg`.
 * Database production: Supabase (PostgreSQL). Development lokal juga bisa
 * connect ke Supabase, atau PostgreSQL lokal.
 *
 * LAPISAN KOMPATIBILITAS mysql2:
 * Kode routes lama ditulis dengan gaya mysql2 (placeholder `?`, hasil
 * `insertId` / `affectedRows`, `pool.getConnection()`). Supaya tidak perlu
 * menulis ulang ratusan query, file ini menyediakan wrapper yang:
 *   1. Mengubah placeholder `?` menjadi `$1, $2, ...` (gaya PostgreSQL)
 *   2. Mengubah bulk insert `VALUES ?` (array of arrays) menjadi multi-row VALUES
 *   3. Menambahkan `RETURNING id` otomatis ke INSERT → emulasi `insertId`
 *   4. Mengembalikan `affectedRows` dari rowCount → emulasi mysql2 ResultSetHeader
 *   5. Menyediakan getConnection() dengan beginTransaction/commit/rollback
 *   6. Mengembalikan DATE/TIME/TIMESTAMP sebagai STRING (seperti dateStrings:true)
 *      supaya logika tanggal di routes tidak berubah
 *   7. Mengembalikan NUMERIC sebagai number dan COUNT (int8) sebagai number
 *
 * ENV YANG DIBUTUHKAN (pilih salah satu):
 *   DATABASE_URL  contoh: postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
 *   ATAU
 *   PGHOST (default: localhost), PGPORT (default: 5432),
 *   PGUSER (default: postgres), PGPASSWORD, PGDATABASE (default: pkl)
 *
 * SSL otomatis aktif untuk host non-localhost (Supabase mewajibkan SSL).
 * Timezone sesi di-set Asia/Jakarta (WIB) agar NOW() konsisten dengan
 * perilaku MySQL lama (timezone +07:00).
 * ============================================================================
 */

import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
const localEnvPath = path.resolve(__dirname, "..", ".env");

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: false });
}

const { Pool, types } = pg;

// ----------------------------------------------------------------------------
// TYPE PARSERS: samakan perilaku dengan mysql2 (dateStrings: true)
// ----------------------------------------------------------------------------
const keepString = (v) => v;
types.setTypeParser(1082, keepString); // DATE        → "YYYY-MM-DD"
types.setTypeParser(1083, keepString); // TIME        → "HH:MM:SS"
types.setTypeParser(1114, keepString); // TIMESTAMP   → "YYYY-MM-DD HH:MM:SS"
types.setTypeParser(1184, keepString); // TIMESTAMPTZ → string apa adanya
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // NUMERIC/DECIMAL → number
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // INT8 (COUNT(*)) → number

// ----------------------------------------------------------------------------
// KONFIGURASI KONEKSI
// ----------------------------------------------------------------------------
const connectionString = process.env.DATABASE_URL || null;

let dbConfig;
if (connectionString) {
  dbConfig = { connectionString };
} else {
  dbConfig = {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "",
    database: process.env.PGDATABASE || "pkl",
  };
}

// Tentukan host untuk keputusan SSL
let dbHost = dbConfig.host;
if (connectionString) {
  try {
    dbHost = new URL(connectionString).hostname;
  } catch {
    dbHost = "";
  }
}
const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(dbHost);
const useSsl =
  process.env.PGSSL === "true"
    ? true
    : process.env.PGSSL === "false"
      ? false
      : !isLocalHost;

const pgPool = new Pool({
  ...dbConfig,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PGPOOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  options: "-c timezone=Asia/Jakarta",
});

// Pastikan timezone WIB di setiap koneksi fisik baru ( kompatibel dengan
// Supabase connection pooler yang kadang mengabaikan startup options).
pgPool.on("connect", (client) => {
  client.query("SET TIME ZONE 'Asia/Jakarta'").catch((err) => {
    console.error("Gagal set timezone koneksi:", err.message);
  });
});

pgPool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err.message);
});

// ----------------------------------------------------------------------------
// KONVERSI SQL: gaya mysql2 → gaya PostgreSQL
// ----------------------------------------------------------------------------

/**
 * Ubah `?` menjadi `$n` (skip tanda tanya di dalam string literal),
 * hapus backtick, dan ekspansi bulk insert `VALUES ?`.
 */
export const convertSql = (sql, params = []) => {
  let s = String(sql).replace(/`/g, "");
  let values = Array.isArray(params) ? params.slice() : [];

  // Bulk insert mysql2: "INSERT INTO t (a,b) VALUES ?" dengan params [[row1, row2, ...]]
  const bulkMatch = s.match(/VALUES\s*\?\s*;?\s*$/i);
  if (
    bulkMatch &&
    Array.isArray(values[0]) &&
    values[0].length > 0 &&
    Array.isArray(values[0][0])
  ) {
    const rows = values[0];
    const tuples = [];
    const flat = [];
    for (const row of rows) {
      tuples.push("(" + row.map(() => "?").join(", ") + ")");
      flat.push(...row);
    }
    s = s.slice(0, bulkMatch.index) + "VALUES " + tuples.join(", ");
    values = flat;
  }

  // Walk karakter: ganti ? di luar string literal dengan $n
  let out = "";
  let i = 0;
  let n = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "\\" && ch === "'") {
          j += 2;
          continue;
        }
        if (s[j] === ch) {
          if (s[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out += s.slice(i, Math.min(j + 1, s.length));
      i = j + 1;
      continue;
    }
    if (ch === "?") {
      n += 1;
      out += "$" + n;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }

  if (values.length !== n) {
    throw new Error(
      `Jumlah parameter (${values.length}) tidak cocok dengan placeholder (${n}) di query: ${s.slice(0, 120)}...`,
    );
  }

  return { sql: out, values };
};

const commandOf = (sql) => {
  const m = sql
    .trim()
    .match(
      /^(SELECT|INSERT|UPDATE|DELETE|WITH|SHOW|SET|BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i,
    );
  return m ? m[1].toUpperCase() : "OTHER";
};

/**
 * Jalankan query dengan emulasi hasil mysql2:
 * - SELECT/WITH  → [rows, fields]
 * - INSERT       → [{ insertId, affectedRows }, undefined]  (RETURNING id otomatis)
 * - UPDATE/DELETE→ [{ affectedRows, changedRows }, undefined]
 */
const runQuery = async (executor, sql, params) => {
  const { sql: convertedRaw, values } = convertSql(sql, params);
  let converted = convertedRaw;
  const cmd = commandOf(converted);

  if (cmd === "INSERT" && !/\bRETURNING\b/i.test(converted)) {
    converted = converted.replace(/;\s*$/, "") + " RETURNING id";
  }

  const result = await executor.query(
    converted,
    values.length > 0 ? values : undefined,
  );

  // Multi-statement (simple protocol) mengembalikan array of results
  const res = Array.isArray(result) ? result[result.length - 1] : result;

  if (cmd === "SELECT" || cmd === "WITH" || cmd === "SHOW") {
    return [res.rows || [], res.fields];
  }
  if (cmd === "INSERT") {
    const rows = res.rows || [];
    return [
      {
        insertId: rows.length > 0 ? rows[0].id : 0,
        affectedRows: res.rowCount ?? rows.length,
        rows,
      },
      undefined,
    ];
  }
  if (cmd === "UPDATE" || cmd === "DELETE") {
    return [
      {
        affectedRows: res.rowCount ?? 0,
        changedRows: res.rowCount ?? 0,
      },
      undefined,
    ];
  }
  return [res.rows ?? res, undefined];
};

/**
 * Bungkus pg.Client agar punya API seperti mysql2 connection.
 */
const wrapClient = (client) => ({
  query: (sql, params) => runQuery(client, sql, params),
  execute: (sql, params) => runQuery(client, sql, params),
  beginTransaction: () => client.query("BEGIN"),
  commit: () => client.query("COMMIT"),
  rollback: () => client.query("ROLLBACK"),
  ping: () => client.query("SELECT 1"),
  release: (err) => client.release(err),
  end: () => client.end(),
  // Escape hatch kalau butuh akses pg.Client asli
  raw: client,
});

/**
 * Pool dengan API kompatibel mysql2/promise.
 */
export const pool = {
  query: (sql, params) => runQuery(pgPool, sql, params),
  execute: (sql, params) => runQuery(pgPool, sql, params),
  getConnection: async () => wrapClient(await pgPool.connect()),
  end: () => pgPool.end(),
  on: (...args) => pgPool.on(...args),
  // Escape hatch: pg.Pool asli (untuk query PostgreSQL native bila perlu)
  pg: pgPool,
};

/**
 * Test koneksi ke database. Berguna untuk startup check.
 */
export const testConnection = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (conn) conn.release();
  }
};

/**
 * Helper: parse kolom devices (JSONB) ke array JS.
 * PostgreSQL JSONB sudah dikembalikan sebagai object/array oleh driver,
 * tapi helper ini tetap defensif (data lama bisa berupa string).
 */
export const parseDevices = (val) => {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export default pool;