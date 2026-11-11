# Update APK Android (Capacitor)

Aplikasi memeriksa `GET /api/app-update` saat aplikasi Android dibuka. Endpoint ini publik dan dikonfigurasi melalui environment backend.

Tambahkan konfigurasi berikut ke file environment backend (sesuaikan URL dan versi):

```env
APP_VERSION=1.0.1
APP_VERSION_CODE=2
APP_APK_URL=https://billing.domain-anda.com/downloads/billing-v1.0.1.apk
APP_FORCE_UPDATE=false
APP_RELEASE_NOTES=Perbaikan cetak 58mm dan nama petugas.
```

- `APP_VERSION_CODE` harus selalu lebih besar dari versi APK yang sebelumnya dibagikan.
- Upload APK hasil release ke lokasi HTTPS yang sama dengan `APP_APK_URL`.
- APK baru wajib memakai `applicationId` yang sama dan ditandatangani dengan keystore/release key yang sama. Simpan keystore dan password-nya dengan aman.
- Untuk update wajib, ubah `APP_FORCE_UPDATE=true`; untuk update biasa gunakan `false`.
- Setelah mengubah environment, restart service backend.

## Build dan rilis

Dari folder `frontend`:

```bash
npm install
npm run android:sync
```

Buka Android Studio, pilih build variant **release**, lalu buat APK release yang ditandatangani dengan keystore lama. Jangan gunakan debug APK untuk menggantikan APK release yang sudah dibagikan.

Upload APK ke URL HTTPS, kemudian ubah environment backend ke versi dan URL APK baru. Pengguna lama akan melihat dialog update saat membuka aplikasi. Tombol download membuka browser Android; pengguna perlu membuka APK hasil unduhan dan menyetujui pemasangan Android secara manual.

## Catatan

Fitur ini mengotomatisasi pemeriksaan versi, pemberitahuan, dan pembukaan download. Android tetap meminta persetujuan pengguna untuk memasang APK dari luar Play Store. Pengguna mungkin perlu mengizinkan browser menginstal aplikasi yang tidak dikenal.
