# Billing RT/RW Net & TV Kabel

Aplikasi billing untuk operasional RT/RW Net dan layanan TV kabel. Project ini menggunakan **React + Vite** untuk antarmuka, **Node.js + Express** untuk API, **MySQL** untuk database, dan **RouterOS API** untuk integrasi MikroTik.

> **Status project:** komunitas/MVP yang sedang dikembangkan. Uji di lingkungan lab sebelum digunakan untuk pelanggan sungguhan. Fitur isolir mengubah PPP Profile pelanggan dan memutus sesi PPP aktif; kesalahan konfigurasi dapat memutus layanan pelanggan.

## Fitur utama

- Data pelanggan dan paket layanan Internet/TV kabel.
- Integrasi MikroTik untuk router, PPP Profile, status PPPoE, dan isolir/reaktivasi.
- Tagihan bulanan, pembayaran tunai/transfer, rekening bank, dan riwayat transaksi.
- Pengaturan periode pembayaran, dispensasi, serta pengecualian isolir.
- Isolir massal berurutan dengan ukuran batch dan jeda yang dapat diatur.
- Role `superadmin`, `admin`, dan `kolektor`.
- Laporan keuangan bulanan, pengeluaran, aset/ONT, dan ekspor CSV.
- Tema terang/gelap dan pengaturan nama brand.

## Arsitektur

- `frontend/` — React + Vite.
- `backend/` — Express API, scheduler, integrasi RouterOS, dan koneksi MySQL.
- `backend/sql/schema.sql` — skema database untuk instalasi baru.
- `backend/sql/migrate_*.sql` — migrasi untuk database versi sebelumnya.
- `docs/` — dokumentasi teknis dan panduan instalasi.

## Persyaratan

- Node.js **20 atau lebih baru** (disarankan versi LTS yang masih didukung).
- MySQL 8.x.
- Browser modern.
- MikroTik RouterOS yang dapat dijangkau dari backend jika menggunakan integrasi router.
- Untuk instalasi server: Linux/Ubuntu LTS atau Windows yang dikelola dengan baik.

## Mulai cepat untuk pengembangan

Lihat panduan khusus agar langkah dan perintah sesuai sistem operasi:

- [Instalasi Ubuntu Server](docs/INSTALL_UBUNTU.md)
- [Instalasi Windows](docs/INSTALL_WINDOWS.md)
- [Struktur folder](docs/STRUKTUR_FOLDER.md)
- [Keamanan dan batasan produksi](SECURITY.md)

Langkah ringkas:

1. Buat database dan impor `backend/sql/schema.sql`.
2. Salin `backend/.env.example` menjadi `backend/.env`, lalu isi konfigurasi lokal.
3. Di folder `backend`, jalankan `npm install` lalu `npm start`.
4. Di folder `frontend`, jalankan `npm install` lalu `npm run dev`.
5. Buka `http://localhost:5173`.
6. Pada penggunaan pertama, buat akun superadmin dari layar setup awal. Tidak ada password default bawaan.

Untuk instalasi server, jangan gunakan Vite development server sebagai layanan publik. Build frontend dan sajikan melalui web server seperti Nginx; jalankan backend sebagai service. Ikuti panduan Ubuntu untuk contoh deployment.

## Konfigurasi environment

Buat file lokal `backend/.env` dari `backend/.env.example`. Jangan commit file `.env` atau kredensial asli.

| Variabel | Fungsi |
|---|---|
| `PORT` | Port API backend, default `3000` |
| `APP_TIMEZONE` | Zona waktu scheduler, default `Asia/Jakarta` |
| `DB_HOST`, `DB_PORT` | Host dan port MySQL |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Akun dan nama database |
| `SCHEDULER_ENABLED` | `true` untuk mengaktifkan scheduler otomatis |
| `ROUTER_CREDENTIAL_KEY` | Kunci enkripsi password MikroTik yang disimpan aplikasi |
| `ISOLATION_BATCH_SIZE` | Jumlah pelanggan per batch isolir/reaktivasi |
| `ISOLATION_ITEM_DELAY_MS` | Jeda setelah tiap pelanggan diproses |
| `ISOLATION_BATCH_DELAY_MS` | Jeda setelah satu batch selesai |

