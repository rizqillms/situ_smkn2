# SITU SMKN 2 Rantau

Aplikasi tata usaha sekolah untuk arsip surat, absensi pegawai berbasis GPS, data kepegawaian, laporan bulanan, rekap Excel, dan akun multi-role.

## Fitur utama
- **Surat masuk dan keluar** — pencatatan surat, arsip pindaian, PDF surat resmi, dan penomoran keluar otomatis per jenis dan tahun.
- **Absensi** — validasi geofence 300 meter, batas masuk 08.00 WITA, keterangan izin/sakit, dan rekap bulanan.
- **Kepegawaian** — data PNS/PPPK/Guru Non ASN/PJLP, import Excel dengan template resmi, serta pengingat kenaikan pangkat empat tahunan.
- **Laporan bulanan** — unggah laporan per divisi, penilaian kasubag, dan rekap per divisi.
- **Rekap dan ekspor** — rekap absensi, surat, dan pegawai dalam bentuk Excel.
- **Akses berbasis peran** — admin, kasubag, staff TU, kepala sekolah, dan guru dengan pembatasan di backend.
- **Operasional** — log aktivitas, cadangan ZIP (database + unggahan), health check `/healthz`, dan sesi 24 jam.

## Struktur singkat
- `server.js` — API Express, SQLite, validasi, keamanan, PDF, import, dan backup.
- `public/index.html` — shell aplikasi dengan seluruh section.
- `public/login.html` — halaman masuk.
- `public/assets/` — `app.css`, `components.css`, `app.js`, `login.js`, dan favicon.

## Stack
- Node.js 20+
- Express
- SQLite (better-sqlite3)
- HTML/CSS/JavaScript frontend (tanpa framework)

## Menjalankan secara lokal
1. Masuk ke folder `smkn2-git`.
2. Jalankan `npm ci`.
3. Salin `.env.example` menjadi `.env` dan ganti username/password bootstrap dengan nilai unik.
4. Pastikan `DATA_DIR` menunjuk ke folder data lokal yang tidak ikut masuk Git.
5. Jalankan `npm start`.
6. Buka `http://localhost:3000`.

Admin pertama hanya dibuat saat tabel users masih kosong dan kedua variable bootstrap tersedia. Setelah admin pertama berhasil dibuat, hapus variable bootstrap dari environment dan buat akun lain melalui menu pengelolaan akun.

## Operasional dan keamanan
- Browser memerlukan HTTPS untuk geolocation di lingkungan hosting.
- Absensi Hadir divalidasi di backend terhadap titik resmi sekolah dan radius 300 meter; tanggal/jam dihitung server dalam WITA.
- File unggahan memerlukan session aktif. File yang diunggah dibatasi ukuran dan ekstensi.
- Backup dari menu admin berisi snapshot SQLite dan folder uploads dalam satu arsip ZIP.
- Simpan database dan uploads pada persistent storage di luar source tree.
- Jangan commit file `.env`, database, uploads, atau backup.

## Sebelum produksi
Aplikasi ini belum dinyatakan siap produksi. Jangan gunakan hosting dengan filesystem ephemeral untuk data operasional sekolah. Ikuti `../docs/PRODUCTION_READINESS.md`, `../../docs/OPERATIONAL_DATA_SAFETY.md`, dan `PANDUAN-DEPLOY.md`. Lakukan backup dan restore test pada salinan data sebelum cutover; jangan mengunggah database operasional ke repository.
