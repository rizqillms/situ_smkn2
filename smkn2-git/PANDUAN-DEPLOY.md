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
- DATA_DIR menunjuk ke mount point penyimpanan persisten.
- BOOTSTRAP_ADMIN_USERNAME dan BOOTSTRAP_ADMIN_PASSWORD hanya digunakan saat database benar-benar kosong untuk membuat admin pertama. Password minimal 12 karakter. Setelah akun dibuat, hapus kedua variable bootstrap dari konfigurasi layanan.

Jangan commit file .env, database, file unggahan, atau backup ke Git.

## Deploy ke host

1. Hubungkan repository GitHub dan pilih branch yang sudah disetujui.
2. Root directory: smkn2-git.
3. Build command: npm ci.
4. Start command: npm start.
5. Pasang persistent disk pada host dan set DATA_DIR ke mount path tersebut.
6. Tambahkan environment variables melalui dashboard host, bukan file di repository.
7. Pastikan endpoint /healthz mengembalikan status sehat.
8. Uji login, role, upload, unduh file, absensi dari dalam/luar radius, rekap, dan backup/restore menggunakan akun serta data uji.
9. Baru setelah pemilik data menyetujui, jadwalkan cutover dengan backup terakhir dan rencana rollback.

## Catatan SQLite

SQLite cocok untuk deployment kecil dengan satu instance aplikasi dan persistent disk yang andal. Jangan menjalankan beberapa instance aplikasi yang berbagi file SQLite melalui filesystem network yang tidak menjamin locking. Jika kebutuhan concurrency/availability meningkat, rencanakan migrasi teruji ke database server seperti PostgreSQL.

## Rollback

- Hentikan deployment baru.
- Jangan menyalin file database produksi secara manual saat proses aktif.
- Pulihkan backup database dan folder unggahan pada lokasi terpisah terlebih dahulu.
- Verifikasi integritas dan lakukan smoke test sebelum mengalihkan trafik kembali.
- Catat waktu pemulihan dan data yang mungkin perlu direkonsiliasi.

---

**Penting:** repository ini tidak berisi database operasional. Pemindahan data nyata hanya dilakukan oleh pengelola sekolah melalui prosedur backup/restore yang disetujui.