Generate kunci enkripsi sekali saja dan simpan dengan aman. Contoh Linux:

```bash
openssl rand -hex 32
```

Contoh PowerShell dengan Node.js terpasang:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Masukkan hasilnya ke `ROUTER_CREDENTIAL_KEY`. **Jangan mengganti atau kehilangan kunci setelah password router terenkripsi tersimpan**; aplikasi tidak akan dapat mendekripsi kredensial lama tanpa kunci yang sama. Simpan cadangan terenkripsi di tempat aman.

## Isolir massal yang bertahap

Nilai awal yang konservatif di `.env.example`:

```env
ISOLATION_BATCH_SIZE=5
ISOLATION_ITEM_DELAY_MS=2000
ISOLATION_BATCH_DELAY_MS=5000
```

Artinya proses berjalan berurutan, jeda 2 detik setelah setiap pelanggan, lalu jeda 5 detik setelah setiap 5 pelanggan. Untuk 100 pelanggan, jeda konfigurasi saja sekitar 5 menit, di luar waktu API/database. Nilai ini bukan jaminan kinerja untuk semua perangkat. Uji lebih dahulu pada 5–10 pelanggan dan periksa log serta beban router/server.

## Peran pengguna

- **Superadmin:** akses penuh termasuk pengaturan dan MikroTik.
- **Admin:** operasional dan manajemen pengguna, tanpa akses pengaturan global dan pengelolaan router.
- **Kolektor:** pelanggan, tagihan, pembayaran, laporan keuangan bulanan, dan profil.

Pada instalasi baru, layar login menyediakan setup superadmin pertama selama belum ada user. Gunakan password kuat minimal 8 karakter dan segera buat akun individual untuk tiap operator.

## Database baru dan database lama

- **Instalasi baru:** jalankan `backend/sql/schema.sql` satu kali.
- **Upgrade database lama:** backup database terlebih dahulu, lalu jalankan hanya file migrasi yang memang belum diterapkan dan sesuai versi database. Jangan menjalankan semua file migrasi secara membabi buta.
- Beberapa migrasi yang tersedia: `migrate_bank_accounts.sql`, `migrate_package_router.sql`, `migrate_multi_role_assets.sql`, `migrate_customer_billing_collector.sql`, `migrate_billing_windows_customer_status.sql`, dan `migrate_invoice_nunggak.sql`.

## Integrasi MikroTik

- Buat PPP Profile isolir dengan nama persis `KV-ISOLIR` pada router.
- Buat akun API khusus dengan izin minimum yang dibutuhkan aplikasi; jangan gunakan akun administrator utama jika tidak diperlukan.
- Batasi akses API RouterOS hanya dari alamat server billing dan, idealnya, lewat VPN/jaringan manajemen privat.
- Jangan membuka API MikroTik langsung ke internet.
- Uji koneksi, validasi profile isolir, dan uji pada akun pelanggan percobaan sebelum mengaktifkan isolir otomatis.

## Backup dan operasi

- Backup database secara berkala dan uji proses restore.
- Simpan `backend/.env` dan kunci enkripsi di lokasi terpisah yang aman.
- Pantau log backend, koneksi MySQL, dan status API router.
- Scheduler berjalan setiap menit untuk pemeriksaan tagihan/isolir dan setiap 120 detik untuk pemeriksaan kesehatan router. Pastikan hanya satu instance backend dengan scheduler aktif yang menjalankan database produksi; menjalankan beberapa instance dapat menyebabkan pekerjaan scheduler berulang.
- Token login disimpan di memori backend, sehingga semua pengguna harus login ulang setelah backend restart.

## Kontribusi

Issue dan pull request dipersilakan. Sertakan versi Node.js/MySQL/RouterOS, langkah reproduksi, log yang sudah disamarkan, dan hasil yang diharapkan. Jangan kirim password, token, IP publik sensitif, data pelanggan, atau dump database asli.

## Lisensi

Belum ada lisensi open-source yang ditetapkan. Sampai file `LICENSE` ditambahkan, jangan mengasumsikan kode ini boleh digunakan, dimodifikasi, atau didistribusikan ulang tanpa batas. Pemilik repository perlu memilih lisensi yang sesuai sebelum mengundang penggunaan publik.
