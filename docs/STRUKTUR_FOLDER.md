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
