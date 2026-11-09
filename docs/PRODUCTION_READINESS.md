# SITU SMKN 2 Rantau — Engineering & Production Readiness

Dokumen ini menjadi catatan kerja teknis dan gerbang sebelum aplikasi digunakan pada lingkungan produksi. Semua perubahan runtime berada di branch hardening/phase-1; branch main dan database operasional tidak disentuh.

## Prinsip pengerjaan
1. Tidak mengubah atau menghapus data operasional selama pengembangan.
2. Otorisasi harus diperiksa di backend.
3. Input browser tidak dipercaya; validasi dilakukan di server.
4. Perubahan skema harus kompatibel dengan data lama dan punya backup/rollback.
5. Database, unggahan, token, password, dan data pribadi tidak boleh masuk ke Git.
6. Setiap perubahan harus memiliki pengujian yang dapat diulang.

## Implementasi yang sudah masuk branch

### Autentikasi dan akses
- Hash password baru memakai bcrypt dengan salt unik.
- Hash SHA-256 lama diverifikasi dan ditingkatkan ke bcrypt setelah login berhasil.
- Session diperiksa terhadap expires_at; token hanya diterima melalui header x-auth-token.
- Password baru, reset, dan pembuatan akun mensyaratkan minimal 12 karakter.
- Pembuatan admin pertama hanya melalui BOOTSTRAP_ADMIN_USERNAME dan BOOTSTRAP_ADMIN_PASSWORD saat tabel user kosong.
- Seed akun demo dan pegawai contoh dihapus.
- Percobaan login dibatasi sementara setelah kegagalan berulang.
- Data pegawai dan absensi untuk role guru dibatasi ke pegawai yang terhubung.
- Endpoint arsip dan file unggahan memerlukan autentikasi/role yang sesuai.

### Absensi
- Titik referensi resmi: -2.9317903, 115.1820055.
- Radius resmi: 300 meter.
- Server menghitung jarak, memvalidasi koordinat, dan menetapkan tanggal/jam berdasarkan Asia/Makassar.
- Keterlambatan dihitung dari batas 08:00 WITA.
- Keterangan Izin/Sakit wajib ada dan dimasukkan ke rekap bulanan serta export Excel.
- Frontend meminta GPS hanya untuk status Hadir dan tidak lagi menyediakan tombol untuk mengubah titik sekolah.
- Akurasi GPS tetap diperlakukan sebagai isu teknis terpisah; saat ini tidak dipakai sebagai ambang penolakan maupun disimpan. Hanya koordinat yang dipakai untuk memeriksa geofence resmi.

### File dan operasional
- Upload dibatasi maksimum 10 MB dan daftar ekstensi yang diizinkan.
- File unggahan hanya dapat diakses dengan session aktif.
- DATA_DIR memisahkan database dan file unggahan dari source code.
- Backup menggunakan SQLite online backup dan mengemas database serta folder unggahan menjadi satu ZIP.
- Endpoint health check tersedia di /healthz.
- .gitignore dan .env.example disediakan.
- Panduan deploy tidak lagi menyarankan filesystem ephemeral untuk data sekolah.

### Otomatisasi pengujian
GitHub Actions memeriksa sintaks backend, sintaks script frontend, startup dengan database sementara, autentikasi, pembatasan role, geofence, absensi ganda, keterangan rekap, dan pembuatan backup. Hasil terbaru yang telah selesai harus diperiksa lagi setelah commit berikutnya.

## Gerbang yang masih wajib sebelum produksi
- [ ] Jalankan uji browser/manual di beberapa perangkat HP dan browser sekolah.
- [ ] Tinjau kebijakan akurasi GPS terpisah dari radius resmi 300 meter; jangan menolak hanya berdasarkan angka radius.
- [ ] Audit final seluruh endpoint, role, dan kebocoran field pribadi.
- [ ] Uji migrasi pada salinan database lama yang sudah disanitasi.
- [ ] Buat backup dari database dan folder unggahan asli, verifikasi ZIP, dan lakukan restore test ke lokasi terpisah.
- [ ] Rotasi seluruh akun/password demo yang mungkin sudah ada di database lama.
- [ ] Tentukan persistent storage dan pemilik proses backup off-site.
- [ ] Tetapkan kebijakan retensi dokumen/data dan persetujuan pengelola sekolah.
- [ ] Uji cutover dan rollback sebelum domain produksi diarahkan.

## Batasan yang tidak boleh dilanggar
Database dan folder unggahan operasional tetap berada di komputer pemilik. Jangan meminta atau memasukkan data asli ke repository. Jangan jalankan migrasi terhadap database aktif, reset, reseed, atau deployment produksi dari branch ini sebelum backup dan restore terverifikasi serta pengelola sekolah menyetujui.

## Status
- [x] Branch kerja terpisah.
- [x] Baseline risiko dan kebutuhan operasional dikonfirmasi.
- [x] Hardening awal autentikasi, absensi, file, dan backup diterapkan.
- [x] CI smoke test otomatis ditambahkan.
- [ ] Regression test dan review akhir seluruh fitur.
- [ ] Persetujuan sebelum merge dan go-live.
