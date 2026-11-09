const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const os = require('os');
const archiver = require('archiver');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database
const dataDir = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Init tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nama TEXT,
  role TEXT NOT NULL DEFAULT 'guru',
  pegawai_id INTEGER,
  created_at datetime default CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER,
  expires_at datetime
);
CREATE TABLE IF NOT EXISTS surat_masuk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor TEXT, tanggal TEXT, dari TEXT, perihal TEXT, foto TEXT,
  created_at datetime default CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS surat_keluar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor TEXT, tanggal TEXT, tujuan TEXT, perihal TEXT, isi TEXT, jenis TEXT,
  created_at datetime default CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pegawai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT, nip TEXT, tempat_lahir TEXT, tanggal_lahir TEXT,
  golongan TEXT, jabatan TEXT, status TEXT, masa_jabatan TEXT,
  tanggal_naik_pangkat TEXT, no_hp TEXT, alamat TEXT,
  jenis_pegawai TEXT DEFAULT 'PNS', tanggal_mulai TEXT, tanggal_pangkat_terakhir TEXT,
  jenis_kelamin TEXT, agama TEXT, pendidikan TEXT, periode_tahun TEXT, periode_bulan TEXT
);
CREATE TABLE IF NOT EXISTS absensi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pegawai_id INTEGER, tanggal TEXT, jam TEXT, status TEXT, telat_menit INTEGER,
  lat REAL, lng REAL,
  FOREIGN KEY(pegawai_id) REFERENCES pegawai(id)
);
CREATE TABLE IF NOT EXISTS laporan_bulanan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pegawai_id INTEGER, divisi TEXT, bulan TEXT,
  kegiatan TEXT, target TEXT, realisasi TEXT, kendala TEXT, catatan TEXT, foto TEXT,
  status TEXT DEFAULT 'Belum Dinilai', nilai TEXT, komentar_kasubag TEXT,
  created_at datetime default CURRENT_TIMESTAMP,
  UNIQUE(pegawai_id, bulan)
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, username TEXT, nama TEXT, role TEXT,
  aksi TEXT, detail TEXT,
  created_at datetime default CURRENT_TIMESTAMP
);
`);

// Tambah kolom lat/lng kalau tabel lama belum punya (migrasi aman)
const absCols = db.prepare("PRAGMA table_info(absensi)").all().map(c => c.name);
if (!absCols.includes('lat')) db.exec("ALTER TABLE absensi ADD COLUMN lat REAL");
if (!absCols.includes('lng')) db.exec("ALTER TABLE absensi ADD COLUMN lng REAL");
if (!absCols.includes('keterangan')) db.exec("ALTER TABLE absensi ADD COLUMN keterangan TEXT");
const lapCols = db.prepare("PRAGMA table_info(laporan_bulanan)").all().map(c => c.name);
if (!lapCols.includes('file_laporan')) db.exec("ALTER TABLE laporan_bulanan ADD COLUMN file_laporan TEXT");
const pgCols = db.prepare("PRAGMA table_info(pegawai)").all().map(c => c.name);
if (!pgCols.includes('jenis_pegawai')) db.exec("ALTER TABLE pegawai ADD COLUMN jenis_pegawai TEXT DEFAULT 'PNS'");
if (!pgCols.includes('tanggal_mulai')) db.exec("ALTER TABLE pegawai ADD COLUMN tanggal_mulai TEXT");
if (!pgCols.includes('tanggal_pangkat_terakhir')) db.exec("ALTER TABLE pegawai ADD COLUMN tanggal_pangkat_terakhir TEXT");
if (!pgCols.includes('jenis_kelamin')) db.exec("ALTER TABLE pegawai ADD COLUMN jenis_kelamin TEXT");
if (!pgCols.includes('agama')) db.exec("ALTER TABLE pegawai ADD COLUMN agama TEXT");
if (!pgCols.includes('pendidikan')) db.exec("ALTER TABLE pegawai ADD COLUMN pendidikan TEXT");
if (!pgCols.includes('periode_tahun')) db.exec("ALTER TABLE pegawai ADD COLUMN periode_tahun TEXT");
if (!pgCols.includes('periode_bulan')) db.exec("ALTER TABLE pegawai ADD COLUMN periode_bulan TEXT");
const absColsGps = db.prepare("PRAGMA table_info(absensi)").all().map(c => c.name);
if (!absColsGps.includes('gps_accuracy')) db.exec("ALTER TABLE absensi ADD COLUMN gps_accuracy REAL");

// Helpers
function hashPass(pw) {
  return bcrypt.hashSync(String(pw), 12);
}
function verifyPass(pw, stored) {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith('$2')) return bcrypt.compareSync(String(pw), stored);
  const legacy = crypto.createHash('sha256').update(String(pw) + ':smkn2salt').digest('hex');
  const candidate = Buffer.from(stored);
  return candidate.length === Buffer.byteLength(legacy) && crypto.timingSafeEqual(Buffer.from(legacy), candidate);
}
function schoolDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, part) => (acc[part.type] = part.value, acc), {});
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}
const loginFailures = new Map();
function isLoginBlocked(ip) {
  const now = Date.now();
  const entry = loginFailures.get(ip);
  if (!entry || now - entry.windowStart > 15 * 60 * 1000) {
    loginFailures.delete(ip);
    return false;
  }
  return entry.blockedUntil > now;
}
function recordLoginFailure(ip) {
  const now = Date.now();
  let entry = loginFailures.get(ip);
  if (!entry || now - entry.windowStart > 15 * 60 * 1000) entry = { count: 0, windowStart: now, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= 8) entry.blockedUntil = now + 15 * 60 * 1000;
  loginFailures.set(ip, entry);
}
const SCHOOL_LOCATION = Object.freeze({ lat: -2.9317903, lng: 115.1820055 });
const ATTENDANCE_RADIUS_METERS = 300;
function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function getUser(req) {
  const token = req.headers['x-auth-token'];
  if (!token || typeof token !== 'string') return null;
  const row = db.prepare('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
  if (!row) return null;
  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  delete row.expires_at;
  return row;
}
function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Belum login' });
  req.user = user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Belum login' });
    if (!roles.includes(user.role)) return res.status(403).json({ error: 'Tidak punya hak akses' });
    req.user = user;
    next();
  };
}
function log(user, aksi, detail) {
  try {
    db.prepare('INSERT INTO activity_log (user_id,username,nama,role,aksi,detail) VALUES (?,?,?,?,?,?)')
      .run(user.id, user.username, user.nama, user.role, aksi, detail);
  } catch(e) { /* log jangan sampai gagalkan request */ }
}

// Seed users if empty
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (username && password && password.length >= 12) {
    db.prepare('INSERT INTO users (username,password_hash,nama,role) VALUES (?,?,?,?)')
      .run(username, hashPass(password), 'Administrator', 'admin');
    console.log('Bootstrap administrator created from environment configuration.');
  } else {
    console.warn('No users exist. Configure BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD (12+ chars) before first start.');
  }
}

// ========== AUTH ==========
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isLoginBlocked(ip)) return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: 'Input login tidak valid' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !verifyPass(password, user.password_hash)) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  loginFailures.delete(ip);
  if (!user.password_hash.startsWith('$2')) {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPass(password), user.id);
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24*60*60*1000).toISOString();
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, user.id, expires);
  log(user, 'Login', `Login dari perangkat`);
  res.json({ ok: true, token, user: { id: user.id, username: user.username, nama: user.nama, role: user.role, pegawai_id: user.pegawai_id } });
});
app.post('/api/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Belum login' });
  res.json({ id: user.id, username: user.username, nama: user.nama, role: user.role, pegawai_id: user.pegawai_id });
});
app.post('/api/ganti-password', requireAuth, (req, res) => {
  const { lama, baru } = req.body;
  if (typeof baru !== 'string' || baru.length < 12 || baru.length > 200) return res.status(400).json({ error: 'Password baru minimal 12 karakter' });
  if (!verifyPass(lama, req.user.password_hash)) return res.status(400).json({ error: 'Password lama salah' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPass(baru), req.user.id);
  log(req.user, 'Ganti Password', 'Password berhasil diganti');
  res.json({ ok: true });
});

// Upload config
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv'];
    if (!allowed.includes(ext)) return cb(new Error('Jenis file tidak diizinkan'));
    cb(null, true);
  }
});
app.use('/uploads', requireAuth, express.static(uploadsDir, { dotfiles: 'deny', index: false }));
// ========== SURAT MASUK ==========
app.get('/api/surat-masuk', requireRole('admin','kasubag','staff','kepsek'), (req, res) => {
  const rows = db.prepare('SELECT * FROM surat_masuk ORDER BY tanggal DESC').all();
  res.json(rows);
});
app.post('/api/surat-masuk', requireRole('admin','kasubag','staff'), upload.single('foto'), (req, res) => {
  const { nomor, tanggal, dari, perihal } = req.body;
  const foto = req.file ? req.file.filename : null;
  db.prepare('INSERT INTO surat_masuk (nomor,tanggal,dari,perihal,foto) VALUES (?,?,?,?,?)').run(nomor,tanggal,dari,perihal,foto);
  log(req.user, 'Surat Masuk', `Input surat ${nomor} dari ${dari}`);
  res.json({ ok: true });
});
app.put('/api/surat-masuk/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const { nomor, tanggal, dari, perihal } = req.body;
  db.prepare('UPDATE surat_masuk SET nomor=?, tanggal=?, dari=?, perihal=? WHERE id=?').run(nomor, tanggal, dari, perihal, req.params.id);
  log(req.user, 'Surat Masuk', `Edit surat ${nomor}`);
  res.json({ ok: true });
});
app.delete('/api/surat-masuk/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const row = db.prepare('SELECT nomor FROM surat_masuk WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM surat_masuk WHERE id=?').run(req.params.id);
  log(req.user, 'Surat Masuk', `Hapus surat ${row ? row.nomor : ''}`);
  res.json({ ok: true });
});

// ========== SURAT KELUAR ==========
app.get('/api/surat-keluar', requireRole('admin','kasubag','staff','kepsek'), (req, res) => {
  const rows = db.prepare('SELECT * FROM surat_keluar ORDER BY tanggal DESC').all();
  res.json(rows);
});
app.post('/api/surat-keluar', requireRole('admin','kasubag','staff'), (req, res) => {
  const { nomor, tanggal, tujuan, perihal, isi, jenis } = req.body;
  db.prepare('INSERT INTO surat_keluar (nomor,tanggal,tujuan,perihal,isi,jenis) VALUES (?,?,?,?,?,?)').run(nomor,tanggal,tujuan,perihal,isi,jenis);
  log(req.user, 'Surat Keluar', `Buat surat ${nomor} ke ${tujuan}`);
  res.json({ ok: true });
});
app.put('/api/surat-keluar/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const { nomor, tanggal, tujuan, perihal, isi, jenis } = req.body;
  db.prepare('UPDATE surat_keluar SET nomor=?, tanggal=?, tujuan=?, perihal=?, isi=?, jenis=? WHERE id=?').run(nomor, tanggal, tujuan, perihal, isi, jenis, req.params.id);
  log(req.user, 'Surat Keluar', `Edit surat ${nomor}`);
  res.json({ ok: true });
});
app.delete('/api/surat-keluar/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const row = db.prepare('SELECT nomor FROM surat_keluar WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM surat_keluar WHERE id=?').run(req.params.id);
  log(req.user, 'Surat Keluar', `Hapus surat ${row ? row.nomor : ''}`);
  res.json({ ok: true });
});
app.get('/api/surat-keluar/:id/pdf', requireRole('admin','kasubag','staff','kepsek'), (req, res) => {
  const s = db.prepare('SELECT * FROM surat_keluar WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).send('Not found');
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=surat-${s.nomor.replace(/\//g,'_')}.pdf`);
  doc.pipe(res);
  doc.fontSize(14).text('SMKN 2 Rantau', { align: 'center' });
  doc.fontSize(10).text('Kabupaten Tapin, Kalimantan Selatan', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Nomor: ${s.nomor}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Tanggal: ${s.tanggal}`);
  doc.text(`Tujuan: ${s.tujuan}`);
  doc.text(`Perihal: ${s.perihal}`);
  doc.moveDown();
  doc.text(s.isi || '');
  doc.moveDown(2);
  doc.text('Rantau, ' + new Date().toLocaleDateString('id-ID'), { align: 'right' });
  doc.text('Kepala Sekolah', { align: 'right' });
  doc.moveDown(2);
  doc.text('(........................)', { align: 'right' });
  doc.end();
});

// ========== PEGAWAI ==========
app.get('/api/pegawai', requireAuth, (req, res) => {
  if (req.user.role === 'guru') {
    const rows = db.prepare('SELECT id, nama, jenis_pegawai, status, jabatan FROM pegawai WHERE id=?').all(req.user.pegawai_id || 0);
    return res.json(rows);
  }
  const rows = db.prepare('SELECT * FROM pegawai ORDER BY nama').all();
  res.json(rows);
});
app.post('/api/pegawai', requireRole('admin','kasubag'), (req, res) => {
  const p = req.body;
  const isPJLP = (p.jenis_pegawai === 'PJLP' || p.status === 'PJLP');
  const info = db.prepare(`INSERT INTO pegawai (nama,nip,tempat_lahir,tanggal_lahir,golongan,jabatan,status,masa_jabatan,tanggal_naik_pangkat,no_hp,alamat,jenis_pegawai,tanggal_mulai,tanggal_pangkat_terakhir,jenis_kelamin,agama,pendidikan,periode_tahun,periode_bulan)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(p.nama, isPJLP ? null : p.nip, p.tempat_lahir, p.tanggal_lahir, isPJLP ? null : p.golongan, p.jabatan, p.status, p.masa_jabatan, isPJLP ? null : p.tanggal_naik_pangkat, p.no_hp, p.alamat, p.jenis_pegawai || 'PNS', p.tanggal_mulai || null, p.tanggal_pangkat_terakhir || null, p.jenis_kelamin || null, p.agama || null, p.pendidikan || null, p.periode_tahun || null, p.periode_bulan || null);
  log(req.user, 'Pegawai', `Tambah pegawai ${p.nama}`);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.put('/api/pegawai/:id', requireRole('admin','kasubag'), (req, res) => {
  const p = req.body;
  const isPJLP = (p.jenis_pegawai === 'PJLP' || p.status === 'PJLP');
  db.prepare(`UPDATE pegawai SET nama=?,nip=?,tempat_lahir=?,tanggal_lahir=?,golongan=?,jabatan=?,status=?,masa_jabatan=?,tanggal_naik_pangkat=?,no_hp=?,alamat=?,jenis_pegawai=?,tanggal_mulai=?,tanggal_pangkat_terakhir=?,jenis_kelamin=?,agama=?,pendidikan=?,periode_tahun=?,periode_bulan=? WHERE id=?`)
    .run(p.nama, isPJLP ? null : p.nip, p.tempat_lahir, p.tanggal_lahir, isPJLP ? null : p.golongan, p.jabatan, p.status, p.masa_jabatan, isPJLP ? null : p.tanggal_naik_pangkat, p.no_hp, p.alamat, p.jenis_pegawai || 'PNS', p.tanggal_mulai || null, p.tanggal_pangkat_terakhir || null, p.jenis_kelamin || null, p.agama || null, p.pendidikan || null, p.periode_tahun || null, p.periode_bulan || null, req.params.id);
  log(req.user, 'Pegawai', `Edit pegawai ${p.nama}`);
  res.json({ ok: true });
});
app.delete('/api/pegawai/:id', requireRole('admin','kasubag'), (req, res) => {
  const row = db.prepare('SELECT nama FROM pegawai WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM absensi WHERE pegawai_id=?').run(req.params.id);
  db.prepare('DELETE FROM pegawai WHERE id=?').run(req.params.id);
  log(req.user, 'Pegawai', `Hapus pegawai ${row ? row.nama : ''}`);
  res.json({ ok: true });
});
app.get('/api/pegawai/notifikasi', requireRole('admin','kasubag','kepsek'), (req, res) => {
  const rows = db.prepare("SELECT * FROM pegawai WHERE jenis_pegawai != 'PJLP' AND status != 'PJLP'").all();
  const today = new Date();
  const notifs = [];
  rows.forEach(r => {
    // Prioritas: periode jabatan (tahun+bulan) -> pangkat terakhir -> naik pangkat lama -> tanggal mulai
    let last = null;
    if (r.periode_tahun && r.periode_bulan) {
      last = new Date(Number(r.periode_tahun), Number(r.periode_bulan) - 1, 1);
    } else {
      let lastStr = r.tanggal_pangkat_terakhir || r.tanggal_naik_pangkat || r.tanggal_mulai;
      if (!lastStr) return;
      last = new Date(lastStr);
    }
    if (isNaN(last)) return;
    // Kenaikan pangkat tiap 4 tahun dari periode jabatan
    const next = new Date(last); next.setFullYear(next.getFullYear() + 4);
    const diff = Math.floor((next - today) / (1000*60*60*24));
    if (diff >= 0 && diff <= 150) {
      notifs.push({ ...r, tanggal_naik_berikutnya: next.toISOString().slice(0,10), sisa_hari: diff, reminder_terakhir: diff % 30 === 0 ? 'Hari ini' : 'dalam ' + (diff % 30) + ' hari lagi' });
    }
  });
  notifs.sort((a,b) => a.sisa_hari - b.sisa_hari);
  res.json(notifs);
});

// ========== ABSENSI ==========
app.get('/api/absensi', requireAuth, (req, res) => {
  const tanggal = req.query.tanggal || schoolDateTime().date;
  let rows;
  if (req.user.role === 'guru') {
    rows = db.prepare(`
      SELECT p.nama, a.jam, a.status, a.telat_menit, a.keterangan FROM absensi a
      JOIN pegawai p ON p.id = a.pegawai_id
      WHERE a.tanggal = ? AND a.pegawai_id = ? ORDER BY p.nama
    `).all(tanggal, req.user.pegawai_id || 0);
  } else {
    rows = db.prepare(`
      SELECT p.nama, a.jam, a.status, a.telat_menit, a.keterangan FROM absensi a
      JOIN pegawai p ON p.id = a.pegawai_id
      WHERE a.tanggal = ? ORDER BY p.nama
    `).all(tanggal);
  }
  res.json(rows);
});
app.post('/api/absensi', requireAuth, (req, res) => {
  const { pegawai_id, status, lat, lng, accuracy, keterangan } = req.body;
  if (!['Hadir', 'Izin', 'Sakit'].includes(status)) return res.status(400).json({ error: 'Status absensi tidak valid' });
  const pegawaiId = Number(pegawai_id);
  if (!Number.isInteger(pegawaiId) || pegawaiId <= 0) return res.status(400).json({ error: 'Pegawai tidak valid' });
  if (!db.prepare('SELECT id FROM pegawai WHERE id=?').get(pegawaiId)) return res.status(404).json({ error: 'Data pegawai tidak ditemukan' });
  if (req.user.role === 'guru' && req.user.pegawai_id !== pegawaiId) return res.status(403).json({ error: 'Guru hanya bisa absen untuk diri sendiri' });

  const note = typeof keterangan === 'string' ? keterangan.trim() : '';
  if ((status === 'Izin' || status === 'Sakit') && !note) return res.status(400).json({ error: 'Keterangan wajib diisi untuk Izin/Sakit' });
  if (note.length > 1000) return res.status(400).json({ error: 'Keterangan maksimal 1000 karakter' });

  let distance = null;
  const gpsAccuracy = Number.isFinite(Number(accuracy)) && Number(accuracy) >= 0 ? Number(accuracy) : null;
  if (status === 'Hadir') {
    const latitude = Number(lat), longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Koordinat GPS tidak valid. Aktifkan izin lokasi lalu coba lagi.' });
    }
    distance = distanceMeters(latitude, longitude, SCHOOL_LOCATION.lat, SCHOOL_LOCATION.lng);
    if (distance > ATTENDANCE_RADIUS_METERS) return res.status(403).json({ error: 'Di luar radius resmi sekolah 300 meter (' + Math.round(distance) + ' meter).' });
  }

  const now = schoolDateTime();
  const [hour, minute] = now.time.split(':').map(Number);
  const lateMinutes = status === 'Hadir' && hour * 60 + minute > 480 ? hour * 60 + minute - 480 : 0;
  if (db.prepare('SELECT id FROM absensi WHERE pegawai_id=? AND tanggal=?').get(pegawaiId, now.date)) {
    return res.status(409).json({ error: 'Pegawai sudah melakukan absensi hari ini' });
  }
  db.prepare('INSERT INTO absensi (pegawai_id,tanggal,jam,status,telat_menit,lat,lng,keterangan,gps_accuracy) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(pegawaiId, now.date, now.time, status, lateMinutes, status === 'Hadir' ? Number(lat) : null,
      status === 'Hadir' ? Number(lng) : null, note || null, gpsAccuracy);
  log(req.user, 'Absensi', 'Absensi ' + status + ' tanggal ' + now.date + ' jam ' + now.time +
    (lateMinutes ? ' (telat ' + lateMinutes + ' menit)' : '') +
    (distance !== null ? ' jarak ' + Math.round(distance) + ' meter' : ''));
  res.json({ ok: true, tanggal: now.date, jam: now.time, telat: lateMinutes,
    jarak_meter: distance === null ? null : Math.round(distance) });
});
app.get('/api/absensi/rekap', requireRole('admin','kasubag','kepsek','staff'), async (req, res) => {
  const { bulan } = req.query;
  const rows = db.prepare(`
    SELECT p.nama,
      GROUP_CONCAT(CASE WHEN a.keterangan IS NOT NULL AND TRIM(a.keterangan) <> '' THEN a.tanggal || ': ' || a.keterangan END, ' | ') as keterangan,
      SUM(CASE WHEN a.status='Hadir' THEN 1 ELSE 0 END) as hadir,
      SUM(CASE WHEN a.telat_menit>0 THEN 1 ELSE 0 END) as telat,
      SUM(a.telat_menit) as total_telat,
      SUM(CASE WHEN a.status='Izin' THEN 1 ELSE 0 END) as izin,
      SUM(CASE WHEN a.status='Sakit' THEN 1 ELSE 0 END) as sakit
    FROM pegawai p LEFT JOIN absensi a ON a.pegawai_id=p.id AND a.tanggal LIKE ?
    GROUP BY p.id ORDER BY p.nama
  `).all(bulan + '%');
  res.json(rows);
});
app.get('/api/absensi/rekap/excel', requireRole('admin','kasubag','kepsek','staff'), async (req, res) => {
  const { bulan } = req.query;
  const rows = db.prepare(`
    SELECT p.nama,
      GROUP_CONCAT(CASE WHEN a.keterangan IS NOT NULL AND TRIM(a.keterangan) <> '' THEN a.tanggal || ': ' || a.keterangan END, ' | ') as keterangan,
      SUM(CASE WHEN a.status='Hadir' THEN 1 ELSE 0 END) as hadir,
      SUM(CASE WHEN a.telat_menit>0 THEN 1 ELSE 0 END) as telat,
      SUM(a.telat_menit) as total_telat,
      SUM(CASE WHEN a.status='Izin' THEN 1 ELSE 0 END) as izin,
      SUM(CASE WHEN a.status='Sakit' THEN 1 ELSE 0 END) as sakit
    FROM pegawai p LEFT JOIN absensi a ON a.pegawai_id=p.id AND a.tanggal LIKE ?
    GROUP BY p.id ORDER BY p.nama
  `).all(bulan + '%');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rekap');
  ws.columns = [
    { header: 'Nama', key: 'nama' },
    { header: 'Keterangan Absensi', key: 'keterangan' },
    { header: 'Hadir', key: 'hadir' },
    { header: 'Telat', key: 'telat' },
    { header: 'Total Menit Telat', key: 'total_telat' },
    { header: 'Izin', key: 'izin' },
    { header: 'Sakit', key: 'sakit' },
  ];
  rows.forEach(r => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=rekap-${bulan}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

// ========== REKAP SURAT ==========
app.get('/api/rekap/surat', requireRole('admin','kasubag','kepsek','staff'), (req, res) => {
  const { bulan } = req.query;
  const sm = db.prepare("SELECT COUNT(*) as total, dari, perihal, tanggal FROM surat_masuk WHERE tanggal LIKE ? GROUP BY dari ORDER BY tanggal DESC").all(bulan + '%');
  const sk = db.prepare("SELECT COUNT(*) as total, tujuan, perihal, tanggal FROM surat_keluar WHERE tanggal LIKE ? GROUP BY tujuan ORDER BY tanggal DESC").all(bulan + '%');
  const totalMasuk = db.prepare("SELECT COUNT(*) as c FROM surat_masuk WHERE tanggal LIKE ?").get(bulan + '%');
  const totalKeluar = db.prepare("SELECT COUNT(*) as c FROM surat_keluar WHERE tanggal LIKE ?").get(bulan + '%');
  res.json({ totalMasuk: totalMasuk.c, totalKeluar: totalKeluar.c, masukRinci: sm, keluarRinci: sk });
});
app.get('/api/rekap/surat/excel', requireRole('admin','kasubag','kepsek','staff'), async (req, res) => {
  const { bulan } = req.query;
  const sm = db.prepare("SELECT nomor, tanggal, dari, perihal FROM surat_masuk WHERE tanggal LIKE ? ORDER BY tanggal").all(bulan + '%');
  const sk = db.prepare("SELECT nomor, tanggal, tujuan, perihal FROM surat_keluar WHERE tanggal LIKE ? ORDER BY tanggal").all(bulan + '%');
  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet('Surat Masuk');
  ws1.columns = [{ header:'Nomor', key:'nomor' }, { header:'Tanggal', key:'tanggal' }, { header:'Dari', key:'dari' }, { header:'Perihal', key:'perihal' }];
  sm.forEach(r => ws1.addRow(r));
  const ws2 = wb.addWorksheet('Surat Keluar');
  ws2.columns = [{ header:'Nomor', key:'nomor' }, { header:'Tanggal', key:'tanggal' }, { header:'Tujuan', key:'tujuan' }, { header:'Perihal', key:'perihal' }];
  sk.forEach(r => ws2.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=rekap-surat-${bulan}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

// ========== REKAP PEGAWAI ==========
app.get('/api/rekap/pegawai', requireRole('admin','kasubag','kepsek','staff'), (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM pegawai').get();
  const perStatus = db.prepare("SELECT COALESCE(NULLIF(jenis_pegawai,''), status) as status, COUNT(*) as c FROM pegawai GROUP BY status").all();
  const perGolongan = db.prepare('SELECT golongan, COUNT(*) as c FROM pegawai WHERE golongan IS NOT NULL AND length(golongan) > 0 GROUP BY golongan ORDER BY golongan').all();
  const perJabatan = db.prepare('SELECT jabatan, COUNT(*) as c FROM pegawai WHERE jabatan IS NOT NULL AND length(jabatan) > 0 GROUP BY jabatan ORDER BY c DESC').all();
  const semua = db.prepare("SELECT id, nama, jenis_kelamin, nip, tempat_lahir, tanggal_lahir, golongan, jabatan, COALESCE(NULLIF(jenis_pegawai,''), status) as jenis, agama, pendidikan, no_hp, alamat, periode_tahun, periode_bulan, tanggal_naik_pangkat FROM pegawai ORDER BY nama").all();
  res.json({ total: total.c, perStatus, perGolongan, perJabatan, semua });
});
app.get('/api/rekap/pegawai/excel', requireRole('admin','kasubag','kepsek','staff'), async (req, res) => {
  const rows = db.prepare("SELECT nama, jenis_kelamin, tempat_lahir, tanggal_lahir, nip, COALESCE(NULLIF(jenis_pegawai,''), status) as status, jabatan, agama, pendidikan, no_hp, alamat, golongan, periode_tahun, periode_bulan, tanggal_naik_pangkat FROM pegawai ORDER BY nama").all();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pegawai');
  ws.columns = [
    { header:'Nama', key:'nama' }, { header:'Jenis Kelamin', key:'jenis_kelamin' },
    { header:'Tempat Lahir', key:'tempat_lahir' }, { header:'Tanggal Lahir', key:'tanggal_lahir' },
    { header:'NIP', key:'nip' }, { header:'Status Kepegawaian', key:'status' },
    { header:'Jabatan', key:'jabatan' }, { header:'Agama', key:'agama' },
    { header:'Pendidikan Terakhir', key:'pendidikan' }, { header:'No HP', key:'no_hp' },
    { header:'Alamat', key:'alamat' }, { header:'Golongan', key:'golongan' },
    { header:'Periode Tahun', key:'periode_tahun' }, { header:'Periode Bulan', key:'periode_bulan' },
    { header:'Naik Pangkat', key:'tanggal_naik_pangkat' }
  ];
  rows.forEach(r => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=rekap-pegawai.xlsx');
  await wb.xlsx.write(res);
  res.end();
});

// ========== USERS (buat akun guru/staff) ==========
app.get('/api/users', requireRole('admin','kasubag'), (req, res) => {
  const rows = db.prepare('SELECT id, username, nama, role, pegawai_id FROM users ORDER BY role, nama').all();
  res.json(rows);
});
app.post('/api/users', requireRole('admin','kasubag'), (req, res) => {
  const { username, password, nama, role, pegawai_id } = req.body;
  const assignedRole = role || 'guru';
  const allowedRoles = req.user.role === 'admin'
    ? ['admin', 'kepsek', 'kasubag', 'staff', 'guru']
    : ['staff', 'guru'];
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,50}$/.test(username) ||
      typeof password !== 'string' || password.length < 12 || password.length > 200) {
    return res.status(400).json({ error: 'Username harus 3-50 karakter dan password minimal 12 karakter' });
  }
  if (!allowedRoles.includes(assignedRole)) return res.status(403).json({ error: 'Role tersebut tidak boleh dibuat oleh akun ini' });
  const pegawaiId = pegawai_id ? Number(pegawai_id) : null;
  if (pegawaiId !== null && (!Number.isInteger(pegawaiId) || !db.prepare('SELECT id FROM pegawai WHERE id=?').get(pegawaiId))) {
    return res.status(400).json({ error: 'Pegawai yang dipilih tidak valid' });
  }
  if (assignedRole === 'guru' && !pegawaiId) return res.status(400).json({ error: 'Akun guru harus terhubung ke data pegawai' });
  const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (exists) return res.status(400).json({ error: 'Username sudah dipakai' });
  db.prepare('INSERT INTO users (username,password_hash,nama,role,pegawai_id) VALUES (?,?,?,?,?)')
    .run(username, hashPass(password), nama || username, assignedRole, pegawaiId);
  log(req.user, 'User', 'Buat akun ' + username + ' (' + assignedRole + ')');
  res.json({ ok: true });
});
app.put('/api/users/:id/reset-password', requireRole('admin','kasubag'), (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) return res.status(400).json({ error: 'Password minimal 12 karakter' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPass(password), req.params.id);
  log(req.user, 'User', `Reset password user id ${req.params.id}`);
  res.json({ ok: true });
});
app.delete('/api/users/:id', requireRole('admin','kasubag'), (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  log(req.user, 'User', `Hapus akun id ${req.params.id}`);
  res.json({ ok: true });
});

// ========== LAPORAN BULANAN ==========
const DIVISI = ["Administrasi Kesiswaan","Administrasi Keuangan","Administrasi Kurikulum","Dapodik","HUMAS","Keamanan dan Kebersihan","Kepegawaian","Persuratan dan Kearsipan","SARPRAS"];
app.get('/api/divisi', requireAuth, (req, res) => res.json(DIVISI));
app.get('/api/laporan', requireAuth, (req, res) => {
  const { bulan } = req.query;
  let rows;
  if (req.user.role === 'guru' || req.user.role === 'staff') {
    rows = db.prepare('SELECT l.*, p.nama FROM laporan_bulanan l JOIN pegawai p ON p.id=l.pegawai_id WHERE l.bulan=? AND l.pegawai_id=? ORDER BY p.nama').all(bulan, req.user.pegawai_id || 0);
  } else {
    rows = db.prepare('SELECT l.*, p.nama FROM laporan_bulanan l JOIN pegawai p ON p.id=l.pegawai_id WHERE l.bulan=? ORDER BY l.divisi, p.nama').all(bulan);
  }
  res.json(rows);
});
app.post('/api/laporan', requireAuth, upload.fields([{name:'foto',maxCount:1},{name:'file_laporan',maxCount:1}]), (req, res) => {
  const { pegawai_id, divisi, bulan, kegiatan, target, realisasi, kendala, catatan } = req.body;
  if (req.user.role !== 'admin' && req.user.role !== 'kasubag' && req.user.pegawai_id !== Number(pegawai_id)) {
    return res.status(403).json({ error: 'Hanya bisa upload laporan sendiri' });
  }
  const foto = req.files && req.files.foto ? req.files.foto[0].filename : null;
  const file_laporan = req.files && req.files.file_laporan ? req.files.file_laporan[0].filename : null;
  const existing = db.prepare('SELECT id FROM laporan_bulanan WHERE pegawai_id=? AND bulan=?').get(pegawai_id, bulan);
  if (existing) {
    db.prepare('UPDATE laporan_bulanan SET divisi=?, kegiatan=?, target=?, realisasi=?, kendala=?, catatan=?, foto=IFNULL(?,foto), file_laporan=IFNULL(?,file_laporan), status=? WHERE id=?')
      .run(divisi, kegiatan, target, realisasi, kendala, catatan, foto, file_laporan, 'Belum Dinilai', existing.id);
    log(req.user, 'Laporan', `Update laporan ${bulan} (${divisi})`);
  } else {
    db.prepare('INSERT INTO laporan_bulanan (pegawai_id,divisi,bulan,kegiatan,target,realisasi,kendala,catatan,foto,file_laporan) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(pegawai_id, divisi, bulan, kegiatan, target, realisasi, kendala, catatan, foto, file_laporan);
    log(req.user, 'Laporan', `Upload laporan ${bulan} (${divisi})`);
  }
  res.json({ ok: true });
});
app.put('/api/laporan/:id/nilai', requireRole('admin','kasubag'), (req, res) => {
  const { nilai, komentar_kasubag } = req.body;
  db.prepare('UPDATE laporan_bulanan SET nilai=?, komentar_kasubag=?, status=? WHERE id=?').run(nilai, komentar_kasubag, 'Sudah Dinilai', req.params.id);
  log(req.user, 'Laporan', `Nilai laporan id ${req.params.id}: ${nilai}`);
  res.json({ ok: true });
});
app.get('/api/laporan/rekap', requireRole('admin','kasubag','kepsek','staff'), (req, res) => {
  const { bulan } = req.query;
  const rows = db.prepare(`
    SELECT l.divisi, COUNT(*) as total_laporan,
      SUM(CASE WHEN l.status='Sudah Dinilai' THEN 1 ELSE 0 END) as sudah_dinilai,
      SUM(CASE WHEN l.status='Belum Dinilai' THEN 1 ELSE 0 END) as belum_dinilai
    FROM laporan_bulanan l WHERE l.bulan=? GROUP BY l.divisi ORDER BY l.divisi
  `).all(bulan);
  const detail = db.prepare('SELECT l.*, p.nama FROM laporan_bulanan l JOIN pegawai p ON p.id=l.pegawai_id WHERE l.bulan=? ORDER BY l.divisi, p.nama').all(bulan);
  res.json({ rekapDivisi: rows, detail });
});

// ========== IMPORT PEGAWAI (Excel/CSV) ==========
app.post('/api/pegawai/import', requireRole('admin','kasubag'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File tidak ada' });
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);
    const ws = wb.worksheets[0];
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < 2) return; // skip header
      const v = row.values; // 1-indexed
      const get = (i) => v[i] ? String(v[i]).trim() : '';
      const nama = get(2);
      if (!nama || nama.toLowerCase() === 'nama') return;
      rows.push({
        nama,
        jenis_kelamin: get(3) || null,
        tempat_lahir: get(4) || null,
        tanggal_lahir: get(5) || null, // format YYYY-MM-DD disarankan
        nip: get(6) || null,
        jenis_pegawai: get(7) || 'PJLP',
        jabatan: get(8) || null,
        agama: get(9) || null,
        pendidikan: get(10) || null,
        no_hp: get(11) || null,
        golongan: get(12) || null,
        periode_tahun: get(13) || null,
        periode_bulan: get(14) || null,
      });
    });
    const ins = db.prepare(`INSERT INTO pegawai (nama,jenis_kelamin,tempat_lahir,tanggal_lahir,nip,jenis_pegawai,status,jabatan,agama,pendidikan,no_hp,golongan,periode_tahun,periode_bulan)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let ok = 0, gagal = 0;
    const tx = db.transaction((list) => {
      for (const r of list) {
        try {
          ins.run(r.nama, r.jenis_kelamin, r.tempat_lahir, r.tanggal_lahir, r.nip, r.jenis_pegawai, r.jenis_pegawai, r.jabatan, r.agama, r.pendidikan, r.no_hp, r.golongan, r.periode_tahun, r.periode_bulan);
          ok++;
        } catch(e) { gagal++; }
      }
    });
    tx(rows);
    fs.unlinkSync(req.file.path);
    log(req.user, 'Import Pegawai', `Import ${ok} pegawai dari Excel (${gagal} gagal)`);
    res.json({ ok: true, berhasil: ok, gagal });
  } catch(e) {
    return res.status(400).json({ error: 'Gagal baca file: ' + e.message });
  }
});

// ========== ACTIVITY LOG (existing anchor) ==========
app.get('/api/log', requireRole('admin','kasubag','kepsek'), (req, res) => {
  const rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows);
});

// ========== BACKUP ==========
app.get('/api/backup', requireRole('admin','kasubag'), async (req, res, next) => {
  const stamp = schoolDateTime().date;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'situ-smkn2-backup-'));
  const databaseCopy = path.join(tempDir, 'data.db');
  const cleanup = () => fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  try {
    await db.backup(databaseCopy);
    log(req.user, 'Backup', `Download backup database dan unggahan ${stamp}`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=backup-smkn2-${stamp}.zip`);
    res.on('finish', cleanup);
    res.on('close', cleanup);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => {
      cleanup();
      if (!res.headersSent) next(err);
      else res.destroy(err);
    });
    archive.pipe(res);
    archive.file(databaseCopy, { name: 'data.db' });
    if (fs.existsSync(uploadsDir)) archive.directory(uploadsDir, 'uploads');
    archive.finalize();
  } catch (err) {
    await cleanup();
    next(err);
  }
});

// Demo personnel are intentionally not inserted into operational databases.

app.get('/healthz', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, service: 'situ-smkn2' });
  } catch (err) {
    res.status(503).json({ ok: false });
  }
});
app.use((err, req, res, next) => {
  console.error(err && err.message ? err.message : 'Request error');
  if (res.headersSent) return next(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Ukuran file maksimal 10 MB' });
  if (err && err.message === 'Jenis file tidak diizinkan') return res.status(400).json({ error: err.message });
  res.status(400).json({ error: 'Permintaan tidak dapat diproses' });
});
app.listen(PORT, () => console.log(`SMKN 2 Rantau TU running on :${PORT}`));
