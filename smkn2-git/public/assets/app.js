/* SITU SMKN 2 Rantau — frontend application */
(() => {
  'use strict';

  const TOKEN_KEY = 'token';
  const USER_KEY = 'user';
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    window.location.replace('/login.html');
    return;
  }

  const ROLE_LABEL = {
    admin: 'Administrator',
    kasubag: 'Kasubag TU',
    staff: 'Staff TU',
    kepsek: 'Kepala Sekolah',
    guru: 'Guru'
  };
  const PAGE_META = {
    dashboard: ['Ringkasan', 'Dashboard'],
    'surat-masuk': ['Administrasi', 'Surat masuk'],
    'surat-keluar': ['Administrasi', 'Surat keluar'],
    absensi: ['Kehadiran', 'Absensi'],
    pegawai: ['Kepegawaian', 'Data pegawai'],
    rekap: ['Pelaporan', 'Rekap'],
    laporan: ['Kinerja', 'Laporan bulanan'],
    pengguna: ['Akses', 'Akun pengguna'],
    log: ['Audit', 'Log aktivitas'],
    profil: ['Akun', 'Profil saya']
  };
  const PERMS = {
    suratRead: ['admin', 'kasubag', 'staff', 'kepsek'],
    suratWrite: ['admin', 'kasubag', 'staff'],
    pegawaiRead: ['admin', 'kasubag', 'staff', 'kepsek'],
    pegawaiWrite: ['admin', 'kasubag'],
    rekapRead: ['admin', 'kasubag', 'staff', 'kepsek'],
    logRead: ['admin', 'kasubag', 'kepsek'],
    userManage: ['admin', 'kasubag'],
    backup: ['admin', 'kasubag'],
    laporanNilai: ['admin', 'kasubag'],
    laporanUpload: ['admin', 'kasubag', 'staff', 'guru'],
    absenAll: ['admin', 'kasubag'],
    notifRead: ['admin', 'kasubag', 'kepsek']
  };
  const SECTION_PERMS = {
    dashboard: null,
    'surat-masuk': 'suratRead',
    'surat-keluar': 'suratRead',
    absensi: null,
    pegawai: 'pegawaiRead',
    rekap: 'rekapRead',
    laporan: null,
    pengguna: 'userManage',
    log: 'logRead',
    profil: null
  };

  let currentUser = readStoredUser();
  let role = currentUser.role || 'guru';

  const state = {
    suratMasuk: [],
    suratKeluar: [],
    pegawai: [],
    absensi: [],
    laporan: [],
    users: [],
    log: [],
    editingPegawai: null
  };

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const monthNow = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const today = localISO(now);

  const can = (perm) => !perm || (PERMS[perm] || []).includes(role);
  const sectionAllowed = (section) => can(SECTION_PERMS[section]);

  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function pad2(value) { return String(value).padStart(2, '0'); }
  function localISO(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatDate(value, fallback = '—') {
    if (!value) return fallback;
    const date = parseDateOnly(value);
    if (!date) return String(value);
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }
  function formatDateLong(value) {
    const date = parseDateOnly(value) || new Date();
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }
  function formatDateTime(value) {
    if (!value) return '—';
    const text = String(value);
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? text.replace(' ', 'T') + 'Z' : text;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return text;
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Makassar'
    }).format(date);
  }
  function initials(name) {
    const parts = String(name || 'Pengguna').trim().split(/\s+/).slice(0, 2);
    return parts.map(part => part.charAt(0).toUpperCase()).join('') || 'S';
  }
  function readStoredUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function debounce(fn, wait = 220) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /* ---------- HTTP ---------- */
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('x-auth-token', token);
    const response = await fetch(path, { ...options, headers });
    if (response.status === 401) {
      clearSession();
      throw new Error('Sesi berakhir. Silakan masuk kembali.');
    }
    return response;
  }
  async function apiJson(path, options = {}) {
    let response;
    try { response = await api(path, options); }
    catch (error) { throw error; }
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw new Error((data && data.error) || 'Permintaan tidak dapat diproses.');
    return data;
  }
  function jsonOptions(method, body) {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.replace('/login.html');
  }
  function handleError(error) {
    const message = error && error.message ? error.message : 'Terjadi kesalahan. Coba lagi.';
    toast(message, 'error');
  }
  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* sesi lokal tetap dibersihkan */ }
    clearSession();
  }

  /* ---------- Notifikasi kecil ---------- */
  function toast(message, type = 'success') {
    const stack = $('toast-stack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = `toast is-${type}`;
    node.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
    stack.appendChild(node);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    setTimeout(() => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 200);
    }, type === 'error' ? 5200 : 3200);
  }

  /* ---------- Modal ---------- */
  let confirmResolver = null;
  function modalHeader(title, kicker = '', description = '') {
    return `<div class="modal-head">
      <div>${kicker ? `<span class="kicker">${esc(kicker)}</span>` : ''}<h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div>
      <button class="icon-btn" type="button" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </div>`;
  }
  function openModal(content, options = {}) {
    const wrap = $('modal-wrap');
    const width = options.narrow ? ' is-narrow' : options.wide ? ' is-wide' : '';
    wrap.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
      <div class="modal${width}" role="dialog" aria-modal="true">${content}</div>
    </div>`;
    document.body.classList.add('modal-open');
    const focusable = wrap.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  }
  function closeModal(result = false) {
    const wrap = $('modal-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    document.body.classList.remove('modal-open');
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(result);
    }
  }
  function confirmAction({ title, message, confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal', danger = true }) {
    return new Promise((resolve) => {
      confirmResolver = resolve;
      openModal(`${modalHeader(title, 'Konfirmasi')}
        <div class="modal-body"><p class="small muted" style="line-height:1.65;">${esc(message)}</p></div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" data-action="close-modal">${esc(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn-danger' : ''}" type="button" data-action="modal-confirm">${esc(confirmLabel)}</button>
        </div>`, { narrow: true });
    });
  }

  /* ---------- Navigasi ---------- */
  function applyPermissions() {
    document.querySelectorAll('.nav a[data-section]').forEach(link => {
      link.classList.toggle('hidden', !sectionAllowed(link.dataset.section));
    });
    document.querySelectorAll('[data-perm]').forEach(node => {
      node.classList.toggle('hidden', !can(node.dataset.perm));
    });
    document.querySelectorAll('[data-school-only]').forEach(node => {
      node.classList.toggle('hidden', !can('suratRead'));
    });
    document.querySelectorAll('#user-role-baru option').forEach(option => {
      if (role !== 'admin' && ['admin', 'kepsek', 'kasubag'].includes(option.value)) option.hidden = true;
      else option.hidden = false;
    });
    if (role !== 'admin') {
      const roleSelect = $('user-role-baru');
      if (roleSelect && ['admin', 'kepsek', 'kasubag'].includes(roleSelect.value)) roleSelect.value = 'guru';
    }
    if (role === 'guru') {
      const executive = $('dash-kepsek');
      if (executive) executive.classList.add('hidden');
    }
  }

  function setIdentity() {
    $('user-nama').textContent = currentUser.nama || 'Pengguna';
    $('user-role').textContent = ROLE_LABEL[role] || role;
    $('user-initial').textContent = initials(currentUser.nama);
    $('today-date').textContent = formatDateLong(today);
    $('dash-date').textContent = formatDateLong(today);
    $('prof-nama').textContent = currentUser.nama || '—';
    $('prof-user').textContent = currentUser.username || '—';
    $('prof-role').textContent = ROLE_LABEL[role] || role;
    $('prof-role-text').textContent = ROLE_LABEL[role] || role;
    $('prof-initial').textContent = initials(currentUser.nama);
  }

  function closeSidebar() {
    $('sidebar').classList.remove('is-open');
    $('sidebar-scrim').classList.remove('is-open');
    $('menu-toggle').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  }
  function toggleSidebar() {
    const open = !$('sidebar').classList.contains('is-open');
    $('sidebar').classList.toggle('is-open', open);
    $('sidebar-scrim').classList.toggle('is-open', open);
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);
  }

  function navigate(section, updateHash = true) {
    const target = PAGE_META[section] ? section : 'dashboard';
    if (!sectionAllowed(target)) {
      toast('Anda tidak memiliki akses ke halaman tersebut.', 'error');
      return;
    }
    document.querySelectorAll('.page-section').forEach(node => {
      node.classList.toggle('hidden', node.id !== target);
    });
    document.querySelectorAll('.nav a[data-section]').forEach(link => {
      const active = link.dataset.section === target;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const meta = PAGE_META[target];
    $('page-kicker').textContent = meta[0];
    $('page-title').textContent = meta[1];
    document.title = `${meta[1]} · SITU SMK Negeri 2 Rantau`;
    if (updateHash && window.location.hash !== '#' + target) {
      history.replaceState(null, '', '#' + target);
    }
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'auto' });
    const loader = LOADERS[target];
    if (loader) loader().catch(handleError);
  }

  function togglePanel(id) {
    const panel = $(id);
    if (!panel) return;
    if (id === 'form-pg' && panel.classList.contains('hidden')) resetPegawaiForm();
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const first = panel.querySelector('input:not([type="hidden"]), select, textarea');
      if (first) setTimeout(() => first.focus(), 40);
    }
  }

  function emptyRow(colspan, title, description = '', iconName = 'inbox') {
    return `<tr><td colspan="${colspan}" class="td-empty">
      <div class="empty-state"><div class="empty-icon">${icon(iconName)}</div>
      <strong>${esc(title)}</strong>${description ? `<p>${esc(description)}</p>` : ''}</div>
    </td></tr>`;
  }
  function statusBadge(status) {
    const map = { Hadir: 'success', Izin: 'warning', Sakit: 'danger', 'Sudah Dinilai': 'success', 'Belum Dinilai': 'warning' };
    return `<span class="badge badge-${map[status] || 'neutral'}"><i class="status-dot"></i>${esc(status || '—')}</span>`;
  }
  function jenisBadge(jenis) {
    const map = { PNS: 'info', PPPK: 'emerald', PJLP: 'warning', 'Guru Non ASN': 'neutral' };
    return `<span class="badge badge-${map[jenis] || 'neutral'}">${esc(jenis || '—')}</span>`;
  }

  /* ---------- Unduhan ---------- */
  async function downloadProtected(path, fallbackName) {
    try {
      const response = await api(path);
      if (!response.ok) {
        let data = {};
        try { data = await response.json(); } catch { data = {}; }
        throw new Error(data.error || 'Unduhan gagal. Silakan masuk kembali.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : fallbackName;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { handleError(error); }
  }
  async function openProtected(filename) {
    try {
      const response = await api('/uploads/' + encodeURIComponent(filename));
      if (!response.ok) throw new Error('Berkas tidak dapat diakses.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener');
      if (!opened) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { handleError(error); }
  }

  /* ---------- Dashboard ---------- */
  async function listOrEmpty(path) {
    try {
      const data = await apiJson(path);
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  function notifMarkup(items, compact = false) {
    if (!items.length) return '';
    const rows = items.slice(0, compact ? 3 : 5).map((item) => {
      const days = Number(item.sisa_hari) || 0;
      const dayText = days < 0 ? `${Math.abs(days)} hari lalu` : days === 0 ? 'hari ini' : `${days} hari lagi`;
      return `<li><strong>${esc(item.nama)}</strong> — ${esc(formatDate(item.tanggal_naik_berikutnya))} <span class="muted">(${esc(dayText)})</span></li>`;
    }).join('');
    const more = items.length > (compact ? 3 : 5) ? `<li class="muted">dan ${items.length - (compact ? 3 : 5)} pegawai lainnya</li>` : '';
    return `<div class="notice">${icon('bell')}<div><strong>Pengingat kenaikan pangkat</strong><ul>${rows}${more}</ul></div></div>`;
  }

  async function loadDashboard() {
    const isGuru = role === 'guru';
    const [sm, sk, pg, absen] = await Promise.all([
      can('suratRead') ? listOrEmpty('/api/surat-masuk') : Promise.resolve([]),
      can('suratRead') ? listOrEmpty('/api/surat-keluar') : Promise.resolve([]),
      listOrEmpty('/api/pegawai'),
      listOrEmpty('/api/absensi')
    ]);

    const hadir = absen.filter(item => item.status === 'Hadir').length;
    const telat = absen.filter(item => Number(item.telat_menit) > 0).length;
    const total = pg.length;
    const percentage = total ? Math.min(100, Math.round(hadir / total * 100)) : 0;

    const setText = (id, value) => { const el = $(id); if (el) el.textContent = String(value); };
    setText('stat-sm', can('suratRead') ? sm.length : '—');
    setText('stat-sk', can('suratRead') ? sk.length : '—');
    setText('stat-hadir', hadir);
    setText('stat-telat', telat);
    setText('kp-guru', total);
    setText('kp-hadir', hadir);
    setText('kp-telat', telat);
    setText('kp-persen', percentage + '%');
    setText('dash-attendance-label', percentage + '%');

    const detail = $('dash-attendance-detail');
    if (detail) {
      detail.textContent = isGuru
        ? (hadir ? 'Anda tercatat hadir hari ini.' : 'Belum ada catatan kehadiran hari ini.')
        : (total ? `${hadir} dari ${total} pegawai tercatat hadir.` : 'Belum ada data pegawai.');
    }
    const progress = $('dash-attendance-progress');
    if (progress) progress.style.width = percentage + '%';
    const track = $('dash-attendance-track');
    if (track) track.setAttribute('aria-valuenow', String(percentage));

    const hour = new Date().getHours();
    const salutation = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
    const greeting = $('dash-greeting');
    if (greeting) greeting.textContent = `${salutation}, ${currentUser.nama || 'Pengguna'}.`;

    const notifWrap = $('notif-wrap');
    const kpNotif = $('kp-notif');
    if (can('notifRead')) {
      const notifs = await listOrEmpty('/api/pegawai/notifikasi');
      if (notifWrap) notifWrap.innerHTML = notifMarkup(notifs, false);
    } else if (notifWrap) {
      notifWrap.innerHTML = '';
    }
    if (kpNotif) kpNotif.innerHTML = '';
  }

  /* ---------- Surat masuk ---------- */
  function renderSM() {
    const body = $('list-sm');
    if (!body) return;
    const term = ($('search-sm').value || '').toLowerCase().trim();
    const rows = state.suratMasuk.filter(item => !term || [item.nomor, item.dari, item.perihal, item.tanggal]
      .some(value => String(value || '').toLowerCase().includes(term)));
    const count = $('count-sm');
    if (count) count.textContent = `${rows.length} surat`;
    if (!rows.length) {
      body.innerHTML = emptyRow(6, term ? 'Tidak ada surat yang cocok' : 'Belum ada surat masuk', term ? 'Coba kata kunci lain.' : 'Surat yang dicatat akan muncul di sini.');
      return;
    }
    body.innerHTML = rows.map((item) => {
      const actions = can('suratWrite')
        ? `<div class="row-actions">
            <button class="btn btn-secondary btn-small" type="button" data-action="edit-sm" data-id="${Number(item.id)}">${icon('edit')}Edit</button>
            <button class="btn btn-danger btn-small" type="button" data-action="delete-sm" data-id="${Number(item.id)}">${icon('trash')}Hapus</button>
          </div>`
        : '<span class="muted small">Hanya baca</span>';
      const archive = item.foto
        ? `<button class="btn btn-secondary btn-small" type="button" data-action="open-file" data-file="${esc(item.foto)}">${icon('eye')}Lihat</button>`
        : '<span class="muted">—</span>';
      return `<tr>
        <td class="cell-strong nowrap">${esc(item.nomor || '—')}</td>
        <td class="nowrap">${esc(formatDate(item.tanggal))}</td>
        <td>${esc(item.dari || '—')}</td>
        <td class="cell-wide">${esc(item.perihal || '—')}</td>
        <td>${archive}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  }

  async function loadSM() {
    state.suratMasuk = await apiJson('/api/surat-masuk');
    if (!Array.isArray(state.suratMasuk)) state.suratMasuk = [];
    renderSM();
  }

  async function submitSM(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      await apiJson('/api/surat-masuk', { method: 'POST', body: new FormData(form) });
      toast('Surat masuk berhasil disimpan.');
      form.reset();
      $('sm-tanggal').value = today;
      const panel = $('form-sm');
      if (panel) panel.classList.add('hidden');
      await loadSM();
      await loadDashboard();
    } catch (error) { handleError(error); }
    finally { if (button) button.disabled = false; }
  }

  function editSM(id) {
    const item = state.suratMasuk.find(row => Number(row.id) === Number(id));
    if (!item) return;
    openModal(`${modalHeader('Edit surat masuk', 'Administrasi')}
      <form id="modal-sm-form">
        <div class="modal-body">
          <div class="form-grid">
            <div class="field span-2"><label>Nomor surat</label><input name="nomor" value="${esc(item.nomor)}" required></div>
            <div class="field"><label>Tanggal</label><input name="tanggal" type="date" value="${esc(item.tanggal)}" required></div>
            <div class="field"><label>Asal surat</label><input name="dari" value="${esc(item.dari)}" required></div>
            <div class="field span-2"><label>Perihal</label><input name="perihal" value="${esc(item.perihal)}" required></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" data-action="close-modal">Batal</button>
          <button class="btn" type="submit">Simpan perubahan</button>
        </div>
      </form>`);
    $('modal-sm-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      try {
        await apiJson(`/api/surat-masuk/${Number(id)}`, jsonOptions('PUT', Object.fromEntries(new FormData(event.target).entries())));
        closeModal();
        toast('Surat masuk diperbarui.');
        await loadSM();
      } catch (error) { handleError(error); if (button) button.disabled = false; }
    });
  }

  async function deleteSM(id) {
    const item = state.suratMasuk.find(row => Number(row.id) === Number(id));
    const approved = await confirmAction({
      title: 'Hapus surat masuk?',
      message: `Surat ${item ? item.nomor : ''} akan dihapus beserta arsip pindaiannya. Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus surat'
    });
    if (!approved) return;
    try {
      await apiJson(`/api/surat-masuk/${Number(id)}`, { method: 'DELETE' });
      toast('Surat masuk dihapus.');
      await loadSM();
      await loadDashboard();
    } catch (error) { handleError(error); }
  }

  /* ---------- Surat keluar ---------- */
  const JENIS_LABEL = { '400.3.8': 'Surat umum', '800.1.11.1': 'Surat tugas' };
  let nomorRequest = 0;

  async function updateNomor() {
    const input = $('nomor-otomatis');
    if (!input) return;
    if (!can('suratWrite')) { input.value = '—'; return; }
    const jenis = $('jenis-surat').value;
    const tanggal = $('sk-tanggal').value || today;
    $('jenis-hidden').value = jenis;
    const request = ++nomorRequest;
    try {
      const data = await apiJson(`/api/surat-keluar/next-number?jenis=${encodeURIComponent(jenis)}&tahun=${encodeURIComponent(tanggal.slice(0, 4))}`);
      if (request === nomorRequest) input.value = data.nomor;
    } catch {
      if (request === nomorRequest) input.value = 'Nomor belum tersedia';
    }
  }

  function renderSK() {
    const body = $('list-sk');
    if (!body) return;
    const term = ($('search-sk').value || '').toLowerCase().trim();
    const rows = state.suratKeluar.filter(item => !term || [item.nomor, item.tujuan, item.perihal, item.tanggal]
      .some(value => String(value || '').toLowerCase().includes(term)));
    const count = $('count-sk');
    if (count) count.textContent = `${rows.length} surat`;
    if (!rows.length) {
      body.innerHTML = emptyRow(6, term ? 'Tidak ada surat yang cocok' : 'Belum ada surat keluar', term ? 'Coba kata kunci lain.' : 'Surat yang diterbitkan akan tercatat di sini.', 'send');
      return;
    }
    body.innerHTML = rows.map((item) => {
      const actions = `<div class="row-actions">
        <button class="btn btn-secondary btn-small" type="button" data-action="pdf-sk" data-id="${Number(item.id)}">${icon('download')}PDF</button>
        ${can('suratWrite') ? `<button class="btn btn-secondary btn-small" type="button" data-action="edit-sk" data-id="${Number(item.id)}">${icon('edit')}Edit</button>
        <button class="btn btn-danger btn-small" type="button" data-action="delete-sk" data-id="${Number(item.id)}">${icon('trash')}Hapus</button>` : ''}
      </div>`;
      return `<tr>
        <td class="cell-strong nowrap">${esc(item.nomor || '—')}</td>
        <td class="nowrap">${esc(formatDate(item.tanggal))}</td>
        <td>${esc(item.tujuan || '—')}</td>
        <td class="cell-wide">${esc(item.perihal || '—')}</td>
        <td><span class="badge badge-neutral">${esc(JENIS_LABEL[item.jenis] || item.jenis || '—')}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  }

  async function loadSK() {
    state.suratKeluar = await apiJson('/api/surat-keluar');
    if (!Array.isArray(state.suratKeluar)) state.suratKeluar = [];
    renderSK();
    await updateNomor();
  }

  async function submitSK(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      delete data.nomor;
      const result = await apiJson('/api/surat-keluar', jsonOptions('POST', data));
      toast(`Surat ${result.nomor} berhasil diterbitkan.`);
      form.reset();
      $('sk-tanggal').value = today;
      $('jenis-hidden').value = $('jenis-surat').value;
      const panel = $('form-sk');
      if (panel) panel.classList.add('hidden');
      await loadSK();
      await loadDashboard();
    } catch (error) { handleError(error); }
    finally { if (button) button.disabled = false; }
  }

  function editSK(id) {
    const item = state.suratKeluar.find(row => Number(row.id) === Number(id));
    if (!item) return;
    openModal(`${modalHeader('Edit surat keluar', 'Administrasi', 'Nomor surat tidak diubah agar urutan penomoran tetap konsisten.')}
      <form id="modal-sk-form">
        <div class="modal-body">
          <div class="form-grid">
            <div class="field span-2"><label>Nomor surat</label><input value="${esc(item.nomor)}" readonly></div>
            <div class="field"><label>Tanggal</label><input name="tanggal" type="date" value="${esc(item.tanggal)}" required></div>
            <div class="field"><label>Jenis</label><select name="jenis"><option value="400.3.8"${item.jenis === '400.3.8' ? ' selected' : ''}>Surat umum</option><option value="800.1.11.1"${item.jenis === '800.1.11.1' ? ' selected' : ''}>Surat tugas</option></select></div>
            <div class="field span-2"><label>Tujuan</label><input name="tujuan" value="${esc(item.tujuan)}" required></div>
            <div class="field span-2"><label>Perihal</label><input name="perihal" value="${esc(item.perihal)}" required></div>
            <div class="field span-2"><label>Isi surat</label><textarea name="isi" rows="5">${esc(item.isi)}</textarea></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" data-action="close-modal">Batal</button>
          <button class="btn" type="submit">Simpan perubahan</button>
        </div>
      </form>`, { wide: true });
    $('modal-sk-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      data.nomor = item.nomor;
      const button = event.target.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      try {
        await apiJson(`/api/surat-keluar/${Number(id)}`, jsonOptions('PUT', data));
        closeModal();
        toast('Surat keluar diperbarui.');
        await loadSK();
      } catch (error) { handleError(error); if (button) button.disabled = false; }
    });
  }

  async function deleteSK(id) {
    const item = state.suratKeluar.find(row => Number(row.id) === Number(id));
    const approved = await confirmAction({
      title: 'Hapus surat keluar?',
      message: `Surat ${item ? item.nomor : ''} akan dihapus dari daftar. Nomor surat tidak digunakan ulang.`,
      confirmLabel: 'Hapus surat'
    });
    if (!approved) return;
    try {
      await apiJson(`/api/surat-keluar/${Number(id)}`, { method: 'DELETE' });
      toast('Surat keluar dihapus.');
      await loadSK();
      await loadDashboard();
    } catch (error) { handleError(error); }
  }

  /* ---------- Kepegawaian ---------- */
  function nextPangkatInfo(person) {
    const jenis = person.jenis_pegawai || person.status;
    if (jenis !== 'PNS') return null;
    let last = null;
    if (person.periode_tahun && person.periode_bulan) {
      last = new Date(Number(person.periode_tahun), Number(person.periode_bulan) - 1, 1);
    } else {
      last = parseDateOnly(person.tanggal_pangkat_terakhir || person.tanggal_naik_pangkat || person.tanggal_mulai);
    }
    if (!last || Number.isNaN(last.getTime())) return null;
    const next = new Date(last);
    next.setFullYear(next.getFullYear() + 4);
    const base = parseDateOnly(today) || new Date();
    const days = Math.round((next - base) / 86400000);
    return { iso: localISO(next), days };
  }

  function renderPG() {
    const body = $('list-pg');
    if (!body) return;
    const term = ($('search-pg').value || '').toLowerCase().trim();
    const rows = state.pegawai.filter(person => !term || [person.nama, person.nip, person.jabatan, person.jenis_pegawai || person.status, person.pendidikan]
      .some(value => String(value || '').toLowerCase().includes(term)));
    const count = $('count-pg');
    if (count) count.textContent = `${rows.length} pegawai`;
    if (!rows.length) {
      body.innerHTML = emptyRow(7, term ? 'Tidak ada pegawai yang cocok' : 'Belum ada data pegawai', term ? 'Coba kata kunci lain.' : 'Tambahkan pegawai atau import dari Excel.', 'users');
      return;
    }
    body.innerHTML = rows.map((person) => {
      const jenis = person.jenis_pegawai || person.status || '—';
      const isPns = jenis === 'PNS';
      const next = nextPangkatInfo(person);
      let nextCell = '<span class="muted">—</span>';
      if (next) {
        const badge = next.days < 0
          ? '<span class="badge badge-danger">Terlewat</span>'
          : next.days <= 30
            ? '<span class="badge badge-warning">Segera</span>'
            : next.days <= 150
              ? '<span class="badge badge-gold">Dipantau</span>'
              : '';
        nextCell = `<span class="nowrap">${esc(formatDate(next.iso))}</span><span class="cell-sub">${next.days >= 0 ? next.days + ' hari lagi' : Math.abs(next.days) + ' hari lalu'} ${badge}</span>`;
      }
      const actions = can('pegawaiWrite')
        ? `<div class="row-actions">
            <button class="btn btn-secondary btn-small" type="button" data-action="edit-pg" data-id="${Number(person.id)}">${icon('edit')}Edit</button>
            <button class="btn btn-danger btn-small" type="button" data-action="delete-pg" data-id="${Number(person.id)}">${icon('trash')}Hapus</button>
          </div>`
        : '<span class="muted small">Hanya baca</span>';
      return `<tr>
        <td><span class="cell-strong">${esc(person.nama || '—')}</span><span class="cell-sub">${esc(person.jabatan || 'Jabatan belum diisi')}</span></td>
        <td class="nowrap">${isPns ? esc(person.nip || '—') : '<span class="muted">—</span>'}</td>
        <td class="nowrap">${isPns ? esc(person.golongan || '—') : '<span class="muted">—</span>'}</td>
        <td>${jenisBadge(jenis)}</td>
        <td>${esc(person.pendidikan || '—')}</td>
        <td>${nextCell}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  }

  async function loadPG() {
    state.pegawai = await apiJson('/api/pegawai');
    if (!Array.isArray(state.pegawai)) state.pegawai = [];
    renderPG();
  }

  function applyPegawaiRules() {
    const form = $('pg-form');
    if (!form) return;
    const jenis = $('jenis-pg').value;
    $('status-hidden').value = jenis;
    const locked = jenis !== 'PNS';
    ['nip', 'golongan', 'periode_tahun', 'periode_bulan', 'tanggal_pangkat_terakhir'].forEach((name) => {
      const field = form.elements.namedItem(name);
      if (field) field.disabled = locked;
    });
  }

  function resetPegawaiForm() {
    state.editingPegawai = null;
    const form = $('pg-form');
    if (!form) return;
    form.reset();
    $('pg-form-title').textContent = 'Tambah pegawai';
    $('pg-submit').textContent = 'Simpan pegawai';
    $('jenis-pg').value = 'PNS';
    applyPegawaiRules();
  }

  function editPG(id) {
    const person = state.pegawai.find(row => Number(row.id) === Number(id));
    if (!person) return;
    const form = $('pg-form');
    form.reset();
    const values = {
      nama: person.nama, jenis_kelamin: person.jenis_kelamin, tempat_lahir: person.tempat_lahir,
      tanggal_lahir: person.tanggal_lahir, jenis_pegawai: person.jenis_pegawai || person.status || 'PNS',
      nip: person.nip, golongan: person.golongan, jabatan: person.jabatan, agama: person.agama,
      pendidikan: person.pendidikan, no_hp: person.no_hp, alamat: person.alamat,
      periode_tahun: person.periode_tahun, periode_bulan: person.periode_bulan,
      tanggal_mulai: person.tanggal_mulai, tanggal_pangkat_terakhir: person.tanggal_pangkat_terakhir
    };
    Object.entries(values).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field && value !== null && value !== undefined) field.value = String(value);
    });
    state.editingPegawai = Number(id);
    $('pg-form-title').textContent = 'Edit data pegawai';
    $('pg-submit').textContent = 'Simpan perubahan';
    applyPegawaiRules();
    const panel = $('form-pg');
    panel.classList.remove('hidden');
    setTimeout(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('pg-nama').focus();
    }, 60);
  }

  async function submitPG(event) {
    event.preventDefault();
    const form = event.target;
    const button = $('pg-submit');
    if (button) button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      if (state.editingPegawai) {
        await apiJson(`/api/pegawai/${state.editingPegawai}`, jsonOptions('PUT', data));
        toast('Data pegawai diperbarui.');
      } else {
        await apiJson('/api/pegawai', jsonOptions('POST', data));
        toast('Pegawai berhasil ditambahkan.');
      }
      resetPegawaiForm();
      $('form-pg').classList.add('hidden');
      await loadPG();
      await loadNotifikasi();
      await loadDashboard();
    } catch (error) { handleError(error); }
    finally { if (button) button.disabled = false; }
  }

  async function deletePG(id) {
    const person = state.pegawai.find(row => Number(row.id) === Number(id));
    const approved = await confirmAction({
      title: 'Hapus data pegawai?',
      message: `Data ${person ? person.nama : 'pegawai ini'}, absensi, dan laporan yang terkait akan dihapus. Akun login yang terhubung akan dilepas. Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus pegawai'
    });
    if (!approved) return;
    try {
      const result = await apiJson(`/api/pegawai/${Number(id)}`, { method: 'DELETE' });
      toast(`Pegawai dihapus${result.laporan_dihapus ? ` beserta ${result.laporan_dihapus} laporan` : ''}.`);
      await loadPG();
      await loadNotifikasi();
      await loadDashboard();
    } catch (error) { handleError(error); }
  }

  function renderNotifPegawai(items) {
    const target = $('notif-pegawai');
    if (!target) return;
    target.innerHTML = items.length ? notifMarkup(items, false) : '';
  }

  async function loadNotifikasi() {
    if (!can('notifRead')) { renderNotifPegawai([]); return; }
    const items = await apiJson('/api/pegawai/notifikasi');
    renderNotifPegawai(Array.isArray(items) ? items : []);
  }

  async function submitImport(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const result = await apiJson('/api/pegawai/import', { method: 'POST', body: new FormData(form) });
      const skipped = Number(result.dilewati || 0);
      const failed = Number(result.gagal || 0);
      toast(`Import selesai: ${result.berhasil || 0} ditambahkan${skipped ? `, ${skipped} dilewati` : ''}${failed ? `, ${failed} gagal` : ''}.`);
      form.reset();
      $('form-import').classList.add('hidden');
      await loadPG();
      await loadNotifikasi();
      await loadDashboard();
    } catch (error) { handleError(error); }
    finally { if (button) button.disabled = false; }
  }

  /* ---------- Absensi ---------- */
  let absenLoading = false;

  async function loadAbsen() {
    if (absenLoading) return;
    absenLoading = true;
    try {
      const dateInput = $('absen-date-input');
      const date = dateInput.value || today;
      const [pegawai, absensi] = await Promise.all([
        apiJson('/api/pegawai'),
        apiJson(`/api/absensi?tanggal=${encodeURIComponent(date)}`)
      ]);
      state.pegawai = Array.isArray(pegawai) ? pegawai : [];
      state.absensi = Array.isArray(absensi) ? absensi : [];
      const recorded = new Map(state.absensi.map(row => [Number(row.pegawai_id), row]));
      const hadir = state.absensi.filter(row => row.status === 'Hadir').length;
      const telat = state.absensi.filter(row => Number(row.telat_menit) > 0).length;
      const belum = Math.max(0, state.pegawai.length - recorded.size);
      $('absen-date').textContent = formatDate(date);
      $('absen-chip-hadir').textContent = String(hadir);
      $('absen-chip-telat').textContent = String(telat);
      $('absen-chip-belum').textContent = String(belum);
      const isToday = date === today;
      $('absen-caption').textContent = isToday
        ? 'Absensi hari ini. Tombol aktif tersedia pada pegawai yang belum tercatat.'
        : `Arsip kehadiran ${formatDate(date)}. Hanya dapat dilihat.`;

      const body = $('list-absen');
      if (!state.pegawai.length) {
        body.innerHTML = emptyRow(5, 'Belum ada data pegawai', 'Absensi memerlukan data pegawai yang terhubung.', 'users');
        return;
      }
      const canRecordAll = can('absenAll');
      const ownId = Number(currentUser.pegawai_id || 0);
      body.innerHTML = state.pegawai.map((person) => {
        const row = recorded.get(Number(person.id));
        const isOwn = ownId && Number(person.id) === ownId;
        const canSelfRecord = ['guru', 'staff', 'kepsek'].includes(role) && isOwn;
        const canAct = isToday && !row && (canRecordAll || canSelfRecord);
        let actions = '<span class="muted small">—</span>';
        if (canAct) {
          actions = `<div class="row-actions">
            <button class="btn btn-emerald btn-small" type="button" data-action="absen" data-id="${Number(person.id)}" data-status="Hadir">Hadir</button>
            <button class="btn btn-secondary btn-small" type="button" data-action="absen" data-id="${Number(person.id)}" data-status="Izin">Izin</button>
            <button class="btn btn-secondary btn-small" type="button" data-action="absen" data-id="${Number(person.id)}" data-status="Sakit">Sakit</button>
          </div>`;
        } else if (row) {
          actions = '<span class="badge badge-neutral">Tercatat</span>';
        } else if (!isToday) {
          actions = '<span class="muted small">Arsip</span>';
        }
        return `<tr>
          <td><span class="cell-strong">${esc(person.nama || '—')}</span>${isOwn ? '<span class="cell-sub">Akun Anda</span>' : `<span class="cell-sub">${esc(person.jabatan || '')}</span>`}</td>
          <td>${row ? statusBadge(row.status) : '<span class="badge badge-neutral">Belum tercatat</span>'}</td>
          <td class="nowrap mono">${row ? esc(row.jam || '—') : '—'}</td>
          <td>${row ? esc(row.keterangan || (Number(row.telat_menit) > 0 ? `Terlambat ${row.telat_menit} menit` : '—')) : '—'}</td>
          <td>${actions}</td>
        </tr>`;
      }).join('');
    } catch (error) { handleError(error); }
    finally { absenLoading = false; }
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Browser tidak mendukung layanan lokasi.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        error => {
          const message = error.code === 1
            ? 'Izin lokasi ditolak. Aktifkan akses lokasi untuk absensi hadir.'
            : 'Lokasi belum tersedia. Coba lagi di area terbuka.';
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function postAbsen(pegawaiId, status, keterangan = '') {
    const body = { pegawai_id: Number(pegawaiId), status };
    if (keterangan) body.keterangan = keterangan;
    if (status === 'Hadir') {
      const position = await getPosition();
      body.lat = position.lat;
      body.lng = position.lng;
    }
    const result = await apiJson('/api/absensi', jsonOptions('POST', body));
    const telat = Number(result.telat || 0);
    toast(telat ? `Absensi hadir tercatat pukul ${result.jam}, terlambat ${telat} menit.` : `Absensi ${status.toLowerCase()} tercatat pukul ${result.jam}.`);
    await loadAbsen();
    await loadDashboard();
  }

  async function handleAbsen(button) {
    const id = Number(button.dataset.id);
    const status = button.dataset.status;
    if (($('absen-date-input').value || today) !== today) {
      toast('Absensi hanya dapat dicatat untuk hari ini.', 'error');
      return;
    }
    if (status === 'Hadir') {
      button.disabled = true;
      try { await postAbsen(id, status); }
      catch (error) { handleError(error); }
      finally { button.disabled = false; }
      return;
    }
    const person = state.pegawai.find(row => Number(row.id) === id);
    openModal(`${modalHeader(`Catat ${status.toLowerCase()}`, 'Absensi', person ? person.nama : '')}
      <form id="absen-note-form">
        <div class="modal-body">
          <div class="field"><label for="absen-note">Keterangan <span class="required">*</span></label><textarea id="absen-note" name="keterangan" rows="3" required placeholder="Contoh: izin keperluan keluarga / surat dokter"></textarea></div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" data-action="close-modal">Batal</button>
          <button class="btn" type="submit">Simpan absensi</button>
        </div>
      </form>`, { narrow: true });
    $('absen-note-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const note = new FormData(event.target).get('keterangan');
      const submit = event.target.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await postAbsen(id, status, String(note || '').trim());
        closeModal();
      } catch (error) { handleError(error); if (submit) submit.disabled = false; }
    });
  }

  /* ---------- Rekap ---------- */
  function switchRekap(tab) {
    ['absen', 'surat', 'pegawai'].forEach((name) => {
      const panel = $('rekap-' + name);
      const button = $('tab-' + name);
      if (panel) panel.classList.toggle('hidden', name !== tab);
      if (button) {
        button.classList.toggle('is-active', name === tab);
        button.setAttribute('aria-selected', String(name === tab));
      }
    });
    if (tab === 'absen') loadRekap().catch(handleError);
    if (tab === 'surat') loadRekapSurat().catch(handleError);
    if (tab === 'pegawai') loadRekapPegawai().catch(handleError);
  }

  async function loadRekap() {
    if (!can('rekapRead')) return;
    const bulan = $('bulan').value || monthNow;
    const rows = await apiJson('/api/absensi/rekap?bulan=' + encodeURIComponent(bulan));
    const body = $('list-rekap');
    if (!Array.isArray(rows) || !rows.length) {
      body.innerHTML = emptyRow(7, 'Belum ada data absensi', 'Pilih bulan lain atau catat absensi terlebih dahulu.');
      return;
    }
    body.innerHTML = rows.map(row => `<tr>
      <td class="cell-strong">${esc(row.nama || '—')}</td>
      <td class="mono">${Number(row.hadir || 0)}</td>
      <td class="mono">${Number(row.telat || 0)}</td>
      <td class="mono">${Number(row.total_telat || 0)} mnt</td>
      <td class="mono">${Number(row.izin || 0)}</td>
      <td class="mono">${Number(row.sakit || 0)}</td>
      <td class="small">${esc(row.keterangan || '—')}</td>
    </tr>`).join('');
  }

  async function loadRekapSurat() {
    if (!can('rekapRead')) return;
    const bulan = $('bulan-surat').value || monthNow;
    const data = await apiJson('/api/rekap/surat?bulan=' + encodeURIComponent(bulan));
    $('rk-sm-total').textContent = String(data.totalMasuk || 0);
    $('rk-sk-total').textContent = String(data.totalKeluar || 0);
    const masuk = Array.isArray(data.masukRinci) ? data.masukRinci : [];
    const keluar = Array.isArray(data.keluarRinci) ? data.keluarRinci : [];
    $('list-rk-sm').innerHTML = masuk.length
      ? masuk.map(row => `<tr><td class="cell-strong">${esc(row.dari || '—')}</td><td class="mono">${Number(row.total || 0)}</td><td>${esc(row.perihal || '—')}</td></tr>`).join('')
      : emptyRow(3, 'Tidak ada surat masuk', 'Belum ada surat masuk pada bulan ini.');
    $('list-rk-sk').innerHTML = keluar.length
      ? keluar.map(row => `<tr><td class="cell-strong">${esc(row.tujuan || '—')}</td><td class="mono">${Number(row.total || 0)}</td><td>${esc(row.perihal || '—')}</td></tr>`).join('')
      : emptyRow(3, 'Tidak ada surat keluar', 'Belum ada surat keluar pada bulan ini.', 'send');
  }

  async function loadRekapPegawai() {
    if (!can('rekapRead')) return;
    const data = await apiJson('/api/rekap/pegawai');
    const counts = { PNS: 0, PPPK: 0, 'Guru Non ASN': 0, PJLP: 0, Honorer: 0 };
    (data.perStatus || []).forEach(row => {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status] = Number(row.c || 0);
    });
    $('rk-pg-total').textContent = String(data.total || 0);
    $('rk-pg-pns').textContent = String(counts.PNS);
    $('rk-pg-pppk').textContent = String(counts.PPPK);
    $('rk-pg-honorer').textContent = String(counts['Guru Non ASN'] || counts.Honorer || 0);
    $('rk-pg-pjlp').textContent = String(counts.PJLP);
    const semua = Array.isArray(data.semua) ? data.semua : [];
    $('list-rk-pg').innerHTML = semua.length
      ? semua.map(row => {
        const jenis = row.jenis || row.status || '—';
        const info = nextPangkatInfo(row);
        return `<tr>
          <td class="cell-strong">${esc(row.nama || '—')}</td>
          <td>${esc(row.jenis_kelamin || '—')}</td>
          <td class="nowrap">${jenis === 'PNS' ? esc(row.nip || '—') : '<span class="muted">—</span>'}</td>
          <td>${jenis === 'PNS' ? esc(row.golongan || '—') : '<span class="muted">—</span>'}</td>
          <td>${esc(row.jabatan || '—')}</td>
          <td>${jenisBadge(jenis)}</td>
          <td>${esc(row.pendidikan || '—')}</td>
          <td class="nowrap">${esc(row.no_hp || '—')}</td>
          <td class="nowrap">${info ? esc(formatDate(info.iso)) : '—'}</td>
        </tr>`;
      }).join('')
      : emptyRow(9, 'Belum ada data pegawai', 'Tambahkan data pegawai terlebih dahulu.', 'users');
  }

  /* ---------- Laporan bulanan ---------- */
  let divisiList = [];

  async function loadDivisi() {
    const data = await apiJson('/api/divisi');
    divisiList = Array.isArray(data) ? data : [];
    const select = $('lap-divisi');
    select.innerHTML = divisiList.map(item => `<option>${esc(item)}</option>`).join('');
  }

  async function loadPegawaiLap() {
    const data = await apiJson('/api/pegawai');
    const people = Array.isArray(data) ? data : [];
    const select = $('lap-pegawai');
    const restricted = !['admin', 'kasubag'].includes(role);
    const list = restricted
      ? people.filter(person => Number(person.id) === Number(currentUser.pegawai_id || 0))
      : people;
    select.innerHTML = list.length
      ? list.map(person => `<option value="${Number(person.id)}">${esc(person.nama)}</option>`).join('')
      : '<option value="">— Akun belum terhubung ke data pegawai —</option>';
    const monthInput = $('lap-bulan');
    if (!monthInput.value) monthInput.value = $('bulan-lap').value || monthNow;
  }

  function renderLaporan() {
    const body = $('list-laporan');
    if (!body) return;
    const count = $('count-laporan');
    if (count) count.textContent = `${state.laporan.length} laporan`;
    if (!state.laporan.length) {
      body.innerHTML = emptyRow(7, 'Belum ada laporan bulan ini', 'Laporan yang dikirim akan tampil di sini.', 'file');
      return;
    }
    const canGrade = can('laporanNilai');
    body.innerHTML = state.laporan.map((item) => {
      const evidence = [
        item.foto ? `<button class="btn btn-secondary btn-small" type="button" data-action="open-file" data-file="${esc(item.foto)}">${icon('eye')}Foto</button>` : '',
        item.file_laporan ? `<button class="btn btn-secondary btn-small" type="button" data-action="open-file" data-file="${esc(item.file_laporan)}">${icon('download')}Berkas</button>` : ''
      ].filter(Boolean).join(' ');
      const grading = canGrade
        ? `<div style="display:flex;flex-direction:column;gap:5px;min-width:148px;">
             <input id="nilai-${Number(item.id)}" value="${esc(item.nilai || '')}" placeholder="Nilai, mis. A" aria-label="Nilai ${esc(item.nama)}" style="min-height:31px;padding:5px 8px;font-size:11px;">
             <input id="kom-${Number(item.id)}" value="${esc(item.komentar_kasubag || '')}" placeholder="Komentar" aria-label="Komentar ${esc(item.nama)}" style="min-height:31px;padding:5px 8px;font-size:11px;">
             <button class="btn btn-secondary btn-small" type="button" data-action="save-nilai" data-id="${Number(item.id)}">Simpan nilai</button>
           </div>`
        : `<span class="small"><strong>${esc(item.nilai || '—')}</strong>${item.komentar_kasubag ? `<span class="cell-sub">${esc(item.komentar_kasubag)}</span>` : ''}</span>`;
      return `<tr>
        <td><span class="cell-strong">${esc(item.nama || '—')}</span></td>
        <td>${esc(item.divisi || '—')}</td>
        <td class="cell-wide cell-pre">${esc(item.kegiatan || '—')}</td>
        <td class="small">Target: ${esc(item.target || '—')}<br>Realisasi: ${esc(item.realisasi || '—')}${item.kendala ? `<span class="cell-sub" style="color:var(--warning)">Kendala: ${esc(item.kendala)}</span>` : ''}</td>
        <td><div class="row-actions">${evidence || '<span class="muted">—</span>'}</div></td>
        <td>${statusBadge(item.status || 'Belum Dinilai')}</td>
        <td>${grading}</td>
      </tr>`;
    }).join('');
  }

  async function loadLaporan() {
    const bulan = $('bulan-lap').value || monthNow;
    const rows = await apiJson('/api/laporan?bulan=' + encodeURIComponent(bulan));
    state.laporan = Array.isArray(rows) ? rows : [];
    renderLaporan();
    const rekapCard = $('rekap-lap-card');
    if (!can('rekapRead')) {
      if (rekapCard) rekapCard.classList.add('hidden');
      return;
    }
    if (rekapCard) rekapCard.classList.remove('hidden');
    const rekap = await apiJson('/api/laporan/rekap?bulan=' + encodeURIComponent(bulan));
    const divisi = Array.isArray(rekap.rekapDivisi) ? rekap.rekapDivisi : [];
    $('list-rekap-lap').innerHTML = divisi.length
      ? divisi.map(row => `<tr>
          <td class="cell-strong">${esc(row.divisi || '—')}</td>
          <td class="mono">${Number(row.total_laporan || 0)}</td>
          <td class="mono">${Number(row.sudah_dinilai || 0)}</td>
          <td class="mono">${Number(row.belum_dinilai || 0)}</td>
        </tr>`).join('')
      : emptyRow(4, 'Belum ada laporan', 'Belum ada laporan pada bulan ini.');
  }

  async function submitLaporan(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const formData = new FormData(form);
      if (!formData.get('pegawai_id')) throw new Error('Akun Anda belum terhubung ke data pegawai. Hubungi administrator.');
      await apiJson('/api/laporan', { method: 'POST', body: formData });
      toast('Laporan berhasil disimpan.');
      form.reset();
      $('lap-bulan').value = $('bulan-lap').value || monthNow;
      $('form-lap').classList.add('hidden');
      await loadPegawaiLap();
      await loadLaporan();
    } catch (error) { handleError(error); }
    finally { if (button) button.disabled = false; }
  }

  async function saveNilai(id) {
    const nilaiInput = $('nilai-' + id);
    const komentarInput = $('kom-' + id);
    const nilai = (nilaiInput.value || '').trim();
    if (!nilai) { toast('Nilai wajib diisi sebelum disimpan.', 'error'); nilaiInput.focus(); return; }
    try {
      await apiJson(`/api/laporan/${Number(id)}/nilai`, jsonOptions('PUT', {
        nilai,
        komentar_kasubag: (komentarInput.value || '').trim()
      }));
      toast('Penilaian laporan tersimpan.');
      await loadLaporan();
    } catch (error) { handleError(error); }
  }

  /* ---------- Pengguna ---------- */
  async function loadUsers() {
    if (!can('userManage')) return;
    const [users, pegawai] = await Promise.all([apiJson('/api/users'), apiJson('/api/pegawai')]);
    state.users = Array.isArray(users) ? users : [];
    const people = Array.isArray(pegawai) ? pegawai : [];
    $('user-pegawai').innerHTML = '<option value="">— Tidak dihubungkan —</option>' +
      people.map(person => `<option value="${Number(person.id)}">${esc(person.nama)}${person.nip ? ` — ${esc(person.nip)}` : ''}</option>`).join('');
    $('count-users').textContent = `${state.users.length} akun`;
    $('list-users').innerHTML = state.users.length
      ? state.users.map(user => `<tr>
          <td class="cell-strong">${esc(user.username)}</td>
          <td>${esc(user.nama || '—')}</td>
          <td>${jenisBadge(ROLE_LABEL[user.role] || user.role)}</td>
          <td><div class="row-actions">
            <button class="btn btn-secondary btn-small" type="button" data-action="reset-user" data-id="${Number(user.id)}" data-name="${esc(user.username)}">${icon('key')}Reset sandi</button>
            <button class="btn btn-danger btn-small" type="button" data-action="delete-user" data-id="${Number(user.id)}" data-name="${esc(user.username)}">${icon('trash')}Hapus</button>
          </div></td>
        </tr>`).join('')
      : emptyRow(4, 'Belum ada akun', 'Buat akun untuk guru dan staf tata usaha.', 'key');
  }

  async function submitUser(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.pegawai_id) data.pegawai_id = null;
      await apiJson('/api/users', jsonOptions('POST', data));
      toast('Akun berhasil dibuat. Sampaikan kata sandi secara langsung kepada pengguna.');
      form.reset();
      $('form-user').classList.add('hidden');
      await loadUsers();
    } catch (error) { handleError(error); }
    finally { if (button) button.disabled = false; }
  }

  function resetUserPassword(id, username) {
    openModal(`${modalHeader('Reset kata sandi', 'Akun pengguna', `Akun: ${username}`)}
      <form id="reset-password-form">
        <div class="modal-body">
          <div class="field"><label for="reset-password">Kata sandi baru</label><input id="reset-password" name="password" type="password" minlength="12" required autocomplete="new-password" placeholder="Minimal 12 karakter"></div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" data-action="close-modal">Batal</button>
          <button class="btn" type="submit">Simpan kata sandi</button>
        </div>
      </form>`, { narrow: true });
    $('reset-password-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = String(new FormData(event.target).get('password') || '');
      const button = event.target.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      try {
        await apiJson(`/api/users/${Number(id)}/reset-password`, jsonOptions('PUT', { password }));
        closeModal();
        toast('Kata sandi berhasil direset.');
      } catch (error) { handleError(error); if (button) button.disabled = false; }
    });
  }

  async function deleteUser(id, username) {
    const approved = await confirmAction({
      title: 'Hapus akun pengguna?',
      message: `Akun ${username} tidak akan bisa masuk lagi. Data pegawai yang terhubung tidak ikut dihapus.`,
      confirmLabel: 'Hapus akun'
    });
    if (!approved) return;
    try {
      await apiJson(`/api/users/${Number(id)}`, { method: 'DELETE' });
      toast('Akun pengguna dihapus.');
      await loadUsers();
    } catch (error) { handleError(error); }
  }

  /* ---------- Log aktivitas ---------- */
  function renderLog() {
    const body = $('list-log');
    if (!body) return;
    const term = ($('search-log').value || '').toLowerCase().trim();
    const rows = state.log.filter(item => !term || [item.nama, item.username, item.aksi, item.detail, item.role]
      .some(value => String(value || '').toLowerCase().includes(term)));
    $('count-log').textContent = `${rows.length} catatan`;
    if (!rows.length) {
      body.innerHTML = emptyRow(5, term ? 'Tidak ada catatan yang cocok' : 'Belum ada aktivitas', term ? 'Coba kata kunci lain.' : 'Aktivitas pengguna akan tercatat otomatis.', 'activity');
      return;
    }
    body.innerHTML = rows.map(item => `<tr>
      <td class="nowrap small">${esc(formatDateTime(item.created_at))}</td>
      <td class="cell-strong">${esc(item.nama || item.username || '—')}</td>
      <td><span class="badge badge-neutral">${esc(ROLE_LABEL[item.role] || item.role || '—')}</span></td>
      <td>${esc(item.aksi || '—')}</td>
      <td class="small">${esc(item.detail || '—')}</td>
    </tr>`).join('');
  }

  async function loadLog() {
    if (!can('logRead')) return;
    const data = await apiJson('/api/log');
    state.log = Array.isArray(data) ? data : [];
    renderLog();
  }

  /* ---------- Profil ---------- */
  function loadProfil() {
    $('prof-nama').textContent = currentUser.nama || '—';
    $('prof-user').textContent = currentUser.username || '—';
    $('prof-role').textContent = ROLE_LABEL[role] || role;
    $('prof-role-text').textContent = ROLE_LABEL[role] || role;
    $('prof-initial').textContent = initials(currentUser.nama);
  }

  async function submitPassword(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.baru !== data.konfirmasi) {
      toast('Konfirmasi kata sandi tidak sama.', 'error');
      return;
    }
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      await apiJson('/api/ganti-password', jsonOptions('POST', { lama: data.lama, baru: data.baru }));
      window.alert('Kata sandi berhasil diperbarui. Silakan masuk kembali menggunakan kata sandi baru.');
      clearSession();
    } catch (error) { handleError(error); }
    finally { if (button) button.disabled = false; }
  }

  /* ---------- Aksi terdelegasi ---------- */
  function handleAction(button) {
    const action = button.dataset.action;
    if (!action) return;
    switch (action) {
      case 'navigate': navigate(button.dataset.target); break;
      case 'toggle': togglePanel(button.dataset.target); break;
      case 'close-modal': closeModal(false); break;
      case 'modal-confirm': closeModal(true); break;
      case 'logout': logout(); break;
      case 'template': downloadProtected('/api/pegawai/template', 'template-pegawai.xlsx'); break;
      case 'backup': downloadProtected('/api/backup', 'backup-smkn2.zip'); break;
      case 'export-absen': downloadProtected('/api/absensi/rekap/excel?bulan=' + encodeURIComponent($('bulan').value || monthNow), `rekap-absensi-${$('bulan').value || monthNow}.xlsx`); break;
      case 'export-surat': downloadProtected('/api/rekap/surat/excel?bulan=' + encodeURIComponent($('bulan-surat').value || monthNow), `rekap-surat-${$('bulan-surat').value || monthNow}.xlsx`); break;
      case 'export-pegawai': downloadProtected('/api/rekap/pegawai/excel', 'rekap-pegawai.xlsx'); break;
      case 'refresh-absen': loadAbsen().catch(handleError); break;
      case 'refresh-rekap-pegawai': loadRekapPegawai().catch(handleError); break;
      case 'reset-pegawai': resetPegawaiForm(); $('form-pg').classList.add('hidden'); break;
      case 'edit-sm': editSM(button.dataset.id); break;
      case 'delete-sm': deleteSM(button.dataset.id); break;
      case 'edit-sk': editSK(button.dataset.id); break;
      case 'delete-sk': deleteSK(button.dataset.id); break;
      case 'pdf-sk': downloadProtected(`/api/surat-keluar/${Number(button.dataset.id)}/pdf`, `surat-${button.dataset.id}.pdf`); break;
      case 'edit-pg': editPG(button.dataset.id); break;
      case 'delete-pg': deletePG(button.dataset.id); break;
      case 'open-file': openProtected(button.dataset.file); break;
      case 'absen': handleAbsen(button); break;
      case 'save-nilai': saveNilai(button.dataset.id); break;
      case 'reset-user': resetUserPassword(button.dataset.id, button.dataset.name); break;
      case 'delete-user': deleteUser(button.dataset.id, button.dataset.name); break;
      default: break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const navLink = event.target.closest('.nav a[data-section]');
      if (navLink) {
        event.preventDefault();
        navigate(navLink.dataset.section);
        return;
      }
      const rekapButton = event.target.closest('[data-rekap]');
      if (rekapButton) {
        switchRekap(rekapButton.dataset.rekap);
        return;
      }
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        event.preventDefault();
        handleAction(actionButton);
        return;
      }
      if (event.target.matches('[data-modal-backdrop]')) closeModal(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && $('modal-wrap').innerHTML) closeModal(false);
    });

    $('menu-toggle').addEventListener('click', toggleSidebar);
    $('sidebar-scrim').addEventListener('click', closeSidebar);
    window.addEventListener('hashchange', () => {
      const section = window.location.hash.replace('#', '');
      navigate(section || 'dashboard', false);
    });

    $('sm-form').addEventListener('submit', submitSM);
    $('sk-form').addEventListener('submit', submitSK);
    $('pg-form').addEventListener('submit', submitPG);
    $('import-form').addEventListener('submit', submitImport);
    $('lap-form').addEventListener('submit', submitLaporan);
    $('user-form').addEventListener('submit', submitUser);
    $('password-form').addEventListener('submit', submitPassword);

    $('jenis-pg').addEventListener('change', applyPegawaiRules);
    $('jenis-surat').addEventListener('change', () => {
      $('jenis-hidden').value = $('jenis-surat').value;
      updateNomor();
    });
    $('sk-tanggal').addEventListener('change', updateNomor);
    $('sk-tanggal').addEventListener('input', debounce(updateNomor, 250));
    $('absen-date-input').addEventListener('change', () => loadAbsen().catch(handleError));

    $('search-sm').addEventListener('input', renderSM);
    $('search-sk').addEventListener('input', renderSK);
    $('search-pg').addEventListener('input', renderPG);
    $('search-log').addEventListener('input', renderLog);

    $('bulan').addEventListener('change', () => loadRekap().catch(handleError));
    $('bulan-surat').addEventListener('change', () => loadRekapSurat().catch(handleError));
    $('bulan-lap').addEventListener('change', () => loadLaporan().catch(handleError));
  }

  function initDefaults() {
    $('sm-tanggal').value = today;
    $('sk-tanggal').value = today;
    $('absen-date-input').value = today;
    $('bulan').value = monthNow;
    $('bulan-surat').value = monthNow;
    $('bulan-lap').value = monthNow;
    $('lap-bulan').value = monthNow;
    $('jenis-hidden').value = $('jenis-surat').value;
    applyPegawaiRules();
  }

  const LOADERS = {
    dashboard: loadDashboard,
    'surat-masuk': loadSM,
    'surat-keluar': loadSK,
    absensi: loadAbsen,
    pegawai: async () => { await loadPG(); await loadNotifikasi(); },
    rekap: async () => {
      const active = document.querySelector('[data-rekap].is-active');
      switchRekap(active ? active.dataset.rekap : 'absen');
    },
    laporan: async () => { await loadDivisi(); await loadPegawaiLap(); await loadLaporan(); },
    pengguna: loadUsers,
    log: loadLog,
    profil: async () => loadProfil()
  };

  async function init() {
    try {
      const me = await apiJson('/api/me');
      currentUser = me;
      role = me.role || 'guru';
      localStorage.setItem(USER_KEY, JSON.stringify(me));
    } catch (error) {
      handleError(error);
      return;
    }
    setIdentity();
    applyPermissions();
    initDefaults();
    bindEvents();
    const initial = window.location.hash.replace('#', '');
    navigate(initial && sectionAllowed(initial) ? initial : 'dashboard');
  }

  init();
})();

