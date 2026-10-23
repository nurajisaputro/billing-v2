# Windows local setup — Billing RT/RW Net MVP

> This starter is for local development and lab testing only. It does not yet include login/authentication or authorization. Do not expose it to a LAN/WAN or connect its isolate/reactivate endpoints to production customers until those controls are implemented.

## Requirements
- Windows 10/11
- Node.js 20 LTS or newer (verify with `node -v` and `npm -v`)
- MySQL 8.x Server and MySQL command-line client
- A test MikroTik on a trusted LAN or VPN; RouterOS v6 and v7 are supported through the RouterOS API

## 1. Extract project
Extract `billing-rt-rwnet-mvp.zip`, then open PowerShell in the extracted `billing-rt-rwnet` directory.

## 2. Create database and app user
Open MySQL Workbench or the MySQL command-line client as an administrator and execute:

```sql
CREATE DATABASE IF NOT EXISTS billing_rwnet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'billing_app'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON billing_rwnet.* TO 'billing_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Then import `backend/sql/schema.sql` using MySQL Workbench (Server > Data Import > Import from Self-Contained File), or from a MySQL prompt:

```sql
source C:/FULL/PATH/TO/billing-rt-rwnet/backend/sql/schema.sql;
```

Use forward slashes in the path. The schema creates the database and tables.

## 3. Configure backend
In PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
notepad .env
```

Set `DB_PASSWORD` to the password created above and `ROUTER_CREDENTIAL_KEY` to the 64-character hex output. Keep this key private and back it up securely. Do not commit `.env` to source control.

For the first lab test, set `SCHEDULER_ENABLED=false` so the scheduler cannot automatically isolate accounts while you configure the app. Then:

```powershell
npm install
npm run dev
```

Keep this terminal open. In another PowerShell window, check:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

## 4. Run frontend
In a second PowerShell window from the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

## 5. Prepare MikroTik lab router
1. Back up the router configuration.
2. Create a dedicated PPPoE test Secret and a test PPP Profile named exactly `KV-ISOLIR`.
3. Confirm the test Secret's original PPP Profile and record it.
4. Create a dedicated API user for the lab with only the needed `api`, `read`, and `write` policies. RouterOS policy granularity is limited, so keep this user on a lab router if possible.
5. Enable the RouterOS API service only for the trusted billing-server/local test IP. Do not port-forward API (8728/8729) to the public internet. Prefer a VPN/private network; use API-SSL where properly configured and supported by your client setup.
6. In the app, add the router using its private IP, API port (normally 8728 for API), username/password, and the exact isolation profile name. Click Test Connection.

## 6. Read-only test before changing profiles
Use the app's PPP Secret list endpoint after adding a router:

```powershell
Invoke-RestMethod http://localhost:3000/api/routers/1/ppp-secrets
```

Replace `1` with the router ID shown by `GET http://localhost:3000/api/routers`. Confirm the test username and profile are correct. Never paste router passwords or API tokens into chat.

## 7. Controlled isolation test
Do not enable the scheduler yet. Use only a disposable test PPPoE account. Confirm the `KV-ISOLIR` profile exists and has the intended restricted access. Then use the UI's isolate action for that test customer, verify its Secret profile changed, and verify the active session is disconnected. Reactivate the same test customer and verify the exact original profile is restored.

The current MVP has no authentication and exposes profile-changing API routes. Use only on localhost during development. Do not connect it to production routers or real customers until authentication/authorization, CSRF/origin protections, input validation, audit review, backups, and safe scheduler controls are added and tested.


## Dashboard terisolir dan riwayat pembayaran

Di menu MikroTik, buat terlebih dahulu PPP Profile `KV-ISOLIR` pada setiap router. Setelah router tersimpan, klik **Validasi KV-ISOLIR** agar aplikasi memastikan profile tersebut tersedia dan menggunakan nama itu sebagai profile isolir billing. Dashboard akan menghitung pelanggan berdasarkan PPP Secret yang benar-benar memakai profile `KV-ISOLIR` di router; angka tidak dianggap valid bila router gagal diperiksa.

Pada menu Pembayaran, gunakan input bulan untuk melihat riwayat transaksi pada periode lain. Total dan jumlah transaksi mengikuti tanggal pembayaran (`paid_at`), bukan periode tagihan.


## Update fitur paket MikroTik (database versi sebelumnya)

Jika database `billing_rwnet` sudah dibuat dari versi project sebelumnya, jalankan file `backend/sql/migrate_package_router.sql` satu kali di MySQL Workbench atau terminal MySQL. Migrasi ini menambahkan hubungan paket dengan router MikroTik. Jangan jalankan ulang jika kolom `packages.router_id` sudah ada. Jika database masih baru, kolom tersebut sudah dibuat oleh `schema.sql` dan migrasi tidak perlu dijalankan.

