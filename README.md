# Billing RT/RW Net & TV Kabel

Aplikasi penagihan dan pengelolaan pelanggan untuk layanan RT/RW Net dan TV kabel. Project ini menggunakan **React + Vite** untuk antarmuka, **Node.js + Express** untuk API, **MySQL** untuk database, serta **RouterOS API** untuk integrasi MikroTik.

> **Status project:** aplikasi komunitas/MVP yang masih dikembangkan. Uji terlebih dahulu di lingkungan laboratorium sebelum digunakan untuk pelanggan sungguhan. Fitur isolir mengubah PPP Profile pelanggan dan dapat memutus sesi PPP aktif. Kesalahan konfigurasi dapat menyebabkan layanan pelanggan terputus.

## Fitur utama

- Pengelolaan data pelanggan dan paket layanan Internet/TV kabel.
- Integrasi MikroTik untuk router, PPP Profile, status PPPoE, serta isolir dan aktivasi kembali.
- Tagihan bulanan, pembayaran tunai/transfer, rekening bank, dan riwayat transaksi.
- Pengaturan periode pembayaran, masa tenggang, dispensasi, dan pengecualian isolir.
- Isolir massal secara bertahap dengan ukuran kelompok (batch) dan jeda yang dapat dikonfigurasi.
- Hak akses pengguna: `superadmin`, `admin`, dan `kolektor`.
- Laporan keuangan bulanan, pengeluaran, aset/ONT, dan ekspor CSV.
- Tema terang/gelap dan pengaturan nama merek aplikasi.

## Teknologi dan struktur project

- `frontend/` — antarmuka React + Vite.
- `backend/` — API Express, scheduler, integrasi RouterOS, dan koneksi MySQL.
- `backend/sql/schema.sql` — skema database untuk instalasi baru.
- `backend/sql/migrate_*.sql` — berkas migrasi untuk database versi sebelumnya.
- `docs/` — dokumentasi teknis dan panduan instalasi.

## Persyaratan sistem

- Node.js **versi 20 atau lebih baru**; disarankan menggunakan versi LTS yang masih didukung.
- MySQL 8.x.
- Browser modern.
- MikroTik RouterOS yang dapat dijangkau oleh backend jika menggunakan integrasi router.
- Untuk server, gunakan Ubuntu Server LTS atau Windows yang dikelola dengan baik.

## Panduan instalasi

Pilih panduan yang sesuai dengan sistem operasi:

- [Panduan instalasi Ubuntu Server](docs/INSTALL_UBUNTU.md)
- [Panduan instalasi Windows](docs/INSTALL_WINDOWS.md)
- [Struktur folder project](docs/STRUKTUR_FOLDER.md)
- [Keamanan dan batasan sebelum penggunaan produksi](SECURITY.md)

### Menjalankan untuk pengembangan lokal

1. Buat database MySQL dan impor `backend/sql/schema.sql`.
2. Salin `backend/.env.example` menjadi `backend/.env`, lalu isi nilai konfigurasi lokal.
3. Di folder `backend`, jalankan `npm install`, kemudian `npm start`.
4. Di folder `frontend`, jalankan `npm install`, kemudian `npm run dev`.
5. Buka `http://localhost:5173` di browser.
6. Saat pertama kali digunakan, buat akun superadmin melalui halaman penyiapan awal. Aplikasi tidak menyediakan kata sandi bawaan.

Untuk server produksi, **jangan gunakan Vite development server sebagai layanan publik**. Bangun frontend dan sajikan melalui web server seperti Nginx; jalankan backend sebagai layanan sistem. Ikuti panduan Ubuntu untuk contoh penerapan.

## Konfigurasi environment

Buat berkas konfigurasi lokal `backend/.env` berdasarkan `backend/.env.example`. Jangan unggah berkas `.env`, kata sandi, token, atau kredensial asli ke repository.

| Variabel | Fungsi |
|---|---|
| `PORT` | Port API backend; nilai bawaan `3000` |
| `APP_TIMEZONE` | Zona waktu scheduler; nilai bawaan `Asia/Jakarta` |
| `DB_HOST`, `DB_PORT` | Alamat host dan port MySQL |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Akun database dan nama database |
| `SCHEDULER_ENABLED` | Gunakan `true` untuk mengaktifkan scheduler otomatis |
| `ROUTER_CREDENTIAL_KEY` | Kunci enkripsi kata sandi MikroTik yang disimpan aplikasi |
| `ISOLATION_BATCH_SIZE` | Jumlah pelanggan dalam satu kelompok isolir/aktivasi kembali |
| `ISOLATION_ITEM_DELAY_MS` | Jeda setelah setiap pelanggan diproses, dalam milidetik |
| `ISOLATION_BATCH_DELAY_MS` | Jeda setelah satu kelompok selesai, dalam milidetik |

Buat kunci enkripsi satu kali dan simpan di tempat aman. Contoh pada Linux:

```bash
openssl rand -hex 32
```

