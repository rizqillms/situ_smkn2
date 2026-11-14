# Panduan Deploy SITU SMKN 2 Rantau

## Platform produksi

Pemilik proyek mengonfirmasi aplikasi berjalan di Railway Free. Railway menyediakan persistent volume pada paket Free, tetapi keberadaan volume pada service SITU belum diverifikasi.

**Panduan khusus Railway:** lihat [docs/RAILWAY_DEPLOYMENT.md](../docs/RAILWAY_DEPLOYMENT.md).

## Persyaratan wajib sebelum deploy

1. Pastikan persistent volume terpasang pada service Railway yang menjalankan aplikasi.
2. Gunakan mount path `/data` dan environment variable `DATA_DIR=/data`.
3. Pastikan database SQLite (`data.db`) dan folder `uploads` berada bersama di direktori persisten tersebut.
4. Unduh backup dari service yang sedang aktif sebelum membuat atau memasang volume. Backup harus berisi database dan folder uploads.
5. Verifikasi ZIP dan uji restore pada salinan terpisah.
6. Jangan mengalihkan aplikasi ke volume kosong sebelum data lama dipulihkan.
7. Simpan backup tambahan di luar Railway dan uji restore secara berkala.

## Environment variables

- `NODE_ENV=production`
- `PORT` disediakan oleh platform hosting.
- `DATA_DIR=/data` wajib menunjuk ke mount point persistent volume.
- `TRUST_PROXY_HOPS` hanya diatur sesuai jumlah reverse proxy tepercaya.
- `ALLOW_EMPTY_DB_INIT=true` hanya untuk instalasi pertama yang benar-benar baru, setelah volume diverifikasi. Hapus setelah startup pertama. Jangan gunakan untuk menggantikan database produksi yang hilang.
- `BOOTSTRAP_ADMIN_USERNAME` dan `BOOTSTRAP_ADMIN_PASSWORD` hanya untuk membuat admin pertama pada database kosong yang disengaja. Hapus setelah akun dibuat.

## Build dan start

- Root directory: `smkn2-git`
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/healthz`

## Database dan backup

SQLite tetap dapat digunakan untuk satu instance aplikasi dengan persistent volume yang andal. Backend menggunakan snapshot SQLite yang konsisten dan mengemas folder unggahan ke dalam ZIP melalui menu Backup. Backup manual tersebut bukan pengganti backup off-site terjadwal.

Untuk kebutuhan concurrency, availability, atau kapasitas lebih besar, rencanakan migrasi terpisah ke PostgreSQL terkelola dan object storage. Migrasi harus diuji pada salinan data, disertai validasi jumlah record dan rencana rollback.

## Catatan Render

File `render.yaml` pada root repository adalah konfigurasi alternatif untuk Render. File tersebut tidak mengatur service atau volume Railway. Jangan menganggap keberadaan file tersebut berarti persistent storage Railway sudah aktif.

## Larangan sebelum verifikasi data

Jangan deploy perubahan produksi, mengganti DATA_DIR, menghapus volume, menjalankan reset database, atau mengaktifkan inisialisasi database kosong sebelum backup data aktif berhasil diunduh dan diverifikasi. Repository GitHub hanya berisi source code, bukan database operasional sekolah.
