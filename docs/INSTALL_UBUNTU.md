# Instalasi Billing RT/RW Net di Ubuntu Server

Panduan ini adalah contoh deployment satu server dengan Ubuntu Server LTS, Node.js 20+, MySQL 8, dan Nginx. Sesuaikan domain, username, serta alamat jaringan dengan lingkungan Anda. Perintah server dijalankan oleh akun sudo.

> Lakukan uji di lingkungan lab terlebih dahulu. Jangan membuka port API MikroTik ke internet. Aktifkan HTTPS sebelum aplikasi diakses dari jaringan publik.

## 1. Update sistem dan instal paket

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx mysql-server git curl build-essential
```

Pasang Node.js versi LTS yang didukung (minimal Node.js 20) dari sumber instalasi Node.js tepercaya, lalu verifikasi:

```bash
node --version
npm --version
mysql --version
```

## 2. Ambil kode aplikasi

Pilih salah satu:

```bash
# Jika repository sudah tersedia di GitHub
sudo mkdir -p /opt/billing-rwnet
sudo chown "$USER":"$USER" /opt/billing-rwnet
 git clone https://github.com/USERNAME/REPOSITORY.git /opt/billing-rwnet
```

Ganti `USERNAME/REPOSITORY` dengan alamat repository Anda. Jika mengunduh ZIP, unggah lalu ekstrak isi ZIP ke `/opt/billing-rwnet`. Pastikan direktori `backend/` dan `frontend/` ada langsung di dalam folder tersebut.

```bash
cd /opt/billing-rwnet
```

## 3. Buat database MySQL

Masuk ke MySQL sebagai administrator:

```bash
sudo mysql
```

Jalankan SQL berikut, ganti password dengan nilai kuat dan unik:

```sql
CREATE DATABASE billing_rwnet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'billing_app'@'127.0.0.1' IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_KUAT';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON billing_rwnet.* TO 'billing_app'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

Impor skema instalasi baru:

```bash
mysql -h 127.0.0.1 -u billing_app -p billing_rwnet < backend/sql/schema.sql
```

Masukkan password akun `billing_app` ketika diminta. Jika `schema.sql` memerlukan izin tambahan pada versi project yang Anda unduh, ikuti error MySQL dan evaluasi izin minimum yang dibutuhkan—hindari memakai akun `root` dari aplikasi.

## 4. Konfigurasikan backend

```bash
cd /opt/billing-rwnet/backend
cp .env.example .env
nano .env
```

Isi nilai berikut dengan konfigurasi Anda:

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

Generate kunci enkripsi dengan:

```bash
openssl rand -hex 32
```

Salin hasilnya ke `ROUTER_CREDENTIAL_KEY`. Batasi akses file environment:

```bash
chmod 600 .env
```

Instal dependency dan uji backend:

```bash
npm install
npm start
```

Di terminal lain, uji health endpoint:

```bash
curl http://127.0.0.1:3000/api/health
```

Jika berhasil, hentikan proses uji dengan `Ctrl+C`. Jika gagal, periksa log error, nilai `.env`, akses database, dan port 3000.

## 5. Jalankan backend sebagai systemd service

Buat user sistem khusus dan pastikan user tersebut dapat membaca kode serta `.env`:

```bash
sudo useradd --system --home /opt/billing-rwnet --shell /usr/sbin/nologin billingapp || true
sudo chown -R billingapp:billingapp /opt/billing-rwnet
sudo chmod 600 /opt/billing-rwnet/backend/.env
```

Buat unit service:

```bash
sudo nano /etc/systemd/system/billing-rwnet.service
```

Isi dengan path Node.js yang sesuai pada server Anda (cek `command -v node` jika bukan `/usr/bin/node`):

```ini
[Unit]
Description=Billing RT/RW Net API and scheduler
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=billingapp
Group=billingapp
WorkingDirectory=/opt/billing-rwnet/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/billing-rwnet/backend/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Aktifkan service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now billing-rwnet
sudo systemctl status billing-rwnet
sudo journalctl -u billing-rwnet -f
```

Pastikan `npm install` dilakukan sebelum service dijalankan dan user `billingapp` dapat membaca `backend/node_modules`.

## 6. Build frontend

```bash
cd /opt/billing-rwnet/frontend
npm install
npm run build
```

Build produksi akan dibuat di `frontend/dist/`.

## 7. Konfigurasikan Nginx

Buat konfigurasi situs:

```bash
sudo nano /etc/nginx/sites-available/billing-rwnet
```

Contoh konfigurasi untuk domain `billing.example.com`:

```nginx
server {
    listen 80;
    server_name billing.example.com;
    root /opt/billing-rwnet/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Aktifkan situs dan periksa konfigurasi:

```bash
sudo ln -s /etc/nginx/sites-available/billing-rwnet /etc/nginx/sites-enabled/billing-rwnet
sudo nginx -t
sudo systemctl reload nginx
```

Jika situs default bentrok, nonaktifkan symlink default setelah memastikan tidak dipakai situs lain. Konfigurasikan HTTPS dengan sertifikat TLS tepercaya sebelum penggunaan melalui internet. Pastikan backend port 3000 dan MySQL port 3306 tidak dibuka ke publik.

## 8. Login pertama dan setup MikroTik

1. Buka domain atau alamat server dari browser.
2. Buat akun superadmin pertama melalui layar setup. Gunakan password kuat minimal 8 karakter (lebih panjang lebih baik).
3. Tambahkan router MikroTik dan uji koneksi API.
4. Buat PPP Profile `KV-ISOLIR` pada router, lalu gunakan fungsi validasi di aplikasi.
5. Uji pada satu pelanggan uji sebelum menjalankan isolir otomatis.
6. Periksa zona waktu dan pengaturan tagihan/dispensasi sebelum mengaktifkan scheduler produksi.

## 9. Firewall dan jaringan

- Izinkan HTTPS ke Nginx dari jaringan yang diperlukan.
- Batasi port 3000 agar hanya dapat diakses lokal oleh Nginx.
- Batasi port MySQL 3306 ke localhost/jaringan database yang diperlukan.
- Batasi RouterOS API ke IP server billing melalui firewall MikroTik dan gunakan VPN/jaringan manajemen privat.
- Jangan mengekspos port API MikroTik langsung ke internet.

## 10. Operasi harian

```bash
# Status backend
sudo systemctl status billing-rwnet

# Log backend
sudo journalctl -u billing-rwnet --since today

# Restart setelah perubahan konfigurasi backend
sudo systemctl restart billing-rwnet

# Build ulang frontend setelah perubahan UI
cd /opt/billing-rwnet/frontend && npm install && npm run build
sudo systemctl reload nginx
```

Backup database:

```bash
mysqldump -h 127.0.0.1 -u billing_app -p billing_rwnet > billing_rwnet-$(date +%F).sql
```

Simpan backup di lokasi terpisah dan terlindungi. Backup `.env`/kunci enkripsi secara aman dan uji restore secara berkala. Jangan simpan dump database atau `.env` di repository GitHub.

## Upgrade versi

1. Jadwalkan maintenance dan backup database serta folder `.env`.
2. Ambil rilis baru ke direktori staging atau gunakan Git dengan backup/rollback yang jelas.
3. Baca changelog/README versi baru dan jalankan hanya migrasi yang belum diterapkan.
4. Instal dependency backend/frontend, build frontend, lalu restart service.
5. Periksa health endpoint, log, login, pembayaran, serta fungsi MikroTik.
6. Jangan menimpa `.env` produksi atau mengganti `ROUTER_CREDENTIAL_KEY`.