Paket Internet dan Bundle memerlukan router MikroTik dan PPP Profile yang dibaca langsung melalui RouterOS API. Paket TV Kabel tidak menampilkan pilihan router atau PPP Profile. Status PPP pelanggan diperiksa saat aplikasi dibuka/di-refresh dan otomatis diperiksa kembali setiap 3 jam. Pemeriksaan membaca sesi `/ppp/active`; bila router tidak dapat dihubungi atau pelanggan tidak memiliki sesi aktif, status ditampilkan `Offline`.


## Upgrade ke multi-role dan inventaris
Jika database `billing_rwnet` sudah ada, buka MySQL client lalu jalankan isi file `backend/sql/migrate_multi_role_assets.sql` satu kali. Jangan jalankan migrasi yang sama berulang kali jika Anda mengubahnya secara manual. Jika membuat database baru, gunakan `backend/sql/schema.sql` yang sudah memuat tabel baru.

Restart backend, kemudian buka frontend. Jika tabel `users` masih kosong, aplikasi akan meminta Anda membuat akun superadmin pertama. Gunakan password minimal 8 karakter dan simpan dengan aman. Admin tidak dapat membuka menu MikroTik/Pengaturan; kolektor dibatasi ke menu kerja harian dan laporan bulanan.


### Update versi pelanggan: tanggal invoice dan penugasan kolektor

Untuk database yang sudah dipakai dari versi sebelumnya, setelah menjalankan migrasi `migrate_multi_role_assets.sql`, jalankan `backend/sql/migrate_customer_billing_collector.sql` satu kali. Migrasi ini menambahkan override tanggal cetak invoice per pelanggan dan penugasan kolektor. Jangan jalankan jika kolom `invoice_day_override` dan `collector_id` sudah tersedia. Pada database baru, cukup jalankan `schema.sql`.

Tanggal cetak invoice global di Pengaturan menjadi nilai default. Pada form pelanggan, isi `Tanggal cetak invoice` untuk jadwal khusus pelanggan; kosong berarti mengikuti pengaturan global. Scheduler backend harus aktif (`SCHEDULER_ENABLED=true`) agar invoice dibuat otomatis setiap hari sesuai jadwal. `Tanggal billing/jatuh tempo` tetap menentukan tanggal jatuh tempo, dan `Masa tenggang` serta opsi isolir otomatis per pelanggan tetap berlaku.


## Pengaturan rentang pembayaran dan isolir massal (v7)
Untuk database yang sudah dipakai pada v6, setelah memastikan migrasi v6 sebelumnya telah dijalankan, jalankan satu kali `backend/sql/migrate_billing_windows_customer_status.sql` pada database `billing_rwnet`. Untuk database baru, cukup gunakan `backend/sql/schema.sql`.

Default billing: invoice dibuat tanggal 1, masa pembayaran tanggal 1–13, dispensasi 2 hari, lalu isolir massal berjalan tanggal 16 pukul 00:01 (zona waktu server `APP_TIMEZONE`, default Asia/Jakarta). Pengaturan per pelanggan dapat meng-override tanggal invoice, rentang pembayaran, dispensasi, dan jam isolir. Centang **Lewati isolir massal** untuk mengecualikan pelanggan dari proses isolir otomatis. Pelanggan yang dinonaktifkan tidak akan mendapat invoice bulanan baru.

Hapus pelanggan hanya tersedia jika pelanggan belum memiliki riwayat tagihan. Jika sudah ada tagihan, nonaktifkan pelanggan agar riwayat pembayaran tetap terjaga.


### Fitur paket dan tagihan versi terbaru
- Menu Paket memiliki pencarian dan tombol hapus. Penghapusan paket tidak menghapus riwayat invoice; relasi paket pada pelanggan/tagihan menjadi kosong.
- Menu Tagihan memiliki ringkasan nominal tagihan belum lunas dan lunas yang dapat diklik untuk memfilter daftar, serta pencarian dan filter status.
- Tombol NUNGGAK menandai invoice periode berjalan agar pelanggan tidak diisolir untuk bulan ini, tanpa menghapus atau membatalkan invoice. Jika pelanggan sudah terisolir, sistem mencoba mengaktifkan kembali PPP profile.
- Penghapusan invoice menghapus transaksi pembayaran terkait juga; konfirmasi wajib dilakukan karena tidak dapat dibatalkan.
- Untuk database lama jalankan `backend/sql/migrate_invoice_nunggak.sql` satu kali. Database baru menggunakan `backend/sql/schema.sql`.


## Perbaikan v9: Scheduler, session, dan isolir per pelanggan

- Scheduler berada di `backend/src/scheduler.js`; aktifkan dengan `SCHEDULER_ENABLED=true`.
- Log scheduler muncul pada terminal backend setiap tick. Scheduler memeriksa invoice/isolation setiap 60 detik dan status router setiap 120 detik.
- Halaman terakhir disimpan di sessionStorage, jadi refresh browser tidak kembali ke Dashboard.
- Jika API mengembalikan HTTP 401 karena sesi berakhir, token lokal dibersihkan dan aplikasi kembali ke halaman login.
- Menu Pelanggan memiliki tombol Isolir/Aktifkan per pelanggan (admin/superadmin), yang hanya mengubah PPP profile pelanggan tersebut.
