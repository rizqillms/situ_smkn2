# Panduan Deploy SITU SMKN 2 Rantau

## Status dan batasan

Aplikasi ini memproses data pegawai dan administrasi sekolah. Jangan deploy ke layanan dengan filesystem sementara/ephemeral untuk penggunaan nyata. SQLite dan file unggahan harus berada pada penyimpanan persisten yang terpasang secara khusus, atau aplikasi perlu dimigrasikan ke database dan object storage terkelola.

**Jangan gunakan panduan demo gratis sebagai lingkungan operasional sekolah.** Layanan gratis yang menghapus filesystem saat restart/redeploy tidak memenuhi kebutuhan retensi data.

## Prasyarat sebelum produksi

1. PR hardening sudah direview dan disetujui.
2. Backup database dan folder unggahan dari komputer sumber telah dibuat, diverifikasi, dan diuji pemulihannya pada salinan terpisah.
3. Admin sekolah menyetujui lokasi penyimpanan, siapa yang boleh mengakses data, dan kebijakan retensi.
4. Semua password awal/default telah dirotasi. Akun admin awal dibuat dengan environment variable, bukan ditulis di source code.
5. Host menggunakan HTTPS. Browser membutuhkan HTTPS untuk akses geolocation.
6. DATA_DIR menunjuk ke persistent disk yang benar-benar terpasang dan dapat ditulis oleh proses Node.
7. Ada jadwal backup di luar host aplikasi dan prosedur restore yang sudah diuji.

## Environment variables

- NODE_ENV=production
- PORT disediakan oleh platform hosting.
- TRUST_PROXY_HOPS diatur hanya jika aplikasi berada di belakang reverse proxy tepercaya; isi 1 untuk satu proxy tepercaya, atau biarkan 0/tidak diatur jika akses langsung.
- DATA_DIR wajib menunjuk ke mount point penyimpanan persisten. Production akan menolak startup jika variabel ini kosong.
- ALLOW_EMPTY_DB_INIT=true hanya untuk inisialisasi database pertama yang disengaja setelah persistent disk diverifikasi. Hapus/nonaktifkan segera setelah startup pertama berhasil. Jika marker penyimpanan sudah ada tetapi data.db hilang, aplikasi akan berhenti dan tidak membuat database kosong.
- BOOTSTRAP_ADMIN_USERNAME dan BOOTSTRAP_ADMIN_PASSWORD hanya digunakan saat database benar-benar kosong untuk membuat admin pertama. Password minimal 12 karakter. Setelah akun dibuat, hapus kedua variable bootstrap dari konfigurasi layanan.

Jangan commit file .env, database, file unggahan, atau backup ke Git.

## Deploy ke host

1. Gunakan konfigurasi Blueprint di repository root: `render.yaml`. Konfigurasi tersebut menetapkan Root Directory `smkn2-git`, persistent disk `/var/data`, dan `DATA_DIR=/var/data`.
2. Jika layanan sudah dibuat manual, pastikan mount persistent disk benar-benar terpasang pada `/var/data` dan environment `DATA_DIR=/var/data` ada di dashboard hosting. Menambahkan file YAML ke GitHub tidak otomatis memasang disk pada layanan manual.
3. Sebelum perubahan deployment, unduh backup ZIP dari menu Backup (admin/kasubag) atau ambil salinan konsisten database dan folder uploads dari sumber data aktif. Simpan di lokasi terpisah.
4. Untuk instalasi pertama yang memang belum memiliki data, set `ALLOW_EMPTY_DB_INIT=true` satu kali setelah persistent disk diverifikasi. Setelah server berhasil berjalan, segera hapus variabel tersebut dan hapus variabel bootstrap admin.
5. Untuk sistem yang sudah berisi data, jangan set `ALLOW_EMPTY_DB_INIT`. Jika data.db tidak ditemukan pada persistent disk, aplikasi sengaja gagal start agar tidak membuat database kosong yang terlihat seperti data terhapus.
6. Build command: `npm ci`; Start command: `npm start`.
7. Pastikan endpoint `/healthz` sehat. Uji login, role, upload, unduh file, absensi, rekap, dan backup/restore pada salinan uji.
8. Jadwalkan backup off-site harian/mingguan ke penyimpanan terpisah dari host aplikasi dan lakukan uji restore berkala.
9. Baru setelah pemilik data menyetujui, jadwalkan cutover dengan backup terakhir dan rencana rollback.

## Catatan database dan backup

SQLite tetap layak untuk satu instance aplikasi dengan persistent disk yang andal. Saat ini aplikasi menggunakan satu file `data.db` dan folder `uploads` pada direktori `DATA_DIR`; keduanya harus selalu dipertahankan bersama.

Untuk operasional yang lebih besar, banyak pengguna bersamaan, atau beberapa instance server, target jangka panjang yang lebih kuat adalah PostgreSQL terkelola ditambah object storage untuk dokumen. Migrasi tersebut harus dilakukan terpisah melalui backup, uji restore, pemetaan skema, validasi jumlah record, dan rollback pada salinan data—bukan dengan mengganti database saat deploy fitur biasa.

Endpoint `/api/backup` menghasilkan snapshot SQLite yang konsisten beserta folder unggahan dalam ZIP. Endpoint ini adalah backup manual; backup produksi tetap harus disalin ke lokasi off-site terjadwal, bukan hanya disimpan pada disk aplikasi.

SQLite cocok untuk deployment kecil dengan satu instance aplikasi dan persistent disk yang andal. Jangan menjalankan beberapa instance aplikasi yang berbagi file SQLite melalui filesystem network yang tidak menjamin locking. Jika kebutuhan concurrency/availability meningkat, rencanakan migrasi teruji ke database server seperti PostgreSQL.

## Rollback

- Hentikan deployment baru.
- Jangan menyalin file database produksi secara manual saat proses aktif.
- Pulihkan backup database dan folder unggahan pada lokasi terpisah terlebih dahulu.
- Pastikan marker `.situ-storage-initialized` tetap berada di direktori data setelah restore. Jika restore dilakukan ke disk kosong, marker boleh dibuat ulang hanya setelah file database dan unggahan diverifikasi; jangan gunakan flag inisialisasi untuk menggantikan restore.
- Verifikasi integritas dan lakukan smoke test sebelum mengalihkan trafik kembali.
- Catat waktu pemulihan dan data yang mungkin perlu direkonsiliasi.

---

**Penting:** repository ini tidak berisi database operasional. Pemindahan data nyata hanya dilakukan oleh pengelola sekolah melalui prosedur backup/restore yang disetujui.
