# SITU SMKN 2 Rantau — Engineering & Production Readiness

Dokumen ini menjadi baseline pengerjaan teknis. Perubahan dilakukan bertahap dan melalui pull request agar branch utama tetap aman.

## Product objective

Membangun sistem administrasi sekolah yang dapat diandalkan untuk pengarsipan surat, absensi pegawai, pengelolaan kepegawaian, laporan bulanan, rekap, dan pengelolaan akun.

## Prinsip pengerjaan
1. Jangan menghapus atau mengubah perilaku fitur yang sudah dipakai tanpa migrasi dan pengujian.
2. Semua otorisasi wajib diperiksa di backend, bukan hanya dengan menyembunyikan menu di frontend.
3. Validasi input dilakukan di server; data dari browser tidak dipercaya.
4. Perubahan database harus kompatibel dengan data lama dan memiliki strategi backup/rollback.
5. Rahasia, password awal, token, dan data pribadi tidak boleh ditanam di source code atau log.
6. Setiap perubahan harus memiliki pengujian dan catatan perubahan.

## Temuan awal dari snapshot kode yang tersedia

### P0 — Wajib dibereskan sebelum data nyata digunakan
- Password menggunakan SHA-256 dengan salt statis. Migrasikan ke Argon2id atau bcrypt dengan salt unik.
- Akun demo dan password default ditanam di kode. Seed akun awal harus dikendalikan melalui environment/bootstrap satu kali, lalu wajib mengganti password.
- Session memiliki kolom expiry tetapi pemeriksaan session yang terlihat belum memvalidasi expires_at.
- Token diterima melalui query string. Token di URL berisiko masuk ke browser history, access log, dan referrer; gunakan header Authorization atau cookie HttpOnly/Secure/SameSite.
- Absensi hanya memeriksa koordinat tersedia pada potongan kode yang ditinjau. Validasi radius sekolah harus dilakukan server-side dengan koordinat sekolah dari konfigurasi.
- Upload file menggunakan konfigurasi Multer dasar. Batasi ukuran, tipe file, nama file, dan akses file; jangan sajikan dokumen sensitif sebagai file publik.
- CORS dibuka untuk semua origin. Batasi ke origin aplikasi yang benar.

### P1 — Keandalan dan operasional
- Database SQLite dan folder upload berada di direktori aplikasi. Pastikan memakai persistent disk atau migrasikan ke PostgreSQL sebelum deploy yang menyimpan data penting.
- Tambahkan backup terjadwal, uji restore, health check, dan penanganan error terpusat.
- Tambahkan constraint/index database untuk relasi dan pencarian yang sering dipakai.
- Validasi tanggal, status, role, ID, dan field wajib pada seluruh endpoint.
- Pastikan aksi sensitif tercatat pada audit log tanpa merekam password, token, atau isi dokumen pribadi.

### P2 — Maintainability dan pengalaman pengguna
- Pecah frontend satu-file menjadi modul yang jelas setelah baseline fitur dan pengujian tersedia.
- Standarkan komponen form, tabel, modal, notifikasi, loading, empty state, dan error state.
- Tambahkan pencarian, filter, pagination, dan tampilan responsif yang konsisten.
- Sediakan dokumentasi setup lokal, konfigurasi environment, deployment, backup, dan pemulihan.

## Tahapan pengerjaan
### Phase 1 — Baseline dan security hardening
- Inventarisasi seluruh endpoint, role matrix, tabel, upload, dan alur frontend.
- Perbaiki autentikasi, expiry session, validasi input, CORS, upload, serta rate limiting login.
- Implementasikan validasi absensi berbasis radius di backend setelah titik koordinat dan radius resmi sekolah dikonfirmasi.
- Tambahkan test untuk login, role access, session expiry, dan absensi.

### Phase 2 — Data integrity dan deployment
- Migrasi database yang aman, indeks, constraint, persistent storage, backup, dan restore.
- Health check, structured logging, konfigurasi environment, serta panduan deployment.

### Phase 3 — UX dan workflow
- Perapihan dashboard, navigasi berbasis role, pencarian arsip, alur disposisi, approval laporan, dan notifikasi.
- Uji alur kerja dengan perwakilan pengguna sekolah.

### Phase 4 — Release readiness
- Regression test seluruh fitur.
- Uji keamanan dasar dan uji pemulihan backup.
- Dokumentasi pengguna/admin, changelog, dan checklist go-live.

## Informasi yang harus dikonfirmasi sebelum go-live
- Koordinat resmi titik absensi sekolah dan radius yang disetujui.
- Jam kerja, toleransi keterlambatan, kalender kerja, dan aturan izin/sakit.
- Daftar role resmi beserta kewenangan masing-masing.
- Kebijakan retensi dokumen dan data pegawai.
- Domain produksi, origin frontend, lokasi penyimpanan permanen, serta penanggung jawab backup.
- Apakah data pada deployment saat ini sudah berisi data nyata. Jangan menjalankan migrasi destruktif sebelum backup terverifikasi.

## Status
- [x] Membuat branch kerja terpisah: hardening/phase-1.
- [x] Mencatat baseline risiko dan urutan pengerjaan.
- [ ] Audit lengkap seluruh endpoint dan role matrix.
- [ ] Implementasi hardening dan regression test.
- [ ] Review pull request dan persetujuan sebelum merge.