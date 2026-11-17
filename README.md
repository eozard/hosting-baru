# Sistem Absensi & Monitoring PKL BPTI

Aplikasi fullstack untuk absensi, pendaftaran, logbook, dan penilaian peserta PKL BPTI.

- **Backend:** Node.js + Express (REST API, JWT auth, device binding, validasi WiFi kampus)
- **Frontend:** React + Vite + Tailwind CSS
- **Database:** PostgreSQL (Supabase) — driver `pg` dengan lapisan kompatibilitas gaya mysql2 di `server/config/db.js`
- **Upload file:** disk lokal `server/uploads/` (di Railway: Volume)
- **Hosting:** Railway (satu service Docker: Express melayani API + hasil build React)

## Fitur

| Modul | Keterangan |
|---|---|
| Absensi | Absen pagi/sore, validasi WiFi kampus & device binding, hari libur |
| Izin | Pengajuan izin (maks 2/hari), approval admin, pembatalan |
| Logbook | Catatan harian mahasiswa (draft → edit maks 2x → submit → lock); hapus & reset hanya oleh admin |
| Pendaftaran | Form publik + upload 3 PDF, kuota divisi, dashboard admin pendaftaran |
| Mentor | Indikator penilaian, nilai, sertifikat, tugas mingguan, tugas akhir |
| Admin | Statistik, kelola user/device, laporan absensi, tanggal merah |

## Quick Start (Lokal)

Prasyarat: Node.js >= 20, project Supabase (gratis) atau PostgreSQL lokal.

```bash
# 1. Install dependencies (root + server + client)
npm install

# 2. Siapkan database
#    - Supabase: SQL Editor → paste isi database_postgres.sql → Run
#    - (opsional) import data: database_postgres_data.sql (file lokal, tidak di repo)

# 3. Konfigurasi environment
cp .env.example .env
#    Isi DATABASE_URL (Supabase → Connect → Session pooler → URI) dan JWT_SECRET

# 4. Build frontend + jalankan
npm run build
npm start
# → http://localhost:5000
```

Development frontend terpisah (hot reload): `npm run dev:frontend` (port 5173, proxy /api ke 5000).

## Scripts

| Script | Fungsi |
|---|---|
| `npm start` / `npm run dev` | Jalankan server (melayani API + frontend build) |
| `npm run build` | Build React client ke `client/dist` |
| `npm run seed` | Buat akun default (admin/admin123, sample mahasiswa & mentor) |
| `node server/scripts/export_mysql_to_pg.js` | (Migrasi) export data MySQL lama → file INSERT PostgreSQL |
| `node server/scripts/restore_uploads.js <url> <secret>` | (Migrasi) kirim file uploads lokal ke server production |

## Environment Variables

Lihat [.env.example](.env.example). Yang utama:

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL/Supabase (Session pooler, port 5432) |
| `JWT_SECRET` | Secret random minimal 32 karakter |
| `PORT` | Default 5000; Railway set otomatis |
| `BYPASS_WIFI_CHECK` | `true` = absen dari jaringan mana pun |
| `BYPASS_TIME_CHECK` | `true` = abaikan jendela jam absen (sesi otomatis pagi→sore) |
| `BYPASS_JEDA_CHECK` | `true` = lewati aturan jeda 6 jam pagi→sore |
| `BYPASS_PAGI_ONLY` | `true` = paksa sesi selalu pagi |
| `VITE_BYPASS_TIME_CHECK` | Flag bypass UI frontend (dibaca saat build) |
| `UPLOAD_ROOT` | Folder upload; Railway: `/app/server/uploads` (Volume) |
| `MIGRATION_SECRET` | Sementara: aktifkan endpoint migrasi uploads; hapus setelah selesai |

## Deploy

Panduan lengkap click-by-click (Supabase → GitHub → Railway → migrasi file):
**[DEPLOY_RAILWAY_SUPABASE.md](DEPLOY_RAILWAY_SUPABASE.md)**

Ringkas: push repo ke GitHub → Railway deploy dari repo (Dockerfile otomatis) →
set variables → tambah Volume di `/app/server/uploads` → Generate Domain.

## Struktur Project

```
client/               React (Vite) — halaman & komponen
server/
  config/db.js        Pool PostgreSQL + kompatibilitas API mysql2
  config/storage.js   Helper upload file lokal
  middleware/         JWT auth, role guard, validasi WiFi kampus
  routes/             auth/absen, admin, mentor, logbook, pendaftaran
  scripts/            seed, export migrasi, restore uploads
database_postgres.sql Schema PostgreSQL (import ke Supabase)
Dockerfile            Build image production (Railway)
railway.json          Konfigurasi deploy Railway (healthcheck /health)
```

## Catatan Keamanan

- Jangan commit `.env` atau `database_postgres_data.sql` (sudah di `.gitignore`).
- Ada password bypass yang di-hardcode di `server/routes/auth.js` dan
  `adminPendaftaran.js` untuk keperluan testing/UAT. **Hapus/nonaktifkan sebelum
  publikasi luas** — siapa pun yang mengetahuinya bisa login sebagai user mana pun.
- Ganti password akun default (`admin/admin123`) setelah online.
- RLS aktif di semua tabel Supabase; akses REST publik (anon key) diblokir.
  Server connect sebagai role `postgres` (bypass RLS) — jaga kerahasiaan DATABASE_URL.