Contoh pada PowerShell jika Node.js sudah terpasang:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Masukkan hasilnya ke `ROUTER_CREDENTIAL_KEY`. **Jangan mengganti atau kehilangan kunci setelah kata sandi router tersimpan dalam bentuk terenkripsi**, karena aplikasi mungkin tidak dapat membaca kembali kredensial tersebut. Simpan cadangan dengan aman.

## Isolir massal bertahap

Nilai awal konservatif yang dicantumkan dalam contoh konfigurasi:

```env
ISOLATION_BATCH_SIZE=5
ISOLATION_ITEM_DELAY_MS=2000
ISOLATION_BATCH_DELAY_MS=5000
```

Artinya, pelanggan diproses satu per satu dengan jeda 2 detik setelah setiap pelanggan, lalu jeda 5 detik setelah setiap kelompok berisi 5 pelanggan. Untuk 100 pelanggan, jeda konfigurasi saja memerlukan sekitar 5 menit, belum termasuk waktu respons API dan database.

Nilai tersebut bukan jaminan kinerja untuk semua server dan router. Uji terlebih dahulu pada 5–10 pelanggan percobaan, lalu pantau log serta beban server dan router sebelum meningkatkan jumlah pelanggan.

## Hak akses pengguna

- **Superadmin:** akses penuh, termasuk pengaturan global dan pengelolaan MikroTik.
- **Admin:** akses operasional dan pengelolaan pengguna, tanpa akses ke pengaturan global dan pengelolaan router.
- **Kolektor:** akses pelanggan, tagihan, pembayaran, laporan keuangan bulanan, dan profil.

Pada instalasi baru, halaman login menyediakan penyiapan superadmin pertama selama belum ada pengguna. Gunakan kata sandi yang kuat dan buat akun tersendiri untuk setiap operator.

## Database baru dan database lama

- **Instalasi baru:** jalankan `backend/sql/schema.sql` satu kali.
- **Peningkatan dari database lama:** buat cadangan database terlebih dahulu, kemudian jalankan hanya migrasi yang belum diterapkan dan sesuai dengan versi database Anda.
- Jangan menjalankan seluruh berkas migrasi secara membabi buta. Periksa struktur database dan petunjuk pada setiap migrasi sebelum menerapkannya.

Migrasi yang tersedia antara lain `migrate_bank_accounts.sql`, `migrate_package_router.sql`, `migrate_multi_role_assets.sql`, `migrate_customer_billing_collector.sql`, `migrate_billing_windows_customer_status.sql`, dan `migrate_invoice_nunggak.sql`.

## Integrasi MikroTik

- Buat PPP Profile isolir dengan nama persis `KV-ISOLIR` pada router.
- Buat akun API khusus dengan hak akses minimum yang dibutuhkan aplikasi. Hindari menggunakan akun administrator utama jika tidak diperlukan.
- Batasi akses API RouterOS hanya dari alamat server billing dan, jika memungkinkan, gunakan VPN atau jaringan manajemen privat.
- Jangan membuka API MikroTik langsung ke internet.
- Uji koneksi, validasi profile isolir, serta uji isolir dan pemulihan pada pelanggan percobaan sebelum mengaktifkan scheduler otomatis.

## Pencadangan dan operasional

- Cadangkan database secara berkala dan uji proses pemulihannya.
- Simpan `backend/.env` dan kunci enkripsi di lokasi aman yang terpisah dari repository.
- Pantau log backend, koneksi MySQL, dan status API router.
- Scheduler memeriksa tagihan/isolir setiap menit dan kesehatan router setiap 120 detik. Pastikan hanya satu instance backend dengan scheduler aktif yang mengelola database produksi, kecuali mekanisme penguncian terdistribusi sudah diterapkan dan diuji.
- Sesi login disimpan di memori backend, sehingga pengguna perlu login kembali setelah backend dimulai ulang.

## Kontribusi

Laporan masalah (issue) dan pull request dipersilakan sesuai ketentuan lisensi repository. Sertakan versi Node.js, MySQL, dan RouterOS, langkah untuk mengulangi masalah, log yang sudah disamarkan, serta hasil yang diharapkan.

Jangan mengirim kata sandi, token, alamat IP publik yang sensitif, data pelanggan, atau cadangan database asli ke issue publik.

## Lisensi

Project ini menggunakan **Lisensi Khusus Billing RT/RW Net — Kode Sumber Tersedia** yang tercantum dalam berkas [`LICENSE`](LICENSE). Lisensi ini **bukan lisensi open-source standar**.

Penggunaan komersial, termasuk penggunaan oleh ISP untuk operasional usahanya sendiri, wajib memperoleh izin tertulis terlebih dahulu dari pemegang hak cipta. Penggunaan, modifikasi, dan distribusi tetap tunduk pada seluruh ketentuan dalam berkas `LICENSE`.

Komponen pihak ketiga tetap tunduk pada lisensi masing-masing. Untuk pertanyaan atau permohonan izin komersial, hubungi: **nuraji486@gmail.com**.
