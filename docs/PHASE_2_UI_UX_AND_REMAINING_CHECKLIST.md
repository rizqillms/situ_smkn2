# Catatan Lanjutan SITU SMKN 2 Rantau

Dokumen ini memisahkan pekerjaan UI/UX yang dikerjakan pada Phase 2 dari pekerjaan operasional yang perlu diverifikasi oleh pengelola sekolah.

## Yang dikerjakan pada Phase 2
- Penyegaran visual dengan palet biru formal, kontras lebih baik, kartu ringkasan, tombol, formulir, tabel, dan navigasi yang konsisten.
- Layout responsif untuk layar desktop, tablet, dan ponsel.
- Navigasi utama tetap memakai section dan fungsi aplikasi yang sudah ada; ID elemen, endpoint API, dan alur data tidak sengaja diubah.
- Perbaikan penanda menu aktif agar tetap benar saat section dibuka dari tombol aksi cepat, bukan hanya dari menu navigasi.
- Penambahan skip link, label navigasi, fokus keyboard yang terlihat, dan dukungan reduced-motion.

## Catatan verifikasi UI
1. Uji seluruh menu dengan akun tiap role: Dashboard, Surat Masuk, Surat Keluar, Absensi, Kepegawaian, Rekap, Laporan Bulanan, Log Aktivitas, Profil, dan Pengguna.
2. Uji tampilan pada lebar 360px, 390px, 768px, 1024px, dan desktop.
3. Pastikan tabel panjang dapat digeser horizontal tanpa memotong tombol aksi.
4. Uji semua form, modal, toast, unggah/unduh file, dan tombol export.
5. Pastikan menu yang disembunyikan berdasarkan role tetap sesuai kebijakan akses backend.
6. Periksa kembali teks dan istilah yang dipakai agar sesuai kebiasaan administrasi sekolah.

## Pekerjaan tersisa untuk pengelola (belum dilakukan oleh Phase 2)
- **Database lama:** buat salinan tersamarkan, audit skema dan data legacy, uji kompatibilitas dan migrasi, lalu validasi jumlah record sebelum/sesudah. Jangan menguji pada database operasional.
- **Backup/restore:** lakukan uji pemulihan database dan folder uploads dari backup di lokasi terpisah. Verifikasi integritas SQLite dan file hasil restore.
- **GPS:** lakukan pengujian langsung di area sekolah menggunakan beberapa ponsel/browser. Titik sekolah tetap -2.9317903, 115.1820055 dengan radius resmi 300 meter; batas akurasi GPS belum ditetapkan.
- **Kredensial:** periksa apakah database lama masih memiliki akun demo/default dan rotasi kredensial yang masih digunakan bersama. Jangan mengirim password melalui chat atau repository.
- **Hosting:** pilih layanan dengan persistent storage untuk database dan uploads. Jangan menyimpan data operasional pada filesystem ephemeral. Atur backup off-site dan uji restore berkala.
- **Persetujuan:** lakukan pemeriksaan role/endpoint akhir bersama pemilik data dan manajemen sekolah sebelum merge dan penggunaan produksi.

## Batasan status
Perubahan UI/UX bukan bukti aplikasi siap produksi. Tidak ada database operasional yang diakses, dimigrasikan, di-reset, atau di-deploy oleh pekerjaan ini. Semua verifikasi fisik, migrasi legacy, konfigurasi persistent storage, rotasi kredensial, dan persetujuan produksi tetap menjadi tanggung jawab pengelola.
