# Catatan Pengembangan dan Roadmap — SITU SMKN 2 Rantau

> Dokumen kerja untuk melanjutkan pengembangan SITU secara terarah. Status pada dokumen ini diperbarui berdasarkan perubahan yang sudah tercatat pada branch `fix/kepsek-readonly-persistence-guard` dan konfirmasi operasional sampai 14 November 2026.
>
> **Penting:** fitur yang tercatat "sudah diimplementasikan" di bawah ini berada pada branch pengembangan/PR #6. Itu tidak otomatis berarti sudah aktif di website produksi. PR #6 masih perlu ditinjau, diuji, dan digabungkan setelah prosedur perlindungan database selesai.

## 1. Ringkasan proyek

SITU adalah Sistem Informasi Tata Usaha untuk SMKN 2 Rantau. Fokus pengembangan saat ini:

1. Menata pengalaman pengguna agar dashboard tidak berulang di setiap halaman.
2. Memastikan Kepala Sekolah dapat memantau seluruh informasi dan rekap tanpa mengubah data operasional.
3. Menjaga data surat, absensi, laporan, akun, dan dokumen tetap tersimpan meskipun aplikasi diperbarui atau di-deploy ulang.
4. Menyiapkan prosedur deploy, backup, pemulihan, pengujian, dan rollback yang bisa diikuti tanpa menebak-nebak.

## 2. Perbaikan yang sudah dikerjakan pada branch pengembangan

### 2.1 Pemisahan dashboard dan halaman fitur

- Ringkasan aktivitas, statistik utama, dan shortcut diarahkan menjadi konten khusus halaman Dashboard.
- Halaman fitur operasional tidak seharusnya mengulang panel ringkasan dashboard.
- Tujuannya agar halaman Surat, Absensi, Laporan, dan fitur lain lebih fokus pada pekerjaan yang sedang dilakukan.
- Saat uji manual, pastikan halaman Dashboard tetap menampilkan ringkasan yang dibutuhkan, sementara halaman fitur hanya menampilkan konten sesuai fungsinya.

### 2.2 Hak akses Kepala Sekolah — mode pemantauan

Perubahan akses yang tercatat pada PR #6:

- Kepala Sekolah dapat melihat dashboard pemantauan.
- Dapat melihat arsip surat masuk dan surat keluar dalam mode baca-saja.
- Dapat membuka/meninjau PDF surat keluar yang tersedia.
- Dapat melihat rekap absensi bulanan dan ekspor Excel.
- Dapat melihat laporan kegiatan bulanan, ringkasan divisi, dan dokumentasi.
- Tetap dapat melakukan absensi pribadi sesuai alur yang berlaku.
- Tidak dapat membuat, mengubah, atau menghapus surat.
- Tidak dapat menginput absensi pegawai lain.
- Tidak dapat mengirim atau menilai laporan.
- Tidak dapat mengelola data pegawai.
- Tidak dapat melihat rekap individual pegawai maupun audit log khusus pegawai jika tidak termasuk kewenangannya.

Prinsip penting: pembatasan harus diterapkan di backend/API, bukan hanya menyembunyikan tombol pada tampilan. Uji setiap endpoint dengan akun Kepala Sekolah untuk memastikan akses tulis benar-benar ditolak.

### 2.3 Perlindungan database dan penyimpanan persisten

Perubahan yang tercatat pada PR #6:

- Aplikasi production mewajibkan konfigurasi `DATA_DIR`.
- Database SQLite diarahkan ke `data.db` di dalam direktori data yang ditentukan.
- Folder dokumen unggahan menggunakan direktori persisten yang sama, yaitu `uploads`.
- Aplikasi menggunakan marker inisialisasi penyimpanan agar dapat membedakan instalasi baru dari penyimpanan yang sebelumnya sudah pernah diinisialisasi.
- Jika penyimpanan yang sudah diinisialisasi kehilangan `data.db`, file database kosong, atau ditemukan kondisi file SQLite pendamping yang tidak konsisten, aplikasi dirancang untuk gagal saat startup daripada diam-diam membuat database kosong.
- Pembuatan database kosong untuk instalasi baru memerlukan persetujuan eksplisit melalui `ALLOW_EMPTY_DB_INIT=true`. Flag ini harus dihapus setelah inisialisasi pertama dan tidak boleh dipakai untuk menggantikan database produksi yang hilang.
- Endpoint/menu Backup membuat snapshot SQLite yang konsisten dan mengemas database bersama folder `uploads`.

Pengaman ini mengurangi risiko aplikasi terlihat seperti instalasi baru setelah salah konfigurasi. Pengaman tersebut **bukan** pengganti backup dan tidak dapat mengembalikan data yang sudah hilang.

