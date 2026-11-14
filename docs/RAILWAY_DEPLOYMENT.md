# Panduan Deploy SITU SMKN 2 Rantau

## Platform produksi: Railway

SITU saat ini diinformasikan berjalan di Railway paket Free. Railway Free dapat menggunakan satu persistent volume dengan kapasitas 0,5 GB. Kapasitas dan penggunaan aktual harus diperiksa dari dashboard Railway.

**Jangan menganggap filesystem container sebagai penyimpanan permanen.** Database SQLite dan seluruh dokumen unggahan harus berada di persistent volume yang terpasang pada service aplikasi.

## Konfigurasi Railway

Pada project dan environment yang menjalankan SITU:

1. Pilih service aplikasi SITU (service yang menjalankan `npm start`).
2. Periksa bagian **Volumes**. Pastikan ada volume yang terhubung ke service tersebut.
3. Jika belum ada, buat/attach volume dengan mount path absolut **`/data`**. Jangan melakukan deploy sebelum backup data aktif diamankan.
4. Pada bagian **Variables**, tambahkan:
   - `NODE_ENV=production`
   - `DATA_DIR=/data`
   - `TRUST_PROXY_HOPS=1` hanya jika service berada di belakang satu reverse proxy tepercaya; jika tidak yakin, jangan mengubah nilai default.
5. Pastikan service memakai:
   - Root directory: `smkn2-git`
   - Build command: `npm ci`
   - Start command: `npm start`
   - Health check path: `/healthz`
6. Pastikan volume benar-benar terpasang di service dan path `/data` dapat dibaca serta ditulis oleh proses Node.

Railway juga menyediakan `RAILWAY_VOLUME_MOUNT_PATH` saat volume terpasang, tetapi aplikasi SITU saat ini menggunakan `DATA_DIR`. Karena itu, tetapkan `DATA_DIR=/data` secara eksplisit agar konfigurasi mudah diaudit.

## PENTING: prosedur sebelum memasang volume pada sistem yang sudah berisi data

Menambahkan volume kosong pada service yang sebelumnya menyimpan `data.db` di filesystem container **tidak memindahkan database lama**. Setelah mount, aplikasi akan melihat isi volume, bukan otomatis menyalin file lama.

Sebelum mengubah konfigurasi atau melakukan deploy:

1. Login sebagai admin/kasubag pada aplikasi yang sedang berjalan.
2. Gunakan menu **Backup** untuk mengunduh ZIP yang berisi snapshot database SQLite dan folder `uploads`.
3. Simpan ZIP di komputer atau penyimpanan lain di luar Railway. Jangan unggah backup ke GitHub.
4. Pastikan file ZIP dapat dibuka. Lakukan restore test pada salinan terpisah bila memungkinkan.
5. Baru setelah backup terverifikasi, buat/attach volume `/data`.
6. Pulihkan `data.db` dan folder `uploads` ke root volume `/data` sebelum aplikasi baru dijalankan.
7. Pastikan kedua item tersebut ada dan ukurannya masuk akal. Jangan membuat database baru untuk menggantikan database sekolah.
8. Set `DATA_DIR=/data`, lalu deploy.
9. Pastikan login, arsip surat, absensi, laporan, unduh dokumen, dan endpoint `/healthz` berfungsi.
10. Unduh backup baru setelah cutover dan simpan off-site.

Jika backup belum tersedia, hentikan perubahan deployment dan amankan data aktif terlebih dahulu. Jika data lama sudah tidak dapat diakses, jangan menganggap database kosong sebagai instalasi baru; lakukan proses pemulihan dari backup yang tersedia.

## Pengaman startup database

Pada production, backend menolak startup jika `DATA_DIR` tidak ditetapkan. Backend juga menolak membuat database kosong jika marker penyimpanan sudah ada tetapi `data.db` hilang, jika database berukuran nol byte, atau jika file SQLite WAL/SHM tertinggal tanpa database utama.

`ALLOW_EMPTY_DB_INIT=true` hanya untuk instalasi pertama yang benar-benar baru, setelah pemilik data memastikan volume kosong memang disengaja. Hapus variabel itu setelah startup pertama berhasil. **Jangan pernah memakai flag tersebut untuk mengatasi data produksi yang hilang.**

Untuk sistem yang sudah berisi data, pulihkan `data.db` dan `uploads` dari backup ke volume terlebih dahulu. Jangan menginisialisasi ulang.

## Backup dan pemulihan

- Endpoint/menu Backup membuat snapshot SQLite yang konsisten dan mengemas folder unggahan bersama database.
- Backup dari endpoint adalah backup manual, bukan pengganti backup off-site terjadwal.
- Simpan salinan harian/mingguan di lokasi terpisah dari Railway.
- Lakukan restore test berkala pada lingkungan terisolasi.
- Backup database dan folder `uploads` harus dipulihkan bersama karena record database menyimpan referensi file unggahan.
- Jangan menyalin file SQLite produksi secara manual ketika aplikasi sedang aktif; gunakan mekanisme snapshot/backup aplikasi.

Railway menyediakan backup volume untuk layanan yang memiliki volume. Tetap simpan salinan off-site yang dapat diakses jika project atau akun hosting bermasalah.

## Database dan skalabilitas

SQLite tetap dapat digunakan untuk satu instance aplikasi dengan persistent volume yang andal. Jangan menjalankan beberapa instance aplikasi yang berbagi file SQLite melalui filesystem yang tidak menjamin locking.

Untuk kebutuhan concurrency, availability, atau kapasitas lebih besar, rencanakan migrasi terpisah ke PostgreSQL terkelola dan object storage untuk dokumen. Migrasi wajib melalui backup, restore test, pemetaan skema, validasi jumlah record, dan rencana rollback. Jangan mengganti database hanya karena deploy fitur biasa.

## Rollback

1. Hentikan rollout/deployment baru.
2. Jangan menghapus atau me-wipe volume.
3. Buat backup kondisi terkini sebelum tindakan pemulihan.
4. Pulihkan database dan folder unggahan pada salinan/lokasi terpisah terlebih dahulu.
5. Verifikasi integritas SQLite, referensi file, dan smoke test.
6. Lakukan cutback hanya setelah pemilik data menyetujui.

## Catatan konfigurasi Render

File `render.yaml` di root repository adalah konfigurasi alternatif untuk Render. File tersebut tidak mengonfigurasi Railway dan tidak membuat volume Railway. Untuk produksi Railway, ikuti seluruh langkah pada panduan ini.
