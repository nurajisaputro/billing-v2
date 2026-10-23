# Struktur Folder BillingNet

```text
billing-rt-rwnet/
├── backend/
│   ├── src/
│   │   ├── server.js       # REST API dan scheduler
│   │   ├── billing.js      # Pembuatan tagihan, pembayaran, dan proses isolir
│   │   ├── mikrotik.js     # RouterOS API, PPP Secret, profil dan validasi KV-ISOLIR
│   │   ├── db.js           # Koneksi MySQL
│   │   ├── crypto.js       # Enkripsi kredensial router
│   │   └── log.js          # Audit log
│   └── sql/                # Skema dan migrasi database
├── frontend/
│   └── src/
│       ├── main.jsx        # Entry point React
│       ├── App.jsx         # Kerangka halaman dan navigasi utama
│       ├── components/     # Komponen UI yang dipakai ulang
│       ├── lib/api.js      # Helper request ke backend
│       ├── utils/format.js # Format rupiah dan helper tampilan
│       └── styles/         # CSS aplikasi
├── docs/                   # Dokumentasi proyek
├── README.md
└── WINDOWS_SETUP.md
```

## Catatan validasi KV-ISOLIR

Dashboard menggunakan endpoint `GET /api/dashboard/isolation-status` yang membaca PPP Secret langsung dari semua router aktif. Pelanggan hanya dihitung terisolir jika username PPPoE yang cocok pada data billing mempunyai `profile` persis `KV-ISOLIR`. Router yang gagal diakses dilaporkan terpisah agar tidak dianggap sebagai router tanpa pelanggan terisolir.

## Riwayat pembayaran

Halaman Pembayaran menggunakan `GET /api/payments?month=YYYY-MM`. Filter bulan berlaku pada tanggal transaksi `paid_at`; riwayat pembayaran lama tetap tersimpan dan dapat dipilih lewat input bulan.


## Modul Scheduler (v9)

- `backend/src/scheduler.js`: menjalankan pemeriksaan invoice dan isolir tiap 60 detik, serta pemeriksaan koneksi router tiap 120 detik.
- `backend/src/billing.js`: aturan generate invoice, isolir massal, aktivasi kembali, dan pencatatan pembayaran.
- `backend/src/server.js`: API HTTP, validasi role, dan endpoint isolir manual satu pelanggan.
- `frontend/src/lib/api.js`: helper API yang mendeteksi sesi kedaluwarsa dan mengirim event untuk kembali ke halaman login.
