require('dotenv').config();

const express = require('express');
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
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self'",
    "connect-src 'self'"
  ].join('; '));
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

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

// Index operasional. Dibuat terpisah agar database lama tetap bisa dibuka
// meskipun sudah memiliki data ganda dari versi sebelumnya.
db.exec(`
CREATE INDEX IF NOT EXISTS idx_surat_masuk_tanggal ON surat_masuk(tanggal);
CREATE INDEX IF NOT EXISTS idx_surat_keluar_tanggal ON surat_keluar(tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_pegawai ON absensi(pegawai_id);
CREATE INDEX IF NOT EXISTS idx_laporan_bulan ON laporan_bulanan(bulan);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
`);
try {
  const duplicate = db.prepare(`
    SELECT pegawai_id, tanggal, COUNT(*) AS jumlah
    FROM absensi GROUP BY pegawai_id, tanggal HAVING jumlah > 1 LIMIT 1
  `).get();
  if (duplicate) {
    console.warn('Indeks absensi unik dilewati: ditemukan data absensi ganda pada database lama.');
  } else {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_absensi_pegawai_tanggal ON absensi(pegawai_id, tanggal)');
  }
} catch (err) {
  console.warn('Indeks absensi unik tidak dapat dibuat:', err.message);
}

function purgeExpiredSessions() {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at IS NULL OR expires_at <= ?').run(new Date().toISOString());
  } catch (err) {
    console.warn('Pembersihan session gagal:', err.message);
  }
}
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 60 * 60 * 1000).unref();

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
function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function cleanText(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}
function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}
function optionalText(value, max = 300) {
  return cleanText(value, max) || null;
}
function normalizePegawai(input = {}) {
  const allowedJenis = ['PNS', 'PPPK', 'PJLP', 'Guru Non ASN'];
  const requested = cleanText(input.jenis_pegawai || input.status, 40);
  const jenis = allowedJenis.includes(requested) ? requested : 'PNS';
  const isPjlp = jenis === 'PJLP';
  const periodeTahun = Number(input.periode_tahun);
  const periodeBulan = Number(input.periode_bulan);
  const gender = cleanText(input.jenis_kelamin, 20);
  return {
    nama: cleanText(input.nama, 160),
    nip: isPjlp ? null : optionalText(input.nip, 30),
    tempat_lahir: optionalText(input.tempat_lahir, 120),
    tanggal_lahir: isDateOnly(input.tanggal_lahir) ? input.tanggal_lahir : null,
    golongan: isPjlp ? null : optionalText(input.golongan, 20),
    jabatan: optionalText(input.jabatan, 160),
    status: jenis,
    masa_jabatan: optionalText(input.masa_jabatan, 80),
    tanggal_naik_pangkat: isPjlp ? null : (isDateOnly(input.tanggal_naik_pangkat) ? input.tanggal_naik_pangkat : null),
    no_hp: optionalText(input.no_hp, 40),
    alamat: optionalText(input.alamat, 500),
    jenis_pegawai: jenis,
    tanggal_mulai: isDateOnly(input.tanggal_mulai) ? input.tanggal_mulai : null,
    tanggal_pangkat_terakhir: isDateOnly(input.tanggal_pangkat_terakhir) ? input.tanggal_pangkat_terakhir : null,
    jenis_kelamin: ['Laki-laki', 'Perempuan'].includes(gender) ? gender : null,
    agama: optionalText(input.agama, 40),
    pendidikan: optionalText(input.pendidikan, 120),
    periode_tahun: Number.isInteger(periodeTahun) && periodeTahun >= 1900 && periodeTahun <= 2100 ? String(periodeTahun) : null,
    periode_bulan: Number.isInteger(periodeBulan) && periodeBulan >= 1 && periodeBulan <= 12 ? String(periodeBulan) : null
  };
}
const PANGKAT_REMINDER_DAYS = 150;
const LETTER_TYPES = Object.freeze({
  '400.3.8': 'Surat umum',
  '800.1.11.1': 'Surat tugas'
});
function normalizeSuratType(value) {
  return Object.prototype.hasOwnProperty.call(LETTER_TYPES, value) ? value : '400.3.8';
}
function letterYear(tanggal) {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(String(tanggal || ''));
  return match ? match[1] : schoolDateTime().date.slice(0, 4);
}
function nextSuratNumber(jenis, tahun) {
  const rows = db.prepare('SELECT nomor FROM surat_keluar WHERE jenis = ?').all(jenis);
  let highest = 0;
  for (const row of rows) {
    const parts = String(row.nomor || '').split('/');
    if (parts.length !== 4) continue;
    if (parts[0] !== jenis || parts[2] !== 'SMKN2RTU' || parts[3] !== String(tahun)) continue;
    const sequence = Number(parts[1]);
    if (Number.isInteger(sequence) && sequence > highest) highest = sequence;
  }
  return `${jenis}/${String(highest + 1).padStart(3, '0')}/SMKN2RTU/${tahun}`;
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
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginFailures) {
    if (now - entry.windowStart > 15 * 60 * 1000) loginFailures.delete(ip);
  }
}, 15 * 60 * 1000).unref();
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
  const updatePassword = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPass(baru), req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
  });
  updatePassword();
  log(req.user, 'Ganti Password', 'Password berhasil diganti; seluruh sesi dicabut');
  res.json({ ok: true, reauth_required: true });
});

