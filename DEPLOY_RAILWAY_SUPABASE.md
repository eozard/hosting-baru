# Panduan Deploy: Railway + Supabase

Panduan click-by-click untuk meng-online-kan Sistem Absensi PKL BPTI.
Kode sudah dimigrasikan ke PostgreSQL dan **lulus 109 tes API** terhadap data asli.

```
Laptop kamu ──push──> GitHub (repo baru) ──deploy──> Railway (app)
                                                      │
                                          DATABASE_URL│
                                                      ▼
                                               Supabase (PostgreSQL)
File uploads lama ──restore_uploads.js──> Railway Volume
```

**Biaya:** Supabase gratis (cukup untuk app ini). Railway: kredit trial $5 sekali
untuk akun baru, lalu paket Hobby ±$5/bulan (±Rp85 ribu) supaya app terus online.

---

## Bagian 1 — Supabase (database)

1. Buka **https://supabase.com** → **Sign in** (bisa pakai akun GitHub).
2. Di dashboard: **New project**.
   - **Name:** `pkl-bpti`
   - **Database Password:** buat password kuat → **SIMPAN di tempat aman**
     (tidak bisa dilihat lagi, hanya bisa di-reset).
   - **Region:** `Southeast Asia (Singapore)` (terdekat dari Indonesia).
   - Klik **Create new project** → tunggu ±1–2 menit.
3. Menu kiri: **SQL Editor** → **New query**.
4. Di laptop, buka file **`database_postgres.sql`** (root project) → copy SEMUA
   isinya → paste ke SQL Editor → klik **Run** → pastikan "Success".
5. **New query** lagi → copy SEMUA isi **`database_postgres_data.sql`**
   (±250 KB, data asli: 98 user, 1346 absensi, 17 pendaftar, dll) → paste → **Run**.
   - File ini sengaja TIDAK masuk GitHub (berisi data user). Ada di laptop kamu.
   - Alternatif: kirim connection string (langkah 7) ke asisten, nanti diimportkan.
6. Cek: menu **Table Editor** → tabel `users` → harus ada 98 baris.
7. Ambil connection string: klik tombol **Connect** (atas) → tab
   **Session pooler** → copy URI. Bentuknya:
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
   ```
   Ganti `[YOUR-PASSWORD]` dengan password dari langkah 2.
   - Pakai **Session pooler** (port 5432), JANGAN Transaction pooler (6543)
     dan jangan Direct connection (IPv6, sering gagal dari Railway).

> Catatan: project gratis Supabase di-pause otomatis setelah ±7 hari tanpa
> aktivitas. Kalau app tiba-tiba tidak bisa connect: buka dashboard Supabase →
> **Restore project**. Untuk UAT yang aktif terus, ini jarang terjadi.

---

## Bagian 2 — GitHub (repository baru)

1. Buka **https://github.com/new** (login dulu).
2. **Repository name:** `pkl-bpti-app` (atau nama lain yang kamu mau).
3. Pilih **Private** (disarankan).
4. JANGAN centang "Add a README file" / .gitignore / license — repo harus kosong.
5. Klik **Create repository**.
6. Kirim URL repo ke asisten (contoh: `https://github.com/username/pkl-bpti-app`)
   → kode akan di-push dari laptop ini (history baru, bersih, tanpa data dump).

---

## Bagian 3 — Railway (hosting app)

1. Buka **https://railway.com** → **Login with GitHub**.
2. Dashboard → **New Project** → **Deploy from GitHub repo**.
   - Kalau diminta: **Configure GitHub App** → pilih repo baru tadi
     ("Only select repositories") → Install/Authorize.
3. Railway otomatis mendeteksi **Dockerfile** dan mulai build (±3–5 menit).
   Build pertama mungkin gagal karena `DATABASE_URL` belum di-set — wajar,
   lanjutkan langkah berikut lalu redeploy.
