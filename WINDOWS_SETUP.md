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