// Upload config
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const uploadExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv'];
const uploadMimeByExtension = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8'
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, crypto.randomBytes(16).toString('hex') + (uploadExtensions.includes(ext) ? ext : ''));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!uploadExtensions.includes(ext)) return cb(new Error('Jenis file tidak diizinkan'));
    cb(null, true);
  }
});
function detectUploadMime(filePath, filename) {
  let buffer;
  try { buffer = fs.readFileSync(filePath); } catch (err) { return 'application/octet-stream'; }
  const head = buffer.subarray(0, 16);
  const ext = path.extname(filename).toLowerCase();
  if (head.subarray(0, 4).toString('latin1') === '%PDF-') return 'application/pdf';
  if (head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG' && head.subarray(4, 8).equals(Buffer.from([0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'application/x-ole-storage';
  if (head[0] === 0x50 && head[1] === 0x4b && [0x03, 0x05, 0x07].includes(head[2]) && [0x04, 0x06, 0x08].includes(head[3])) {
    const names = buffer.toString('latin1');
    if (names.includes('word/document.xml')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (names.includes('xl/workbook.xml')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/zip';
  }
  if (ext === '.csv' && buffer.length > 0 && !buffer.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return 'text/csv; charset=utf-8';
    } catch (err) { return 'application/octet-stream'; }
  }
  return 'application/octet-stream';
}
function isUploadSignatureValid(file) {
  if (!file || !file.path) return false;
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = detectUploadMime(file.path, ext);
  const expected = {
    '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.png': ['image/png'], '.webp': ['image/webp'],
    '.pdf': ['application/pdf'], '.doc': ['application/x-ole-storage'], '.xls': ['application/x-ole-storage'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.csv': ['text/csv; charset=utf-8']
  };
  return Boolean(expected[ext] && expected[ext].includes(mime));
}
function validateUploadedFiles(req, res, next) {
  const files = req.file ? [req.file] : Object.values(req.files || {}).flat();
  const invalid = files.filter(file => !isUploadSignatureValid(file));
  if (invalid.length) {
    files.forEach(discardUpload);
    return res.status(400).json({ error: 'Isi file tidak sesuai dengan format ekstensi. Pastikan file asli dan tidak rusak.' });
  }
  next();
}
function discardUpload(file) {
  if (file && file.path) fs.promises.unlink(file.path).catch(() => {});
}
function removeStoredUpload(filename) {
  if (!filename) return;
  const target = path.join(uploadsDir, path.basename(String(filename)));
  fs.promises.unlink(target).catch(() => {});
}
app.get('/uploads/:file', requireAuth, (req, res) => {
  const filename = path.basename(String(req.params.file || ''));
  if (!filename) return res.status(404).json({ error: 'Berkas tidak ditemukan' });
  const target = path.join(uploadsDir, filename);
  let stat = null;
  try { stat = fs.statSync(target); } catch (err) { stat = null; }
  if (!stat || !stat.isFile()) return res.status(404).json({ error: 'Berkas tidak ditemukan' });
  const mime = detectUploadMime(target, filename);
  const inline = mime === 'application/pdf' || mime.startsWith('image/');
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=0');
  const stream = fs.createReadStream(target);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Berkas tidak dapat dibaca' });
    else res.destroy();
  });
  stream.pipe(res);
});
// ========== SURAT MASUK ==========
app.get('/api/surat-masuk', requireRole('admin','kasubag','staff','kepsek'), (req, res) => {
  const rows = db.prepare('SELECT * FROM surat_masuk ORDER BY tanggal DESC').all();
  res.json(rows);
});
app.post('/api/surat-masuk', requireRole('admin','kasubag','staff'), upload.single('foto'), validateUploadedFiles, (req, res) => {
  const nomor = cleanText(req.body.nomor, 120);
  const tanggal = cleanText(req.body.tanggal, 10);
  const dari = cleanText(req.body.dari, 160);
  const perihal = cleanText(req.body.perihal, 300);
  if (!nomor || !isDateOnly(tanggal) || !dari || !perihal) {
    discardUpload(req.file);
    return res.status(400).json({ error: 'Nomor, tanggal, asal, dan perihal surat wajib diisi dengan benar.' });
  }
  const foto = req.file ? req.file.filename : null;
  const info = db.prepare('INSERT INTO surat_masuk (nomor,tanggal,dari,perihal,foto) VALUES (?,?,?,?,?)').run(nomor, tanggal, dari, perihal, foto);
  log(req.user, 'Surat Masuk', `Input surat ${nomor} dari ${dari}`);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.put('/api/surat-masuk/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const nomor = cleanText(req.body.nomor, 120);
  const tanggal = cleanText(req.body.tanggal, 10);
  const dari = cleanText(req.body.dari, 160);
  const perihal = cleanText(req.body.perihal, 300);
  if (!nomor || !isDateOnly(tanggal) || !dari || !perihal) {
    return res.status(400).json({ error: 'Nomor, tanggal, asal, dan perihal surat wajib diisi dengan benar.' });
  }
  const info = db.prepare('UPDATE surat_masuk SET nomor=?, tanggal=?, dari=?, perihal=? WHERE id=?')
    .run(nomor, tanggal, dari, perihal, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Surat tidak ditemukan' });
  log(req.user, 'Surat Masuk', `Edit surat ${nomor}`);
  res.json({ ok: true });
});
app.delete('/api/surat-masuk/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const row = db.prepare('SELECT nomor, foto FROM surat_masuk WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Surat tidak ditemukan' });
  db.prepare('DELETE FROM surat_masuk WHERE id=?').run(req.params.id);
  removeStoredUpload(row.foto);
  log(req.user, 'Surat Masuk', `Hapus surat ${row.nomor || ''}`);
  res.json({ ok: true });
});

// ========== SURAT KELUAR ==========
app.get('/api/surat-keluar', requireRole('admin','kasubag','staff','kepsek'), (req, res) => {
  const rows = db.prepare('SELECT * FROM surat_keluar ORDER BY tanggal DESC').all();
  res.json(rows);
});
app.get('/api/surat-keluar/next-number', requireRole('admin','kasubag','staff'), (req, res) => {
  const jenis = normalizeSuratType(req.query.jenis);
  const tahun = /^\d{4}$/.test(String(req.query.tahun || '')) ? String(req.query.tahun) : schoolDateTime().date.slice(0, 4);
  res.json({ nomor: nextSuratNumber(jenis, tahun), jenis, tahun });
});
app.post('/api/surat-keluar', requireRole('admin','kasubag','staff'), (req, res) => {
  const tanggal = cleanText(req.body.tanggal, 10);
  const tujuan = cleanText(req.body.tujuan, 160);
  const perihal = cleanText(req.body.perihal, 300);
  const isi = cleanText(req.body.isi, 10000);
  const jenis = normalizeSuratType(req.body.jenis);
  if (!isDateOnly(tanggal) || !tujuan || !perihal) {
    return res.status(400).json({ error: 'Tanggal, tujuan, dan perihal surat wajib diisi dengan benar.' });
  }
  const createSurat = db.transaction(() => {
    const nomor = nextSuratNumber(jenis, letterYear(tanggal));
    const info = db.prepare('INSERT INTO surat_keluar (nomor,tanggal,tujuan,perihal,isi,jenis) VALUES (?,?,?,?,?,?)')
      .run(nomor, tanggal, tujuan, perihal, isi || null, jenis);
    return { nomor, id: info.lastInsertRowid };
  });
  const created = createSurat();
  log(req.user, 'Surat Keluar', `Buat surat ${created.nomor} ke ${tujuan}`);
  res.json({ ok: true, ...created });
});
app.put('/api/surat-keluar/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const existing = db.prepare('SELECT nomor FROM surat_keluar WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Surat tidak ditemukan' });
  const nomor = cleanText(req.body.nomor, 120) || existing.nomor;
  const tanggal = cleanText(req.body.tanggal, 10);
  const tujuan = cleanText(req.body.tujuan, 160);
  const perihal = cleanText(req.body.perihal, 300);
  const isi = cleanText(req.body.isi, 10000);
  const jenis = normalizeSuratType(req.body.jenis);
  if (!isDateOnly(tanggal) || !tujuan || !perihal) {
    return res.status(400).json({ error: 'Tanggal, tujuan, dan perihal surat wajib diisi dengan benar.' });
  }
  db.prepare('UPDATE surat_keluar SET nomor=?, tanggal=?, tujuan=?, perihal=?, isi=?, jenis=? WHERE id=?')
    .run(nomor, tanggal, tujuan, perihal, isi || null, jenis, req.params.id);
  log(req.user, 'Surat Keluar', `Edit surat ${nomor}`);
  res.json({ ok: true, nomor });
});
app.delete('/api/surat-keluar/:id', requireRole('admin','kasubag','staff'), (req, res) => {
  const row = db.prepare('SELECT nomor FROM surat_keluar WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Surat tidak ditemukan' });
  db.prepare('DELETE FROM surat_keluar WHERE id=?').run(req.params.id);
  log(req.user, 'Surat Keluar', `Hapus surat ${row.nomor || ''}`);
  res.json({ ok: true });
});
app.get('/api/surat-keluar/:id/pdf', requireRole('admin','kasubag','staff','kepsek'), (req, res) => {
  const s = db.prepare('SELECT * FROM surat_keluar WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).send('Not found');
  const nomor = cleanText(s.nomor, 120) || `surat-${s.id}`;
  const safeName = nomor.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const doc = new PDFDocument({ margin: 56 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="surat-${safeName}.pdf"`);
  doc.pipe(res);
  doc.fontSize(15).font('Helvetica-Bold').text('SMK NEGERI 2 RANTAU', { align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#475569').text('Kabupaten Tapin, Kalimantan Selatan', { align: 'center' });
  doc.moveDown(1.2);
  doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('SURAT KELUAR', { align: 'center' });
  doc.moveDown(1.4);
  doc.fontSize(10).font('Helvetica').text(`Nomor: ${nomor}`);
  doc.text(`Tanggal: ${s.tanggal || '-'}`);
  doc.text(`Tujuan: ${s.tujuan || '-'}`);
  doc.text(`Perihal: ${s.perihal || '-'}`);
  doc.moveDown(1.2);
  doc.text(s.isi || '', { align: 'justify', lineGap: 4 });
  doc.moveDown(2);
  const today = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date());
  doc.text(`Rantau, ${today}`, { align: 'right' });
  doc.text('Kepala Sekolah', { align: 'right' });
  doc.moveDown(2.4);
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
  const p = normalizePegawai(req.body);
  if (!p.nama) return res.status(400).json({ error: 'Nama pegawai wajib diisi.' });
  const info = db.prepare(`INSERT INTO pegawai (nama,nip,tempat_lahir,tanggal_lahir,golongan,jabatan,status,masa_jabatan,tanggal_naik_pangkat,no_hp,alamat,jenis_pegawai,tanggal_mulai,tanggal_pangkat_terakhir,jenis_kelamin,agama,pendidikan,periode_tahun,periode_bulan)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    p.nama, p.nip, p.tempat_lahir, p.tanggal_lahir, p.golongan, p.jabatan, p.status, p.masa_jabatan,
    p.tanggal_naik_pangkat, p.no_hp, p.alamat, p.jenis_pegawai, p.tanggal_mulai, p.tanggal_pangkat_terakhir,
    p.jenis_kelamin, p.agama, p.pendidikan, p.periode_tahun, p.periode_bulan
  );
  log(req.user, 'Pegawai', `Tambah pegawai ${p.nama}`);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.put('/api/pegawai/:id', requireRole('admin','kasubag'), (req, res) => {
  const p = normalizePegawai(req.body);
  if (!p.nama) return res.status(400).json({ error: 'Nama pegawai wajib diisi.' });
  const info = db.prepare(`UPDATE pegawai SET nama=?,nip=?,tempat_lahir=?,tanggal_lahir=?,golongan=?,jabatan=?,status=?,masa_jabatan=?,tanggal_naik_pangkat=?,no_hp=?,alamat=?,jenis_pegawai=?,tanggal_mulai=?,tanggal_pangkat_terakhir=?,jenis_kelamin=?,agama=?,pendidikan=?,periode_tahun=?,periode_bulan=? WHERE id=?`)
    .run(
      p.nama, p.nip, p.tempat_lahir, p.tanggal_lahir, p.golongan, p.jabatan, p.status, p.masa_jabatan,
      p.tanggal_naik_pangkat, p.no_hp, p.alamat, p.jenis_pegawai, p.tanggal_mulai, p.tanggal_pangkat_terakhir,
      p.jenis_kelamin, p.agama, p.pendidikan, p.periode_tahun, p.periode_bulan, req.params.id
    );
  if (!info.changes) return res.status(404).json({ error: 'Pegawai tidak ditemukan' });
  log(req.user, 'Pegawai', `Edit pegawai ${p.nama}`);
  res.json({ ok: true });
});
app.delete('/api/pegawai/:id', requireRole('admin','kasubag'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID pegawai tidak valid' });
  const row = db.prepare('SELECT nama FROM pegawai WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Pegawai tidak ditemukan' });
  const reports = db.prepare('SELECT foto, file_laporan FROM laporan_bulanan WHERE pegawai_id=?').all(id);
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE pegawai_id=?)').run(id);
    db.prepare('UPDATE users SET pegawai_id=NULL WHERE pegawai_id=?').run(id);
    db.prepare('DELETE FROM laporan_bulanan WHERE pegawai_id=?').run(id);
    db.prepare('DELETE FROM absensi WHERE pegawai_id=?').run(id);
    db.prepare('DELETE FROM pegawai WHERE id=?').run(id);
  });
  remove();
  for (const report of reports) {
    removeStoredUpload(report.foto);
    removeStoredUpload(report.file_laporan);
  }
  log(req.user, 'Pegawai', `Hapus pegawai ${row.nama}`);
  res.json({ ok: true, laporan_dihapus: reports.length });
});
app.get('/api/pegawai/notifikasi', requireRole('admin','kasubag','kepsek'), (req, res) => {
  const rows = db.prepare("SELECT * FROM pegawai WHERE COALESCE(NULLIF(jenis_pegawai,''), status) = 'PNS'").all();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const notifs = [];
  rows.forEach(r => {
    // Prioritas: periode jabatan (tahun+bulan) -> pangkat terakhir -> naik pangkat lama -> tanggal mulai
    let last = null;
    if (r.periode_tahun && r.periode_bulan) {
      last = new Date(Number(r.periode_tahun), Number(r.periode_bulan) - 1, 1);
    } else {
      const lastStr = r.tanggal_pangkat_terakhir || r.tanggal_naik_pangkat || r.tanggal_mulai;
      if (!lastStr) return;
      last = new Date(lastStr);
    }
    if (!(last instanceof Date) || Number.isNaN(last.getTime())) return;
    const next = new Date(last);
    next.setFullYear(next.getFullYear() + 4);
    const diff = Math.round((next - today) / (1000 * 60 * 60 * 24));
    if (diff >= -365 && diff <= PANGKAT_REMINDER_DAYS) {
      notifs.push({
        ...r,
        tanggal_naik_berikutnya: formatDateOnly(next),
        sisa_hari: diff,
        status_reminder: diff < 0 ? 'Terlewat' : diff <= 30 ? 'Segera' : diff <= 90 ? 'Perlu disiapkan' : 'Terjadwal'
      });
    }
  });
  notifs.sort((a, b) => a.sisa_hari - b.sisa_hari);
  res.json(notifs);
});

