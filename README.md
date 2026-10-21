# Billing RT/RW Net & TV Kabel — MVP starter

Stack: React + Vite, Express, MySQL, RouterOS API.

## Requirements
- Node.js 20+
- MySQL 8+
- MikroTik RouterOS API reachable from the billing server (prefer VPN/private network)

## Quick start

### 1. Database
```bash
mysql -u root -p < backend/sql/schema.sql
```

### 2. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Edit `.env` with your MySQL credentials and `APP_TIMEZONE=Asia/Jakarta`. Generate `ROUTER_CREDENTIAL_KEY` with `openssl rand -hex 32`; keep it secret and back it up securely, because router credentials cannot be decrypted without it.

### 3. Frontend
```bash
cd ../frontend
npm install
npm run dev
```

Vite runs on http://localhost:5173 and proxies `/api` to the backend on port 3000.

## Important implementation notes
- The first MVP stores RouterOS credentials per router. Use a dedicated RouterOS user with only the permissions needed for PPP profile/session operations. Restrict API access to the billing server IP and use a VPN/private network.
- Do not expose RouterOS API directly to the public internet.
- Isolation changes a PPP Secret's profile to `KV-ISOLIR`, then disconnects its active PPP session so the next session uses the isolation profile.
- The original profile is saved in `customers.original_ppp_profile` before isolation. The un-isolation routine restores that profile.
- Scheduler runs every minute. It isolates only unpaid customers whose configured isolation time has passed. This starter is for testing; add authentication, authorization, backups, and operational monitoring before production use.
- Set each router's `isolation_profile` to the exact profile name configured on that MikroTik.


## Pembayaran dan rekening bank

- Metode pembayaran: Cash/Tunai atau Transfer bank.
- Menu Rekening untuk menambah dan mengubah rekening bank tujuan (nama bank, pemilik, nomor rekening, cabang, status aktif).
- Pembayaran transfer wajib memilih rekening aktif; pembayaran cash tidak memerlukan rekening.
- Jika database dibuat dari skema lama, jalankan `backend/sql/migrate_bank_accounts.sql` satu kali sebelum menjalankan backend terbaru.


## Pembaruan dashboard dan pembayaran

- Dashboard memiliki kartu **Terisolir KV-ISOLIR**. Angka divalidasi dengan membaca PPP Profile dan PPP Secret secara langsung dari setiap router aktif. Pelanggan dihitung hanya bila Secret yang cocok menggunakan profile persis `KV-ISOLIR`; router gagal akses atau profile tidak tersedia dilaporkan terpisah.
- Pada halaman **MikroTik**, tombol **Validasi KV-ISOLIR** memeriksa keberadaan profile pada router dan menyimpan `KV-ISOLIR` sebagai profile isolir yang digunakan billing. Buat profile ini terlebih dahulu pada RouterOS dengan kebijakan pembatasan yang sesuai.
- Halaman **Pembayaran** memiliki filter bulan dan ringkasan total/jumlah transaksi, beserta riwayat cash dan transfer.
- Struktur folder frontend dipisahkan menjadi `components/`, `lib/`, `utils/`, dan `styles/`. Lihat `docs/STRUKTUR_FOLDER.md`.