### 2.4 Dokumentasi operasional dan deployment

Dokumen yang sudah ada pada branch:

- `docs/OPERATIONAL_DATA_SAFETY.md` — aturan keselamatan data, validasi absensi, akses, dan gerbang sebelum deploy.
- `docs/RAILWAY_DEPLOYMENT.md` — panduan konfigurasi Railway, persistent volume, backup, restore, dan rollback.
- `smkn2-git/PANDUAN-DEPLOY.md` — panduan deploy ringkas dari direktori aplikasi.
- `render.yaml` — konfigurasi alternatif untuk Render, bukan konfigurasi Railway.
- Workflow CI — pengujian otomatis untuk beberapa aturan akses Kepala Sekolah dan pengaman startup database.

### 2.5 Aturan absensi yang harus dipertahankan

Aturan operasional yang sudah dikonfirmasi dan didokumentasikan:

- Titik referensi sekolah: latitude `-2.9317903`, longitude `115.1820055`.
- Radius geofence resmi: 300 meter.
- Batas keterlambatan: pukul 08.00 WITA.
- Zona waktu operasional: `Asia/Makassar` (WITA).
- Jarak dihitung dan divalidasi di server; validasi browser saja tidak cukup.
- Waktu absensi harus berasal dari server, bukan jam perangkat pengguna.
- Catatan/alasan absensi yang diinput pengguna tetap dicatat dan dimasukkan dalam rekap bulanan.
- Akurasi GPS merupakan hal terpisah dari radius 300 meter. Jangan menambah batas akurasi tanpa kebijakan yang disetujui sekolah.

## 3. Status repository dan produksi

### 3.1 GitHub

