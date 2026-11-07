# Build Aplikasi Android Billing RT/RW Net

Aplikasi Android menggunakan frontend React/Vite yang dibungkus Capacitor. Backend, MySQL, scheduler, dan integrasi MikroTik tetap berada di server.

## Prasyarat

- Node.js 20+ dan npm.
- Android Studio stabil beserta Android SDK.
- JDK 21 yang dipilih di Android Studio (Gradle JDK).
- Server billing yang dapat diakses HP melalui HTTPS dengan sertifikat valid.
- Akun GitHub yang dapat mengakses repository.

## 1. Ambil source terbaru

```powershell
git clone https://github.com/nurajisaputro/billing-v2.git
cd billing-v2
git checkout main
```

Jika repository sudah ada:

```powershell
git pull --ff-only origin main
```

## 2. Konfigurasi alamat API

Salin contoh konfigurasi:

```powershell
Copy-Item frontend/.env.android.example frontend/.env.production
```

Edit `frontend/.env.production` dan ubah:

```env
VITE_API_BASE_URL=https://billing.domain-anda.com
```

Gunakan alamat publik HTTPS server billing tanpa `/api` di akhir. Jangan gunakan `localhost` atau `127.0.0.1` karena di HP alamat tersebut menunjuk ke HP sendiri. File environment lokal tidak boleh di-commit.

## 3. Install Capacitor dan buat project Android

```powershell
cd frontend
npm install
npm run android:add
```

Perintah `android:add` hanya dijalankan sekali untuk membuat project native di `frontend/android`. Jika folder itu sudah ada, jangan jalankan lagi.

## 4. Sinkronisasi dan buka Android Studio

```powershell
npm run android:sync
npm run android:open
```

Tunggu Gradle sync selesai. Jika diminta, pasang Android SDK Platform yang direkomendasikan oleh Android Studio. Pilih JDK 21 di Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK.

## 5. Jalankan di HP

1. Aktifkan Developer Options dan USB debugging pada HP Android.
2. Hubungkan HP ke komputer menggunakan kabel USB.
3. Terima dialog otorisasi debugging pada HP.
4. Pilih perangkat di Android Studio.
5. Klik Run untuk memasang aplikasi pengujian.

Bisa juga menggunakan Android Emulator dari Device Manager.

## 6. Build APK atau AAB

Untuk APK pengujian: Android Studio > Build > Build Bundle(s) / APK(s) > Build APK(s).

Untuk distribusi: Android Studio > Build > Generate Signed Bundle / APK. Pilih APK untuk instalasi langsung atau Android App Bundle (AAB) untuk Google Play. Buat signing key sendiri dan simpan keystore serta password di tempat aman. Jangan pernah commit file signing key ke Git.

## 7. Update aplikasi setelah perubahan kode

Setelah mengambil perubahan terbaru:

```powershell
cd frontend
npm install
npm run android:sync
npm run android:open
```

Jalankan ulang dari Android Studio atau hasilkan APK/AAB baru. Jika hanya backend yang berubah, deploy backend ke server; APK tidak perlu dibuat ulang selama API contract dan konfigurasi aplikasi tidak berubah.

## Catatan penting

- Pengguna Android dari semua role memakai akun yang sama seperti aplikasi web: superadmin, admin, dan kolektor. Hak akses tetap divalidasi backend.
- API harus dapat dijangkau melalui HTTPS dari Wi-Fi maupun jaringan seluler.
- Jangan menyimpan password router, database, atau API secret di aplikasi Android.
- Scheduler invoice dan isolir tetap hanya berjalan di server. Android tidak menjalankan scheduler.
- Sesi saat ini disimpan di memori backend. Jika backend restart, pengguna mungkin perlu login kembali.
- Uji seluruh role, pembayaran, daftar tagihan, bukti pembayaran, dan logout sebelum distribusi. Uji isolir hanya pada pelanggan uji.
- Folder `frontend/android` dibuat di komputer pengembang oleh Capacitor. Commit folder tersebut ke repository setelah project native berhasil dibuat, agar konfigurasi Android tersimpan untuk tim.
- Untuk keamanan produksi, jangan mengaktifkan HTTP cleartext atau menonaktifkan validasi sertifikat TLS.