4. Klik service-nya → tab **Variables** → tambahkan (bisa pakai **Raw Editor**
   dan paste semuanya sekaligus):

   ```env
   NODE_ENV=production
   DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
   JWT_SECRET=[string acak minimal 32 karakter — minta dibuatkan asisten]
   BYPASS_WIFI_CHECK=true
   BYPASS_TIME_CHECK=true
   BYPASS_JEDA_CHECK=true
   VITE_BYPASS_TIME_CHECK=true
   UPLOAD_ROOT=/app/server/uploads
   ```

   Penjelasan flag bypass:

   | Variabel | Efek kalau `true` |
   |---|---|
   | `BYPASS_WIFI_CHECK` | Absen bisa dari jaringan mana pun (tidak wajib WiFi kampus) |
   | `BYPASS_TIME_CHECK` | Abaikan jam absen 08–10 & 15–17; sesi otomatis pagi lalu sore |
   | `BYPASS_JEDA_CHECK` | Lewati aturan jeda minimal 6 jam antara pagi & sore |
   | `VITE_BYPASS_TIME_CHECK` | UI dashboard mahasiswa menampilkan mode bypass (saat build) |
   | `BYPASS_PAGI_ONLY` | (JANGAN di-set) memaksa sesi selalu pagi — tidak bisa absen sore |

5. **Volume** (supaya file upload tidak hilang saat redeploy):
   klik service → tab **Settings** → bagian **Volumes** → **Add Volume** →
   **Mount path:** `/app/server/uploads` → simpan.
   (Di beberapa versi UI: klik kanan service di canvas → **Add Volume**.)
6. Tab **Settings** → **Networking** → **Generate Domain** →
   dapat URL publik, mis. `https://pkl-bpti-app.up.railway.app`.
7. Tab **Deployments** → deploy terbaru → menu ⋮ → **Redeploy**
   (supaya variables + volume terpakai). Tunggu status **Active**.
8. Buka domain → halaman landing app harus muncul.

---

## Bagian 4 — Pindahkan file uploads lama (48 PDF, ±51 MB)

Volume Railway mulai dalam keadaan kosong, jadi file PDF pendaftar/tugas lama
perlu dikirim sekali dari laptop:

1. Railway → **Variables** → tambah: `MIGRATION_SECRET=[string acak panjang]`.
2. Tunggu redeploy selesai (endpoint migrasi baru aktif).
3. Di laptop, dari folder project, jalankan:
   ```bash
   node server/scripts/restore_uploads.js https://<domain-railway> <MIGRATION_SECRET>
   ```
4. Tunggu sampai `48 sukses, 0 gagal`.
5. **Hapus variabel `MIGRATION_SECRET`** di Railway → redeploy.
   Endpoint migrasi otomatis nonaktif lagi (aman).

---

## Bagian 5 — Verifikasi online

1. `https://<domain>/health` → harus mengembalikan:
   `{"status":"Server is running","database":"connected"}`
2. Login pakai akun yang sudah ada (data ikut pindah dari Laragon).
3. Coba absen pagi & sore (semua bypass ON → bisa dari rumah, jam berapa pun).
4. Cek dashboard admin, logbook, pendaftaran, dan menu mentor.
5. Coba upload PDF pendaftaran baru → preview → pastikan file tersimpan
   (tersimpan di Volume, aman dari redeploy).

---

## Bagian 6 — Development lokal setelah migrasi

Laragon/MySQL **tidak dipakai lagi**. Lokal sekarang connect ke Supabase:

1. Edit `.env` di root project: isi `DATABASE_URL` (sama dengan Railway, atau
   buat project Supabase kedua khusus development — gratis 2 project).
2. `npm install` → `npm run build` → `npm start` → http://localhost:5000.
3. `npm run seed` tetap bisa dipakai untuk membuat akun default.

---

## Catatan keamanan penting

- **Password bypass hardcode:** ada password "sakti" di `server/routes/auth.js`
  dan `adminPendaftaran.js` yang bisa login sebagai user mana pun. Ini sengaja
  dipertahankan untuk UAT sesuai permintaan. **Setelah UAT selesai, minta
  asisten menghapusnya** sebelum app dipublikasikan luas.
- Ganti password akun default `admin/admin123` (absensi & pendaftaran) setelah online.
- `JWT_SECRET` harus acak & rahasia; jangan pakai yang default.
- Jangan pernah commit `.env` / `database_postgres_data.sql` (sudah di `.gitignore`).
- RLS Supabase aktif di semua tabel → akses via anon key publik diblokir;
  hanya server (role postgres) yang bisa baca/tulis. Jaga kerahasiaan DATABASE_URL.