// ========== ABSENSI ==========
app.get('/api/absensi', requireAuth, (req, res) => {
  const tanggal = req.query.tanggal || schoolDateTime().date;
  let rows;
  if (req.user.role === 'guru') {
    rows = db.prepare(`
      SELECT a.pegawai_id, p.nama, a.jam, a.status, a.telat_menit, a.keterangan FROM absensi a
      JOIN pegawai p ON p.id = a.pegawai_id
      WHERE a.tanggal = ? AND a.pegawai_id = ? ORDER BY p.nama
    `).all(tanggal, req.user.pegawai_id || 0);
  } else {
    rows = db.prepare(`
      SELECT a.pegawai_id, p.nama, a.jam, a.status, a.telat_menit, a.keterangan FROM absensi a
      JOIN pegawai p ON p.id = a.pegawai_id
      WHERE a.tanggal = ? ORDER BY p.nama
    `).all(tanggal);
  }
  res.json(rows);
});
app.post('/api/absensi', requireAuth, (req, res) => {
  const { pegawai_id, status, lat, lng, keterangan } = req.body;
  if (!['Hadir', 'Izin', 'Sakit'].includes(status)) return res.status(400).json({ error: 'Status absensi tidak valid' });
  const pegawaiId = Number(pegawai_id);
  if (!Number.isInteger(pegawaiId) || pegawaiId <= 0) return res.status(400).json({ error: 'Pegawai tidak valid' });
  if (!db.prepare('SELECT id FROM pegawai WHERE id=?').get(pegawaiId)) return res.status(404).json({ error: 'Data pegawai tidak ditemukan' });
  if (!['admin', 'kasubag'].includes(req.user.role)) {
    const ownPegawaiId = Number(req.user.pegawai_id);
    if (!Number.isInteger(ownPegawaiId) || ownPegawaiId <= 0) {
      return res.status(403).json({ error: 'Akun belum terhubung ke data pegawai. Hubungi administrator.' });
    }
    if (ownPegawaiId !== pegawaiId) {
      return res.status(403).json({ error: 'Anda hanya dapat melakukan absensi untuk diri sendiri.' });
    }
  }

  const note = typeof keterangan === 'string' ? keterangan.trim() : '';
  if ((status === 'Izin' || status === 'Sakit') && !note) return res.status(400).json({ error: 'Keterangan wajib diisi untuk Izin/Sakit' });
  if (note.length > 1000) return res.status(400).json({ error: 'Keterangan maksimal 1000 karakter' });

  let distance = null;
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
  db.prepare('INSERT INTO absensi (pegawai_id,tanggal,jam,status,telat_menit,lat,lng,keterangan) VALUES (?,?,?,?,?,?,?,?)')
    .run(pegawaiId, now.date, now.time, status, lateMinutes, status === 'Hadir' ? Number(lat) : null,
      status === 'Hadir' ? Number(lng) : null, note || null);
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
  const info = db.prepare('INSERT INTO users (username,password_hash,nama,role,pegawai_id) VALUES (?,?,?,?,?)')
    .run(username, hashPass(password), nama || username, assignedRole, pegawaiId);
  log(req.user, 'User', 'Buat akun ' + username + ' (' + assignedRole + ')');
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.put('/api/users/:id/reset-password', requireRole('admin','kasubag'), (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) return res.status(400).json({ error: 'Password minimal 12 karakter' });
  const target = db.prepare('SELECT id, role FROM users WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (req.user.role === 'kasubag' && ['admin', 'kepsek', 'kasubag'].includes(target.role)) {
    return res.status(403).json({ error: 'Kasubag hanya dapat reset akun guru dan staff' });
  }
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPass(password), target.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
  log(req.user, 'User', 'Reset password user id ' + target.id);
  res.json({ ok: true });
});
app.delete('/api/users/:id', requireRole('admin','kasubag'), (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'ID akun tidak valid' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
  const target = db.prepare('SELECT id, role FROM users WHERE id=?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (req.user.role === 'kasubag' && ['admin', 'kepsek', 'kasubag'].includes(target.role)) {
    return res.status(403).json({ error: 'Kasubag hanya dapat menghapus akun guru dan staff' });
  }
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
  db.prepare('DELETE FROM users WHERE id=?').run(targetId);
  log(req.user, 'User', 'Hapus akun id ' + targetId);
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
app.post('/api/laporan', requireAuth, upload.fields([{name:'foto',maxCount:1},{name:'file_laporan',maxCount:1}]), validateUploadedFiles, (req, res) => {
  const pegawaiId = Number(req.body.pegawai_id);
  const divisi = cleanText(req.body.divisi, 120);
  const bulan = cleanText(req.body.bulan, 7);
  const kegiatan = cleanText(req.body.kegiatan, 5000);
  const target = optionalText(req.body.target, 300);
  const realisasi = optionalText(req.body.realisasi, 300);
  const kendala = optionalText(req.body.kendala, 2000);
  const catatan = optionalText(req.body.catatan, 2000);
  const uploaded = req.files || {};
  const fotoFile = uploaded.foto && uploaded.foto[0];
  const laporanFile = uploaded.file_laporan && uploaded.file_laporan[0];
  const reject = (message, status = 400) => {
    discardUpload(fotoFile);
    discardUpload(laporanFile);
    return res.status(status).json({ error: message });
  };
  if (!Number.isInteger(pegawaiId) || !db.prepare('SELECT id FROM pegawai WHERE id=?').get(pegawaiId)) {
    return reject('Pegawai yang dipilih tidak valid.');
  }
  if (!/^\d{4}-\d{2}$/.test(bulan)) return reject('Bulan laporan tidak valid.');
  if (!DIVISI.includes(divisi)) return reject('Divisi laporan tidak valid.');
  if (!kegiatan) return reject('Uraian kegiatan wajib diisi.');
  if (req.user.role !== 'admin' && req.user.role !== 'kasubag' && req.user.pegawai_id !== pegawaiId) {
    return reject('Hanya dapat mengirim laporan untuk diri sendiri.', 403);
  }
  const foto = fotoFile ? fotoFile.filename : null;
  const file_laporan = laporanFile ? laporanFile.filename : null;
  const existing = db.prepare('SELECT id, foto, file_laporan FROM laporan_bulanan WHERE pegawai_id=? AND bulan=?').get(pegawaiId, bulan);
  if (existing) {
    db.prepare('UPDATE laporan_bulanan SET divisi=?, kegiatan=?, target=?, realisasi=?, kendala=?, catatan=?, foto=IFNULL(?,foto), file_laporan=IFNULL(?,file_laporan), status=? WHERE id=?')
      .run(divisi, kegiatan, target, realisasi, kendala, catatan, foto, file_laporan, 'Belum Dinilai', existing.id);
    if (foto) removeStoredUpload(existing.foto);
    if (file_laporan) removeStoredUpload(existing.file_laporan);
    log(req.user, 'Laporan', `Update laporan ${bulan} (${divisi})`);
    return res.json({ ok: true, id: existing.id, updated: true });
  }
  const info = db.prepare('INSERT INTO laporan_bulanan (pegawai_id,divisi,bulan,kegiatan,target,realisasi,kendala,catatan,foto,file_laporan) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(pegawaiId, divisi, bulan, kegiatan, target, realisasi, kendala, catatan, foto, file_laporan);
  log(req.user, 'Laporan', `Upload laporan ${bulan} (${divisi})`);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.put('/api/laporan/:id/nilai', requireRole('admin','kasubag'), (req, res) => {
  const nilai = cleanText(req.body.nilai, 40);
  const komentar = cleanText(req.body.komentar_kasubag, 1000);
  if (!nilai) return res.status(400).json({ error: 'Nilai wajib diisi.' });
  const info = db.prepare('UPDATE laporan_bulanan SET nilai=?, komentar_kasubag=?, status=? WHERE id=?')
    .run(nilai, komentar || null, 'Sudah Dinilai', req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Laporan tidak ditemukan' });
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

// ========== IMPORT PEGAWAI (Excel) ==========
const BULAN_NAMA = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12
};
const HEADER_ALIASES = Object.freeze({
  nama: ['nama', 'nama lengkap', 'nama pegawai', 'nama guru', 'nama dan gelar'],
  jenis_kelamin: ['jenis kelamin', 'jk', 'l p', 'gender'],
  tempat_lahir: ['tempat lahir', 'tmp lahir'],
  tanggal_lahir: ['tanggal lahir', 'tgl lahir'],
  nip: ['nip', 'nip baru', 'nomor induk pegawai'],
  jenis_pegawai: ['status kepegawaian', 'jenis pegawai', 'status pegawai', 'status'],
  jabatan: ['jabatan', 'jenis ptk', 'mata pelajaran', 'mapel'],
  agama: ['agama'],
  pendidikan: ['pendidikan terakhir', 'pendidikan', 'ijazah terakhir'],
  no_hp: ['no hp', 'nomor telepon hp', 'nomor telepon', 'no telp', 'telepon', 'hp', 'nomor hp'],
  golongan: ['golongan', 'pangkat golongan', 'golongan ruang'],
  periode_tahun: ['periode tahun', 'tahun periode', 'tahun'],
  periode_bulan: ['periode bulan', 'bulan periode', 'bulan'],
  usul_naik_pangkat: ['usul naik pangkat', 'usul kenaikan pangkat', 'naik pangkat']
});
function pad2(value) {
  return String(value).padStart(2, '0');
}
function normalizeHeader(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function sheetCellText(cell) {
  const value = cell && cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDateOnly(value) || '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('').trim();
    if (value.result !== undefined && value.result !== null) return sheetCellText({ value: value.result });
    if (value.text !== undefined && value.text !== null) return String(value.text).trim();
  }
  return String(value).trim();
}
function sheetCellDate(cell) {
  const raw = cell && cell.value;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return formatDateOnly(raw);
  if (typeof raw === 'number' && raw > 0 && raw < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000);
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }
  const text = sheetCellText(cell);
  if (!text) return null;
  const iso = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  const named = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (named) {
    const month = BULAN_NAMA[named[2].toLowerCase()];
    if (month) return `${named[3]}-${pad2(month)}-${pad2(named[1])}`;
  }
  return null;
}
function normalizeJenisPegawai(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('pppk')) return 'PPPK';
  if (text.includes('pjlp')) return 'PJLP';
  if (text.includes('non asn') || text.includes('honorer')) return 'Guru Non ASN';
  if (text.includes('pns') || text.includes('asn')) return 'PNS';
  return 'PJLP';
}
function normalizeGender(value) {
  const text = String(value || '').toLowerCase().trim();
  if (['l', 'lk', 'laki laki', 'laki-laki', 'pria'].includes(text)) return 'Laki-laki';
  if (['p', 'pr', 'perempuan', 'wanita'].includes(text)) return 'Perempuan';
  return null;
}
function detectHeaderRow(ws) {
  const maxRow = Math.min(ws.rowCount || 0, 40);
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const map = {};
    ws.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = normalizeHeader(sheetCellText(cell));
      if (!header) return;
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (map[field] !== undefined) continue;
        if (aliases.some(alias => header === alias || header.startsWith(alias + ' ') || header.endsWith(' ' + alias))) {
          map[field] = colNumber;
        }
      }
    });
    if (map.nama && Object.keys(map).length >= 3) return { rowNumber, map };
  }
  return null;
}

app.get('/api/pegawai/template', requireRole('admin','kasubag'), async (req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SITU SMKN 2 Rantau';
  const ws = wb.addWorksheet('Data Pegawai', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Nama Lengkap', key: 'nama', width: 30 },
    { header: 'Jenis Kelamin', key: 'jenis_kelamin', width: 16 },
    { header: 'Tempat Lahir', key: 'tempat_lahir', width: 20 },
    { header: 'Tanggal Lahir', key: 'tanggal_lahir', width: 15 },
    { header: 'NIP', key: 'nip', width: 22 },
    { header: 'Status Kepegawaian', key: 'jenis_pegawai', width: 20 },
    { header: 'Jabatan', key: 'jabatan', width: 24 },
    { header: 'Agama', key: 'agama', width: 14 },
    { header: 'Pendidikan Terakhir', key: 'pendidikan', width: 22 },
    { header: 'No. HP', key: 'no_hp', width: 18 },
    { header: 'Golongan', key: 'golongan', width: 12 },
    { header: 'Periode Tahun', key: 'periode_tahun', width: 14 },
    { header: 'Periode Bulan', key: 'periode_bulan', width: 14 }
  ];
  const header = ws.getRow(1);
  header.height = 28;
  header.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15263F' } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.autoFilter = 'A1:M1';
  ws.getColumn(4).numFmt = 'yyyy-mm-dd';
  ws.dataValidations.add('B2:B1000', { type: 'list', allowBlank: true, formulae: ['"Laki-laki,Perempuan"'] });
  ws.dataValidations.add('F2:F1000', { type: 'list', allowBlank: true, formulae: ['"PNS,PPPK,Guru Non ASN,PJLP"'] });
  ws.dataValidations.add('L2:L1000', { type: 'whole', allowBlank: true, operator: 'between', formulae: [1900, 2100] });
  ws.dataValidations.add('M2:M1000', { type: 'whole', allowBlank: true, operator: 'between', formulae: [1, 12] });

  const guide = wb.addWorksheet('Petunjuk');
  guide.columns = [{ width: 28 }, { width: 92 }];
  guide.addRow(['Kolom', 'Keterangan']);
  guide.addRow(['Nama Lengkap', 'Wajib diisi. Gunakan nama lengkap beserta gelar bila ada.']);
  guide.addRow(['Jenis Kelamin', 'Pilih Laki-laki atau Perempuan.']);
  guide.addRow(['Tanggal Lahir', 'Gunakan format YYYY-MM-DD, misalnya 1990-05-10.']);
  guide.addRow(['NIP', 'Khusus PNS. Kosongkan atau isi tanda - untuk non-PNS.']);
  guide.addRow(['Status Kepegawaian', 'PNS, PPPK, Guru Non ASN, atau PJLP.']);
  guide.addRow(['Golongan', 'Contoh: III/a. Kosongkan untuk PJLP.']);
  guide.addRow(['Periode Tahun / Bulan', 'Periode jabatan terakhir. Kenaikan pangkat dihitung otomatis setiap 4 tahun.']);
  guide.addRow(['Contoh baris', 'Budi Santoso, S.Pd. | Laki-laki | Rantau | 1990-05-10 | 199005101500000001 | PNS | Guru Matematika | Islam | S1 Pendidikan | 081234567890 | III/a | 2022 | 12']);
  guide.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15263F' } };
  guide.getColumn(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template-pegawai.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

app.post('/api/pegawai/import', requireRole('admin','kasubag'), upload.single('file'), validateUploadedFiles, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File Excel belum dipilih.' });
  if (path.extname(req.file.originalname || '').toLowerCase() !== '.xlsx') {
    discardUpload(req.file);
    return res.status(400).json({ error: 'Import hanya mendukung file Excel .xlsx.' });
  }
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'File tidak memiliki lembar kerja.' });

    const detected = detectHeaderRow(ws);
    const legacyMap = {
      nama: 2, jenis_kelamin: 4, tempat_lahir: 5, tanggal_lahir: 6, nip: 7,
      jenis_pegawai: 8, jabatan: 9, agama: 10, pendidikan: 12, no_hp: 16,
      usul_naik_pangkat: 18
    };
    const map = detected ? detected.map : legacyMap;
    const startRow = detected ? detected.rowNumber + 1 : 19;
    const lastRow = ws.rowCount || 0;
    const get = (row, field) => {
      const col = map[field];
      return col ? sheetCellText(row.getCell(col)) : '';
    };
    const getDate = (row, field) => {
      const col = map[field];
      return col ? sheetCellDate(row.getCell(col)) : null;
    };

    const insert = db.prepare(`INSERT INTO pegawai
      (nama,jenis_kelamin,tempat_lahir,tanggal_lahir,nip,jenis_pegawai,status,jabatan,agama,pendidikan,no_hp,golongan,periode_tahun,periode_bulan)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const findNip = db.prepare('SELECT id FROM pegawai WHERE nip = ?');
    const findName = db.prepare("SELECT id FROM pegawai WHERE lower(nama) = lower(?) AND IFNULL(tanggal_lahir,'') = IFNULL(?, '')");
    const counters = { berhasil: 0, dilewati: 0, gagal: 0, total: 0 };

    const importRows = db.transaction(() => {
      for (let rowNumber = startRow; rowNumber <= lastRow; rowNumber += 1) {
        const row = ws.getRow(rowNumber);
        const nama = get(row, 'nama').replace(/\s+/g, ' ').trim();
        if (!nama) continue;
        const headerLike = normalizeHeader(nama);
        if (['nama', 'nama lengkap', 'no', 'nomor'].includes(headerLike)) continue;
        if (nama.toLowerCase().startsWith('contoh:')) continue;
        counters.total += 1;
        try {
          const jenis = normalizeJenisPegawai(get(row, 'jenis_pegawai'));
          const nipRaw = get(row, 'nip');
          const nip = (nipRaw === '' || nipRaw === '-' || nipRaw === '—') ? null : nipRaw;
          let periodeTahun = get(row, 'periode_tahun');
          let periodeBulan = get(row, 'periode_bulan');
          const usul = get(row, 'usul_naik_pangkat');
          if (!periodeTahun && /^\d{4}$/.test(usul)) {
            periodeTahun = String(Number(usul) - 4);
            periodeBulan = periodeBulan || '1';
          }
          const tanggalLahir = getDate(row, 'tanggal_lahir');
          const duplicate = nip ? findNip.get(nip) : findName.get(nama, tanggalLahir);
          if (duplicate) {
            counters.dilewati += 1;
            continue;
          }
          insert.run(
            nama,
            normalizeGender(get(row, 'jenis_kelamin')),
            get(row, 'tempat_lahir') || null,
            tanggalLahir,
            jenis === 'PJLP' ? null : nip,
            jenis,
            jenis,
            get(row, 'jabatan') || null,
            get(row, 'agama') || null,
            get(row, 'pendidikan') || null,
            get(row, 'no_hp') || null,
            jenis === 'PJLP' ? null : (get(row, 'golongan') || null),
            /^\d{4}$/.test(periodeTahun) ? periodeTahun : null,
            /^\d{1,2}$/.test(periodeBulan) && Number(periodeBulan) >= 1 && Number(periodeBulan) <= 12 ? String(Number(periodeBulan)) : null
          );
          counters.berhasil += 1;
        } catch (err) {
          counters.gagal += 1;
        }
      }
    });
    importRows();

    if (!counters.total) {
      return res.status(400).json({ error: 'Tidak ada baris data pegawai yang dapat dibaca. Gunakan template terbaru.' });
    }
    log(req.user, 'Import Pegawai', `Import ${counters.berhasil} pegawai (${counters.dilewati} dilewati, ${counters.gagal} gagal)`);
    res.json({ ok: true, ...counters });
  } catch (err) {
    console.error('Import pegawai gagal:', err.message);
    return res.status(400).json({ error: 'Gagal membaca file Excel. Pastikan format file sesuai template.' });
  } finally {
    discardUpload(req.file);
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
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  console.error(err && err.message ? err.message : 'Request error');
  if (res.headersSent) return next(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Ukuran file maksimal 10 MB' });
  if (err && (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT')) {
    return res.status(400).json({ error: 'Berkas unggahan tidak sesuai.' });
  }
  if (err && err.message === 'Jenis file tidak diizinkan') return res.status(400).json({ error: err.message });
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return res.status(err.status || 400).json({ error: 'Permintaan tidak valid' });
  }
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});
const server = app.listen(PORT, () => console.log(`SMKN 2 Rantau TU running on :${PORT}`));
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} diterima. Menutup koneksi...`);
  server.close(() => {
    try { db.close(); } catch (err) { console.error('Gagal menutup database:', err.message); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