- Repository: `rizqillms/situ_smkn2`
- PR pengembangan: [#6 — Expand headmaster monitoring and protect persistent operational data](https://github.com/rizqillms/situ_smkn2/pull/6)
- Branch kerja: `fix/kepsek-readonly-persistence-guard`
- PR #6 belum boleh dianggap sebagai versi produksi sebelum status merge dan deployment diperiksa.
- Database operasional sekolah tidak disimpan di GitHub dan tidak boleh dimasukkan ke repository.

### 3.2 Railway — kondisi terkonfirmasi per 14 November 2026

Berdasarkan output CLI yang dikirim pemilik proyek:

- Project: `SITU-SMKN2`
- Environment: `production`
- Service: `situ_smkn2`
- Domain: `https://situ-smkn2.up.railway.app`
- Volume: `situ_smkn2-volume`
- Mount path: `/data`
- Kapasitas volume yang dilaporkan CLI: 500 MB
- Pemakaian saat pemeriksaan: 0 MB / 500 MB
- Status volume: Ready
- Volume terpasang pada service `situ_smkn2`.

Backup aplikasi telah diunduh melalui menu Backup dan pemilik proyek mengonfirmasi ZIP dapat dibuka di komputer. Isi yang ditemukan adalah `data.db`. Pemilik proyek menyatakan belum pernah mengunggah dokumen melalui aplikasi, sehingga belum ada folder unggahan yang diketahui perlu dipulihkan dari backup tersebut.

**Tahap pemulihan belum selesai.** Upaya mengakses file volume melalui CLI menghasilkan pesan SSH authentication failed. Karena itu:
- Belum ada konfirmasi bahwa `data.db` sudah berhasil diunggah ke `/data/data.db`.
- Belum ada verifikasi file jarak jauh maupun checksum.
- `DATA_DIR` belum boleh diarahkan ke `/data`.
- Jangan deploy, menghapus volume, menginisialisasi database kosong, atau menjalankan reset selama pemulihan belum selesai.

## 4. Pekerjaan yang sedang berjalan — prioritas paling tinggi

### P0 — Selesaikan pemulihan database ke Railway

1. Pastikan file lokal `data.db` hasil ekstraksi backup tersedia dan ukurannya masuk akal.
2. Atasi autentikasi SSH Railway dengan mendaftarkan **public key** komputer. Jangan pernah membagikan private key.
3. Pastikan perintah CLI menunjuk ke project `SITU-SMKN2`, environment `production`, dan volume `situ_smkn2-volume`.
4. Upload database ke lokasi persisten `/data/data.db`.
5. Daftar isi volume dan pastikan file terlihat serta ukurannya tidak nol.
6. Verifikasi integritas database menggunakan salinan kerja/restore test yang terpisah jika memungkinkan.
7. Jangan mengubah `DATA_DIR` sampai file di volume sudah diverifikasi.
8. Rencanakan cutover ke kode yang memiliki startup guard. Pastikan konfigurasi root directory, build command, start command, branch, dan environment sudah cocok sebelum deployment.
9. Setelah cutover, periksa login dan data nyata yang diharapkan: surat masuk/keluar, absensi, laporan bulanan, akun, dan file terkait.
10. Buat backup baru setelah aplikasi terbukti berjalan menggunakan volume persisten.

**Jangan menjalankan `ALLOW_EMPTY_DB_INIT=true` untuk memaksa aplikasi hidup ketika database produksi belum ditemukan.**

### P1 — Validasi PR #6 sebelum merge

- Jalankan seluruh CI dan pastikan hasil terbaru berstatus sukses, termasuk commit dokumentasi paling baru.
- Tinjau diff backend untuk setiap role dan endpoint, bukan hanya tampilan.
- Uji akun Kepala Sekolah, admin/tata usaha, dan pegawai biasa.
- Pastikan Kepala Sekolah dapat membaca seluruh rekap yang menjadi kewenangannya tetapi tidak dapat mengubah data operasional.
- Pastikan dashboard summary tidak muncul berulang di halaman fitur.
- Uji backup dan pemulihan database pada salinan terpisah.
- Pastikan tidak ada file database, backup, secret, token, atau data pribadi di commit.
- Merge hanya setelah backup terverifikasi dan prosedur deployment siap.

## 5. Roadmap penyempurnaan berikutnya

Roadmap di bawah adalah rencana yang diusulkan, bukan klaim bahwa fitur-fitur ini sudah selesai.

### Tahap A — Stabilitas dan keamanan (prioritas tertinggi)

1. **Penyimpanan persisten**
   - Pastikan database dan uploads menggunakan satu direktori persisten.
   - Tambahkan pemeriksaan startup dan health check yang jelas.
   - Pastikan kegagalan storage tidak membuat database baru secara diam-diam.

2. **Backup otomatis dan retensi**
   - Jadwalkan backup harian dan mingguan ke lokasi di luar Railway.
   - Gunakan nama file bertanggal dan catat ukuran serta hasil backup.
   - Terapkan retensi, misalnya menyimpan sejumlah backup harian dan bulanan sesuai kapasitas penyimpanan.
   - Kirim notifikasi jika backup gagal.
   - Uji restore berkala, bukan hanya memastikan file ZIP dapat dibuka.

3. **Audit log**
   - Catat aktivitas penting: login, perubahan surat, perubahan data pegawai, input absensi, pengiriman laporan, dan perubahan hak akses.
   - Simpan aktor, waktu server, jenis tindakan, dan identitas record seperlunya.
   - Batasi akses audit log untuk role yang berwenang.
   - Hindari menyimpan password, token, atau data sensitif yang tidak diperlukan.

4. **Penguatan autentikasi dan otorisasi**
   - Ganti kredensial demo/default.
   - Gunakan akun individual, bukan akun bersama.
   - Terapkan prinsip least privilege.
   - Uji akses langsung ke endpoint dan file unduhan.

### Tahap B — Penyempurnaan UX dan dashboard

1. Dashboard Kepala Sekolah menampilkan indikator ringkas dan tren: surat masuk/keluar, kehadiran, dan status laporan.
2. Tambahkan filter periode dan pencarian pada arsip, rekap, dan laporan.
3. Gunakan status yang konsisten, misalnya baru, diproses, selesai, atau terlambat jika alur kerja sekolah memang mendefinisikannya.
4. Sediakan tampilan responsif untuk desktop, tablet, dan ponsel.
5. Tambahkan empty state, loading state, dan pesan error yang membantu.
6. Pertahankan dashboard sebagai pusat ringkasan; jangan menyalin kartu statistik ke setiap halaman fitur.

### Tahap C — Modul tata usaha dan alur kerja

1. **Surat masuk/keluar**
   - Nomor surat dan penomoran yang konsisten.
   - Pencarian berdasarkan nomor, tanggal, pengirim/penerima, dan perihal.
   - Filter status dan periode.
   - Arsip PDF/dokumen dengan pemeriksaan akses dan validasi file.
   - Riwayat perubahan agar revisi dapat ditelusuri.

2. **Absensi**
   - Rekap harian dan bulanan.
   - Filter unit/divisi dan periode sesuai hak akses.
   - Ekspor Excel/PDF yang konsisten dengan tampilan.
   - Penanganan GPS gagal atau perangkat tidak mendukung melalui prosedur yang disetujui sekolah; jangan membuat aturan persetujuan otomatis tanpa kebijakan.

3. **Laporan kegiatan**
   - Template laporan yang seragam.
   - Status penyusunan dan pengiriman.
   - Rekap per divisi dan periode.
   - Lampiran dokumentasi dengan batas ukuran dan tipe file yang aman.

### Tahap D — Kualitas data dan database

1. Buat rencana migrasi skema yang eksplisit dan bernomor.
2. Gunakan transaksi untuk perubahan data yang saling terkait.
3. Tambahkan foreign key dan indeks sesuai kebutuhan query setelah memeriksa skema saat ini.
4. Validasi jumlah record sebelum dan sesudah migrasi.
5. Siapkan rollback yang sudah diuji pada salinan database.
6. Pertahankan SQLite untuk satu instance dengan persistent volume yang sesuai.
7. Pertimbangkan PostgreSQL terkelola hanya jika beban pengguna, concurrency, kebutuhan availability, atau operasional sudah membenarkan migrasi.
8. Jika migrasi database dilakukan, rencanakan penyimpanan file unggahan secara terpisah/object storage dan validasi semua referensi file.

### Tahap E — Operasional dan pemeliharaan

1. CI menjalankan test, lint, dan pemeriksaan keamanan dependency.
2. Gunakan staging dengan data sintetis/anonymized sebelum produksi.
3. Terapkan deployment bertahap dan checklist pascadeploy.
4. Pantau error server, status health check, penggunaan volume, dan kegagalan backup.
5. Dokumentasikan prosedur pemulihan untuk orang selain developer utama.
6. Catat setiap perubahan produksi: tanggal, commit, perubahan konfigurasi, backup yang dipakai, hasil tes, dan keputusan rollback.

## 6. Checklist pengujian manual sebelum rilis

### Akses dan role
- [ ] Admin dapat mengelola data sesuai kewenangannya.
- [ ] Kepala Sekolah dapat melihat dashboard dan seluruh rekap yang diizinkan.
- [ ] Kepala Sekolah tidak dapat mengubah/menghapus surat.
- [ ] Kepala Sekolah tidak dapat menginput absensi pegawai lain.
- [ ] Kepala Sekolah tidak dapat mengirim atau menilai laporan.
- [ ] Pegawai hanya dapat mengakses data pribadi dan fitur yang diizinkan.
- [ ] Akses endpoint diuji langsung, bukan hanya melalui tombol UI.

### Dashboard dan halaman fitur
- [ ] Ringkasan dan shortcut hanya muncul di Dashboard.
- [ ] Halaman fitur tidak mengulang ringkasan dashboard.
- [ ] Navigasi, filter, pencarian, dan tombol aksi bekerja.
- [ ] Tampilan desktop dan ponsel terbaca dengan baik.

### Data dan deployment
- [ ] Backup berhasil dibuat dan disimpan di luar Railway.
- [ ] Backup dapat dipulihkan pada salinan terpisah.
- [ ] Database produksi berada di volume persisten.
- [ ] Uploads berada di lokasi persisten yang sama atau storage yang direncanakan.
- [ ] Tidak ada inisialisasi database kosong yang tidak disengaja.
- [ ] Health check sukses.
- [ ] Data lama tetap tersedia setelah deploy.
- [ ] Rollback telah dipahami dan tidak menghapus volume.

## 7. Aturan kerja untuk setiap pengembangan berikutnya

1. Mulai dengan membaca dokumen ini dan `docs/OPERATIONAL_DATA_SAFETY.md`.
2. Periksa branch dan commit terbaru sebelum mengubah kode.
3. Buat branch khusus untuk satu kelompok perubahan.
4. Jangan mengembangkan langsung di production.
5. Gunakan database salinan dengan data sintetis atau anonim.
6. Setiap perubahan skema harus memiliki migrasi, backup, validasi, dan rollback.
7. Jalankan test sebelum membuat PR.
8. Perbarui dokumen ini setelah fitur benar-benar selesai dan teruji.
9. Catat mana yang sudah diimplementasikan, mana yang sudah diuji, dan mana yang sudah aktif di production — ketiganya status berbeda.
10. Jangan pernah commit `data.db`, file backup, uploads produksi, password, token, atau secret.

## 8. Referensi internal

- [PR #6 — Headmaster monitoring and persistent data protection](https://github.com/rizqillms/situ_smkn2/pull/6)
- [Operational Data Safety](OPERATIONAL_DATA_SAFETY.md)
- [Railway Deployment Guide](RAILWAY_DEPLOYMENT.md)
- [Panduan Deploy aplikasi](../smkn2-git/PANDUAN-DEPLOY.md)

---

**Prinsip utama proyek:** data sekolah lebih penting daripada kecepatan rilis. Setiap penyempurnaan harus menjaga integritas data, memperjelas hak akses, dan dapat diuji serta dipulihkan.
