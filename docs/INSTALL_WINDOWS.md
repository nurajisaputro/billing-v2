# Instalasi Billing RT/RW Net di Windows

Panduan ini untuk menjalankan aplikasi di Windows 10/11 atau Windows Server. Untuk pemakaian lokal/pengembangan, gunakan Vite. Untuk pemakaian multiuser di jaringan, gunakan frontend hasil build di web server yang sesuai dan jalankan backend sebagai service terkelola; jangan mengandalkan terminal development yang ditutup pengguna.

## 1. Instal kebutuhan

Instal:

- Node.js versi LTS minimal 20.
- MySQL 8.x Server (MySQL Installer) dan Workbench, atau server MySQL yang dapat diakses.
- Git (opsional jika mengambil source dari GitHub).

Buka PowerShell dan verifikasi:

```powershell
node --version
npm --version
mysql --version
```

Jika perintah `mysql` tidak dikenali, gunakan MySQL Command Line Client atau tambahkan folder `bin` MySQL ke PATH.

## 2. Unduh source

Clone repository setelah dipublikasikan:

```powershell
git clone https://github.com/USERNAME/REPOSITORY.git C:\BillingRTNet
cd C:\BillingRTNet
```

Atau unduh ZIP dari GitHub, ekstrak ke `C:\BillingRTNet`, lalu buka PowerShell pada folder tersebut. Pastikan folder `backend` dan `frontend` langsung berada di dalam direktori itu.

## 3. Buat database

Di MySQL Workbench, jalankan SQL berikut dengan mengganti password:

```sql
CREATE DATABASE billing_rwnet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'billing_app'@'localhost' IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_KUAT';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON billing_rwnet.* TO 'billing_app'@'localhost';
FLUSH PRIVILEGES;
```

Impor `backend/sql/schema.sql` ke database `billing_rwnet` melalui Workbench (Server > Data Import) atau PowerShell:

```powershell
Get-Content .\backend\sql\schema.sql | mysql -u billing_app -p billing_rwnet
```

Jika executable `mysql` tidak berada di PATH, gunakan path penuh ke `mysql.exe` atau gunakan Workbench. Jangan gunakan akun root pada konfigurasi aplikasi.

## 4. Konfigurasikan backend

```powershell
Copy-Item .\backend\.env.example .\backend\.env
notepad .\backend\.env
```

Contoh nilai:

```env
PORT=3000
APP_TIMEZONE=Asia/Jakarta
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=billing_app
DB_PASSWORD=GANTI_DENGAN_PASSWORD_KUAT
DB_NAME=billing_rwnet
SCHEDULER_ENABLED=true
ROUTER_CREDENTIAL_KEY=ISI_DENGAN_KUNCI_HEX_64_KARAKTER
ISOLATION_BATCH_SIZE=5
ISOLATION_ITEM_DELAY_MS=2000
ISOLATION_BATCH_DELAY_MS=5000
```

Generate kunci enkripsi dari PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Salin hasil ke `ROUTER_CREDENTIAL_KEY`. Simpan kunci dengan aman dan jangan menggantinya setelah password router tersimpan. Jangan mengunggah `.env` ke GitHub.

## 5. Jalankan backend

Buka PowerShell pertama:

```powershell
cd C:\BillingRTNet\backend
npm install
npm start
```

Biarkan jendela tetap berjalan. Backend menggunakan port 3000 secara default. Untuk tes, buka PowerShell kedua:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Jika gagal, periksa MySQL aktif, `.env`, username/password database, dan apakah port 3000 sedang dipakai aplikasi lain.

## 6. Jalankan frontend

Buka PowerShell kedua atau ketiga:

```powershell
cd C:\BillingRTNet\frontend
npm install
npm run dev
```

Buka alamat yang ditampilkan Vite, biasanya `http://localhost:5173`. Jangan gunakan development server ini sebagai layanan internet publik.

## 7. Akses dari komputer lain di LAN

Untuk penggunaan multiuser, cara yang lebih baik adalah build frontend dan menyajikannya melalui web server yang melayani HTTPS serta meneruskan `/api` ke backend. Konfigurasi default Vite hanya untuk pengembangan dan proxy API mengarah ke `localhost:3000`.

Jika Anda memilih konfigurasi LAN sendiri, pastikan frontend menggunakan alamat API yang benar untuk server dan jangan membuka port backend ke internet. Aktifkan Windows Firewall, izinkan hanya port yang diperlukan, dan gunakan HTTPS untuk akses yang melewati jaringan tidak tepercaya. Jangan mem-forward port MikroTik API dari router ke internet.

## 8. Setup awal dan MikroTik

1. Buka aplikasi dan buat akun superadmin pertama di layar setup.
2. Tambahkan router MikroTik dari menu MikroTik.
3. Buat PPP Profile dengan nama persis `KV-ISOLIR`, lalu validasi dari aplikasi.
4. Uji dengan satu akun pelanggan percobaan sebelum isolir otomatis.
5. Periksa zona waktu Windows, periode pembayaran, dispensasi, dan waktu isolir.

## 9. Menjalankan otomatis saat startup

Untuk penggunaan server, jangan hanya mengandalkan jendela PowerShell manual. Gunakan Windows Task Scheduler atau service manager yang tepercaya untuk menjalankan `node C:\BillingRTNet\backend\src\server.js` saat startup, dengan working directory `C:\BillingRTNet\backend` dan restart saat gagal. Pastikan akun service punya izin baca folder aplikasi dan `.env`.

Jalankan hanya satu instance backend dengan scheduler aktif terhadap database produksi agar invoice dan isolir tidak diproses ganda. Build ulang frontend setiap kali source UI berubah:

```powershell
cd C:\BillingRTNet\frontend
npm install
npm run build
```

Hasil build ada di `frontend\dist`. Sajikan folder ini dengan web server yang dikonfigurasi untuk SPA fallback dan proxy `/api` ke backend.

## 10. Backup dan update

- Backup database dari MySQL Workbench atau `mysqldump` secara berkala.
- Simpan `.env` dan kunci enkripsi di tempat aman di luar repository.
- Sebelum update, backup database dan source, baca migrasi yang diperlukan, lalu jalankan hanya migrasi yang belum diterapkan.
- Jangan menimpa `.env` produksi dengan file `.env.example`.
- Periksa log backend dan lakukan tes login, tagihan, pembayaran, dan router setelah update.
