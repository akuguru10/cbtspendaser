/* ============================================================================
   CBT APP — FRONTEND LOGIC
   Mode LOKAL (default): semua data (soal, siswa, ujian, sesi) disimpan di
   localStorage browser ini — TIDAK perlu setup apa pun, langsung bisa dipakai.
   Cocok untuk uji coba atau ujian yang dikerjakan di satu perangkat/komputer.

   Mode SERVER (opsional, untuk ujian banyak siswa di banyak perangkat/HP):
   isi CONFIG.API_URL dengan URL Web App Google Apps Script (lihat Code.gs +
   README). Begitu diisi, aplikasi otomatis pindah ke mode server — semua
   fungsi (tambah/impor/lihat/ubah soal, data siswa, dll) memakai kontrak API
   yang sama sehingga tidak perlu ubah kode lain.
   ============================================================================ */

const CONFIG = {
  // URL server sekarang diisi lewat config.js (window.CBT_API_URL) supaya tidak hilang saat
  // app.js diganti. Mengisi langsung di sini tetap bisa dan dipakai kalau config.js kosong.
  API_URL: (typeof window !== 'undefined' && window.CBT_API_URL) || '', // contoh: https://script.google.com/macros/s/xxxx/exec — kosongkan untuk mode lokal
  AUTOSAVE_INTERVAL_MS: 20000,   // sinkron jawaban ke server tiap 20 detik (throttle)
  PING_INTERVAL_MS: 60000,       // heartbeat device-lock tiap 60 detik
  REALTIME_POLL_MS: 8000,        // saat Mode Server aktif: tarik ulang data tiap 8 detik ("realtime")
  TIMER_LOW_THRESHOLD_SEC: 120   // timer jadi merah & berdenyut saat sisa < 2 menit
};

// URL Web App bisa diisi langsung di CONFIG.API_URL di atas (berlaku untuk semua
// orang yang membuka situs ini), ATAU ditempel lewat menu "⚙ Pengaturan Server"
// di layar login (tersimpan per-perangkat di localStorage). Yang tersimpan di
// perangkat selalu diprioritaskan, supaya guru/siswa bisa mengaktifkan Mode
// Server tanpa perlu mengedit kode sama sekali.
function getUrlServerTersimpan() {
  try { return (localStorage.getItem('cbt_api_url_override') || '').trim(); } catch (e) { return ''; }
}
function setUrlServerTersimpan(url) {
  try {
    if (url) localStorage.setItem('cbt_api_url_override', url);
    else localStorage.removeItem('cbt_api_url_override');
  } catch (e) { /* localStorage tidak tersedia */ }
}
function efektifApiUrl() {
  const override = getUrlServerTersimpan();
  if (override) return override;
  if (CONFIG.API_URL && CONFIG.API_URL.trim() && CONFIG.API_URL.indexOf('GANTI_DENGAN') !== 0) return CONFIG.API_URL.trim();
  return '';
}

function modeServerAktif() {
  return !!efektifApiUrl();
}

// Toggle ikon mata di samping field password (login, ganti password akun, dst).
function toggleLihatSandi(idInput, tombol) {
  const el = document.getElementById(idInput);
  if (!el) return;
  const sedangTersembunyi = el.type === 'password';
  el.type = sedangTersembunyi ? 'text' : 'password';
  tombol.textContent = sedangTersembunyi ? '🙈' : '👁️';
  tombol.title = sedangTersembunyi ? 'Sembunyikan sandi' : 'Lihat sandi';
}

// ---------------- Pemuat pustaka berat (lazy) ----------------
// SheetJS (.xlsx) & Mammoth (.docx) hanya dipakai guru. Dimuat saat pertama dibutuhkan
// (atau di latar belakang setelah guru login), bukan di <head>, supaya halaman login &
// layar ujian siswa tidak menunggu ~1,5 MB skrip yang tidak mereka pakai.
const PUSTAKA_EKSTERNAL = {
  xlsx: { url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', siap: () => typeof XLSX !== 'undefined' },
  mammoth: { url: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', siap: () => typeof mammoth !== 'undefined' }
};
const _janjiPustaka = {};
function muatPustaka_(nama) {
  const info = PUSTAKA_EKSTERNAL[nama];
  if (!info) return Promise.reject(new Error('Pustaka tidak dikenal: ' + nama));
  if (info.siap()) return Promise.resolve();
  if (_janjiPustaka[nama]) return _janjiPustaka[nama];
  _janjiPustaka[nama] = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = info.url;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      delete _janjiPustaka[nama]; // boleh dicoba lagi nanti
      el.remove();
      reject(new Error('Gagal memuat pustaka ' + nama + '. Periksa koneksi internet lalu coba lagi.'));
    };
    document.head.appendChild(el);
  });
  return _janjiPustaka[nama];
}
// Pemanasan di latar belakang (tidak mengganggu): dipanggil setelah guru login.
function pemanasanPustakaGuru_() {
  const jalan = () => { muatPustaka_('xlsx').catch(() => {}); };
  if (window.requestIdleCallback) requestIdleCallback(jalan, { timeout: 4000 }); else setTimeout(jalan, 1500);
}

// ---------------- Bar loading global (dipanggil dari api(), lihat di bawah) ----------------
let jumlahRequestBerjalan = 0;
function mulaiLoading() {
  jumlahRequestBerjalan++;
  const bar = document.getElementById('top-loading-bar');
  if (bar) bar.classList.add('active');
}
function selesaiLoading() {
  jumlahRequestBerjalan = Math.max(0, jumlahRequestBerjalan - 1);
  if (jumlahRequestBerjalan === 0) {
    const bar = document.getElementById('top-loading-bar');
    if (bar) bar.classList.remove('active');
  }
}

// Menonaktifkan sebuah tombol "Simpan" selagi aksinya berjalan (mengganti teksnya
// jadi "Menyimpan...") lalu mengembalikannya seperti semula setelah selesai —
// mencegah orang mengetuk tombol yang sama berkali-kali saat responsnya terasa
// lambat (tiap klik ganda hanya menambah antrean permintaan ke server, membuatnya
// terasa makin lambat).
async function jalankanDenganTombolSibuk(idTombol, teksSibuk, fn) {
  const tombol = document.getElementById(idTombol);
  if (!tombol || tombol.disabled) return; // sudah berjalan, abaikan klik susulan
  const teksAsli = tombol.textContent;
  tombol.disabled = true;
  tombol.textContent = teksSibuk;
  try {
    await fn();
  } finally {
    tombol.disabled = false;
    tombol.textContent = teksAsli;
  }
}

function tampilkanBadgeMode() {
  const aktif = modeServerAktif();
  const teksBadge = aktif
    ? '☁️ Mode: Server (Google Sheets) — tersinkron ke semua perangkat (tiap ' + Math.round(CONFIG.REALTIME_POLL_MS / 1000) + ' dtk). Ketuk untuk ubah/lepas.'
    : '⚙ Mode: Lokal (perangkat ini) — data belum tersinkron. Ketuk untuk aktifkan Google Sheets.';
  // Sengaja HANYA ditampilkan di Portal Guru (mode-badge-guru) — status koneksi
  // Google Sheets bukan urusan siswa, dan tidak ditampilkan di layar login supaya
  // halaman awal tetap sederhana. Guru mengatur/memantau koneksi lewat tab
  // Pengaturan setelah masuk ke Portal Guru.
  const el = document.getElementById('mode-badge-guru');
  if (el) el.textContent = teksBadge;
  // Tombol "Kirim ke Spreadsheet" / "Tarik Data Terbaru" hanya relevan di Mode
  // Server (Mode Lokal tidak punya spreadsheet terpisah untuk disinkron).
  const sync = document.getElementById('sidebar-sync-guru');
  if (sync) sync.classList.toggle('hidden', !aktif);
  const statusPengaturan = document.getElementById('pengaturan-status-server');
  if (statusPengaturan) {
    statusPengaturan.textContent = aktif
      ? '☁️ Status saat ini: Terhubung ke Google Sheets — data tersinkron ke semua perangkat.'
      : '⚙ Status saat ini: Mode Lokal — data hanya tersimpan di perangkat ini.';
  }
}

// Versi lebih rapi dari unduhXlsx: lebar kolom bebas, baris judul dibekukan,
// ada filter, dan nama file/sheet disesuaikan. Dipakai unduhan analisis.
async function unduhXlsxRapi_(namaFile, namaSheet, headers, rows, lebarKolom) {
  try { await muatPustaka_('xlsx'); } catch (e) { toast(e.message, 'error'); return false; }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map((_, i) => ({ wch: (lebarKolom && lebarKolom[i]) || 14 }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(namaSheet).replace(/[\[\]*?\/\\:]/g, '-').slice(0, 31));
  XLSX.writeFile(wb, namaFile);
  return true;
}

// Nama ujian terpilih pada sebuah <select>, aman dipakai untuk nama file.
function namaUjianUntukFile_(selectId) {
  const sel = document.getElementById(selectId);
  const t = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : '';
  return (t && t !== 'Pilih ujian...' ? t : 'ujian').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60);
}


// ----------------------------------------------------------------------------
// PENCARIAN SISWA + FILTER KELAS (dipakai Rekap Nilai, Pemantauan, Log Pelanggaran,
// Analisis Jawaban, Data Siswa & Status Login)
// ----------------------------------------------------------------------------
function normCari_(s) { return String(s === null || s === undefined ? '' : s).toLowerCase().trim(); }

// Daftar kelas unik (urut natural: 7A, 7B, 8A, ... 10A).
function kelasUnikDari_(list) {
  return [...new Set((list || []).map(x => String(x.kelas || '').trim()).filter(k => k && k !== '-'))]
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
}

// Isi <select> filter kelas, pertahankan pilihan lama kalau masih ada.
function isiOpsiKelas_(selectId, daftarKelas) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const lama = sel.value;
  sel.innerHTML = '<option value="">Semua Kelas</option>' + daftarKelas.map(k => `<option value="${escapeHtml_(k)}">${escapeHtml_(k)}</option>`).join('');
  sel.value = daftarKelas.includes(lama) ? lama : '';
}

// true kalau item lolos Filter Kelas (kelasId) & kotak cari (cariId). Pencarian
// cocok ke nama, username, dan kelas (tidak peka huruf besar/kecil).
function cocokFilterSiswa_(item, kelasId, cariId) {
  const kelas = kelasId ? (document.getElementById(kelasId)?.value || '') : '';
  const q = normCari_(cariId ? document.getElementById(cariId)?.value : '');
  if (kelas && String(item.kelas || '').trim() !== kelas) return false;
  if (q && !(normCari_(item.nama).includes(q) || normCari_(item.username).includes(q) || normCari_(item.kelas).includes(q))) return false;
  return true;
}

function filterAktif_(kelasId, cariId) {
  return !!((kelasId && document.getElementById(kelasId)?.value) || (cariId && document.getElementById(cariId)?.value.trim()));
}

function tampilkanInfoFilter_(infoId, tampil, total, tambahan) {
  const el = document.getElementById(infoId);
  if (!el) return;
  el.textContent = `Menampilkan ${tampil} dari ${total} siswa` + (tambahan ? ' • ' + tambahan : '');
}

// Nama sheet Excel: maks 31 karakter, tanpa []:*?/\ dan unik.
function namaSheetUnik_(nama, terpakai) {
  const dasar = String(nama || 'Sheet').replace(/[\[\]:*?\/\\]/g, '-').trim().slice(0, 31) || 'Sheet';
  let calon = dasar, n = 2;
  while (terpakai.has(calon.toLowerCase())) calon = dasar.slice(0, 28) + '-' + (n++);
  terpakai.add(calon.toLowerCase());
  return calon;
}

// ----------------------------------------------------------------------------
// PALET WARNA SIAP PAKAI + PEMBUAT PALET ACAK
// ----------------------------------------------------------------------------
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// ============================================================================
// MESIN TAMPILAN — (1) warna turunan dari warna utama, (2) gaya UI tak terbatas
// Semua tampilan memakai variabel CSS (--c-* dan --ui-*) yang dihitung di sini,
// jadi mengganti SATU warna utama atau satu parameter gaya mengubah seluruh app.
// ============================================================================
const Warna = (() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const hex2rgb = (h) => {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return (isNaN(n) || h.length !== 6) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const rgb2hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  };
  const hsl = (hex) => rgb2hsl(...hex2rgb(hex));
  const dariHsl = (h, s, l) => hslToHex(((h % 360) + 360) % 360, clamp(s, 0, 100), clamp(l, 0, 100));
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const lum = (hex) => { const c = hex2rgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const kontras = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const teksDi = (bg) => kontras('#ffffff', bg) >= kontras('#14161a', bg) ? '#ffffff' : '#14161a';
  const geser = (hex, dl, ds = 0) => { const [h, s, l] = hsl(hex); return dariHsl(h, s + ds, l + dl); };
  const rgba = (hex, a) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${+(+a).toFixed(3)})`; };
  const valid = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
  return { clamp, hex2rgb, hsl, dariHsl, mix, lum, kontras, teksDi, geser, rgba, valid };
})();

// ---- Palet siap pakai + harmoni warna ---------------------------------------
const PALET_PRESET = [
  { nama: 'Soft Clay', primary: '#e58a72', secondary: '#6f9f94', accent: '#e9b44c', bg: '#faf6f1', text: '#2d2a26' },
  { nama: 'Violet Neon', primary: '#7c3aed', secondary: '#ec4899', accent: '#eab308', bg: '#faf7ff', text: '#211334' },
  { nama: 'Gold Elegan', primary: '#8a5a00', secondary: '#4b3621', accent: '#d4af37', bg: '#fffdf6', text: '#2b2210' },
  { nama: 'Ocean Teal', primary: '#0f766e', secondary: '#0369a1', accent: '#facc15', bg: '#f2fbfa', text: '#0b2a27' },
  { nama: 'Sunset Ceria', primary: '#c2410c', secondary: '#db2777', accent: '#facc15', bg: '#fff8f2', text: '#3a1607' },
  { nama: 'Emerald Segar', primary: '#15803d', secondary: '#0d9488', accent: '#eab308', bg: '#f3fdf6', text: '#0c2a17' },
  { nama: 'Midnight Neon', primary: '#151a3d', secondary: '#3b82f6', accent: '#ec4899', bg: '#f5f6ff', text: '#12142b' },
  { nama: 'Putih Klasik', primary: '#1d3557', secondary: '#457b9d', accent: '#e76f51', bg: '#ffffff', text: '#1b1f24' },
  { nama: 'Sakura', primary: '#d6336c', secondary: '#9775fa', accent: '#fcc419', bg: '#fff5f8', text: '#3b1020' },
  { nama: 'Mint Fresh', primary: '#12b886', secondary: '#339af0', accent: '#ff922b', bg: '#f1fcf8', text: '#0b2e24' },
  { nama: 'Cokelat Hangat', primary: '#8d5a3b', secondary: '#c08552', accent: '#e0a458', bg: '#fbf6f0', text: '#2e1d12' },
  { nama: 'Grafit Biru', primary: '#3b5bdb', secondary: '#495057', accent: '#fab005', bg: '#f6f7fb', text: '#14161f' }
];

const HARMONI = {
  klasik: { nama: 'Klasik (aksen emas)' },
  analog: { nama: 'Analog (warna bertetangga)' },
  komplementer: { nama: 'Komplementer (berlawanan)' },
  triad: { nama: 'Triad (3 warna seimbang)' },
  split: { nama: 'Split-komplementer' },
  tetrad: { nama: 'Tetrad (4 warna)' },
  mono: { nama: 'Monokrom (satu warna)' }
};

// Dari SATU warna utama -> seluruh palet (sekunder, aksen, latar, teks).
function turunkanPalet(primary, harmoni) {
  const W = Warna, [h, s] = W.hsl(primary);
  const sat = Math.max(45, Math.min(s, 88));
  const H = (off, ss, ll) => W.dariHsl(h + off, ss, ll);
  let sec, acc;
  switch (harmoni) {
    case 'analog': sec = H(32, sat * .85, 46); acc = H(-34, 85, 56); break;
    case 'komplementer': sec = H(180, sat * .7, 44); acc = H(28, 88, 57); break;
    case 'triad': sec = H(120, sat * .8, 44); acc = H(240, sat * .85, 55); break;
    case 'split': sec = H(150, sat * .75, 45); acc = H(210, sat * .8, 55); break;
    case 'tetrad': sec = H(90, sat * .75, 45); acc = H(180, sat * .8, 52); break;
    case 'mono': sec = H(0, Math.min(sat, 45) * .8, 42); acc = H(0, sat, 64); break;
    default: sec = H(38, sat * .45, 52); acc = W.dariHsl(42, 80, 58);
  }
  return { primary, secondary: sec, accent: acc, bg: W.dariHsl(h, Math.min(sat, 40) * .85, 96.5), text: W.dariHsl(h, 28, 14) };
}

function buatPaletAcak(rnd) {
  rnd = rnd || Math.random;
  const ks = Object.keys(HARMONI);
  return turunkanPalet(hslToHex(Math.floor(rnd() * 360), 60 + rnd() * 25, 38 + rnd() * 12), ks[Math.floor(rnd() * ks.length)]);
}

// ---- Font -------------------------------------------------------------------
const FALLBACK_SANS = ", system-ui, -apple-system, 'Segoe UI', sans-serif";
const GAYA_FONT = {
  jakarta: { nama: 'Plus Jakarta Sans', d: "'Plus Jakarta Sans'", b: "'Inter'" },
  inter: { nama: 'Inter', d: "'Inter'", b: "'Inter'" },
  system: { nama: 'Sistem (tercepat)', d: 'system-ui', b: 'system-ui' },
  poppins: { nama: 'Poppins', d: "'Poppins'", b: "'Poppins'", q: 'Poppins:wght@400;500;600;700;800' },
  nunito: { nama: 'Nunito (bulat)', d: "'Nunito'", b: "'Nunito'", q: 'Nunito:wght@400;600;700;800;900' },
  baloo: { nama: 'Baloo 2 (gemuk ceria)', d: "'Baloo 2'", b: "'Nunito'", q: 'Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700' },
  space: { nama: 'Space Grotesk', d: "'Space Grotesk'", b: "'Inter'", q: 'Space+Grotesk:wght@500;600;700' },
  sora: { nama: 'Sora', d: "'Sora'", b: "'Inter'", q: 'Sora:wght@500;600;700;800' },
  outfit: { nama: 'Outfit', d: "'Outfit'", b: "'Outfit'", q: 'Outfit:wght@400;500;600;700;800' },
  lexend: { nama: 'Lexend', d: "'Lexend'", b: "'Lexend'", q: 'Lexend:wght@400;500;600;700' },
  fraunces: { nama: 'Fraunces (serif)', d: "'Fraunces', Georgia, serif", b: "'Inter'", q: 'Fraunces:wght@500;600;700;800' },
  mono: { nama: 'JetBrains Mono (kode)', d: "'JetBrains Mono', ui-monospace, monospace", b: "'Inter'", q: 'JetBrains+Mono:wght@500;600;700;800' },
  doodle: { nama: 'Patrick Hand (tulisan tangan)', d: "'Patrick Hand', cursive", b: "'Nunito'", q: 'Patrick+Hand&family=Nunito:wght@400;600;700' }
};
function muatFont(key) {
  const f = GAYA_FONT[key];
  if (!f || !f.q) return;
  const id = 'font-' + key;
  if (document.getElementById(id)) return;
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=' + f.q + '&display=swap';
  document.head.appendChild(l);
}

// ---- Parameter gaya & preset ------------------------------------------------
const DEF_UI = { r: 14, pill: 0, depth: 'soft', elev: 50, bw: 0, ink: 0, glass: 0, grad: 0, pat: 'blobs', side: 'tint', float: 1, font: 'jakarta', hw: 800, caps: 0, dens: 100, neon: 0 };
const OPSI_DEPTH = { flat: 'Rata (tanpa bayangan)', line: 'Garis tipis', soft: 'Lembut', layer: 'Berlapis (material)', clay: 'Clay (empuk 3D)', neu: 'Neumorphism (timbul)', hard: 'Keras (brutalis)', pop: 'Pop 3D (tombol tebal)', glow: 'Cahaya (glow)' };
const OPSI_POLA = { none: 'Polos', blobs: 'Gumpalan lembut', aurora: 'Aurora', mesh: 'Mesh gradien', waves: 'Gelombang', dots: 'Titik-titik', grid: 'Kotak-kotak', lines: 'Buku bergaris', checker: 'Papan catur' };
const OPSI_SIDE = { tint: 'Warna pastel', light: 'Putih bersih', solid: 'Warna utama', dark: 'Gelap pekat', glass: 'Kaca transparan', navy: 'Gelap navy (ikut warna sekunder)' };

const GAYA_PRESET = [
  { id: 'softclay', nama: 'Soft Pastel', info: 'Bawaan, lembut & hangat', u: { r: 14, depth: 'soft', elev: 50, pat: 'blobs', side: 'tint', float: 1, font: 'jakarta', hw: 800 } },
  { id: 'clay', nama: 'Claymorphism', info: 'Empuk seperti tanah liat', u: { r: 26, depth: 'clay', elev: 60, grad: 25, pat: 'blobs', side: 'tint', float: 1, font: 'baloo', hw: 700 } },
  { id: 'glass', nama: 'Glassmorphism', info: 'Kaca buram di atas aurora', u: { r: 20, depth: 'soft', elev: 40, bw: 1, glass: 70, pat: 'aurora', side: 'glass', float: 1, font: 'outfit', hw: 600 } },
  { id: 'neu', nama: 'Neumorphism', info: 'Timbul & tenggelam satu warna', u: { r: 22, depth: 'neu', elev: 55, pat: 'none', side: 'light', float: 1, font: 'nunito', hw: 800 } },
  { id: 'brutal', nama: 'Neo-Brutalism', info: 'Garis tebal, bayangan keras', u: { r: 4, depth: 'hard', elev: 55, bw: 3, ink: 1, pat: 'dots', side: 'solid', float: 0, font: 'space', hw: 700 } },
  { id: 'flat', nama: 'Flat Minimal', info: 'Datar, bersih, fokus', u: { r: 8, depth: 'flat', bw: 1, pat: 'none', side: 'light', float: 0, font: 'inter', hw: 700 } },
  { id: 'material', nama: 'Material Elevated', info: 'Bayangan berlapis halus', u: { r: 10, depth: 'layer', elev: 55, pat: 'none', side: 'light', float: 0, font: 'inter', hw: 600 } },
  { id: 'aurora', nama: 'Aurora Gradient', info: 'Gradien cerah berpendar', u: { r: 22, depth: 'glow', elev: 35, grad: 85, glass: 25, pat: 'aurora', side: 'tint', float: 1, font: 'sora', hw: 700 } },
  { id: 'neon', nama: 'Cyber Neon', mode: 'dark', info: 'Gelap, garis kisi, menyala', u: { r: 6, depth: 'glow', elev: 75, bw: 1, grad: 30, pat: 'grid', side: 'dark', float: 0, font: 'mono', hw: 700, neon: 1, caps: 1 } },
  { id: 'paper', nama: 'Buku Tulis', info: 'Kertas bergaris, nuansa klasik', u: { r: 3, depth: 'soft', elev: 25, bw: 1, pat: 'lines', side: 'light', float: 0, font: 'fraunces', hw: 700 } },
  { id: 'retro', nama: 'Retro Terminal', info: 'Kotak tajam ala komputer lama', u: { r: 0, depth: 'hard', elev: 30, bw: 2, ink: 1, pat: 'checker', side: 'dark', float: 0, font: 'mono', hw: 700, caps: 1 } },
  { id: 'pop', nama: 'Candy Pop 3D', info: 'Tombol tebal bisa "ditekan"', u: { r: 18, pill: 1, depth: 'pop', elev: 60, bw: 2, pat: 'dots', side: 'tint', float: 1, font: 'baloo', hw: 800 } },
  { id: 'corporate', nama: 'Corporate Clean', info: 'Formal, sidebar gelap', u: { r: 10, depth: 'soft', elev: 25, bw: 1, pat: 'none', side: 'dark', float: 0, font: 'inter', hw: 700 } },
  { id: 'ocean', nama: 'Ocean Glass Gelap', mode: 'dark', info: 'Kaca di mode gelap', u: { r: 22, depth: 'soft', elev: 50, bw: 1, glass: 60, pat: 'aurora', side: 'glass', float: 1, font: 'lexend', hw: 600 } },
  { id: 'doodle', nama: 'Doodle Sketsa', info: 'Seperti digambar tangan', u: { r: 14, depth: 'hard', elev: 25, bw: 2, ink: 1, pat: 'dots', side: 'tint', float: 1, font: 'doodle', hw: 400 } },
  { id: 'bento', nama: 'Bento Lapang', info: 'Kartu besar, ruang lega', u: { r: 28, depth: 'line', bw: 1, pat: 'none', side: 'light', float: 1, font: 'jakarta', hw: 800, dens: 110 } },
  { id: 'mono', nama: 'Mono Ink Elegan', info: 'Garis tinta tipis, serif', u: { r: 2, depth: 'flat', bw: 1, ink: 1, pat: 'none', side: 'light', float: 0, font: 'fraunces', hw: 700 } },
  { id: 'gloss', nama: 'Glossy Skeuomorphic', info: 'Tombol mengkilap', u: { r: 12, depth: 'clay', elev: 45, grad: 75, bw: 1, pat: 'waves', side: 'dark', float: 0, font: 'poppins', hw: 700 } },
  { id: 'vapor', nama: 'Vaporwave Gelap', mode: 'dark', info: 'Gelap, gradien, neon lembut', u: { r: 16, depth: 'glow', elev: 65, grad: 90, glass: 30, pat: 'mesh', side: 'glass', float: 1, font: 'outfit', hw: 700, neon: 1 } },
  { id: 'dream', nama: 'Pastel Dream', info: 'Mesh pastel berkaca', u: { r: 26, depth: 'soft', elev: 45, glass: 35, grad: 20, pat: 'mesh', side: 'glass', float: 1, font: 'nunito', hw: 800 } },
  { id: 'portal', nama: 'Portal Navy Magenta', pal: { primary: '#d6249f', secondary: '#1b2559', accent: '#f5a524', bg: '#ffffff', text: '#161a33' }, info: 'Sidebar navy, menu aktif magenta, kartu putih bergaris', u: { r: 12, depth: 'line', bw: 1, pat: 'none', side: 'navy', float: 0, font: 'inter', hw: 800 } },
  { id: 'sunset', nama: 'Senja Hangat', pal: { primary: '#f2562b', secondary: '#c2255c', accent: '#fbbf24', bg: '#fff6ef', text: '#3b1d12' }, info: 'Gradien jingga-merah, sidebar berwarna', u: { r: 24, depth: 'soft', elev: 55, grad: 70, pat: 'waves', side: 'solid', float: 1, font: 'poppins', hw: 700 } },
  { id: 'forest', nama: 'Hutan Tenang', pal: { primary: '#2f7d4f', secondary: '#8a5a2b', accent: '#e0a526', bg: '#f1f5ee', text: '#1d2b21' }, info: 'Hijau tua, serif, sidebar gelap', u: { r: 12, depth: 'layer', elev: 40, pat: 'none', side: 'dark', float: 0, font: 'fraunces', hw: 700 } },
  { id: 'koran', nama: 'Koran Klasik', pal: { primary: '#222222', secondary: '#7a1f1f', accent: '#b8860b', bg: '#f4efe4', text: '#1a1a1a' }, info: 'Kertas krem, huruf kapital, tinta hitam', u: { r: 0, depth: 'line', bw: 1, ink: 1, pat: 'lines', side: 'light', float: 0, font: 'fraunces', hw: 800, caps: 1 } },
  { id: 'midnight', nama: 'Midnight Slate', mode: 'dark', pal: { primary: '#7c8cff', secondary: '#4cc9f0', accent: '#ffb86b', bg: '#0e1020', text: '#e8eaf6' }, info: 'Gelap elegan dengan kisi halus', u: { r: 14, depth: 'layer', elev: 60, pat: 'grid', side: 'dark', float: 0, font: 'inter', hw: 700 } },
  { id: 'sakura', nama: 'Sakura Lembut', pal: { primary: '#ec5f9a', secondary: '#9b7fe6', accent: '#ffc15e', bg: '#fff3f8', text: '#3d1f31' }, info: 'Merah muda bulat, tombol kapsul empuk', u: { r: 30, pill: 1, depth: 'clay', elev: 55, grad: 30, pat: 'dots', side: 'tint', float: 1, font: 'nunito', hw: 800 } },
  { id: 'mint', nama: 'Mint Segar', pal: { primary: '#0f9d8a', secondary: '#2b6cb0', accent: '#f6ad55', bg: '#f2fbf9', text: '#12302c' }, info: 'Datar, hijau toska, ruang lega', u: { r: 16, depth: 'flat', bw: 1, pat: 'none', side: 'light', float: 1, font: 'lexend', hw: 600, dens: 105 } },
  { id: 'blueprint', nama: 'Blueprint Teknik', mode: 'dark', pal: { primary: '#4fc3f7', secondary: '#81d4fa', accent: '#ffd54f', bg: '#0b2545', text: '#e3f2fd' }, info: 'Biru malam, kisi gambar teknik, huruf kode', u: { r: 2, depth: 'line', bw: 1, pat: 'grid', side: 'dark', float: 0, font: 'mono', hw: 600, caps: 1 } },
  { id: 'kuning', nama: 'Kuning Kontras', pal: { primary: '#ffd400', secondary: '#111111', accent: '#ff4d4d', bg: '#fffbe0', text: '#111111' }, info: 'Kuning-hitam, garis tebal, sangat jelas', u: { r: 6, depth: 'hard', elev: 60, bw: 3, ink: 1, pat: 'checker', side: 'solid', float: 0, font: 'space', hw: 800, caps: 1 } },
  { id: 'lavender', nama: 'Lavender Kaca', pal: { primary: '#8b5cf6', secondary: '#ec4899', accent: '#38bdf8', bg: '#f5f0ff', text: '#2a1f4d' }, info: 'Ungu berkaca di atas aurora', u: { r: 24, depth: 'soft', elev: 45, glass: 55, grad: 40, pat: 'aurora', side: 'glass', float: 1, font: 'outfit', hw: 600 } },
  { id: 'sporty', nama: 'Sporty Bold', pal: { primary: '#e11d48', secondary: '#0f172a', accent: '#facc15', bg: '#f8fafc', text: '#0f172a' }, info: 'Merah tegas, sidebar navy, tombol 3D', u: { r: 6, depth: 'pop', elev: 50, bw: 2, pat: 'none', side: 'navy', float: 0, font: 'sora', hw: 800, caps: 1 } },
  { id: 'zen', nama: 'Zen Putih', pal: { primary: '#475569', secondary: '#94a3b8', accent: '#f59e0b', bg: '#fafaf9', text: '#1c1917' }, info: 'Sangat minimalis, abu-abu tenang', u: { r: 14, depth: 'line', bw: 1, pat: 'none', side: 'light', float: 0, font: 'sora', hw: 600, dens: 110 } },
  { id: 'royal', nama: 'Royal Gold', mode: 'dark', pal: { primary: '#e0b04c', secondary: '#6d5bd0', accent: '#f08a5d', bg: '#14112b', text: '#f3efe2' }, info: 'Gelap ungu tua dengan aksen emas', u: { r: 8, depth: 'glow', elev: 40, bw: 1, pat: 'mesh', side: 'dark', float: 0, font: 'fraunces', hw: 700 } },
  { id: 'pantai', nama: 'Pantai Biru', pal: { primary: '#0891b2', secondary: '#f59e0b', accent: '#fb7185', bg: '#effcff', text: '#083344' }, info: 'Biru laut, gelombang, sidebar pastel', u: { r: 20, depth: 'soft', elev: 50, grad: 55, pat: 'waves', side: 'tint', float: 1, font: 'baloo', hw: 700 } }
];
const GAYA_BY_ID = Object.fromEntries(GAYA_PRESET.map(g => [g.id, g]));

function normalisasiUI(u) {
  const o = Object.assign({}, DEF_UI, u || {});
  const n = (v, a, b) => Warna.clamp(Number(v) || 0, a, b);
  o.r = n(o.r, 0, 40); o.elev = n(o.elev, 0, 100); o.bw = n(o.bw, 0, 4); o.glass = n(o.glass, 0, 100);
  o.grad = n(o.grad, 0, 100); o.dens = n(o.dens, 80, 125); o.hw = n(o.hw, 400, 900);
  ['pill', 'ink', 'float', 'caps', 'neon'].forEach(k => o[k] = o[k] ? 1 : 0);
  if (!OPSI_DEPTH[o.depth]) o.depth = 'soft';
  if (!OPSI_POLA[o.pat]) o.pat = 'none';
  if (!OPSI_SIDE[o.side]) o.side = 'tint';
  if (!GAYA_FONT[o.font]) o.font = 'jakarta';
  return o;
}

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Gaya acak: ambil preset sebagai dasar lalu acak banyak parameter -> kombinasi tak terbatas.
function buatGayaAcak(rnd) {
  rnd = rnd || Math.random;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const base = pick(GAYA_PRESET);
  const u = Object.assign({}, DEF_UI, base.u);
  u.r = Math.round(Warna.clamp(u.r + (rnd() - .5) * 14, 0, 36));
  u.elev = Math.round(Warna.clamp(u.elev + (rnd() - .5) * 40, 10, 95));
  u.dens = Math.round(95 + rnd() * 20);
  if (rnd() < .3) u.depth = pick(Object.keys(OPSI_DEPTH));
  if (rnd() < .4) u.pat = pick(Object.keys(OPSI_POLA));
  if (rnd() < .35) u.side = pick(Object.keys(OPSI_SIDE));
  if (rnd() < .45) u.font = pick(Object.keys(GAYA_FONT));
  if (rnd() < .3) u.grad = Math.round(rnd() * 90);
  if (rnd() < .25) u.glass = Math.round(rnd() * 75);
  if (rnd() < .2) u.pill = u.pill ? 0 : 1;
  if (rnd() < .2) u.float = u.float ? 0 : 1;
  if (u.depth === 'neu') { u.bw = 0; u.glass = 0; }
  if (u.depth === 'hard') { u.bw = Math.max(u.bw, 2); u.ink = 1; }
  if (u.glass > 20 && (u.pat === 'none' || u.pat === 'lines')) u.pat = 'aurora';
  return { u, mode: base.mode || (rnd() < .12 ? 'dark' : 'light') };
}

// ---- Perhitungan palet lengkap ---------------------------------------------
function hitungPalet(t, u, gelap) {
  const W = Warna;
  let { primary, secondary, accent, bg, text } = t;
  if (u.neon) {
    const boost = (c) => { const [h, s, l] = W.hsl(c); return W.dariHsl(h, Math.max(s, 88), gelap ? Math.max(l, 60) : Math.min(Math.max(l, 48), 56)); };
    primary = boost(primary); secondary = boost(secondary); accent = boost(accent);
  }
  let surface, line;
  const [hp] = W.hsl(primary);
  if (gelap) {
    bg = W.dariHsl(hp, 16, 9); surface = W.dariHsl(hp, 15, 13.5); text = W.dariHsl(hp, 10, 93); line = W.dariHsl(hp, 13, 23);
    const angkat = (c) => { const [h, s, l] = W.hsl(c); return l < 58 ? W.dariHsl(h, s, 62) : c; };
    primary = angkat(primary); secondary = angkat(secondary); accent = angkat(accent);
  } else {
    if (W.kontras(text, bg) < 4.5) text = W.lum(bg) > .4 ? '#1b1b1f' : '#f5f5f5';
    surface = W.lum(bg) < .35 ? W.geser(bg, 6) : W.mix(bg, '#ffffff', .7);
    line = W.mix(bg, text, .11);
  }
  if (u.depth === 'neu') surface = bg;
  let muted = W.mix(text, bg, .45);
  if (W.kontras(muted, surface) < 3.6) muted = W.mix(text, bg, .32);
  const primaryDark = W.geser(primary, gelap ? 6 : -9);
  const [hs] = W.hsl(secondary), [ht] = W.hsl(text);
  const sh = gelap ? '#000000' : W.dariHsl(ht, 28, 30);
  const ink = gelap ? W.dariHsl(hp, 10, 86) : text;
  // sidebar
  let sidebar, onSb = text, sideBg;
  switch (t._side || u.side) {
    case 'solid': sidebar = gelap ? W.dariHsl(hp, 45, 25) : W.geser(primary, -8); onSb = W.teksDi(sidebar); break;
    case 'navy': { const ss = W.hsl(secondary)[1]; sidebar = gelap ? W.dariHsl(hs, Math.min(ss, 55) * .8, 7) : W.dariHsl(hs, Math.min(Math.max(ss, 35), 60), 13); onSb = W.teksDi(sidebar); break; }
    case 'dark': sidebar = gelap ? W.dariHsl(hp, 30, 6) : W.dariHsl(hp, 32, 13); onSb = W.teksDi(sidebar); break;
    case 'light': sidebar = surface; break;
    case 'glass': sidebar = W.mix(surface, bg, .2); break;
    default: sidebar = gelap ? W.dariHsl(hs, 22, 15) : W.mix(secondary, bg, .8);
  }
  sideBg = u.side === 'glass' ? W.rgba(surface, gelap ? .5 : .5) : sidebar;
  return {
    gelap, primary, secondary, accent, bg, text, surface, line, muted, primaryDark, sh, ink, sidebar, onSb, sideBg,
    onPrimary: W.teksDi(primary), onSecondary: W.teksDi(secondary), onAccent: W.teksDi(accent),
    success: gelap ? '#5cc79a' : '#4f9a78', danger: gelap ? '#ff7b72' : '#d9534f', warn: gelap ? '#f0b84a' : '#d98e04',
    warnInk: gelap ? '#f0c566' : W.mix(W.dariHsl(40, 90, 36), text, .25),
    neuD: gelap ? W.geser(bg, -5) : W.mix(bg, '#000000', .13), neuL: gelap ? W.geser(bg, 6) : W.mix(bg, '#ffffff', .85),
    inputLine: W.mix(bg, text, gelap ? .2 : .17)
  };
}

function polaLatar(pat, P) {
  const W = Warna, a = (c, x) => W.rgba(c, x), p = P.primary, s = P.secondary, c = P.accent, tx = P.text;
  switch (pat) {
    case 'blobs': return [`radial-gradient(circle at 12% 8%, ${a(p, .20)}, transparent 42%), radial-gradient(circle at 90% 92%, ${a(s, .20)}, transparent 46%), radial-gradient(circle at 82% 10%, ${a(c, .12)}, transparent 35%)`, 'auto'];
    case 'aurora': return [`radial-gradient(60% 50% at 15% 10%, ${a(p, .42)}, transparent 70%), radial-gradient(55% 45% at 85% 20%, ${a(s, .38)}, transparent 70%), radial-gradient(60% 55% at 60% 95%, ${a(c, .34)}, transparent 70%)`, 'auto'];
    case 'mesh': return [`radial-gradient(at 0% 0%, ${a(p, .38)} 0, transparent 50%), radial-gradient(at 100% 0%, ${a(s, .36)} 0, transparent 50%), radial-gradient(at 100% 100%, ${a(c, .34)} 0, transparent 50%), radial-gradient(at 0% 100%, ${a(W.mix(p, s, .5), .34)} 0, transparent 50%)`, 'auto'];
    case 'waves': return [`radial-gradient(120% 55% at 50% 108%, ${a(p, .30)}, transparent 62%), radial-gradient(90% 40% at 18% 112%, ${a(s, .26)}, transparent 60%), radial-gradient(70% 35% at 88% 115%, ${a(c, .24)}, transparent 60%)`, 'auto'];
    case 'dots': return [`radial-gradient(${a(tx, .17)} 1.3px, transparent 1.7px)`, '20px 20px'];
    case 'grid': return [`linear-gradient(${a(tx, .07)} 1px, transparent 1px), linear-gradient(90deg, ${a(tx, .07)} 1px, transparent 1px)`, '26px 26px'];
    case 'lines': return [`repeating-linear-gradient(0deg, transparent 0 27px, ${a(p, .20)} 27px 28px)`, 'auto'];
    case 'checker': return [`conic-gradient(${a(tx, .05)} 25%, transparent 0 50%, ${a(tx, .05)} 0 75%, transparent 0)`, '30px 30px'];
    default: return ['none', 'auto'];
  }
}

function bayangan(u, P, jenis) {
  const e = u.elev / 100, W = Warna, A = (x) => W.rgba(P.sh, x), R = Math.round;
  const hi = P.gelap ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.85)';
  const bc = 'var(--btn-c)';
  switch (u.depth) {
    case 'soft':
      if (jenis === 'card') return `0 1px 2px ${A(.04 + .03 * e)}, 0 ${R(3 + 9 * e)}px ${R(10 + 20 * e)}px ${A(.05 + .09 * e)}`;
      if (jenis === 'btn') return `0 ${R(2 + 5 * e)}px ${R(6 + 10 * e)}px -${R(1 + 3 * e)}px color-mix(in srgb, ${bc} ${R(40 + 25 * e)}%, transparent)`;
      return 'none';
    case 'layer':
      if (jenis === 'card') { const k = .5 + e; return `0 1px 1px ${A(.06)}, 0 2px 2px ${A(.06)}, 0 4px 4px ${A(.06)}, 0 ${R(8 * k)}px ${R(8 * k)}px ${A(.05)}, 0 ${R(16 * k)}px ${R(16 * k)}px ${A(.04)}`; }
      if (jenis === 'btn') return `0 1px 1px ${A(.12)}, 0 2px 3px ${A(.12)}, 0 ${R(3 + 3 * e)}px ${R(6 + 6 * e)}px -1px color-mix(in srgb, ${bc} 35%, transparent)`;
      return 'none';
    case 'clay':
      if (jenis === 'card') return `0 ${R(10 + 14 * e)}px ${R(24 + 22 * e)}px -${R(6 + 4 * e)}px ${A(.14 + .16 * e)}, inset 0 ${R(4 + 2 * e)}px ${R(6 + 6 * e)}px ${hi}, inset 0 -${R(5 + 4 * e)}px ${R(10 + 8 * e)}px ${A(.06 + .06 * e)}`;
      if (jenis === 'btn') return `0 ${R(6 + 6 * e)}px ${R(12 + 8 * e)}px -4px color-mix(in srgb, ${bc} 60%, transparent), inset 0 3px 6px rgba(255,255,255,.35), inset 0 -4px 8px rgba(0,0,0,.14)`;
      return `inset 0 ${R(2 + 2 * e)}px ${R(4 + 4 * e)}px ${A(.10 + .08 * e)}, inset 0 -2px 4px ${hi}`;
    case 'neu': {
      const d = R(4 + 9 * e), d2 = Math.max(2, R(d * .55));
      if (jenis === 'card') return `${d}px ${d}px ${d * 2}px ${P.neuD}, -${d}px -${d}px ${d * 2}px ${P.neuL}`;
      if (jenis === 'btn') return `${d2}px ${d2}px ${d2 * 2}px ${P.neuD}, -${d2}px -${d2}px ${d2 * 2}px ${P.neuL}`;
      if (jenis === 'pressed') return `inset ${d2}px ${d2}px ${d2 * 2}px ${P.neuD}, inset -${d2}px -${d2}px ${d2 * 2}px ${P.neuL}`;
      return `inset ${d2}px ${d2}px ${d2 * 2}px ${P.neuD}, inset -${d2}px -${d2}px ${d2 * 2}px ${P.neuL}`;
    }
    case 'hard': {
      const o = R(2 + 5 * e);
      if (jenis === 'card') return `${o}px ${o}px 0 0 ${P.ink}`;
      if (jenis === 'btn') return `${Math.max(2, o - 1)}px ${Math.max(2, o - 1)}px 0 0 ${P.ink}`;
      if (jenis === 'btn-h') return `${o + 1}px ${o + 1}px 0 0 ${P.ink}`;
      if (jenis === 'btn-a') return `0 0 0 0 ${P.ink}`;
      return `2px 2px 0 0 ${P.ink}`;
    }
    case 'pop':
      if (jenis === 'card') return `0 ${R(3 + 4 * e)}px 0 0 ${W.mix(P.line, P.text, .14)}`;
      if (jenis === 'btn') return `0 ${R(3 + 3 * e)}px 0 0 color-mix(in srgb, ${bc} 65%, #000)`;
      return 'none';
    case 'glow':
      if (jenis === 'card') return `0 0 0 1px ${W.rgba(P.primary, .25)}, 0 0 ${R(14 + 26 * e)}px ${W.rgba(P.primary, .12 + .18 * e)}`;
      if (jenis === 'btn') return `0 0 ${R(8 + 16 * e)}px color-mix(in srgb, ${bc} ${R(35 + 30 * e)}%, transparent)`;
      return 'none';
    default: return 'none';
  }
}

// Peta variabel CSS lengkap (dipakai <html> dan juga kartu pratinjau gaya).
function petaVar(t, u, P) {
  const W = Warna, R = Math.round, m = {};
  const f = GAYA_FONT[u.font];
  m['--c-primary'] = P.primary; m['--c-secondary'] = P.secondary; m['--c-accent'] = P.accent;
  m['--c-bg'] = P.bg; m['--c-surface'] = P.surface; m['--c-text'] = P.text; m['--c-muted'] = P.muted; m['--c-line'] = P.line;
  m['--c-success'] = P.success; m['--c-danger'] = P.danger; m['--c-warn-ink'] = P.warnInk;
  m['--c-primary-dark'] = P.primaryDark;
  m['--c-on-primary'] = P.onPrimary; m['--c-on-secondary'] = P.onSecondary; m['--c-on-accent'] = P.onAccent;
  m['--c-sidebar'] = P.sidebar; m['--c-on-sidebar'] = P.onSb;
  m['--c-shadow'] = W.hex2rgb(P.sh).join(',');
  m['--font-display'] = f.d + FALLBACK_SANS; m['--font-body'] = f.b + FALLBACK_SANS;
  m['--ui-hw'] = String(u.hw); m['--ui-caps'] = u.caps ? 'uppercase' : 'none'; m['--ui-hls'] = u.caps ? '.04em' : '-.01em';
  m['--ui-d'] = String(u.dens / 100);
  // radius
  const r = u.r;
  m['--radius'] = r + 'px'; m['--radius-lg'] = R(r * 1.7) + 'px'; m['--r-xl'] = R(r * 2) + 'px';
  m['--ui-r-btn'] = u.pill ? '999px' : r + 'px';
  m['--ui-r-in'] = (u.pill ? Math.min(R(r * 1.6), 26) : r) + 'px';
  m['--ui-r-nav'] = (u.pill ? 999 : R(r * .85)) + 'px';
  m['--ui-r-sm'] = Math.min(8, r) + 'px';
  m['--ui-r-badge'] = (r >= 12 ? 999 : R(r * .5)) + 'px';
  // permukaan kartu
  const g = u.glass / 100, kaca = g > 0;
  const bw = u.depth === 'neu' ? 0 : (u.bw || (kaca ? 1 : 0));
  const bcol = u.ink ? P.ink : (kaca ? (P.gelap ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.55)') : P.line);
  m['--ui-card-bd'] = bw ? `${bw}px solid ${bcol}` : '0 solid transparent';
  m['--ui-card-bg'] = kaca ? W.rgba(P.surface, Math.max(.4, 1 - .62 * g)) : P.surface;
  m['--ui-modal-bg'] = kaca ? W.rgba(P.surface, .94) : P.surface;
  m['--ui-bf'] = kaca ? `blur(${R(4 + 20 * g)}px) saturate(1.4)` : 'none';
  m['--clay'] = bayangan(u, P, 'card'); m['--shadow'] = m['--clay'];
  // tombol
  m['--ui-btn-bw'] = Math.max(u.bw, 1) + 'px';
  if (u.ink) m['--ui-btn-bc'] = P.ink;
  m['--ui-btn-shadow'] = bayangan(u, P, 'btn');
  m['--ui-btn-shadow-h'] = u.depth === 'hard' ? bayangan(u, P, 'btn-h') : m['--ui-btn-shadow'];
  m['--ui-btn-shadow-a'] = u.depth === 'hard' ? bayangan(u, P, 'btn-a') : (u.depth === 'neu' ? bayangan(u, P, 'pressed') : m['--ui-btn-shadow']);
  m['--ui-neu-pressed'] = bayangan(u, P, 'pressed');
  m['--ui-btn-bg'] = u.grad > 0 ? `linear-gradient(135deg, ${P.primary}, ${W.mix(P.primary, P.secondary, Math.min(.85, u.grad / 100 * .9))})` : P.primary;
  if (u.depth === 'hard') { m['--ui-lift'] = 'translate(-1px,-1px)'; m['--ui-press'] = 'translate(2px,2px)'; }
  else if (u.depth === 'flat' || u.depth === 'line') { m['--ui-lift'] = 'none'; m['--ui-press'] = 'none'; }
  // input
  const inClay = u.depth === 'clay' || u.depth === 'neu';
  m['--ui-in-bg'] = u.depth === 'neu' ? P.bg : (kaca ? W.rgba(P.surface, .6) : P.surface);
  m['--ui-in-bd'] = inClay ? '0 solid transparent' : `${Math.max(u.bw, 1)}px solid ${u.ink ? P.ink : P.inputLine}`;
  m['--ui-in-shadow'] = bayangan(u, P, 'input');
  m['--ui-in-focus'] = `0 0 0 3px ${W.rgba(P.primary, .28)}`;
  // latar halaman
  const [img, size] = polaLatar(u.pat, P);
  m['--ui-page-img'] = img; m['--ui-page-size'] = size;
  m['--ui-login-img'] = u.pat === 'none' ? polaLatar('blobs', P)[0] : img;
  // sidebar
  m['--ui-shell-gap'] = u.float ? '12px' : '0px';
  m['--ui-side-r'] = u.float ? Math.min(R(r * 2.2), 40) + 'px' : '0px';
  m['--ui-side-bg'] = P.sideBg;
  m['--ui-side-bd'] = bw && u.side !== 'glass' ? `${bw}px solid ${u.ink ? P.ink : P.line}` : (u.side === 'light' && !u.float && u.depth !== 'neu' ? `1px solid ${P.line}` : '0');
  m['--ui-side-shadow'] = (u.float || u.depth === 'neu') ? bayangan(u, P, 'card') : 'none';
  const terang = u.side === 'tint' || u.side === 'light' || u.side === 'glass';
  if (terang) {
    m['--ui-nav-act-bg'] = u.depth === 'neu' ? P.bg : P.surface; m['--ui-nav-act-fg'] = P.text;
    m['--ui-nav-ico-bg'] = W.rgba(P.surface, .6); m['--ui-nav-ico-fg'] = P.secondary;
    m['--ui-nav-ico-act-bg'] = W.mix(P.primary, P.surface, .84); m['--ui-nav-ico-act-fg'] = P.primary;
  } else if (u.side === 'solid') {
    m['--ui-nav-act-bg'] = W.rgba(P.onSb, .2); m['--ui-nav-act-fg'] = P.onSb;
    m['--ui-nav-ico-bg'] = W.rgba(P.onSb, .12); m['--ui-nav-ico-fg'] = P.onSb;
    m['--ui-nav-ico-act-bg'] = W.rgba(P.onSb, .2); m['--ui-nav-ico-act-fg'] = P.onSb;
  } else {
    m['--ui-nav-act-bg'] = P.primary; m['--ui-nav-act-fg'] = P.onPrimary;
    m['--ui-nav-ico-bg'] = W.rgba(P.onSb, .1); m['--ui-nav-ico-fg'] = P.onSb;
    m['--ui-nav-ico-act-bg'] = W.rgba(P.onPrimary, .18); m['--ui-nav-ico-act-fg'] = P.onPrimary;
  }
  if (u.depth === 'hard') { m['--ui-nav-act-sh'] = '3px 3px 0 0 ' + P.ink; m['--ui-nav-ol'] = `2px solid ${P.ink}`; }
  else if (u.depth === 'neu') { m['--ui-nav-act-sh'] = bayangan(u, P, 'pressed'); m['--ui-nav-ol'] = 'none'; }
  else if (u.depth === 'flat' || u.depth === 'line') { m['--ui-nav-act-sh'] = 'none'; m['--ui-nav-ol'] = 'none'; }
  else { m['--ui-nav-act-sh'] = `0 8px 20px -8px ${W.rgba(P.sh, .38)}`; m['--ui-nav-ol'] = 'none'; }
  // hero dashboard
  if (u.grad >= 35) {
    m['--ui-hero-bg'] = `linear-gradient(120deg, ${P.primary}, ${W.mix(P.primary, P.secondary, .7)})`;
    m['--c-hero-fg'] = P.onPrimary; m['--c-hero-fg-soft'] = W.rgba(P.onPrimary, .86);
  } else {
    m['--ui-hero-bg'] = `linear-gradient(120deg, ${W.mix(P.primary, P.surface, .8)}, ${W.mix(P.primary, P.surface, .66)})`;
    m['--c-hero-fg'] = P.text; m['--c-hero-fg-soft'] = W.rgba(P.text, .72);
  }
  return m;
}

// ---- Pengendali tema aktif --------------------------------------------------
const Tampilan = (() => {
  const CACHE = 'cbt_tema_v2';
  let terpasang = [];
  let aktif = null;     // tema (yang sedang tampil)
  let tersimpan = null; // tema yang terakhir disimpan/dimuat (untuk Batalkan)
  const mqGelap = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function normalisasiTema(t) {
    t = t || {};
    const D = PALET_PRESET[0], W = Warna;
    return {
      primary: W.valid(t.primary) ? t.primary : D.primary,
      secondary: W.valid(t.secondary) ? t.secondary : D.secondary,
      accent: W.valid(t.accent) ? t.accent : D.accent,
      bg: W.valid(t.bg) ? t.bg : D.bg,
      text: W.valid(t.text) ? t.text : D.text,
      mode: ['light', 'dark', 'auto'].includes(t.mode) ? t.mode : 'light',
      rot: ['tetap', 'harian', 'harian-total'].includes(t.rot) ? t.rot : 'tetap',
      ui: normalisasiUI(t.ui || GAYA_BY_ID.softclay.u)
    };
  }
  function efektif(t, tanpaRotasi) {
    if (tanpaRotasi || t.rot === 'tetap') return t;
    const d = new Date(), seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const rnd = mulberry32(seed * 7 + 13);
    const g = buatGayaAcak(rnd);
    const r = Object.assign({}, t, { ui: normalisasiUI(g.u), mode: t.mode === 'auto' ? 'auto' : g.mode });
    if (t.rot === 'harian-total') Object.assign(r, buatPaletAcak(rnd));
    return r;
  }
  function gelapEfektif(mode) { return mode === 'dark' || (mode === 'auto' && !!(mqGelap && mqGelap.matches)); }

  function setVars(map) {
    const st = document.documentElement.style;
    terpasang.forEach(k => { if (!(k in map)) st.removeProperty(k); });
    terpasang = Object.keys(map);
    for (const k in map) st.setProperty(k, map[k]);
  }
  function petaUntuk(t, u) {
    const P = hitungPalet(t, u, gelapEfektif(t.mode));
    return { P, map: petaVar(t, u, P) };
  }
  function terapkan(tema, opsi) {
    opsi = opsi || {};
    const t = efektif(normalisasiTema(tema), opsi.tanpaRotasi);
    aktif = t;
    muatFont(t.ui.font);
    const { P, map } = petaUntuk(t, t.ui);
    setVars(map);
    const el = document.documentElement;
    el.style.colorScheme = P.gelap ? 'dark' : 'light';
    el.dataset.depth = t.ui.depth; el.dataset.glass = t.ui.glass > 0 ? '1' : '0'; el.dataset.mode = P.gelap ? 'dark' : 'light';
    const mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', P.sidebar);
    return t;
  }
  function pasangVarPada(el, tema, u) {
    const t = normalisasiTema(tema);
    const { map } = petaUntuk(t, normalisasiUI(u));
    el.style.cssText = Object.keys(map).map(k => `${k}:${map[k]}`).join(';');
  }
  function muatCache() {
    try { const raw = localStorage.getItem(CACHE); if (raw) { const t = JSON.parse(raw); tersimpan = normalisasiTema(t); terapkan(t); return true; } } catch (e) {}
    return false;
  }
  function simpanCache(t) { try { localStorage.setItem(CACHE, JSON.stringify(t)); } catch (e) {} }
  function tandaiTersimpan(t) { tersimpan = normalisasiTema(t); simpanCache(tersimpan); }
  function kode(t) { t = normalisasiTema(t); return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, c: [t.primary, t.secondary, t.accent, t.bg, t.text], m: t.mode, u: t.ui })))); }
  function dariKode(s) {
    const o = JSON.parse(decodeURIComponent(escape(atob(String(s).trim()))));
    if (!o || !o.c || o.c.length < 5) throw new Error('Kode tidak valid');
    return normalisasiTema({ primary: o.c[0], secondary: o.c[1], accent: o.c[2], bg: o.c[3], text: o.c[4], mode: o.m, ui: o.u });
  }
  if (mqGelap && mqGelap.addEventListener) mqGelap.addEventListener('change', () => { if (aktif && aktif.mode === 'auto') terapkan(tersimpan || aktif, {}); });
  return { terapkan, normalisasiTema, pasangVarPada, muatCache, tandaiTersimpan, kode, dariKode, get tersimpan() { return tersimpan; }, get aktif() { return aktif; } };
})();
Tampilan.muatCache();

function terapkanTema(tema) { if (tema) { Tampilan.tandaiTersimpan(tema); Tampilan.terapkan(tema); } }
async function muatTemaGlobal() {
  const res = await api('getTema', {});
  if (res.ok) terapkanTema(res.tema);
}

function unduhTeks(teks, filename) {
  const blob = new Blob(['\uFEFF' + teks], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// Bikin file .xlsx sungguhan (bukan teks koma) supaya saat dibuka di Excel/Google
// Sheets datanya langsung rapi per kolom, tidak numpuk di satu kolom seperti CSV
// kadang bermasalah di beberapa pengaturan region (koma vs titik koma).
async function unduhXlsx(filename, headers, rows) {
  try { await muatPustaka_('xlsx'); } catch (e) { toast(e.message, 'error'); return; }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, filename);
}

// ----------------------------------------------------------------------------
// MINI-ZIP / .DOCX (tulis saja, tanpa pustaka pihak ketiga) — dipakai HANYA untuk
// membuat file "Unduh Template (.docx)" di Bank Soal. Zip ditulis metode STORE
// (tanpa kompresi) karena kita yang membuat isinya sendiri (bukan membaca file
// pihak lain), jadi tidak perlu implementasi DEFLATE. Untuk MEMBACA .docx yang
// diunggah guru (hasil edit di Microsoft Word, biasanya terkompresi), dipakai
// pustaka mammoth.js (lihat DocxImport & tag <script> mammoth di index.html) --
// menulis file jauh lebih sederhana daripada membaca file sembarang dari luar.
// ----------------------------------------------------------------------------
const CRC32_TABLE_ = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32_(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE_[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zU16_(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
function zU32_(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

function buatZipSederhana_(files) {
  const enc = new TextEncoder();
  const localParts = [], centralParts = [];
  let offset = 0;
  const time = 0, date = 0x21; // tanggal tetap (tidak penting untuk validitas file)
  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const content = f.content;
    const crc = crc32_(content);
    const size = content.length;
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0,
      ...zU16_(time), ...zU16_(date), ...zU32_(crc), ...zU32_(size), ...zU32_(size),
      ...zU16_(nameBytes.length), ...zU16_(0)
    ]);
    localParts.push(localHeader, nameBytes, content);
    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0,
      ...zU16_(time), ...zU16_(date), ...zU32_(crc), ...zU32_(size), ...zU32_(size),
      ...zU16_(nameBytes.length), ...zU16_(0), ...zU16_(0), ...zU16_(0), ...zU16_(0),
      ...zU32_(0), ...zU32_(offset)
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + content.length;
  });
  const centralStart = offset;
  let centralSize = 0; centralParts.forEach(p => centralSize += p.length);
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, ...zU16_(files.length), ...zU16_(files.length),
    ...zU32_(centralSize), ...zU32_(centralStart), 0, 0
  ]);
  const all = [...localParts, ...centralParts, eocd];
  let total = 0; all.forEach(p => total += p.length);
  const out = new Uint8Array(total);
  let pos = 0; all.forEach(p => { out.set(p, pos); pos += p.length; });
  return out;
}

function xmlEscape_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Tabel OOXML sederhana (dipakai buatDocxSederhana_ utk item {table:{headers,rows}}).
function buildTableXml_(headers, rows) {
  const w = Math.floor(9500 / headers.length);
  const grid = headers.map(() => `<w:gridCol w:w="${w}"/>`).join('');
  const cell = (text, bold) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p>${text ? `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape_(text)}</w:t></w:r>` : ''}</w:p></w:tc>`;
  const headerRow = `<w:tr>${headers.map(h => cell(h, true)).join('')}</w:tr>`;
  const bodyRows = rows.map(r => `<w:tr>${r.map(c => cell(c, false)).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headerRow}${bodyRows}</w:tbl>`;
}

// items: [{text, heading?, bold?} | {table:{headers,rows}}]. Halaman dibuat
// landscape (lebar) supaya tabel dgn banyak kolom (Opsi A..E dst) tidak terlalu
// sempit saat dibuka & diisi guru di Microsoft Word/WPS/LibreOffice.
function buatDocxSederhana_(items) {
  const enc = new TextEncoder();
  const body = items.map(p => {
    if (p.table) return buildTableXml_(p.table.headers, p.table.rows);
    if (p.heading) {
      return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${xmlEscape_(p.text)}</w:t></w:r></w:p>`;
    }
    const runs = String(p.text || '').length
      ? `<w:r>${p.bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape_(p.text)}</w:t></w:r>`
      : '';
    return `<w:p>${runs}</w:p>`;
  }).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr></w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const files = [
    { name: '[Content_Types].xml', content: enc.encode(contentTypes) },
    { name: '_rels/.rels', content: enc.encode(rels) },
    { name: 'word/document.xml', content: enc.encode(documentXml) }
  ];
  return buatZipSederhana_(files);
}

function unduhDocx_(filename, items) {
  const bytes = buatDocxSederhana_(items);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ----------------------------------------------------------------------------
// FORMAT TABEL IMPOR SOAL (dipakai bersama oleh Excel & Word) — satu baris tabel
// = satu soal. Kolom (nama header BEBAS URUTANNYA, dicocokkan lewat nama, tidak
// peka besar/kecil huruf): Kategori, Topik, Tipe, Pertanyaan, Gambar, Opsi A,
// Opsi B, Opsi C, Opsi D, Opsi E, Kunci, Bobot, Kesulitan.
//   • Tipe: PG (pilihan ganda), PGK (pilihan ganda kompleks/lebih dari satu
//     kunci), BS (benar/salah), Essay. Boleh juga nama panjangnya.
//   • Kunci: cukup HURUF opsi yang benar, mis. "C". Untuk PGK boleh lebih dari
//     satu dipisah koma, mis. "A,C". Untuk BS isi "Benar" atau "Salah". Untuk
//     Essay isi kata kunci penilaian otomatis dipisah koma.
//   • Gambar: KOSONGKAN jika tidak ada gambar, atau cukup ketik NAMA FILE
//     gambarnya saja (mis. "soal1.jpg") — lalu saat mengimpor, pilih juga
//     file-file gambar itu sekaligus lewat tombol "Pilih Gambar Pendukung"
//     (boleh pilih banyak file sekaligus), sistem otomatis mencocokkan nama
//     file ke soal yang sesuai. Boleh juga isi link gambar publik langsung.
// ----------------------------------------------------------------------------
const TIPE_SINONIM_ = {
  pg: 'pilihan_ganda', 'pilihanganda': 'pilihan_ganda', pilihan_ganda: 'pilihan_ganda', single: 'pilihan_ganda',
  pgk: 'checkbox', 'pilihangandakompleks': 'checkbox', checkbox: 'checkbox', kompleks: 'checkbox', multi: 'checkbox',
  bs: 'benar_salah', 'benarsalah': 'benar_salah', benar_salah: 'benar_salah',
  essay: 'uraian', uraian: 'uraian', isian: 'uraian'
};
// Deteksi tipe dari teks kolom Tipe. Toleran: abaikan tag HTML, huruf besar/kecil,
// spasi & tanda baca. Mengembalikan '' kalau tidak dikenali sama sekali.
function tipeDariTeks_(s) {
  const k = String(s || '').replace(/<[^>]*>/g, ' ').toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return '';
  if (TIPE_SINONIM_[k]) return TIPE_SINONIM_[k];
  if (/kompleks|checkbox|multi|pgk|jamak|lebihdarisatu/.test(k)) return 'checkbox';
  if (/jodoh|cocok|match|pasang|menjodohkan/.test(k)) return 'menjodohkan';
  if (/benarsalah|truefalse|^bs$|^tf$|^bsalah$/.test(k) || (k.includes('benar') && k.includes('salah'))) return 'benar_salah';
  if (/essay|esai|uraian|isian|isiansingkat|jawabansingkat/.test(k)) return 'uraian';
  if (/pilihanganda|^pg|single|biasa|opsi/.test(k)) return 'pilihan_ganda';
  return '';
}
function normalisasiTipeSoal_(s) {
  return tipeDariTeks_(s) || 'pilihan_ganda';
}
// "C" -> 2, "3" -> 2 (angka dianggap 1-based spy konsisten dgn huruf), "benar" -> 0, "salah" -> 1.
// `opsi` (opsional): daftar teks opsi soal ini -- dipakai sbg JARING PENGAMAN
// kalau guru mengisi kolom Kunci dengan TEKS JAWABANNYA LANGSUNG (mis. "Sel")
// alih-alih huruf opsi (mis. "A"), yang tanpa ini akan diam-diam dianggap "0"
// (opsi A) oleh Number("Sel") -> NaN -> 0, sehingga soal jadi SELALU disalahkan
// walau siswa memilih jawaban yang sebenarnya benar. Kembalikan -1 kalau kunci
// benar-benar tidak bisa dikenali sama sekali (dipakai pemanggil utk memberi
// peringatan ke guru, BUKAN didiamkan begitu saja).
function hurufKunciKeIndeks_(s, opsi) {
  const t = String(s || '').trim();
  const tUpper = t.toUpperCase();
  if (tUpper === 'BENAR') return 0;
  if (tUpper === 'SALAH') return 1;
  if (/^[A-H]$/.test(tUpper)) return tUpper.charCodeAt(0) - 65;
  if (opsi && opsi.length) {
    const norm = (x) => String(x || '').replace(/<[^>]*>/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const tNorm = norm(t);
    if (tNorm) {
      const idxPersis = opsi.findIndex(o => norm(o) === tNorm);
      if (idxPersis !== -1) return idxPersis;
      // Jaring pengaman kedua: cocok sebagian (mis. kunci "sel" vs opsi teks
      // kaya "Sel (unit terkecil)") -- hanya dipakai kalau hasilnya unik.
      const idxSebagian = opsi.map(o => norm(o)).reduce((acc, o, i) => (o.includes(tNorm) || tNorm.includes(o)) ? acc.concat(i) : acc, []);
      if (idxSebagian.length === 1) return idxSebagian[0];
    }
  }
  if (/^[A-H]$/i.test(tUpper)) return tUpper.charCodeAt(0) - 65; // (jaga-jaga, sudah tercakup di atas)
  if (t === '') return -1;
  const n = Number(t);
  if (!isNaN(n)) return Math.max(0, Math.round(n) - 1);
  return -1; // tidak dikenali sama sekali -> jangan diam-diam anggap opsi A
}

// ----------------------------------------------------------------------------
// KUNCI JAWABAN: pembacaan aman + status "sudah/belum ditetapkan".
// BUG LAMA: kunci_json disimpan "0" (opsi A) -> Google Sheets mengubahnya jadi
// ANGKA 0 -> saat dibaca `soal.kunci_json || 'null'` angka 0 dianggap kosong
// sehingga kunci A selalu "tidak terdeteksi" (dan skor soal itu selalu 0).
// Sekarang semua pembacaan lewat parseKunciJson_ yang paham angka 0.
// ----------------------------------------------------------------------------
function parseKunciJson_(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  if (typeof raw === 'object') return raw;
  const t = String(raw).trim();
  if (t === '') return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}
// Hasil: { ada, manual, label, indeks[] }.
//  ada    = kunci valid sudah ditetapkan
//  manual = soal Essay tanpa kata kunci (dikoreksi manual, bukan "belum")
function statusKunciSoal_(soal) {
  let opsi = null;
  try { opsi = JSON.parse(soal.opsi_json || 'null'); } catch (e) { opsi = null; }
  const k = parseKunciJson_(soal.kunci_json);
  const tipe = soal.tipe || 'pilihan_ganda';
  const huruf = (i) => String.fromCharCode(65 + i);
  const valid = (v, n) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)) && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < n;
  if (tipe === 'pilihan_ganda' || tipe === 'benar_salah') {
    const n = Array.isArray(opsi) ? opsi.length : 0;
    if (valid(k, n)) return { ada: true, manual: false, label: huruf(Number(k)), indeks: [Number(k)] };
    return { ada: false, manual: false, label: '', indeks: [] };
  }
  if (tipe === 'checkbox') {
    const n = Array.isArray(opsi) ? opsi.length : 0;
    const idx = Array.isArray(k) ? k.filter(v => valid(v, n)).map(Number) : [];
    if (idx.length) return { ada: true, manual: false, label: idx.map(huruf).join(', '), indeks: idx };
    return { ada: false, manual: false, label: '', indeks: [] };
  }
  if (tipe === 'menjodohkan') {
    const nKiri = opsi && Array.isArray(opsi.kiri) ? opsi.kiri.length : 0;
    const vals = (k && typeof k === 'object' && !Array.isArray(k)) ? Object.values(k) : [];
    const ok = nKiri > 0 && vals.length === nKiri && vals.every(v => v !== '' && v !== null && !isNaN(Number(v)));
    return { ada: ok, manual: false, label: ok ? 'pasangan lengkap' : '', indeks: [] };
  }
  const kata = (k && Array.isArray(k.kataKunci)) ? k.kataKunci.filter(x => String(x).trim()) : [];
  if (kata.length) return { ada: true, manual: false, label: kata.length + ' kata kunci', indeks: [] };
  return { ada: false, manual: true, label: '', indeks: [] };
}
// Baris Bank Soal (opsi_json = teks JSON) -> bentuk yang dipakai renderKontenSoal (soal.opsi).
function soalDenganOpsi_(soal) {
  if (soal && soal.opsi !== undefined && soal.opsi !== null && soal.opsi !== '') return soal;
  let opsi = null;
  try { opsi = JSON.parse(soal.opsi_json || 'null'); } catch (e) { opsi = null; }
  return Object.assign({}, soal, { opsi: opsi === null ? [] : opsi });
}

// Token ujian 6 karakter yang mudah dibaca siswa: TIDAK memakai angka 0 & huruf O
// (juga 1 & I) karena sulit dibedakan. Sisa: huruf A-Z (tanpa I, O) + angka 2-9.
const KARAKTER_TOKEN_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function buatTokenAman_(panjang) {
  panjang = panjang || 6;
  let hasil = '';
  const acak = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(panjang)) : null;
  for (let i = 0; i < panjang; i++) {
    const r = acak ? acak[i] : Math.floor(Math.random() * 4294967296);
    hasil += KARAKTER_TOKEN_.charAt(r % KARAKTER_TOKEN_.length);
  }
  return hasil;
}

// Normalisasi header kolom: lowercase, buang spasi -> dipakai sbg key peta.
function kunciHeader_(h) { return String(h || '').trim().toLowerCase().replace(/[\s._-]+/g, ''); }

// Satu baris tabel (array nilai kolom, SEJAJAR dgn `headers`) -> objek soal siap
// dikirim ke action 'importSoal'. `petaGambar`: Map nama-file(lowercase) -> URL
// gambar yg sudah diunggah (lihat Guru.unggahBatchGambarImpor). kategoriDefault
// dipakai kalau kolom Kategori kosong (mis. mapel yg sedang dibuka di Kelola Soal).
// `peringatan` (opsional, array): kalau diisi, baris dgn kunci jawaban yang tidak
// bisa dikenali (bukan huruf opsi A-H, bukan Benar/Salah, dan tidak cocok dgn
// teks opsi mana pun) akan DITULIS PESANNYA ke sini alih-alih diam-diam
// dianggap opsi A -- supaya guru pasti tahu & bisa memperbaikinya sebelum
// dipakai siswa (lihat catatan panjang di hurufKunciKeIndeks_ di atas).
function barisTabelJadiSoal_(headerIdx, nilai, guruId, kategoriDefault, petaGambar, peringatan) {
  const ambil = (nama) => { const i = headerIdx[nama]; return i == null ? '' : String(nilai[i] == null ? '' : nilai[i]).trim(); };
  const pertanyaan = ambil('pertanyaan');
  if (!pertanyaan) return null;
  // Baris petunjuk bawaan template ("(tambahkan baris baru di bawah sini...)") bukan soal.
  if (/^\(\s*tambahkan baris/i.test(pertanyaan.replace(/<[^>]*>/g, '').trim())) return null;
  const tipeTeks = ambil('tipe');
  let tipe = tipeDariTeks_(tipeTeks);
  if (!tipe) {
    // Kolom Tipe kosong / tak dikenali -> tebak otomatis dari isi baris.
    const opsiTebak = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(h => ambil('opsi' + h)).filter(Boolean);
    const kunciTebak = (ambil('kunci') || ambil('kuncijawaban')).replace(/<[^>]*>/g, '').trim();
    if (/^[A-H](\s*[,|;]\s*[A-H])+$/i.test(kunciTebak)) tipe = 'checkbox';
    else if (/^(benar|salah)$/i.test(kunciTebak) && opsiTebak.length <= 2) tipe = 'benar_salah';
    else if (opsiTebak.length >= 2 && opsiTebak.every(o => /\s(=|->|→|\|)\s|=|→/.test(o))) tipe = 'menjodohkan';
    else if (opsiTebak.length === 0) tipe = 'uraian';
    else tipe = 'pilihan_ganda';
    if (tipeTeks && peringatan) peringatan.push(`"${String(pertanyaan).replace(/<[^>]*>/g, '').trim().slice(0, 60)}": Tipe "${tipeTeks.replace(/<[^>]*>/g, '').trim()}" tidak dikenali — ditebak otomatis sebagai ${tipe}. Mohon periksa.`);
  }
  const gambarRaw = ambil('gambar');
  let gambar = '';
  if (gambarRaw) {
    if (/^(https?:|data:)/i.test(gambarRaw)) gambar = normalisasiUrlGambar(gambarRaw);
    else if (petaGambar && petaGambar.has(gambarRaw.trim().toLowerCase())) gambar = petaGambar.get(gambarRaw.trim().toLowerCase());
  }
  const item = {
    guru_id: guruId,
    // Impor dilakukan dari dalam halaman Kelola Soal 1 mapel -> SEMUA baris masuk
    // ke mapel yang sedang dibuka (persis seperti ejaan namanya), tidak peduli isi
    // kolom Kategori di file (template lama berisi "Simulasi"/"IPA", yang dulu
    // membuat soal menumpuk di kategori lama). Kolom Kategori di file hanya dipakai
    // bila tidak ada mapel yang sedang dibuka.
    kategori: kategoriDefault ? String(kategoriDefault).trim() : normalisasiKategoriSoal_(ambil('kategori') || 'Kuis'),
    subkategori: ambil('subkategori') || ambil('sub-kategori'),
    topik: ambil('topik'),
    tipe,
    pertanyaan,
    gambar,
    bobot: Number(ambil('bobot')) || 10,
    tingkat_kesulitan: (ambil('kesulitan') || ambil('tingkatkesulitan') || 'sedang').toLowerCase()
  };
  const potonganPertanyaan = (s) => { const teks = String(s).replace(/<[^>]*>/g, '').trim(); return teks.length > 60 ? teks.slice(0, 60) + '…' : teks; };
  if (tipe === 'menjodohkan') {
    // Tiap kolom Opsi berisi satu pasangan "Item kiri = Pasangan kanan"
    // (pemisah boleh = , -> , → atau |). Sisi kanan diacak otomatis, kunci dihitung.
    const pasangan = [];
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(h => {
      const teks = ambil('opsi' + h).replace(/<[^>]*>/g, '').trim();
      if (!teks) return;
      const m = teks.split(/\s*(?:->|→|=|\|)\s*/);
      if (m.length >= 2 && m[0] && m[1]) pasangan.push([m[0].trim(), m.slice(1).join(' ').trim()]);
      else if (peringatan) peringatan.push(`"${potonganPertanyaan(pertanyaan)}": opsi "${teks}" bukan pasangan (tulis dengan format "kiri = kanan") — dilewati.`);
    });
    if (pasangan.length < 2 && peringatan) peringatan.push(`"${potonganPertanyaan(pertanyaan)}": soal Jodohkan butuh minimal 2 pasangan ("kiri = kanan" pada kolom Opsi A, B, ...).`);
    const kiri = pasangan.map(x => x[0]);
    let urut = pasangan.map((_, i) => i);
    if (urut.length > 1) { urut = urut.slice(1).concat(urut.slice(0, 1)); } // putar 1 posisi: tidak sejajar dgn kiri
    const kanan = urut.map(i => pasangan[i][1]);
    const kunci = {};
    kiri.forEach((_, i) => { kunci[i] = urut.indexOf(i); });
    item.opsi_json = JSON.stringify({ kiri, kanan });
    item.kunci_json = JSON.stringify(kunci);
    return item;
  }
  if (tipe === 'pilihan_ganda' || tipe === 'checkbox' || tipe === 'benar_salah') {
    const opsi = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(h => ambil('opsi' + h)).filter(Boolean);
    item.opsi_json = JSON.stringify(opsi.length ? opsi : ['Benar', 'Salah']);
    const opsiUntukCocok = opsi.length ? opsi : ['Benar', 'Salah'];
    const kunciStr = ambil('kunci') || ambil('kuncijawaban');
    if (tipe === 'checkbox') {
      const idx = kunciStr.split(/[,|]/).map(s => hurufKunciKeIndeks_(s, opsiUntukCocok)).filter(i => i !== -1);
      if (idx.length === 0 && kunciStr && peringatan) {
        peringatan.push(`"${potonganPertanyaan(pertanyaan)}": kunci "${kunciStr}" tidak dikenali (bukan huruf opsi A-H atau teks opsi yang cocok) — TIDAK ADA jawaban yang ditandai benar, mohon perbaiki manual di Bank Soal.`);
      }
      item.kunci_json = JSON.stringify(idx);
    } else {
      const idxTunggal = hurufKunciKeIndeks_(kunciStr, opsiUntukCocok);
      if (idxTunggal === -1 && peringatan) {
        peringatan.push(`"${potonganPertanyaan(pertanyaan)}": kunci "${kunciStr}" tidak dikenali (bukan huruf opsi A-H, Benar/Salah, atau teks opsi yang cocok) — soal ini DIIMPOR TANPA KUNCI (ditandai ⚠ Belum ada kunci di Kelola Soal), mohon tetapkan manual lewat tombol Ubah.`);
      }
      item.kunci_json = idxTunggal === -1 ? '' : JSON.stringify(idxTunggal);
    }
  } else {
    item.tipe = 'uraian';
    item.opsi_json = '';
    const kataKunci = (ambil('kunci') || ambil('kuncijawaban')).split(',').map(s => s.trim()).filter(Boolean);
    item.kunci_json = JSON.stringify({ kataKunci });
  }
  return item;
}

// Ubah baris array-of-array (header di baris pertama) jadi daftar objek soal,
// dipakai untuk hasil XLSX.utils.sheet_to_json({header:1}) MAUPUN hasil parse
// <table> HTML dari dokumen Word (lihat Guru.importSoalDariDocx). `peringatan`
// (opsional, array): diteruskan ke barisTabelJadiSoal_ -- lihat penjelasan di sana.
function barisTabelKeSoalList_(rows, guruId, kategoriDefault, petaGambar, peringatan) {
  if (!rows.length) return [];
  const headerIdx = {};
  rows[0].forEach((h, i) => { headerIdx[kunciHeader_(h)] = i; });
  return rows.slice(1)
    .map(r => barisTabelJadiSoal_(headerIdx, r, guruId, kategoriDefault, petaGambar, peringatan))
    .filter(Boolean);
}


// Password acak yang mudah dibaca/diketik siswa (tanpa karakter mirip: 0/O, 1/l/I).
function buatPasswordAcak(panjang = 8) {
  const karakter = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let hasil = '';
  for (let i = 0; i < panjang; i++) hasil += karakter[Math.floor(Math.random() * karakter.length)];
  return hasil;
}

// Buat username otomatis dari nama lengkap (mis. "Budi Santoso" -> "budisantoso"),
// menghindari tabrakan dengan username yang sudah dipakai (case-insensitive) dengan
// menambahkan angka urut di belakang bila perlu (budisantoso, budisantoso2, dst).
function buatUsernameDariNama(nama, sudahDipakai) {
  const basis = String(nama || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // hilangkan tanda diakritik
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2) // ambil 2 kata pertama saja supaya tidak kepanjangan
    .join('') || 'siswa';
  const terpakai = new Set((sudahDipakai || []).filter(Boolean).map(u => String(u).toLowerCase()));
  let kandidat = basis;
  let n = 1;
  while (terpakai.has(kandidat.toLowerCase())) {
    n++;
    kandidat = basis + n;
  }
  return kandidat;
}

// Google Drive share link (https://drive.google.com/file/d/XXXX/view?usp=sharing)
// tidak bisa langsung dipakai sebagai <img src>. Fungsi ini mengubahnya otomatis jadi
// link tampilan langsung. Link gambar lain (imgur, hosting sekolah, dll) dibiarkan apa
// adanya. Dipakai saat impor massal soal bergambar lewat kolom "gambar" di template.
//
// PENTING: sejak awal 2024 Google MEMATIKAN pola lama "drive.google.com/uc?export=view&id=..."
// untuk hotlink <img src> lintas domain (lihat https://issuetracker.google.com/issues/319531488) --
// pola itu sekarang tampil sebagai ikon "gambar rusak". Pola pengganti resmi yang masih berfungsi
// adalah "drive.google.com/thumbnail?id=...&sz=...". Fungsi ini dipakai baik saat menyimpan URL
// baru maupun (lewat urlGambarAman_ di bawah) saat MENAMPILKAN URL lama yang sudah kadung
// tersimpan dengan pola lama, supaya logo/gambar soal yang sudah pernah diunggah ikut otomatis
// terperbaiki tanpa guru perlu upload ulang.
function idFileDrive_(url) {
  const u = String(url || '').trim();
  if (!u || u.indexOf('drive.google.com') === -1) return null;
  const cocokFile = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  const cocokId = u.match(/[?&]id=([^&]+)/);
  return cocokFile ? cocokFile[1] : (cocokId ? cocokId[1] : null);
}
// Beberapa pola hotlink Drive kadang tetap ditolak Google tergantung akun/wilayah/jaringan
// (mis. "thumbnail?id=" bisa kena rate-limit, "uc?export=view" makin sering diblokir).
// Daftar berurutan dari yang paling andal -> paling lawas, dipakai sebagai rantai
// cadangan otomatis oleh listener "error" global di bawah supaya logo/gambar TIDAK
// langsung tampil sebagai ikon "gambar rusak" begitu satu pola gagal.
function kandidatUrlDrive_(fileId) {
  return [
    `https://lh3.googleusercontent.com/d/${fileId}=w1000`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
    `https://drive.google.com/uc?export=view&id=${fileId}`
  ];
}
function normalisasiUrlGambar(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  const fileId = idFileDrive_(u);
  return fileId ? kandidatUrlDrive_(fileId)[0] : u;
}
// Dipakai di SEMUA tempat yang menampilkan gambar (src="...") -- termasuk data lama yang
// mungkin masih tersimpan dengan pola "uc?export=view" dari sebelum perbaikan ini.
function urlGambarAman_(url) {
  return normalisasiUrlGambar(url);
}
// Versi <img ...> siap-pakai (dipasang lewat innerHTML) yang membawa penanda
// data-drive-id/data-drive-tahap supaya listener "error" global bisa otomatis
// mencoba pola URL Drive berikutnya kalau pola pertama gagal dimuat, dan baru
// menyerah (tampil rapi, bukan ikon "gambar rusak") setelah semua pola dicoba.
function tagGambarAman_(url, kelas, altText) {
  const u = String(url || '').trim();
  if (!u) return '';
  const kelasAttr = kelas ? ` class="${escapeHtml_(kelas)}"` : '';
  const altAttr = ` alt="${escapeHtml_(altText || '')}"`;
  const fileId = idFileDrive_(u);
  if (!fileId) return `<img${kelasAttr}${altAttr} src="${escapeHtml_(u)}" decoding="async">`;
  const src = kandidatUrlDrive_(fileId)[0];
  return `<img${kelasAttr}${altAttr} src="${escapeHtml_(src)}" data-drive-id="${escapeHtml_(fileId)}" data-drive-tahap="1" decoding="async">`;
}
// Versi untuk kasus yang mengisi <img>.src lewat JS langsung (preview upload, dsb.)
// alih-alih lewat innerHTML -- tetap dipasangi penanda fallback yang sama.
function pasangSrcGambarAman_(imgEl, url) {
  const u = String(url || '').trim();
  if (!u) { imgEl.removeAttribute('src'); imgEl.removeAttribute('data-drive-id'); return; }
  const fileId = idFileDrive_(u);
  if (!fileId) { imgEl.src = u; imgEl.removeAttribute('data-drive-id'); return; }
  imgEl.dataset.driveId = fileId;
  imgEl.dataset.driveTahap = '1';
  imgEl.src = kandidatUrlDrive_(fileId)[0];
}
// Listener global (capture phase, supaya kepicu untuk <img> di mana saja termasuk yang
// baru disisipkan lewat innerHTML): begitu sebuah <img> gagal dimuat, coba pola Drive
// berikutnya di rantai kandidatUrlDrive_. Kalau logo (di dalam .app-logo-slot) habis
// semua kandidat, kembalikan ke ikon bawaan. Untuk gambar lain, ganti jadi kotak
// placeholder rapi ("Gambar tidak dapat dimuat") alih-alih ikon "gambar rusak" bawaan browser.
document.addEventListener('error', function (ev) {
  const img = ev.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset || !img.dataset.driveId) return;
  const fileId = img.dataset.driveId;
  const tahap = Number(img.dataset.driveTahap || '1');
  const kandidat = kandidatUrlDrive_(fileId);
  if (tahap < kandidat.length) {
    img.dataset.driveTahap = String(tahap + 1);
    img.src = kandidat[tahap];
    return;
  }
  const slotLogo = img.closest('.app-logo-slot');
  if (slotLogo) {
    slotLogo.innerHTML = '<i class="fa-solid fa-graduation-cap"></i>';
    return;
  }
  const placeholder = document.createElement('div');
  placeholder.className = 'gambar-gagal-muat' + (img.className ? ' ' + img.className : '');
  placeholder.textContent = '🖼 Gambar tidak dapat dimuat';
  if (img.parentNode) img.parentNode.replaceChild(placeholder, img);
}, true);

// Uraikan data URI (dihasilkan mammoth.images.dataUri saat membaca gambar yang ditempel
// langsung di dokumen Word) jadi bagian-bagian siap kirim ke action 'uploadGambar':
// {mimeType, base64, ekstensi}. Mengembalikan null kalau bukan data URI gambar yang valid.
function dataUriKeBagian_(dataUri) {
  const cocok = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUri || ''));
  if (!cocok) return null;
  const mimeType = cocok[1];
  const base64 = cocok[2];
  const ekstensi = (mimeType.split('/')[1] || 'png').split('+')[0]; // mis. "svg+xml" -> "svg"
  return { mimeType, base64, ekstensi };
}

// PERF IMPOR: jalankan `tugas(item, indeks)` untuk semua item dgn paling banyak
// `batas` yang berjalan bersamaan (kumpulan pekerja). Dipakai utk unggah gambar
// paralel -- sebelumnya satu per satu (1 gambar = 1 round-trip Drive ~2-5 detik).
async function jalankanParalel_(items, batas, tugas) {
  const hasil = new Array(items.length);
  let berikut = 0;
  async function pekerja() {
    while (true) {
      const i = berikut++;
      if (i >= items.length) return;
      hasil[i] = await tugas(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(batas, items.length) }, pekerja));
  return hasil;
}

// PERF IMPOR: perkecil gambar sebelum diunggah. Foto dari kamera/Word sering 2-6 MB,
// padahal tampilan soal hanya memakai lebar maks ~1000px (thumbnail?sz=w1000).
// Gambar kecil dibiarkan apa adanya. Gagal memperkecil -> pakai gambar asli.
async function perkecilGambar_(bagian) {
  try {
    if (!/^image\/(jpeg|png|webp|bmp)$/i.test(bagian.mimeType)) return bagian;
    if (bagian.base64.length < 150000) return bagian; // < ~110 KB: tidak perlu
    const biner = Uint8Array.from(atob(bagian.base64), c => c.charCodeAt(0));
    const blob = new Blob([biner], { type: bagian.mimeType });
    const bmp = await createImageBitmap(blob);
    const MAKS = 1000;
    const skala = Math.min(1, MAKS / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * skala));
    const h = Math.max(1, Math.round(bmp.height * skala));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const baru = dataUrl.split(',')[1];
    if (!baru || baru.length >= bagian.base64.length) return bagian; // tidak lebih kecil
    return { mimeType: 'image/jpeg', base64: baru, ekstensi: 'jpg' };
  } catch (e) {
    return bagian;
  }
}

// ---------------- Akses mentah ke database Mode Lokal (dipakai tombol paksa
// kirim/tarik data di Pengaturan, lihat Guru.kirimDataLokalKeSheet/tarikDataDariSheet) ----------------
const LOCAL_DB_KEY = 'cbt_local_db_v1';
function bacaDbLokalMentah() {
  try { LocalBackend.flush(); } catch (e) { /* belum ada penulisan tertunda */ }
  const kosong = () => ({ guru: [], siswa: [], bankSoal: [], ujian: [], sesi: [], log: [] });
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    const db = raw ? JSON.parse(raw) : null;
    if (!db || typeof db !== 'object') return kosong();
    return Object.assign(kosong(), db);
  } catch (e) { return kosong(); }
}
function tulisDbLokalMentah(db) {
  try { localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('Gagal menulis ke penyimpanan lokal (mungkin penuh).', 'error'); return false; }
}

// ---------------- Meta tampilan tiap "Mapel" (kartu di grid Bank Soal) ----------------
// Murni kosmetik (token acak 6 karakter + warna kartu) supaya tampilan kartu Mapel
// terasa seperti aplikasi CBT sekolah pada umumnya — TIDAK dipakai untuk validasi
// token ujian sungguhan (itu tetap kolom "token" di sheet Ujian, lihat tab Kelola
// Ujian). Disimpan per-perangkat di localStorage, terpisah dari data soal supaya
// tetap ringan & tidak perlu kolom baru di Sheets untuk sekadar hiasan kartu.
const MAPEL_META_KEY = 'cbt_mapel_meta_v1';
const MAPEL_WARNA_LIST = ['#16a97e', '#4a5cf0', '#f5a524', '#e0433d', '#7b5cf5', '#0ea5b7'];
function bacaSemuaMetaMapel_() {
  try { return JSON.parse(localStorage.getItem(MAPEL_META_KEY) || '{}'); } catch (e) { return {}; }
}
function ambilMetaMapel_(kategori, tandaiBuatan) {
  const semua = bacaSemuaMetaMapel_();
  const kunci = String(kategori || '').toLowerCase();
  let berubah = false;
  if (!semua[kunci]) {
    semua[kunci] = {
      token: buatTokenAman_(),
      warna: MAPEL_WARNA_LIST[Object.keys(semua).length % MAPEL_WARNA_LIST.length]
    };
    berubah = true;
  }
  // Mapel yang dibuat lewat "Tambah Mapel Baru" (nama asli disimpan) tetap muncul
  // sebagai kartu walau belum punya soal, supaya tidak hilang sebelum diisi.
  if (tandaiBuatan && !semua[kunci].buatan) { semua[kunci].buatan = String(kategori).trim(); berubah = true; }
  if (berubah) { try { localStorage.setItem(MAPEL_META_KEY, JSON.stringify(semua)); } catch (e) {} }
  return semua[kunci];
}
function hapusMapelBuatan_(kategori) {
  const semua = bacaSemuaMetaMapel_();
  const kunci = String(kategori || '').toLowerCase();
  if (semua[kunci]) { delete semua[kunci].buatan; try { localStorage.setItem(MAPEL_META_KEY, JSON.stringify(semua)); } catch (e) {} }
}

// ----------------------------------------------------------------------------
// STATE GLOBAL
// ----------------------------------------------------------------------------
const state = {
  user: null,          // { id, nama, role, kelas? }
  deviceId: null,
  role: 'siswa',        // role yg dipilih di layar login
  guru: {
    bankSoal: [], ujianList: [], daftarSiswa: [], tema: null, kategoriTerpilihUjian: [],
    // viewBankSoal: 'grid' (kartu per Mapel/kategori), 'kelola' (daftar soal 1 kategori,
    // dgn tab tipe soal), 'arsip' (grid kartu per kategori arsip), atau 'arsip-kategori'
    // (daftar soal 1 kategori arsip) — lihat Guru.bukaKelolaSoal/kembaliKeGridMapel/
    // bukaArsipSoal/bukaArsipKategori.
    viewBankSoal: 'grid', kategoriKelola: '', kategoriArsipKelola: '', tipeTabKelola: 'pilihan_ganda'
  },
  ujian: null,          // ujian aktif yg dipilih siswa (dari cekToken)
  sesiId: null,
  soal: [],
  jawaban: {},
  ragu: [],
  idxSoal: 0,
  sisaDetik: 0,
  maxPelanggaran: 999,
  pelanggaran: 0,
  timerHandle: null,
  autosaveHandle: null,
  pingHandle: null,
  autoRefreshHandle: null,
  submitting: false
};

// ----------------------------------------------------------------------------
// UTIL: device id, toast, api call
// ----------------------------------------------------------------------------
function getDeviceId() {
  let id = localStorage.getItem('cbt_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('cbt_device_id', id);
  }
  return id;
}

function toast(msg, jenis) {
  const box = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'toast-item' + (jenis ? ' ' + jenis : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ----------------------------------------------------------------------------
// PESAN HASIL BERDASARKAN RENTANG NILAI
// Guru bisa mengisi pesan berbeda untuk tiap rentang nilai (0, 1-5, 6-10, ..., 96-99, 100).
// Jika guru tidak mengubah apa pun (kolom pesan_nilai kosong) atau mengosongkan
// satu pesan, otomatis dipakai pesan DEFAULT di bawah ini.
// ----------------------------------------------------------------------------
const DEFAULT_PESAN_NILAI = [
  { min: 0, max: 0, pesan: "Nilai Anda 0. Jangan berkecil hati, ini bisa diperbaiki. Segera temui guru mata pelajaran untuk jadwal remedial dan pelajari kembali materinya dari awal." },
  { min: 1, max: 5, pesan: "Nilai Anda masih sangat rendah. Mulailah belajar lagi dari konsep paling dasar dan segera hubungi guru untuk jadwal remedial." },
  { min: 6, max: 10, pesan: "Nilai Anda masih sangat rendah. Pelajari kembali materi dengan tenang dan bertahap, lalu temui guru untuk bimbingan remedial." },
  { min: 11, max: 15, pesan: "Anda baru menguasai sebagian kecil materi. Ulangi catatan dan contoh soal, lalu hubungi guru untuk jadwal remedial." },
  { min: 16, max: 20, pesan: "Nilai Anda masih rendah. Fokus pada materi yang belum dipahami dan minta bimbingan guru pada sesi remedial." },
  { min: 21, max: 25, pesan: "Ada sedikit kemajuan, tetapi pemahaman Anda masih perlu ditingkatkan. Latihan soal secara rutin dan ikuti remedial." },
  { min: 26, max: 30, pesan: "Nilai Anda masih di bawah harapan. Perbanyak latihan soal dan jangan ragu bertanya kepada guru saat remedial." },
  { min: 31, max: 35, pesan: "Anda sudah memahami sebagian materi. Lengkapi bagian yang masih lemah dan hubungi guru untuk informasi remedial." },
  { min: 36, max: 40, pesan: "Terus semangat! Masih banyak bagian yang bisa diperbaiki. Pelajari kembali materi yang keliru dan ikuti remedial." },
  { min: 41, max: 45, pesan: "Pemahaman Anda mulai terbentuk. Tingkatkan lagi dengan membahas soal-soal yang salah bersama guru atau teman." },
  { min: 46, max: 50, pesan: "Anda sudah di tengah jalan. Dengan belajar lebih giat, nilai Anda bisa naik. Hubungi guru untuk jadwal remedial." },
  { min: 51, max: 55, pesan: "Hasil Anda sudah cukup lumayan, tetapi belum mencapai target. Periksa kembali jawaban yang keliru dan ikuti remedial." },
  { min: 56, max: 60, pesan: "Anda sudah cukup memahami materi. Sedikit usaha lagi untuk mencapai target, jadi pelajari bagian yang masih salah." },
  { min: 61, max: 65, pesan: "Hasil yang cukup baik, hanya perlu sedikit peningkatan. Pelajari kembali soal yang salah dan konsultasikan dengan guru." },
  { min: 66, max: 70, pesan: "Anda hampir mencapai target. Teliti lagi bagian yang keliru, lalu hubungi guru bila perlu mengikuti remedial." },
  { min: 71, max: 75, pesan: "Anda sudah sangat dekat dengan target. Jika nilai belum mencapai KKM, ikuti remedial dan perbaiki bagian yang masih keliru." },
  { min: 76, max: 80, pesan: "Hasil yang baik! Anda sudah menguasai sebagian besar materi. Tetap rajin berlatih." },
  { min: 81, max: 85, pesan: "Hasil yang bagus! Pemahaman Anda sudah kuat. Pertahankan dan terus asah kemampuan Anda." },
  { min: 86, max: 90, pesan: "Hasil yang sangat bagus! Anda menguasai materi dengan baik. Terus pertahankan semangat belajar Anda." },
  { min: 91, max: 95, pesan: "Luar biasa! Anda menguasai hampir seluruh materi. Pertahankan prestasi ini." },
  { min: 96, max: 99, pesan: "Hebat sekali! Nilai Anda nyaris sempurna. Tinggal sedikit lagi menuju nilai tertinggi." },
  { min: 100, max: 100, pesan: "Sempurna! Nilai 100. Selamat atas hasil yang luar biasa dan terima kasih atas kerja keras Anda!" }
];

function parsePesanNilai_(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

// Mengembalikan teks pesan untuk sebuah nilai. Urutan prioritas:
// (1) pesan buatan guru yang rentangnya cocok & tidak kosong,
// (2) pesan default yang rentangnya cocok.
function pesanUntukNilai_(nilai, pesanNilaiRaw) {
  const n = Math.round(Number(nilai) || 0);
  const cocok = r => n >= Number(r.min) && n <= Number(r.max);
  const buatanGuru = parsePesanNilai_(pesanNilaiRaw).find(r => cocok(r) && String(r.pesan || '').trim());
  if (buatanGuru) return String(buatanGuru.pesan).trim();
  const bawaan = DEFAULT_PESAN_NILAI.find(cocok);
  return bawaan ? bawaan.pesan : '';
}

function escapeHtml_(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function teksSoalHtml(str) { return escapeHtml_(str).replace(/\n/g, '<br>'); }

// ----------------------------------------------------------------------------
// RICH TEXT: dipakai pada kotak Pertanyaan & Opsi Jawaban di form soal supaya
// guru bisa mengatur bold/underline/warna dst (lihat UI.rtExec, UI.rtSaveSelection
// & elemen ber-class "rich-editable"). Semua HTML hasil kotak ini dibersihkan
// (sanitasi) sebelum disimpan maupun ditampilkan, hanya tag/atribut pemformatan
// teks dasar yang diizinkan — supaya aman dari HTML/skrip yang tidak diinginkan.
// ----------------------------------------------------------------------------
const RT_TAG_DIIZINKAN = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, SPAN: 1, BR: 1, DIV: 1, P: 1, FONT: 1, SUB: 1, SUP: 1, IMG: 1 };
const RT_STYLE_DIIZINKAN = /^(color|background-color|text-decoration|font-weight|font-style|font-family|font-size)\s*:/i;
// src gambar inline (disisipkan lewat tombol 🖼 di toolbar) boleh berupa data:
// URL (Mode Lokal) atau http(s) URL (Mode Server/Drive) -- selain itu dibuang.
const RT_IMG_SRC_AMAN = /^(https?:|data:image\/)/i;

function sanitasiHtmlKaya_(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html == null ? '' : html);
  (function bersihkan(node) {
    Array.from(node.childNodes).forEach(anak => {
      if (anak.nodeType === 1) { // element node
        if (!RT_TAG_DIIZINKAN[anak.tagName]) {
          // tag tak dikenal (mis. <script>, <img> nyasar, dsb) -> buang tag-nya,
          // tapi pertahankan isinya (teks/anak-anaknya) supaya konten tidak hilang
          while (anak.firstChild) node.insertBefore(anak.firstChild, anak);
          node.removeChild(anak);
          return;
        }
        Array.from(anak.attributes).forEach(attr => {
          if (attr.name === 'style') {
            const aman = attr.value.split(';').map(s => s.trim())
              .filter(s => RT_STYLE_DIIZINKAN.test(s)).join('; ');
            if (aman) anak.setAttribute('style', aman); else anak.removeAttribute('style');
          } else if (attr.name === 'color' && anak.tagName === 'FONT') {
            // biarkan atribut color pada <font> (dihasilkan execCommand foreColor di sebagian browser)
          } else if (attr.name === 'src' && anak.tagName === 'IMG') {
            // PENTING: sebelumnya atribut src ikut dibuang di baris "else" bawah ini --
            // akibatnya SEMUA <img> di teks kaya (soal/opsi) tampil kosong/hilang meski
            // gambarnya berhasil diunggah. Sekarang src dipertahankan selama URL-nya aman
            // (http/https atau data:image/...), selain itu dibuang.
            if (!RT_IMG_SRC_AMAN.test(attr.value)) anak.removeAttribute('src');
          } else {
            anak.removeAttribute(attr.name);
          }
        });
        bersihkan(anak);
      } else if (anak.nodeType !== 3) {
        node.removeChild(anak); // buang comment dsb, teks (nodeType 3) dibiarkan
      }
    });
  })(tpl.content);
  return tpl.innerHTML;
}

function isiKayaOtomatis_(str) { return /<[a-z][\s\S]*>/i.test(String(str || '')); }

// Dipakai untuk menampilkan konten yang BISA berupa teks polos lama (sebelum
// fitur format kaya ada) ATAU HTML hasil kotak rich text baru — supaya data
// lama tetap tampil benar tanpa perlu migrasi.
function kontenSoalHtml(str) {
  const s = String(str == null ? '' : str);
  if (!s) return '';
  return isiKayaOtomatis_(s) ? sanitasiHtmlKaya_(s) : teksSoalHtml(s);
}

function richTeksKosong_(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html == null ? '' : html);
  return !tpl.content.textContent.trim();
}

function renderMatika(el) {
  if (window.renderMathInElement) {
    try {
      renderMathInElement(el, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
    } catch (e) { /* abaikan error render */ }
  }
}

// Membangun HTML 1 soal (pertanyaan + gambar + opsi/kotak jawaban sesuai
// tipe). Dipakai OLEH DUA TEMPAT: ExamEngine.renderSoal (layar ujian siswa
// sungguhan, interaktif = true) dan Pratinjau Soal di Portal Guru (Guru.
// pratinjauSatuSoal/pratinjauKategoriSoal, interaktif = false). Sengaja 1
// fungsi yang sama supaya pratinjau di Portal Guru dijamin SAMA PERSIS
// dengan yang dilihat siswa -- tidak ada kode render terpisah yang bisa
// menyimpang seiring waktu. opts.jawaban dipakai untuk menandai opsi yang
// sudah dipilih (kosong/diabaikan saat pratinjau, karena pratinjau tidak
// mewakili jawaban siswa mana pun).
function renderKontenSoal(soal, opts) {
  opts = opts || {};
  const interaktif = opts.interaktif !== false;
  const jawaban = opts.jawaban || {};
  const tandaiKunci = Array.isArray(opts.tandaiKunci) ? opts.tandaiKunci : [];
  const tagKunci = (i) => tandaiKunci.includes(i) ? '<span class="opsi-kunci-tag">✔ Kunci</span>' : '';
  let html = '';
  if (opts.nomor && opts.total) html += `<div class="no">Soal ${opts.nomor} dari ${opts.total}</div>`;
  html += `<div class="pertanyaan">${kontenSoalHtml(soal.pertanyaan)}</div>`;
  if (soal.gambar) html += tagGambarAman_(soal.gambar, 'gambar-soal', 'Gambar soal');

  // Setiap item opsi bisa berupa string polos (data lama) atau objek
  // { teks, gambar } (format baru yang mendukung teks berformat & gambar opsi).
  const opsiObj = (o) => (o && typeof o === 'object') ? o : { teks: o || '', gambar: '' };

  if (soal.tipe === 'pilihan_ganda' || soal.tipe === 'benar_salah') {
    html += '<div class="opsi-list">' + (soal.opsi || []).map((o, i) => {
      const item = opsiObj(o);
      const selected = jawaban[soal.id] === i;
      const onclick = interaktif ? ` onclick="ExamEngine.pilihJawabanTunggal('${soal.id}', ${i})"` : '';
      return `<label class="opsi-item ${selected ? 'selected' : ''}${interaktif ? '' : ' opsi-readonly'}${tandaiKunci.includes(i) ? ' opsi-kunci' : ''}"${onclick}>
        <span class="opsi-huruf">${String.fromCharCode(65 + i)}</span>
        <span class="opsi-konten">${kontenSoalHtml(item.teks)}${item.gambar ? tagGambarAman_(item.gambar, 'opsi-gambar-tampil', 'Gambar opsi') : ''}</span>${tagKunci(i)}
      </label>`;
    }).join('') + '</div>';
  } else if (soal.tipe === 'checkbox') {
    const dipilih = jawaban[soal.id] || [];
    html += '<div class="opsi-list">' + (soal.opsi || []).map((o, i) => {
      const item = opsiObj(o);
      const selected = dipilih.includes(i);
      const onclick = interaktif ? ` onclick="ExamEngine.toggleJawabanGanda('${soal.id}', ${i})"` : '';
      return `<label class="opsi-item ${selected ? 'selected' : ''}${interaktif ? '' : ' opsi-readonly'}${tandaiKunci.includes(i) ? ' opsi-kunci' : ''}"${onclick}>
        <span class="opsi-huruf">${selected ? '&#10003;' : String.fromCharCode(65 + i)}</span>
        <span class="opsi-konten">${kontenSoalHtml(item.teks)}${item.gambar ? tagGambarAman_(item.gambar, 'opsi-gambar-tampil', 'Gambar opsi') : ''}</span>${tagKunci(i)}
      </label>`;
    }).join('') + '</div>';
  } else if (soal.tipe === 'menjodohkan') {
    const jwb = jawaban[soal.id] || {};
    html += (soal.opsi.kiri || []).map((teksKiri, i) => `
      <div class="match-row">
        <div class="kiri">${escapeHtml_(teksKiri)}</div>
        <select ${interaktif ? `onchange="ExamEngine.pilihJodoh('${soal.id}', ${i}, this.value)"` : 'disabled'}>
          <option value="">— pilih pasangan —</option>
          ${(soal.opsi.kanan || []).map((teksKanan, j) => `<option value="${j}" ${String(jwb[i]) === String(j) ? 'selected' : ''}>${escapeHtml_(teksKanan)}</option>`).join('')}
        </select>
      </div>`).join('');
  } else { // uraian
    const isi = jawaban[soal.id] || '';
    html += `<textarea rows="8" placeholder="Tulis jawaban Anda di sini..." ${interaktif ? `oninput="ExamEngine.isiJawabanUraian('${soal.id}', this.value)"` : 'readonly'}>${escapeHtml_(isi)}</textarea>`;
  }
  return html;
}

// Jika CONFIG.API_URL diisi -> kirim ke backend Google Apps Script (POST,
// Content-Type text/plain agar tidak memicu CORS preflight yang tidak
// didukung baik oleh Apps Script Web App). Jika tidak -> pakai LocalBackend
// (localStorage) sehingga aplikasi tetap berfungsi penuh tanpa setup apa pun.
//
// Otomatis mencoba ulang (retry) beberapa kali dengan jeda kalau terjadi
// kegagalan JARINGAN (bukan kegagalan logika seperti password salah) —
// berguna saat banyak siswa online bersamaan dan sesekali ada koneksi yang
// lambat/putus sesaat. Backend sendiri (lihat Code.gs) sudah dirancang
// supaya operasi paling sering (autosave dsb.) TIDAK memerlukan retry ini
// dalam kondisi normal karena tidak lagi berebut kunci server.
const MAKS_PERCOBAAN_API = 3;
async function api(action, payload) {
  const body = Object.assign({ action }, payload || {});
  mulaiLoading();
  try {
    if (!modeServerAktif()) {
      try {
        return await LocalBackend.route(action, body);
      } catch (err) {
        console.error(err);
        return { ok: false, error: 'Kesalahan lokal: ' + (err && err.message ? err.message : String(err)) };
      }
    }
    let errTerakhir = null;
    for (let percobaan = 1; percobaan <= MAKS_PERCOBAAN_API; percobaan++) {
      try {
        const res = await fetch(efektifApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body)
        });
        return await res.json();
      } catch (err) {
        errTerakhir = err;
        if (percobaan < MAKS_PERCOBAAN_API) {
          await new Promise(r => setTimeout(r, 600 * percobaan)); // 600ms, lalu 1200ms
        }
      }
    }
    toast('Gagal terhubung ke server: ' + errTerakhir.message, 'error');
    return { ok: false, error: String(errTerakhir) };
  } finally {
    selesaiLoading();
  }
}

// ============================================================================
// LOCAL BACKEND — implementasi API yang sama persis kontraknya dengan Code.gs,
// tapi menyimpan semua data di localStorage browser ini. Dipakai otomatis
// kapan pun CONFIG.API_URL kosong, supaya aplikasi "siap pakai" tanpa
// perlu deploy Google Apps Script terlebih dahulu.
// ============================================================================
const LocalBackend = (function () {
  const DB_KEY = 'cbt_local_db_v1';
  let db = null;

  function defaultTemaLocal() {
    return { primary: '#e58a72', secondary: '#6f9f94', accent: '#e9b44c', bg: '#faf6f1', text: '#2d2a26' };
  }

  function muat() {
    if (db) return db;
    let raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch (e) {}
    try { db = raw ? JSON.parse(raw) : null; } catch (e) { db = null; }
    if (!db || typeof db !== 'object') db = {};
    db.guru = db.guru || [];
    db.siswa = db.siswa || [];
    db.bankSoal = db.bankSoal || [];
    db.ujian = db.ujian || [];
    db.sesi = db.sesi || [];
    db.log = db.log || [];
    db.config = db.config || {};
    if (db.guru.length === 0) {
      db.guru.push({ id: 'G001', username: 'admin', password: 'admin123', nama: 'Administrator', tema_json: JSON.stringify(defaultTemaLocal()) });
    }
    return db;
  }

  // PERFORMA (Mode Lokal): JSON.stringify seluruh database (bisa berisi banyak gambar)
  // lalu menulisnya ke localStorage di SETIAP aksi -- termasuk tiap jawaban & ping --
  // membuat aplikasi tersendat. Sekarang penulisan digabung (maks. 1x per 400 ms) dan
  // dipaksa tuntas saat halaman ditutup/disembunyikan, jadi data tetap aman.
  let _simpanTimer = null;
  function tulisSekarang() {
    clearTimeout(_simpanTimer); _simpanTimer = null;
    if (!db) return true;
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      toast('Penyimpanan lokal penuh/gagal — coba hapus gambar soal berukuran besar, atau gunakan mode Server.', 'error');
      return false;
    }
  }
  function simpan() {
    if (_simpanTimer === null) _simpanTimer = setTimeout(tulisSekarang, 400);
    return true;
  }
  window.addEventListener('pagehide', () => { if (_simpanTimer !== null) tulisSekarang(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && _simpanTimer !== null) tulisSekarang(); });

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function genId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5); }
  function cariIdx(list, id) { return list.findIndex(x => String(x.id) === String(id)); }

  function shuffleSeeded(arr, seedStr) {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    const a = arr.slice();
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (let j = a.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      const tmp = a[j]; a[j] = a[k]; a[k] = tmp;
    }
    return a;
  }

  // `idxOrder` (opsional): peta posisi-tampil -> indeks-opsi-asli, KHUSUS untuk
  // soal yang opsinya diacak per siswa (lihat opsiAcakMap di action 'mulaiUjian').
  // PENTING: siswa memilih & menjawab berdasarkan POSISI YANG TAMPIL di layarnya
  // (yang sudah diacak), sedangkan `kunci` di bawah selalu memakai INDEKS OPSI
  // ASLI (urutan sebelum diacak, sesuai saat guru membuat soal). Tanpa
  // menerjemahkan lewat idxOrder di sini, soal dengan opsi teracak akan
  // dianggap salah setiap kali posisi jawaban yang benar bergeser dari indeks
  // aslinya -- walau kunci jawaban yang diisi guru sudah 100% benar. Ini
  // sebelumnya adalah BUG: skorSoal() membandingkan posisi-tampil langsung ke
  // kunci tanpa penerjemahan ini.
  function skorSoal(soal, jwb, idxOrder) {
    const bobot = Number(soal.bobot) || 0;
    if (jwb === undefined || jwb === null || jwb === '') return 0;
    let kunci;
    kunci = parseKunciJson_(soal.kunci_json);
    if (kunci === null) return 0;
    const keIndeksAsli = (posisiTampil) => {
      const p = Number(posisiTampil);
      return (Array.isArray(idxOrder) && idxOrder[p] !== undefined) ? Number(idxOrder[p]) : p;
    };
    switch (soal.tipe) {
      case 'pilihan_ganda':
      case 'benar_salah':
        return keIndeksAsli(jwb) === Number(kunci) ? bobot : 0;
      case 'checkbox': {
        const benar = Array.isArray(kunci) ? kunci.map(Number) : [];
        const pilihan = Array.isArray(jwb) ? jwb.map(p => keIndeksAsli(p)) : [];
        const cocok = pilihan.filter(p => benar.indexOf(p) !== -1).length;
        const salah = pilihan.filter(p => benar.indexOf(p) === -1).length;
        const proporsi = benar.length > 0 ? Math.max(cocok - salah, 0) / benar.length : 0;
        return Math.round(proporsi * bobot * 100) / 100;
      }
      case 'menjodohkan': {
        const totalPasang = Object.keys(kunci).length;
        if (totalPasang === 0) return 0;
        let benarPasang = 0;
        Object.keys(kunci).forEach(k => { if (jwb && String(jwb[k]) === String(kunci[k])) benarPasang++; });
        return Math.round((benarPasang / totalPasang) * bobot * 100) / 100;
      }
      case 'uraian': {
        const kataKunci = (kunci.kataKunci || []).map(k => String(k).toLowerCase().trim()).filter(Boolean);
        if (kataKunci.length === 0) return 0;
        const teks = String(jwb).toLowerCase();
        const ditemukan = kataKunci.filter(k => teks.indexOf(k) !== -1).length;
        return Math.round((ditemukan / kataKunci.length) * bobot * 100) / 100;
      }
      default: return 0;
    }
  }

  // Bagian PERHITUNGAN MURNI (tanpa efek samping) dipisah dari
  // hitungDanSelesaikanSesi supaya bisa dipakai ULANG oleh action
  // 'hitungUlangNilaiUjian' (Guru.hitungUlangNilai) untuk menghitung ulang
  // nilai sesi yang SUDAH SELESAI -- tanpa ikut mengubah status/tanggal
  // selesai/jawaban tersimpan, hanya nilai & status lulusnya saja.
  function hitungNilaiDariJawaban_(D, sesi, jawaban) {
    const urutan = JSON.parse(sesi.urutan_json || '{}');
    const opsiAcakMap = urutan.opsiAcak || {};
    const ujian = D.ujian.find(u => u.id === sesi.ujian_id);
    const soalMap = {}; D.bankSoal.forEach(s => soalMap[s.id] = s);
    let totalBobot = 0, totalDapat = 0, detail = [];
    (urutan.order || []).forEach(sid => {
      const soal = soalMap[sid];
      if (!soal) return;
      const bobot = Number(soal.bobot) || 0;
      totalBobot += bobot;
      const skor = skorSoal(soal, jawaban[sid], opsiAcakMap[sid]);
      totalDapat += skor;
      detail.push({ id: sid, tipe: soal.tipe, bobot, skor });
    });
    const nilaiAkhir = totalBobot > 0 ? Math.round((totalDapat / totalBobot) * 10000) / 100 : 0;
    const nilaiLulus = ujian ? Number(ujian.nilai_lulus) || 0 : 0;
    const lulus = nilaiAkhir >= nilaiLulus;
    return { nilai: nilaiAkhir, lulus, detail };
  }

  // Detail jawaban per soal untuk ditampilkan ke SISWA setelah ujian selesai
  // (soal yang dijawab salah/benar, jawaban siswa, kunci, pembahasan), supaya
  // siswa & guru bisa sama-sama memeriksa jika ada kunci yang keliru.
  // Semua posisi opsi dikembalikan dalam urutan TAMPIL milik siswa tsb (setelah
  // diacak), sehingga kunci & jawaban bisa dibandingkan langsung di layar.
  function bangunDetailJawaban_(D, sesi) {
    const urutan = JSON.parse(sesi.urutan_json || '{}');
    const opsiAcakMap = urutan.opsiAcak || {};
    let jawaban = {}; try { jawaban = JSON.parse(sesi.jawaban_json || '{}'); } catch (e) { jawaban = {}; }
    const soalMap = {}; D.bankSoal.forEach(s => soalMap[s.id] = s);
    const items = [];
    (urutan.order || []).forEach(sid => {
      const soal = soalMap[sid];
      if (!soal) return;
      const bobot = Number(soal.bobot) || 0;
      const idxOrder = opsiAcakMap[sid];
      const jwb = jawaban[sid];
      const skor = skorSoal(soal, jwb, idxOrder);
      let kunci = null; kunci = parseKunciJson_(soal.kunci_json);
      let opsi = null, kunciTampil = null;
      if (soal.tipe === 'pilihan_ganda' || soal.tipe === 'checkbox' || soal.tipe === 'benar_salah') {
        const opsiAsli = JSON.parse(soal.opsi_json || '[]');
        const order = Array.isArray(idxOrder) ? idxOrder : opsiAsli.map((_, i) => i);
        opsi = order.map(i => opsiAsli[i]);
        const daftarKunci = soal.tipe === 'checkbox' ? (Array.isArray(kunci) ? kunci : []) : (kunci === null || kunci === undefined || kunci === '' ? [] : [kunci]);
        kunciTampil = daftarKunci.map(k => order.indexOf(Number(k))).filter(i => i >= 0);
      } else if (soal.tipe === 'menjodohkan') {
        opsi = JSON.parse(soal.opsi_json || '{}');
        kunciTampil = kunci && typeof kunci === 'object' ? kunci : {};
      } else {
        kunciTampil = { kataKunci: (kunci && Array.isArray(kunci.kataKunci)) ? kunci.kataKunci : [] };
      }
      const kosong = jwb === undefined || jwb === null || jwb === '' ||
        (Array.isArray(jwb) && jwb.length === 0) ||
        (soal.tipe === 'menjodohkan' && (typeof jwb !== 'object' || Object.keys(jwb).filter(k => jwb[k] !== '' && jwb[k] !== null && jwb[k] !== undefined).length === 0));
      const uraianTanpaRubrik = soal.tipe === 'uraian' && kunciTampil.kataKunci.filter(k => String(k).trim()).length === 0;
      let status;
      if (kosong) status = 'kosong';
      else if (uraianTanpaRubrik) status = 'manual';
      else if (bobot > 0 && skor >= bobot) status = 'benar';
      else if (skor > 0) status = 'sebagian';
      else status = 'salah';
      items.push({ id: sid, tipe: soal.tipe, pertanyaan: soal.pertanyaan, gambar: soal.gambar || '', opsi, jawaban: kosong ? null : jwb, kunciTampil, bobot, skor, status, pembahasan: soal.pembahasan || '' });
    });
    return items;
  }

  function hitungDanSelesaikanSesi(D, sesi, jawaban, statusAkhir) {
    const hasil = hitungNilaiDariJawaban_(D, sesi, jawaban);
    sesi.status = statusAkhir;
    sesi.selesai = new Date().toISOString();
    sesi.jawaban_json = JSON.stringify(jawaban);
    sesi.nilai = hasil.nilai;
    sesi.lulus = hasil.lulus;
    simpan();
    return hasil;
  }

  async function route(action, data) {
    const D = muat();
    switch (action) {
      case 'login': {
        const role = data.role;
        const username = String(data.username || '').trim();
        const password = String(data.password || '');
        const deviceId = String(data.deviceId || '');
        if (role === 'guru') {
          const guru = D.guru.find(g => g.username === username);
          if (!guru || String(guru.password) !== password) return { ok: false, error: 'Username atau password guru salah.' };
          return { ok: true, user: { id: guru.id, nama: guru.nama, username: guru.username, role: 'guru' } };
        }
        if (role === 'siswa') {
          const siswa = D.siswa.find(s => String(s.username).trim().toLowerCase() === username.toLowerCase() && String(s.password).trim() === password.trim());
          if (!siswa) return { ok: false, error: 'Username atau password siswa salah.' };
          const lockAktif = D.config.deviceLockAktif !== false; // default Aktif (perilaku lama) kecuali sudah pernah dimatikan
          const now = new Date();
          const lastPing = siswa.last_ping ? new Date(siswa.last_ping) : null;
          const staleMs = 15 * 60 * 1000;
          const deviceLocked = lockAktif && siswa.device_id && lastPing && (now - lastPing) < staleMs && siswa.device_id !== deviceId;
          if (deviceLocked) return { ok: false, error: 'Akun ini sedang aktif di perangkat lain. Tutup sesi di perangkat tersebut atau tunggu beberapa menit, lalu coba lagi.' };
          siswa.device_id = deviceId; siswa.last_ping = now.toISOString();
          simpan();
          return { ok: true, user: { id: siswa.id, nama: siswa.nama, kelas: siswa.kelas, role: 'siswa', deviceId } };
        }
        return { ok: false, error: 'Role tidak valid.' };
      }
      case 'logout': {
        if (data.role === 'siswa' && data.siswaId) {
          const s = D.siswa.find(x => x.id === data.siswaId);
          if (s) { s.device_id = ''; s.last_ping = ''; simpan(); }
        }
        return { ok: true };
      }
      case 'ping': {
        if (data.role === 'siswa' && data.siswaId) {
          const s = D.siswa.find(x => x.id === data.siswaId);
          if (s) {
            const lockAktif = D.config.deviceLockAktif !== false;
            if (lockAktif && s.device_id && data.deviceId && s.device_id !== data.deviceId) return { ok: false, error: 'Sesi diambil alih oleh perangkat lain.' };
            s.last_ping = new Date().toISOString();
            simpan();
          }
        }
        return { ok: true };
      }
      case 'getPengaturanLock': {
        return { ok: true, aktif: D.config.deviceLockAktif !== false };
      }
      case 'simpanPengaturanLock': {
        D.config.deviceLockAktif = !!data.aktif;
        simpan();
        return { ok: true, aktif: D.config.deviceLockAktif };
      }
      case 'simpanSoal': {
        const soal = JSON.parse(data.soal);
        if (soal.id) {
          const idx = cariIdx(D.bankSoal, soal.id);
          if (idx > -1) { D.bankSoal[idx] = Object.assign({}, D.bankSoal[idx], soal); simpan(); return { ok: true, id: soal.id }; }
        }
        soal.id = genId('S');
        soal.dibuat = new Date().toISOString();
        soal.status = soal.status || 'aktif';
        D.bankSoal.push(soal);
        simpan();
        return { ok: true, id: soal.id };
      }
      case 'importSoal': {
        const list = JSON.parse(data.soalList);
        const ids = [];
        list.forEach(soal => {
          soal.id = genId('S');
          soal.dibuat = new Date().toISOString();
          soal.status = soal.status || 'aktif';
          D.bankSoal.push(soal);
          ids.push(soal.id);
        });
        simpan();
        return { ok: true, count: ids.length, ids };
      }
      case 'hapusSoal': {
        const idx = cariIdx(D.bankSoal, data.id);
        if (idx > -1) D.bankSoal.splice(idx, 1);
        simpan();
        return { ok: true };
      }
      case 'hapusSoalBanyak': {
        const ids = new Set(JSON.parse(data.ids || '[]').map(String));
        const sebelum = D.bankSoal.length;
        D.bankSoal = D.bankSoal.filter(s => !ids.has(String(s.id)));
        simpan();
        return { ok: true, count: sebelum - D.bankSoal.length };
      }
      case 'ubahStatusSoalBanyak': {
        const ids = new Set(JSON.parse(data.ids || '[]').map(String));
        let n = 0;
        D.bankSoal.forEach(s => { if (ids.has(String(s.id))) { s.status = data.status || 'aktif'; n++; } });
        simpan();
        return { ok: true, count: n };
      }
      case 'getBankSoal': {
        let list = clone(D.bankSoal);
        if (data.guruId) list = list.filter(s => s.guru_id === data.guruId);
        if (data.kategori) list = list.filter(s => samaTeks_(s.kategori, data.kategori));
        if (data.subkategori) list = list.filter(s => samaTeks_(s.subkategori, data.subkategori));
        return { ok: true, data: list };
      }
      case 'simpanUjian': {
        const ujian = JSON.parse(data.ujian);
        if (ujian.id) {
          const idx = cariIdx(D.ujian, ujian.id);
          if (idx > -1) { D.ujian[idx] = Object.assign({}, D.ujian[idx], ujian); simpan(); return { ok: true, id: ujian.id }; }
        }
        ujian.id = genId('U');
        if (!ujian.token) ujian.token = buatTokenAman_();
        ujian.status = ujian.status || 'aktif';
        D.ujian.push(ujian);
        simpan();
        return { ok: true, id: ujian.id, token: ujian.token };
      }
      case 'hapusUjian': {
        const idx = cariIdx(D.ujian, data.id);
        if (idx > -1) D.ujian.splice(idx, 1);
        simpan();
        return { ok: true };
      }
      case 'getDaftarUjian': {
        let list = clone(D.ujian);
        if (data.guruId) list = list.filter(u => u.guru_id === data.guruId);
        return { ok: true, data: list };
      }
      case 'getRekapNilai': {
        const sesiList = D.sesi.filter(s => s.ujian_id === data.ujianId && s.status !== 'berlangsung');
        const siswaMap = {}; D.siswa.forEach(s => siswaMap[s.id] = s);
        const rekap = sesiList.map(s => {
          const siswa = siswaMap[s.siswa_id] || {};
          return { sesiId: s.id, siswaId: s.siswa_id, nama: siswa.nama || '(tidak dikenal)', kelas: siswa.kelas || '-', nilai: s.nilai, lulus: s.lulus, pelanggaran: s.pelanggaran, mulai: s.mulai, selesai: s.selesai, status: s.status };
        });
        return { ok: true, data: rekap };
      }
      // Menghitung ULANG nilai SEMUA sesi yang sudah selesai/diblokir di satu
      // ujian, memakai jawaban yang SUDAH TERSIMPAN (tidak diubah) tapi lewat
      // logika penilaian TERBARU (mis. setelah perbaikan bug opsi teracak).
      // Guru dari Portal Guru -> Rekap Nilai -> tombol "Hitung Ulang Nilai".
      // Hanya menulis ulang kolom nilai/lulus kalau memang BERUBAH, supaya
      // tetap aman dipanggil berkali-kali tanpa efek samping tambahan.
      case 'hitungUlangNilaiUjian': {
        const sesiList = D.sesi.filter(s => s.ujian_id === data.ujianId && s.status !== 'berlangsung');
        let totalBerubah = 0;
        sesiList.forEach(sesi => {
          let jawaban = {}; try { jawaban = JSON.parse(sesi.jawaban_json || '{}'); } catch (e) {}
          const hasil = hitungNilaiDariJawaban_(D, sesi, jawaban);
          if (Number(sesi.nilai) !== Number(hasil.nilai) || String(sesi.lulus) !== String(hasil.lulus)) {
            sesi.nilai = hasil.nilai;
            sesi.lulus = hasil.lulus;
            totalBerubah++;
          }
        });
        simpan();
        return { ok: true, totalDiperiksa: sesiList.length, totalBerubah };
      }
      case 'getAnalisisSoal': {
        const ujian = D.ujian.find(u => u.id === data.ujianId);
        if (!ujian) return { ok: false, error: 'Ujian tidak ditemukan.' };
        const soalIds = String(ujian.soal_ids || '').split(',').filter(Boolean);
        const soalMap = {}; D.bankSoal.forEach(s => soalMap[s.id] = s);
        const siswaMap = {}; D.siswa.forEach(s => siswaMap[s.id] = s);
        const sesiList = D.sesi.filter(s => s.ujian_id === data.ujianId && s.status !== 'berlangsung');
        const totalPeserta = sesiList.length;

        const agregat = {};
        soalIds.forEach(sid => { agregat[sid] = { benar: 0, sebagian: 0, salah: 0, kosong: 0 }; });

        const jawabanSiswa = sesiList.map(sesi => {
          const siswa = siswaMap[sesi.siswa_id] || {};
          let jawaban = {}; try { jawaban = JSON.parse(sesi.jawaban_json || '{}'); } catch (e) {}
          let urutanSesi = {}; try { urutanSesi = JSON.parse(sesi.urutan_json || '{}'); } catch (e) {}
          const opsiAcakMap = urutanSesi.opsiAcak || {};
          const detail = {};
          soalIds.forEach(sid => {
            const soal = soalMap[sid];
            if (!soal) { detail[sid] = 'na'; return; }
            const jwb = jawaban[sid];
            const kosong = (jwb === undefined || jwb === null || jwb === '' || (Array.isArray(jwb) && jwb.length === 0));
            if (kosong) { detail[sid] = 'kosong'; agregat[sid].kosong++; return; }
            const bobot = Number(soal.bobot) || 0;
            const skor = skorSoal(soal, jwb, opsiAcakMap[sid]);
            let status;
            if (bobot > 0 && skor >= bobot - 0.001) { status = 'benar'; agregat[sid].benar++; }
            else if (skor > 0) { status = 'sebagian'; agregat[sid].sebagian++; }
            else { status = 'salah'; agregat[sid].salah++; }
            detail[sid] = status;
          });
          return { siswaId: sesi.siswa_id, nama: siswa.nama || '(tidak dikenal)', kelas: siswa.kelas || '-', nilai: sesi.nilai, lulus: sesi.lulus, jawabanDetail: detail };
        });

        const analisisSoal = soalIds.map((sid, i) => {
          const soal = soalMap[sid];
          const agg = agregat[sid];
          const persenBenar = totalPeserta > 0 ? Math.round((agg.benar / totalPeserta) * 1000) / 10 : 0;
          let kesulitanOtomatis;
          if (totalPeserta === 0) kesulitanOtomatis = '-';
          else if (persenBenar >= 70) kesulitanOtomatis = 'mudah';
          else if (persenBenar >= 40) kesulitanOtomatis = 'sedang';
          else kesulitanOtomatis = 'sulit';
          return {
            soalId: sid, nomor: i + 1,
            pertanyaan: soal ? soal.pertanyaan : '(soal ini sudah dihapus dari Bank Soal)',
            tipe: soal ? soal.tipe : '-',
            tingkatKesulitanGuru: soal ? (soal.tingkat_kesulitan || 'sedang') : '-',
            bobot: soal ? (Number(soal.bobot) || 0) : 0,
            jumlahBenar: agg.benar, jumlahSebagianBenar: agg.sebagian, jumlahSalah: agg.salah, jumlahKosong: agg.kosong,
            persenBenar, kesulitanOtomatis
          };
        });

        return { ok: true, totalPeserta, soal: analisisSoal, siswa: jawabanSiswa };
      }
      case 'getLogPelanggaran': {
        let logs = clone(D.log);
        if (data.ujianId) logs = logs.filter(l => l.ujian_id === data.ujianId);
        return { ok: true, data: logs };
      }
      case 'resetDevice': {
        const s = D.siswa.find(x => x.id === data.siswaId);
        if (s) { s.device_id = ''; s.last_ping = ''; simpan(); }
        return { ok: true };
      }
      case 'resetDeviceKelas': {
        const kelas = String(data.kelas || '').trim();
        let count = 0;
        D.siswa.forEach(s => {
          if (kelas && String(s.kelas || '').trim() !== kelas) return;
          if (s.device_id) count++;
          s.device_id = ''; s.last_ping = '';
        });
        simpan();
        return { ok: true, count };
      }
      case 'getPemantauanUjian': {
        const ujian = D.ujian.find(u => u.id === data.ujianId);
        if (!ujian) return { ok: false, error: 'Ujian tidak ditemukan.' };
        const siswaMap = {}; D.siswa.forEach(s => siswaMap[s.id] = s);
        const durasiMs = (Number(ujian.durasi_menit) || 0) * 60000;
        const now = new Date();
        const hasil = D.sesi.filter(s => s.ujian_id === data.ujianId).map(s => {
          const siswa = siswaMap[s.siswa_id] || {};
          let urutan = {}; try { urutan = JSON.parse(s.urutan_json || '{}'); } catch (e) {}
          const totalSoal = (urutan.order || []).length;
          let jawaban = {}; try { jawaban = JSON.parse(s.jawaban_json || '{}'); } catch (e) {}
          const terjawab = Object.keys(jawaban).filter(k => {
            const v = jawaban[k];
            return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
          }).length;
          let sisaDetik = null;
          if (s.status === 'berlangsung' && s.mulai) {
            const tambahanMs = (Number(s.tambahan_detik) || 0) * 1000;
            const sisaMs = durasiMs + tambahanMs - (now - new Date(s.mulai));
            sisaDetik = Math.max(Math.floor(sisaMs / 1000), 0);
          }
          return {
            sesiId: s.id, siswaId: s.siswa_id, nama: siswa.nama || '(tidak dikenal)', kelas: siswa.kelas || '-',
            status: s.status, pelanggaran: Number(s.pelanggaran) || 0,
            terjawab, totalSoal, sisaDetik, tambahanDetik: Number(s.tambahan_detik) || 0,
            mulai: s.mulai, selesai: s.selesai, nilai: s.nilai, lulus: s.lulus
          };
        });
        return { ok: true, data: hasil, maxPelanggaran: Number(ujian.max_pelanggaran) || 999 };
      }
      case 'pemantauanTambahWaktu': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        sesi.tambahan_detik = (Number(sesi.tambahan_detik) || 0) + (Number(data.menit) || 0) * 60;
        simpan();
        return { ok: true, tambahanDetik: sesi.tambahan_detik };
      }
      case 'pemantauanForceFinish': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        if (sesi.status === 'selesai') return { ok: true, sudahSelesai: true, nilai: sesi.nilai, lulus: sesi.lulus };
        const jawaban = JSON.parse(sesi.jawaban_json || '{}');
        const hasil = hitungDanSelesaikanSesi(D, sesi, jawaban, 'selesai');
        return { ok: true, nilai: hasil.nilai, lulus: hasil.lulus };
      }
      case 'pemantauanHapusPelanggaran': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        sesi.pelanggaran = 0;
        if (sesi.status === 'diblokir') { sesi.status = 'berlangsung'; sesi.selesai = ''; sesi.nilai = ''; sesi.lulus = ''; }
        simpan();
        return { ok: true, status: sesi.status };
      }
      case 'hapusNilaiSiswa': {
        const ids = new Set(JSON.parse(data.sesiIds || '[]').map(String));
        D.sesi = D.sesi.filter(x => !ids.has(String(x.id)));
        if (Array.isArray(D.log)) D.log = D.log.filter(l => !ids.has(String(l.sesi_id)));
        simpan();
        return { ok: true, count: ids.size };
      }
      case 'pemantauanReset': {
        const idx = cariIdx(D.sesi, data.sesiId);
        if (idx > -1) D.sesi.splice(idx, 1);
        simpan();
        return { ok: true };
      }
      case 'importSiswa': {
        const list = JSON.parse(data.siswaList);
        list.forEach(s => { s.id = genId('SW'); s.device_id = ''; s.last_ping = ''; D.siswa.push(s); });
        simpan();
        return { ok: true, count: list.length };
      }
      case 'getDaftarSiswa': {
        let list = D.siswa.map(s => ({
          id: s.id, username: s.username, password: s.password, nama: s.nama, kelas: s.kelas,
          online: !!s.device_id, deviceId: s.device_id || '', lastPing: s.last_ping || ''
        }));
        if (data.kelas) list = list.filter(s => s.kelas === data.kelas);
        return { ok: true, data: list };
      }
      case 'updateSiswa': {
        const siswa = JSON.parse(data.siswa);
        const s = D.siswa.find(x => x.id === siswa.id);
        if (!s) return { ok: false, error: 'Siswa tidak ditemukan.' };
        Object.assign(s, siswa);
        simpan();
        return { ok: true };
      }
      case 'hapusSiswa': {
        D.siswa = D.siswa.filter(s => s.id !== data.id);
        simpan();
        return { ok: true };
      }
      case 'hapusKelas': {
        const kelas = String(data.kelas || '');
        if (!kelas) return { ok: false, error: 'Nama kelas tidak boleh kosong.' };
        const sebelum = D.siswa.length;
        D.siswa = D.siswa.filter(s => s.kelas !== kelas);
        simpan();
        return { ok: true, count: sebelum - D.siswa.length };
      }
      case 'updateAkunGuru': {
        const g = D.guru.find(x => x.id === data.guruId);
        if (!g) return { ok: false, error: 'Akun guru tidak ditemukan.' };
        if (String(g.password) !== String(data.passwordLama || '')) return { ok: false, error: 'Password saat ini salah.' };
        const usernameBaru = String(data.username || '').trim();
        if (!usernameBaru) return { ok: false, error: 'Username tidak boleh kosong.' };
        const dipakaiGuruLain = D.guru.some(x => x.username === usernameBaru && x.id !== data.guruId);
        if (dipakaiGuruLain) return { ok: false, error: 'Username sudah dipakai akun guru lain.' };
        g.username = usernameBaru;
        g.nama = String(data.nama || g.nama);
        if (data.password) g.password = String(data.password);
        simpan();
        return { ok: true, user: { id: g.id, nama: g.nama, role: 'guru', username: g.username } };
      }
      case 'simpanTema': {
        const g = D.guru.find(x => x.id === data.guruId) || D.guru[0];
        if (g) { g.tema_json = data.tema; simpan(); }
        return { ok: true };
      }
      case 'getTema': {
        let g = D.guru.find(x => x.id === data.guruId) || D.guru[0];
        let tema = defaultTemaLocal();
        try { if (g && g.tema_json) tema = JSON.parse(g.tema_json); } catch (e) {}
        return { ok: true, tema };
      }
      case 'uploadGambar': {
        return { ok: true, url: `data:${data.mimeType};base64,${data.base64}` };
      }
      case 'simpanBranding': {
        D.config.namaAplikasi = String(data.namaAplikasi || '').trim();
        D.config.logoUrl = String(data.logoUrl || '');
        simpan();
        return { ok: true };
      }
      case 'getBranding': {
        const c = D.config || {};
        return { ok: true, branding: { namaAplikasi: c.namaAplikasi || '', logoUrl: c.logoUrl || '' } };
      }
      case 'cekToken': {
        const ujian = D.ujian.find(u => u.token === String(data.token || '').toUpperCase());
        if (!ujian) return { ok: false, error: 'Token ujian tidak ditemukan.' };
        const now = new Date();
        if (ujian.mulai && now < new Date(ujian.mulai)) return { ok: false, error: 'Ujian belum dibuka.' };
        const batasTelat = ujian.selesai ? new Date(new Date(ujian.selesai).getTime() + (Number(ujian.toleransi_menit) || 0) * 60000) : null;
        if (batasTelat && now > batasTelat) return { ok: false, error: 'Waktu akses ujian sudah berakhir.' };
        if (ujian.status !== 'aktif') return { ok: false, error: 'Ujian ini sedang tidak aktif.' };
        return { ok: true, ujian: { id: ujian.id, judul: ujian.judul, durasiMenit: ujian.durasi_menit, kategori: ujian.kategori } };
      }
      case 'mulaiUjian': {
        const ujian = D.ujian.find(u => u.id === data.ujianId);
        if (!ujian) return { ok: false, error: 'Ujian tidak ditemukan.' };
        let existing = D.sesi.find(s => s.ujian_id === data.ujianId && s.siswa_id === data.siswaId);
        if (existing && existing.status === 'selesai') return { ok: false, error: 'Anda sudah menyelesaikan ujian ini.' };
        if (existing && existing.status === 'diblokir') return { ok: false, error: 'Sesi ujian Anda telah diblokir karena pelanggaran. Hubungi guru.' };

        const soalIds = String(ujian.soal_ids || '').split(',').filter(Boolean);
        const soalMap = {}; D.bankSoal.forEach(s => soalMap[s.id] = s);
        let urutan, jawaban, ragu, sesiObj;

        if (existing) {
          urutan = JSON.parse(existing.urutan_json || '{}');
          jawaban = JSON.parse(existing.jawaban_json || '{}');
          ragu = JSON.parse(existing.ragu_json || '[]');
          sesiObj = existing;
        } else {
          let order = soalIds.slice();
          if (String(ujian.acak_soal) === 'true' || ujian.acak_soal === true) order = shuffleSeeded(order, data.siswaId + data.ujianId);
          const opsiAcakMap = {};
          order.forEach(sid => {
            const soal = soalMap[sid];
            if (soal && (soal.tipe === 'pilihan_ganda' || soal.tipe === 'checkbox' || soal.tipe === 'benar_salah')) {
              const opsi = JSON.parse(soal.opsi_json || '[]');
              let idxArr = opsi.map((_, i) => i);
              if (String(ujian.acak_opsi) === 'true' || ujian.acak_opsi === true) idxArr = shuffleSeeded(idxArr, data.siswaId + data.ujianId + sid);
              opsiAcakMap[sid] = idxArr;
            }
          });
          urutan = { order, opsiAcak: opsiAcakMap };
          jawaban = {}; ragu = [];
          const mulai = new Date().toISOString();
          sesiObj = { id: genId('SES'), ujian_id: data.ujianId, siswa_id: data.siswaId, device_id: data.deviceId, mulai, selesai: '', status: 'berlangsung', pelanggaran: 0, urutan_json: JSON.stringify(urutan), jawaban_json: '{}', ragu_json: '[]', nilai: '', lulus: '', last_ping: mulai };
          D.sesi.push(sesiObj);
        }
        simpan();

        const opsiAcakMap = urutan.opsiAcak || {};
        const soalUntukSiswa = urutan.order.map(sid => {
          const s = soalMap[sid];
          if (!s) return null;
          let opsi = null;
          if (s.tipe === 'pilihan_ganda' || s.tipe === 'checkbox' || s.tipe === 'benar_salah') {
            const opsiAsli = JSON.parse(s.opsi_json || '[]');
            const idxOrder = opsiAcakMap[sid] || opsiAsli.map((_, i) => i);
            opsi = idxOrder.map(i => opsiAsli[i]);
          } else if (s.tipe === 'menjodohkan') {
            opsi = JSON.parse(s.opsi_json || '{}');
          }
          return { id: s.id, tipe: s.tipe, pertanyaan: s.pertanyaan, gambar: s.gambar, opsi, bobot: s.bobot };
        }).filter(Boolean);

        const durasiMs = (Number(ujian.durasi_menit) || 0) * 60000;
        const tambahanMs = (Number(sesiObj.tambahan_detik) || 0) * 1000;
        const sisaMs = durasiMs + tambahanMs - (new Date() - new Date(sesiObj.mulai));

        return {
          ok: true, sesiId: sesiObj.id, soal: soalUntukSiswa, jawabanTersimpan: jawaban, raguTersimpan: ragu,
          sisaDetik: Math.max(Math.floor(sisaMs / 1000), 0),
          maxPelanggaran: Number(ujian.max_pelanggaran) || 999,
          pelanggaranSaatIni: existing ? Number(existing.pelanggaran) || 0 : 0
        };
      }
      case 'simpanJawaban': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        if (sesi.status !== 'berlangsung') return { ok: false, error: 'Sesi sudah tidak aktif.' };
        sesi.jawaban_json = data.jawaban; sesi.ragu_json = data.ragu || '[]'; sesi.last_ping = new Date().toISOString();
        simpan();
        return { ok: true };
      }
      case 'lapor': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        if (sesi.status !== 'berlangsung') return { ok: true, blokir: false };
        sesi.pelanggaran = (Number(sesi.pelanggaran) || 0) + 1;
        D.log.push({ id: genId('LOG'), sesi_id: data.sesiId, siswa_id: sesi.siswa_id, ujian_id: sesi.ujian_id, waktu: new Date().toISOString(), jenis: data.jenis || 'tidak diketahui' });
        const ujian = D.ujian.find(u => u.id === sesi.ujian_id);
        const maxPelanggaran = ujian ? Number(ujian.max_pelanggaran) || 999 : 999;
        simpan();
        if (sesi.pelanggaran >= maxPelanggaran) {
          const jawaban = JSON.parse(data.jawaban || sesi.jawaban_json || '{}');
          const hasil = hitungDanSelesaikanSesi(D, sesi, jawaban, 'diblokir');
          return { ok: true, blokir: true, pelanggaran: sesi.pelanggaran, nilai: hasil.nilai, lulus: hasil.lulus };
        }
        return { ok: true, blokir: false, pelanggaran: sesi.pelanggaran };
      }
      case 'submitUjian': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        if (sesi.status === 'selesai') return { ok: true, nilai: sesi.nilai, lulus: sesi.lulus, sudahSelesai: true };
        const jawaban = JSON.parse(data.jawaban || '{}');
        const hasil = hitungDanSelesaikanSesi(D, sesi, jawaban, 'selesai');
        return { ok: true, nilai: hasil.nilai, lulus: hasil.lulus, detail: hasil.detail };
      }
      case 'getDetailJawaban': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        if (data.siswaId && String(sesi.siswa_id) !== String(data.siswaId)) return { ok: false, error: 'Sesi ini bukan milik Anda.' };
        if (sesi.status === 'berlangsung') return { ok: false, error: 'Detail jawaban baru bisa dilihat setelah ujian selesai.' };
        const ujian = D.ujian.find(u => u.id === sesi.ujian_id);
        if (ujian && String(ujian.tampil_detail) === 'false') return { ok: false, error: 'Guru tidak mengaktifkan detail jawaban untuk ujian ini.' };
        return { ok: true, judulUjian: ujian ? ujian.judul : '-', nilai: sesi.nilai, lulus: sesi.lulus, items: bangunDetailJawaban_(D, sesi) };
      }
      case 'getHasil': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        const ujian = D.ujian.find(u => u.id === sesi.ujian_id);
        return {
          ok: true, selesai: sesi.status !== 'berlangsung', nilai: sesi.nilai, lulus: sesi.lulus, pelanggaran: sesi.pelanggaran,
          judulUjian: ujian ? ujian.judul : '-',
          pesanNilai: ujian && ujian.pesan_nilai ? ujian.pesan_nilai : '',
          tampilDetail: !(ujian && String(ujian.tampil_detail) === 'false'),
          instruksiRemedial: (sesi.lulus === false) ? (ujian && ujian.instruksi_remedial ? ujian.instruksi_remedial : '') : ''
        };
      }
      default:
        return { ok: false, error: 'Aksi tidak dikenal: ' + action };
    }
  }

  return { route, flush: tulisSekarang };
})();

// ----------------------------------------------------------------------------
// TEMA
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// IDENTITAS APLIKASI (Logo & Nama CBT)
// ----------------------------------------------------------------------------
// Menerapkan nama & logo aplikasi ke semua tempat yang menampilkannya: judul
// tab browser, kartu login (sebelum siswa/guru masuk), dan sidebar/topbar
// Portal Guru maupun Portal Siswa. Dipanggil otomatis saat aplikasi dibuka
// (lihat DOMContentLoaded di bawah) -- jadi begitu guru menyimpan identitas
// baru di Pengaturan, semua perangkat siswa yang membuka/memuat ulang
// aplikasi otomatis melihat logo & nama terbaru tanpa perlu update apa pun
// di perangkat mereka.
function terapkanBranding(branding) {
  const nama = (branding && branding.namaAplikasi) ? branding.namaAplikasi : 'CBT Sekolah';
  const logoUrl = branding && branding.logoUrl ? branding.logoUrl : '';

  document.title = nama + ' — Sistem Ujian Online';
  document.querySelectorAll('.app-brand-nama').forEach(el => { el.textContent = nama; });
  document.querySelectorAll('.app-logo-slot').forEach(el => {
    el.innerHTML = logoUrl
      ? tagGambarAman_(logoUrl, '', 'Logo')
      : `<i class="fa-solid fa-graduation-cap"></i>`;
  });

  // Ikon "Layar Utama" (Add to Home Screen di HP) & judul aplikasi iOS ikut
  // memakai logo/nama terbaru begitu guru menyimpannya di Pengaturan >
  // Identitas Aplikasi -- kalau logo belum pernah diisi, tetap pakai ikon
  // bawaan (logo sementara "TEST") yang sudah disiapkan di folder icons/,
  // supaya tetap ada ikon walau belum sempat diganti.
  const favicon = document.getElementById('app-favicon');
  const appleIcon = document.getElementById('app-apple-icon');
  const appleTitle = document.getElementById('app-apple-title');
  if (favicon) favicon.href = logoUrl || 'icons/logo-test-32.png';
  if (appleIcon) appleIcon.href = logoUrl || 'icons/apple-touch-icon.png';
  if (appleTitle) appleTitle.content = nama;
}

async function muatBrandingGlobal() {
  const res = await api('getBranding', {});
  if (res.ok) terapkanBranding(res.branding);
}

// ============================================================================
// AUTH
// ============================================================================
const Auth = {
  async login(ev) {
    ev.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    const tombol = document.getElementById('btn-login-submit');
    const teksAsliTombol = tombol.textContent;
    tombol.disabled = true;
    tombol.textContent = 'Memproses...';
    try {
      const res = await api('login', { role: state.role, username, password, deviceId: state.deviceId });
      if (!res.ok) {
        errEl.textContent = (res.error || 'Login gagal.') + (!modeServerAktif()
          ? ' ⚠ Aplikasi di perangkat ini belum terhubung ke server (Mode Lokal), jadi akun buatan guru tidak dikenali. Hubungi guru/pengawas.'
          : '');
        return;
      }
      state.user = res.user;
      sessionStorage.setItem('cbt_user', JSON.stringify(res.user));

      if (res.user.role === 'guru') {
        UI.tampilkan('guru-portal');
        document.getElementById('guru-nama-label').textContent = res.user.nama;
        Guru.init();
        pemanasanPustakaGuru_();
      } else {
        UI.tampilkan('siswa-portal');
        document.getElementById('siswa-nama-label').textContent = res.user.nama;
        Siswa.mulaiPing();
      }
    } finally {
      tombol.disabled = false;
      tombol.textContent = teksAsliTombol;
    }
  },

  async logout() {
    if (state.user && state.user.role === 'siswa') {
      await api('logout', { role: 'siswa', siswaId: state.user.id });
    }
    clearInterval(state.pingHandle);
    clearInterval(state.autoRefreshHandle);
    sessionStorage.removeItem('cbt_user');
    state.user = null;
    location.reload();
  },

  pulihkanSesiLogin() {
    const raw = sessionStorage.getItem('cbt_user');
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      state.user = user;
      if (user.role === 'guru') {
        UI.tampilkan('guru-portal');
        document.getElementById('guru-nama-label').textContent = user.nama;
        Guru.init();
      } else {
        UI.tampilkan('siswa-portal');
        document.getElementById('siswa-nama-label').textContent = user.nama;
        Siswa.mulaiPing();
      }
    } catch (e) { /* abaikan */ }
  }
};

// ============================================================================
// UI (navigasi umum, modal, tab)
// ============================================================================
const UI = {
  // ---------------- Rich text toolbar (Pertanyaan & Opsi Jawaban) ----------------
  // Satu toolbar dipakai bersama untuk semua kotak ber-class "rich-editable"
  // (pertanyaan maupun tiap opsi). _rtRange/_rtEditable menyimpan posisi kursor
  // terakhir di kotak yang sedang diformat, supaya saat guru meng-klik tombol
  // warna (yang memindahkan fokus ke <input type=color>) pemformatan tetap
  // diterapkan ke teks yang sedang dipilih, bukan hilang begitu saja.
  _rtRange: null,
  _rtEditable: null,

  rtSimpanSeleksi() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let node = range.commonAncestorContainer;
    node = node.nodeType === 1 ? node : node.parentElement;
    const editable = node && node.closest ? node.closest('.rich-editable') : null;
    if (editable) { UI._rtRange = range.cloneRange(); UI._rtEditable = editable; }
  },

  rtPulihkanSeleksi() {
    if (!UI._rtEditable) return false;
    UI._rtEditable.focus();
    if (UI._rtRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(UI._rtRange);
    }
    return true;
  },

  // cmd/value dipakai lewat document.execCommand — sudah usang (deprecated)
  // tapi masih didukung luas di browser & paling ringkas untuk kebutuhan
  // format dasar (bold/underline/warna) tanpa menambah pustaka pihak ketiga.
  rtExec(cmd, value) {
    if (!UI.rtPulihkanSeleksi()) return;
    try { document.execCommand(cmd, false, value); } catch (e) { /* abaikan */ }
    UI.rtSimpanSeleksi();
  },

  rtWarnaTeks(input) { UI.rtExec('foreColor', input.value); },
  rtWarnaSorot(input) { UI.rtExec('hiliteColor', input.value); },
  rtFont(select) { UI.rtExec('fontName', select.value); },
  rtUkuran(select) { UI.rtExec('fontSize', select.value); },
  rtRumus() {
    if (!UI.rtPulihkanSeleksi()) { toast('Klik dulu ke kotak Pertanyaan/Opsi yang ingin disisipi rumus.', 'error'); return; }
    const formula = prompt('Tulis rumus dalam format LaTeX (tanpa tanda $), contoh: x^2+1=0');
    if (!formula) return;
    try { document.execCommand('insertText', false, `$${formula}$`); } catch (e) {}
    UI.rtSimpanSeleksi();
  },
  // Sisip gambar LANGSUNG di tengah teks pertanyaan/opsi (beda dari kotak upload
  // "Gambar Soal" di bawah, yang selalu tampil di bawah pertanyaan). Dipakai lewat
  // tombol 🖼 di toolbar -> membuka file picker tersembunyi -> unggah -> sisip.
  async rtSisipGambar(fileInput) {
    const editableSasaran = UI._rtEditable;
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file || !editableSasaran) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      toast('Menyisipkan gambar...');
      const res = await api('uploadGambar', { base64, filename: file.name, mimeType: file.type });
      if (!res.ok) { toast('Gagal mengunggah gambar: ' + res.error, 'error'); return; }
      UI._rtEditable = editableSasaran;
      if (!UI.rtPulihkanSeleksi()) editableSasaran.focus();
      try { document.execCommand('insertImage', false, res.url); } catch (e) {}
      UI.rtSimpanSeleksi();
    };
    reader.readAsDataURL(file);
  },

  // Toolbar format kaya dipakai bersama utk kotak Pertanyaan (ukuran penuh) &
  // tiap kotak Opsi Jawaban (ukuran "compact", label teks disembunyikan lewat
  // CSS supaya muat berjajar di baris opsi, tapi tombolnya tetap sama persis).
  htmlRichToolbar(compact) {
    const idFile = 'rt-file-' + Math.random().toString(36).slice(2, 8);
    return `<div class="rich-toolbar${compact ? ' compact' : ''}">
      <select class="rt-select" title="Huruf" onmousedown="UI.rtSimpanSeleksi()" onchange="UI.rtFont(this)">
        <option value="">Huruf</option>
        <option value="Arial">Arial</option>
        <option value="Georgia">Georgia</option>
        <option value="'Times New Roman'">Times New Roman</option>
        <option value="'Courier New'">Courier New</option>
        <option value="'Comic Sans MS'">Comic Sans MS</option>
      </select>
      <select class="rt-select" title="Ukuran" onmousedown="UI.rtSimpanSeleksi()" onchange="UI.rtUkuran(this)">
        <option value="">Ukuran</option>
        <option value="2">Kecil</option>
        <option value="3">Normal</option>
        <option value="4">Sedang</option>
        <option value="5">Besar</option>
        <option value="6">Sangat Besar</option>
      </select>
      <span class="rt-label">FORMAT</span>
      <button type="button" class="rt-btn" title="Tebal" onmousedown="event.preventDefault()" onclick="UI.rtExec('bold')"><b>B</b></button>
      <button type="button" class="rt-btn" title="Miring" onmousedown="event.preventDefault()" onclick="UI.rtExec('italic')"><i>I</i></button>
      <button type="button" class="rt-btn" title="Garis bawah" onmousedown="event.preventDefault()" onclick="UI.rtExec('underline')"><u>U</u></button>
      <button type="button" class="rt-btn" title="Coret" onmousedown="event.preventDefault()" onclick="UI.rtExec('strikeThrough')"><s>S</s></button>
      <input type="color" class="rt-color" title="Warna teks" value="#211334" onmousedown="UI.rtSimpanSeleksi()" onchange="UI.rtWarnaTeks(this)">
      <input type="color" class="rt-color" title="Warna sorot (highlight)" value="#fff59d" onmousedown="UI.rtSimpanSeleksi()" onchange="UI.rtWarnaSorot(this)">
      <span class="rt-label">PANGKAT</span>
      <button type="button" class="rt-btn" title="Pangkat atas (superscript)" onmousedown="event.preventDefault()" onclick="UI.rtExec('superscript')">x²</button>
      <button type="button" class="rt-btn" title="Pangkat bawah (subscript)" onmousedown="event.preventDefault()" onclick="UI.rtExec('subscript')">x<sub>n</sub></button>
      <button type="button" class="rt-btn" title="Sisipkan rumus (LaTeX, format $...$)" onmousedown="event.preventDefault()" onclick="UI.rtRumus()">RUMUS Σ</button>
      <button type="button" class="rt-btn" title="Sisipkan gambar di sini" onmousedown="event.preventDefault()" onclick="document.getElementById('${idFile}').click()">🖼</button>
      <input type="file" id="${idFile}" accept="image/*" class="hidden" onchange="UI.rtSisipGambar(this)">
      <button type="button" class="rt-btn" title="Hapus format" onmousedown="event.preventDefault()" onclick="UI.rtExec('removeFormat')">⌫</button>
    </div>`;
  },

  // Tab tipe soal (PG Biasa/PG Kompleks/Benar-Salah/Jodohkan/Essay) di atas
  // daftar soal halaman "Kelola Soal" -- lihat Guru.bukaKelolaSoal/gantiTipeTabKelola.
  renderTipeTabs() {
    const cont = document.getElementById('tipe-tabs-list');
    if (!cont) return;
    cont.innerHTML = TIPE_SOAL_TAB.map(t => `
      <button type="button" class="tipe-tab-btn${t.tipe === state.guru.tipeTabKelola ? ' active' : ''}" onclick="Guru.gantiTipeTabKelola('${t.tipe}')">
        <span class="tipe-tab-label">${t.label}</span>
        <span class="tipe-tab-sub">${t.sub}</span>
      </button>`).join('');
  },

  perbaruiLabelJumlahGambar(idInput, idLabel) {
    const input = document.getElementById(idInput);
    const label = document.getElementById(idLabel);
    if (!input || !label) return;
    label.textContent = input.files.length ? `(${input.files.length} dipilih)` : '';
  },

  pilihRole(role) {
    state.role = role;
    document.getElementById('btn-role-siswa').classList.toggle('active', role === 'siswa');
    document.getElementById('btn-role-guru').classList.toggle('active', role === 'guru');
  },

  tampilkan(idLayar) {
    ['login-screen', 'guru-portal', 'siswa-portal', 'ujian-screen', 'hasil-screen', 'detail-screen'].forEach(id => {
      document.getElementById(id).classList.toggle('hidden', id !== idLayar);
    });
  },

  gantiTabGuru(tabId) {
    document.querySelectorAll('#guru-portal .nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('#guru-portal .main > section').forEach(s => s.classList.toggle('hidden', s.id !== tabId));
    if (tabId === 'tab-dashboard') Guru.muatDashboard();
    if (tabId === 'tab-bank-soal') Guru.muatBankSoal();
    if (tabId === 'tab-ujian') Guru.muatDaftarUjian();
    if (tabId === 'tab-rekap') Guru.muatPilihanUjianUntukSelect('pilih-ujian-rekap');
    if (tabId === 'tab-analisis') Guru.muatPilihanUjianUntukSelect('pilih-ujian-analisis');
    if (tabId === 'tab-pelanggaran') Guru.muatPilihanUjianUntukSelect('pilih-ujian-log');
    if (tabId === 'tab-pemantauan') Guru.muatPilihanUjianUntukSelect('pilih-ujian-pemantauan');
    if (tabId === 'tab-login') { Guru.muatStatusLogin(); Guru.muatPengaturanLockDevice(); }
    if (tabId === 'tab-siswa') Guru.muatDaftarSiswa();
    if (tabId === 'tab-pengaturan') { Guru.muatFormTema(); Guru.muatFormAkun(); Guru.muatFormBranding(); tampilkanBadgeMode(); }
    UI.mulaiAutoRefreshGuru(tabId);
    UI.tutupMenuMobile('guru');
  },

  // Menu HP: sidebar tampil sebagai panel yang meluncur dari samping (bukan
  // selalu terlihat seperti di layar lebar), supaya tidak memakan tempat.
  bukaMenuMobile(portal) {
    document.getElementById('sidebar-' + portal).classList.add('open');
    document.getElementById('sidebar-overlay-' + portal).classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  tutupMenuMobile(portal) {
    const sidebar = document.getElementById('sidebar-' + portal);
    const overlay = document.getElementById('sidebar-overlay-' + portal);
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  },

  // "Realtime": selama Mode Server aktif dan guru sedang membuka salah satu
  // tab data, tarik ulang data dari Google Sheets secara berkala supaya
  // perubahan dari perangkat lain (mis. siswa login/ujian berjalan di HP)
  // ikut muncul tanpa perlu refresh manual.
  mulaiAutoRefreshGuru(tabId) {
    clearInterval(state.autoRefreshHandle);
    if (!modeServerAktif()) return;
    const refreshMap = {
      'tab-dashboard': () => Guru.muatDashboard(),
      'tab-bank-soal': () => Guru.muatBankSoal(),
      'tab-ujian': () => Guru.muatDaftarUjian(),
      'tab-siswa': () => Guru.muatDaftarSiswa(),
      'tab-rekap': () => { if (document.getElementById('pilih-ujian-rekap').value) return Guru.muatRekap(); },
      'tab-analisis': () => { if (document.getElementById('pilih-ujian-analisis').value) return Guru.muatAnalisisSoal(); },
      'tab-pelanggaran': () => { if (document.getElementById('pilih-ujian-log').value) return Guru.muatLogPelanggaran(); },
      'tab-pemantauan': () => { if (document.getElementById('pilih-ujian-pemantauan').value) return Guru.muatPemantauan(); },
      'tab-login': () => Guru.muatStatusLogin()
    };
    const fn = refreshMap[tabId];
    if (!fn) return;
    // PERFORMA: (1) lewati saat tab/browser tidak sedang dilihat, (2) jangan menumpuk
    // permintaan baru selagi yang sebelumnya belum selesai (Apps Script kadang butuh
    // beberapa detik -- tanpa ini permintaan menumpuk & seluruh aplikasi terasa macet),
    // (3) segarkan sekali begitu tab kembali dilihat.
    let sedangJalan = false;
    const putaran = async () => {
      if (document.hidden || sedangJalan) return;
      sedangJalan = true;
      try { await fn(); } catch (e) { /* abaikan, putaran berikutnya mencoba lagi */ } finally { sedangJalan = false; }
    };
    state.autoRefreshHandle = setInterval(putaran, CONFIG.REALTIME_POLL_MS);
    if (state._autoRefreshVis) document.removeEventListener('visibilitychange', state._autoRefreshVis);
    state._autoRefreshVis = () => { if (!document.hidden) putaran(); };
    document.addEventListener('visibilitychange', state._autoRefreshVis);
  },

  bukaPengaturanServer() {
    document.getElementById('server-url-input').value = getUrlServerTersimpan();
    document.getElementById('server-status').textContent = modeServerAktif()
      ? '✅ Status saat ini: Terhubung ke Server (Google Sheets).'
      : 'ℹ️ Status saat ini: Mode Lokal — data hanya tersimpan di perangkat ini.';
    document.getElementById('server-snippet-box').classList.add('hidden');
    document.getElementById('modal-server').classList.remove('hidden');
  },

  async tesKoneksiServer() {
    const url = document.getElementById('server-url-input').value.trim();
    const statusEl = document.getElementById('server-status');
    const snippetBox = document.getElementById('server-snippet-box');
    snippetBox.classList.add('hidden');
    if (!url) { statusEl.textContent = 'Isi URL Web App terlebih dahulu.'; return; }
    statusEl.textContent = 'Menguji koneksi...';
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getTema' }) });
      const data = await res.json();
      if (data && data.ok) {
        statusEl.textContent = '✅ Berhasil terhubung ke Google Sheets.';
        document.getElementById('server-snippet-text').textContent = "API_URL: '" + url + "',";
        snippetBox.classList.remove('hidden');
      } else {
        statusEl.textContent = '❌ Gagal: ' + (data && data.error ? data.error : 'Respons tidak dikenali. Pastikan URL & deployment (Who has access: Anyone) sudah benar.');
      }
    } catch (e) {
      statusEl.textContent = '❌ Gagal terhubung: ' + e.message;
    }
  },

  salinSnippetApiUrl() {
    const teks = document.getElementById('server-snippet-text').textContent;
    if (!teks) return;
    navigator.clipboard.writeText(teks)
      .then(() => toast('Baris kode disalin. Tempel ke app.js lalu upload ulang ke Netlify.', 'success'))
      .catch(() => toast('Gagal menyalin otomatis — silakan salin manual dari kotak teksnya.', 'error'));
  },

  simpanPengaturanServer() {
    const url = document.getElementById('server-url-input').value.trim();
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      if (!confirm('URL ini terlihat tidak seperti URL Web App Google Apps Script (harus diawali https://script.google.com/... dan berakhiran /exec). Tetap simpan?')) return;
    }
    setUrlServerTersimpan(url);
    toast(url ? 'Pengaturan server disimpan untuk PERANGKAT INI SAJA. Untuk mengaktifkannya bagi semua siswa, salin cuplikan kode di atas ke app.js.' : 'Pengaturan server dikosongkan. Aplikasi kembali ke mode lokal.', 'success');
    UI.tutupModal('modal-server');
    setTimeout(() => location.reload(), 600);
  },

  hapusPengaturanServer() {
    document.getElementById('server-url-input').value = '';
    setUrlServerTersimpan('');
    toast('Kembali ke mode lokal (data hanya di perangkat ini).', 'success');
    UI.tutupModal('modal-server');
    setTimeout(() => location.reload(), 600);
  },

  // tipePraset: dipakai saat membuka form "Tambah Soal" dari tombol di halaman
  // Kelola Soal — soal baru langsung memakai tipe tab yang sedang aktif (PG
  // Biasa/PG Kompleks/Benar-Salah/Jodohkan/Essay) tanpa guru perlu memilih ulang.
  bukaModalSoal(soal, tipePraset) {
    document.getElementById('modal-soal-title').textContent = soal ? 'Ubah Soal' : 'Tambah Soal';
    document.getElementById('soal-id').value = soal ? soal.id : '';
    document.getElementById('soal-pertanyaan-toolbar').innerHTML = UI.htmlRichToolbar(false);
    document.getElementById('soal-kategori').value = soal ? soal.kategori : (state.guru.kategoriKelola || 'Kuis');
    document.getElementById('soal-subkategori').value = soal && soal.subkategori ? soal.subkategori : '';
    document.getElementById('soal-topik').value = soal && soal.topik ? soal.topik : '';
    document.getElementById('soal-tipe').value = soal ? soal.tipe : (tipePraset || state.guru.tipeTabKelola || 'pilihan_ganda');
    document.getElementById('soal-pertanyaan').innerHTML = soal ? kontenSoalHtml(soal.pertanyaan) : '';
    document.getElementById('soal-bobot').value = soal ? soal.bobot : 10;
    document.getElementById('soal-tingkat-kesulitan').value = soal && soal.tingkat_kesulitan ? soal.tingkat_kesulitan : 'sedang';
    ['gambar', 'audio', 'video'].forEach(jenis => {
      document.getElementById(`soal-${jenis}-url`).value = soal && soal[jenis] ? soal[jenis] : '';
      const prev = document.getElementById(`soal-${jenis}-preview`);
      if (soal && soal[jenis]) { if (jenis === 'gambar') pasangSrcGambarAman_(prev, soal[jenis]); else prev.src = soal[jenis]; prev.classList.remove('hidden'); } else { prev.classList.add('hidden'); }
    });
    UI.renderModalTipeTabs();
    UI.renderFormOpsiSoal(soal);
    document.getElementById('modal-soal').classList.remove('hidden');
  },

  // Tab tipe soal di ATAS form Tambah/Ubah Soal (dalam modal) — mengganti
  // dropdown lama, sekaligus mengubah #soal-tipe & merender ulang bagian opsi.
  renderModalTipeTabs() {
    const cont = document.getElementById('soal-tipe-tabs');
    if (!cont) return;
    const tipeAktif = document.getElementById('soal-tipe').value;
    cont.innerHTML = TIPE_SOAL_TAB.map(t => `
      <button type="button" class="tipe-tab-btn${t.tipe === tipeAktif ? ' active' : ''}" onclick="UI.pilihTipeSoalModal('${t.tipe}')">
        <span class="tipe-tab-label">${t.label}</span>
        <span class="tipe-tab-sub">${t.sub}</span>
      </button>`).join('');
  },

  pilihTipeSoalModal(tipe) {
    document.getElementById('soal-tipe').value = tipe;
    UI.renderModalTipeTabs();
    UI.renderFormOpsiSoal();
  },

  renderFormOpsiSoal(soal) {
    const tipe = document.getElementById('soal-tipe').value;
    const cont = document.getElementById('soal-form-opsi');
    let opsi = null, kunci = null;
    if (soal) {
      try { opsi = JSON.parse(soal.opsi_json || 'null'); } catch (e) {}
      kunci = parseKunciJson_(soal.kunci_json);
    }

    if (tipe === 'pilihan_ganda' || tipe === 'checkbox' || tipe === 'benar_salah') {
      const list = opsi || (tipe === 'benar_salah' ? ['Benar', 'Salah'] : ['', '', '', '']);
      const bisaHapusTambah = tipe !== 'benar_salah';
      let html = `<div class="opsi-jawaban-header">
        <div>
          <label style="margin-bottom:.1rem">OPSI JAWABAN</label>
          <span class="subtitle" style="display:block;margin:0">${tipe === 'checkbox' ? 'Pilih kunci jawaban (bisa lebih dari satu)' : 'Pilih satu kunci jawaban'}</span>
        </div>
        <span class="badge umum" id="opsi-counter">${list.length}/8 opsi</span>
      </div>`;
      list.forEach((item, i) => {
        const o = (item && typeof item === 'object') ? item : { teks: item || '', gambar: '' };
        const checked = tipe === 'checkbox' ? (Array.isArray(kunci) && kunci.includes(i)) : (kunci !== null && kunci !== undefined && kunci !== '' && Number(kunci) === i);
        html += UI.htmlBarisOpsi(i, o, tipe, checked, bisaHapusTambah);
      });
      if (bisaHapusTambah) html += `<button type="button" class="secondary small" id="btn-tambah-opsi" onclick="UI.tambahOpsiKosong()">+ Tambah Opsi</button>`;
      cont.innerHTML = html;
      UI.perbaruiCounterOpsi();
    } else if (tipe === 'menjodohkan') {
      const kiri = (opsi && opsi.kiri) || ['', ''];
      const kanan = (opsi && opsi.kanan) || ['', ''];
      let html = '<label>Sisi Kiri (soal)</label>';
      kiri.forEach((t, i) => html += `<input type="text" class="mj-kiri" value="${escapeHtml_(t)}" placeholder="Item kiri ${i + 1}" style="margin-bottom:.4rem">`);
      html += '<button type="button" class="secondary small" onclick="UI.tambahBarisJodoh()">+ Tambah Baris</button>';
      html += '<label style="margin-top:.8rem">Sisi Kanan (pasangan, urutan bebas)</label>';
      kanan.forEach((t, i) => html += `<input type="text" class="mj-kanan" value="${escapeHtml_(t)}" placeholder="Item kanan ${i + 1}" style="margin-bottom:.4rem">`);
      html += '<p class="subtitle" style="margin-top:.6rem">Kunci jawaban: masukkan nomor pasangan kanan (mulai dari 0) untuk tiap item kiri, dipisah koma sesuai urutan kiri. Contoh: 1,0,2</p>';
      const kunciStr = kunci ? Object.values(kunci).join(',') : '';
      html += `<input type="text" id="mj-kunci" value="${escapeHtml_(kunciStr)}" placeholder="contoh: 1,0,2">`;
      cont.innerHTML = html;
    } else {
      const kataKunci = kunci && kunci.kataKunci ? kunci.kataKunci.join(', ') : '';
      cont.innerHTML = `<label>Kata Kunci Penilaian Otomatis (pisah dengan koma)</label>
        <input type="text" id="uraian-kata-kunci" value="${escapeHtml_(kataKunci)}" placeholder="contoh: fotosintesis, klorofil, karbon dioksida">
        <p class="subtitle">Nilai dihitung otomatis berdasar proporsi kata kunci yang muncul di jawaban siswa. Kosongkan jika ingin dikoreksi manual lewat spreadsheet.</p>`;
    }
  },

  // Markup satu baris opsi (dipakai renderFormOpsiSoal & tambahOpsiKosong) —
  // tiap opsi punya toolbar format kaya sendiri (persis toolbar Pertanyaan,
  // lihat UI.htmlRichToolbar) + unggah gambar opsi (opsional) + tombol hapus opsi.
  htmlBarisOpsi(i, o, tipe, checked, bisaHapus) {
    const teksHtml = kontenSoalHtml(o.teks || '');
    const gambar = o.gambar || '';
    const huruf = String.fromCharCode(65 + i);
    return `<div class="opsi-row${checked ? ' opsi-row-benar' : ''}">
      <div class="opsi-row-top">
        <span class="opsi-huruf-label">${huruf}</span>
        <div class="opsi-row-main">
          ${UI.htmlRichToolbar(true)}
          <div class="rich-editable opsi-teks-rich" contenteditable="true" data-placeholder="Opsi ${huruf}">${teksHtml}</div>
        </div>
        <input type="${tipe === 'checkbox' ? 'checkbox' : 'radio'}" name="opsi-benar" value="${i}" title="Tandai sebagai kunci jawaban" ${checked ? 'checked' : ''} onchange="UI.tandaiOpsiBenar(this)">
        ${bisaHapus ? `<button type="button" class="opsi-hapus-x" title="Hapus opsi ini" onclick="UI.hapusOpsi(this)">✕</button>` : ''}
      </div>
      <div class="opsi-row-gambar">
        <input type="file" accept="image/*" class="opsi-gambar-file" onchange="Guru.uploadGambarOpsi(event)">
        <input type="hidden" class="opsi-gambar-url" value="${escapeHtml_(gambar)}">
        ${gambar ? tagGambarAman_(gambar, 'opsi-gambar-preview', 'Pratinjau gambar opsi') : '<img class="opsi-gambar-preview hidden">'}
        <button type="button" class="secondary small opsi-hapus-gambar${gambar ? '' : ' hidden'}" onclick="UI.hapusGambarOpsi(this)">Hapus gambar</button>
      </div>
    </div>`;
  },

  tandaiOpsiBenar(input) {
    document.querySelectorAll('#soal-form-opsi .opsi-row').forEach(row => row.classList.remove('opsi-row-benar'));
    document.querySelectorAll('#soal-form-opsi input[name="opsi-benar"]:checked').forEach(el => {
      el.closest('.opsi-row').classList.add('opsi-row-benar');
    });
  },

  tambahOpsiKosong() {
    const cont = document.getElementById('soal-form-opsi');
    const tipe = document.getElementById('soal-tipe').value;
    const n = cont.querySelectorAll('.opsi-row').length;
    if (n >= 8) { toast('Maksimal 8 opsi jawaban.', 'error'); return; }
    const div = document.createElement('div');
    div.innerHTML = UI.htmlBarisOpsi(n, { teks: '', gambar: '' }, tipe, false, true);
    cont.insertBefore(div.firstElementChild, document.getElementById('btn-tambah-opsi'));
    UI.perbaruiCounterOpsi();
  },

  // Menghapus 1 baris opsi lalu menyusun ulang huruf (A/B/C..) & atribut "value"
  // radio/checkbox supaya tetap berurutan 0..n-1 (dipakai saat simpanSoal membaca
  // index opsi yang dicentang sebagai kunci jawaban).
  hapusOpsi(btn) {
    const cont = document.getElementById('soal-form-opsi');
    const baris = cont.querySelectorAll('.opsi-row');
    if (baris.length <= 2) { toast('Minimal 2 opsi jawaban.', 'error'); return; }
    btn.closest('.opsi-row').remove();
    const tipe = document.getElementById('soal-tipe').value;
    cont.querySelectorAll('.opsi-row').forEach((row, i) => {
      row.querySelector('.opsi-huruf-label').textContent = String.fromCharCode(65 + i);
      const radio = row.querySelector('input[name="opsi-benar"]');
      radio.value = i;
      row.querySelector('.opsi-teks-rich').setAttribute('data-placeholder', 'Opsi ' + String.fromCharCode(65 + i));
    });
    UI.perbaruiCounterOpsi();
  },

  perbaruiCounterOpsi() {
    const counter = document.getElementById('opsi-counter');
    if (!counter) return;
    const n = document.querySelectorAll('#soal-form-opsi .opsi-row').length;
    counter.textContent = `${n}/8 opsi`;
    const btnTambah = document.getElementById('btn-tambah-opsi');
    if (btnTambah) btnTambah.classList.toggle('hidden', n >= 8);
  },

  async uploadGambarOpsiDariEvent(ev, callback) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      toast('Mengunggah gambar opsi...');
      const res = await api('uploadGambar', { base64, filename: file.name, mimeType: file.type });
      if (res.ok) callback(res.url);
      else toast('Gagal mengunggah gambar: ' + res.error, 'error');
    };
    reader.readAsDataURL(file);
  },

  hapusGambarOpsi(btn) {
    const row = btn.closest('.opsi-row');
    row.querySelector('.opsi-gambar-url').value = '';
    const prev = row.querySelector('.opsi-gambar-preview');
    prev.src = ''; prev.classList.add('hidden');
    btn.classList.add('hidden');
  },

  tambahBarisJodoh() {
    const cont = document.getElementById('soal-form-opsi');
    const kiriInputs = cont.querySelectorAll('.mj-kiri');
    const n = kiriInputs.length;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mj-kiri'; input.placeholder = 'Item kiri ' + (n + 1); input.style.marginBottom = '.4rem';
    kiriInputs[kiriInputs.length - 1].after(input);
  },

  async bukaModalUjian(ujian) {
    await Guru.muatBankSoal(); // pastikan dropdown kategori & data soal selalu terbaru sebelum modal dibuka
    document.getElementById('modal-ujian-title').textContent = ujian ? 'Ubah Ujian' : 'Buat Ujian';
    document.getElementById('ujian-id').value = ujian ? ujian.id : '';
    document.getElementById('ujian-judul').value = ujian ? ujian.judul : '';
    const kategoriSel = document.getElementById('ujian-kategori');
    if (ujian && ujian.kategori && ![...kategoriSel.options].some(o => o.value === ujian.kategori)) {
      // Ujian lama memakai kategori yang sekarang tidak lagi punya soal aktif
      // (mis. semua soalnya sudah diarsipkan) — tetap tampilkan pilihannya
      // supaya tidak salah menampilkan kategori lain begitu modal dibuka.
      kategoriSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml_(ujian.kategori)}">${escapeHtml_(labelKategori(ujian.kategori))} (tidak ada soal aktif)</option>`);
    }
    kategoriSel.value = ujian ? ujian.kategori : (kategoriSel.options[0] ? kategoriSel.options[0].value : '');
    document.getElementById('ujian-subkategori').value = ujian && ujian.subkategori ? ujian.subkategori : '';
    document.getElementById('ujian-durasi').value = ujian ? ujian.durasi_menit : 60;
    document.getElementById('ujian-toleransi').value = ujian ? ujian.toleransi_menit : 10;
    document.getElementById('ujian-kkm').value = ujian ? ujian.nilai_lulus : 75;
    document.getElementById('ujian-max-pelanggaran').value = ujian ? ujian.max_pelanggaran : 3;
    document.getElementById('ujian-mulai').value = ujian && ujian.mulai ? ujian.mulai.slice(0, 16) : '';
    document.getElementById('ujian-selesai').value = ujian && ujian.selesai ? ujian.selesai.slice(0, 16) : '';
    document.getElementById('ujian-acak-soal').checked = ujian ? (String(ujian.acak_soal) === 'true') : true;
    document.getElementById('ujian-acak-opsi').checked = ujian ? (String(ujian.acak_opsi) === 'true') : true;
    document.getElementById('ujian-instruksi-remedial').value = ujian && ujian.instruksi_remedial ? ujian.instruksi_remedial : '';
    document.getElementById('ujian-tampil-detail').checked = ujian ? (String(ujian.tampil_detail) !== 'false') : true;
    Guru.muatEditorPesanNilai(ujian && ujian.pesan_nilai);
    // null (bukan array kosong) khusus menandai "ujian baru, belum ada
    // pilihan tersimpan" -> semua soal yang cocok otomatis tercentang.
    // Ujian yang sedang diubah selalu punya minimal 1 soal_ids tersimpan.
    await Guru.muatPilihanSoalUntukUjian(ujian ? String(ujian.soal_ids || '').split(',').filter(Boolean) : null);
    document.getElementById('modal-ujian').classList.remove('hidden');
  },

  bukaModalSiswa(siswa) {
    document.getElementById('siswa-edit-id').value = siswa.id;
    document.getElementById('siswa-edit-username').value = siswa.username;
    document.getElementById('siswa-edit-password').value = siswa.password;
    document.getElementById('siswa-edit-nama').value = siswa.nama;
    document.getElementById('siswa-edit-kelas').value = siswa.kelas;
    document.getElementById('modal-siswa').classList.remove('hidden');
  },

  tutupModal(id) { document.getElementById(id).classList.add('hidden'); },

  kembaliKeBerandaSiswa() {
    document.getElementById('konfirmasi-ujian').classList.add('hidden');
    document.getElementById('input-token-ujian').value = '';
    UI.tampilkan('siswa-portal');
  }
};

// ============================================================================
// GURU
// ============================================================================
const Guru = {
  // ---------------- PESAN HASIL PER RENTANG NILAI ----------------
  pesanNilaiDraft: [],

  muatEditorPesanNilai(raw) {
    const tersimpan = parsePesanNilai_(raw);
    // Belum pernah diatur -> isi editor dengan pesan default
    Guru.pesanNilaiDraft = (tersimpan.length ? tersimpan : DEFAULT_PESAN_NILAI).map(r => ({ min: r.min, max: r.max, pesan: r.pesan || '' }));
    Guru.renderEditorPesanNilai();
  },

  renderEditorPesanNilai() {
    const cont = document.getElementById('pesan-nilai-editor');
    if (!cont) return;
    cont.innerHTML = Guru.pesanNilaiDraft.map((r, i) => `
      <div class="pesan-nilai-row">
        <div class="pesan-nilai-rentang">
          <input type="number" min="0" max="100" value="${escapeHtml_(String(r.min))}" oninput="Guru.ubahPesanNilai(${i},'min',this.value)" aria-label="Nilai awal">
          <span>s/d</span>
          <input type="number" min="0" max="100" value="${escapeHtml_(String(r.max))}" oninput="Guru.ubahPesanNilai(${i},'max',this.value)" aria-label="Nilai akhir">
          <button type="button" class="secondary" title="Hapus rentang ini" onclick="Guru.hapusRentangPesan(${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
        <textarea rows="2" oninput="Guru.ubahPesanNilai(${i},'pesan',this.value)" placeholder="Kosongkan untuk memakai pesan default">${escapeHtml_(r.pesan)}</textarea>
      </div>`).join('');
  },

  ubahPesanNilai(i, kolom, nilai) {
    if (!Guru.pesanNilaiDraft[i]) return;
    Guru.pesanNilaiDraft[i][kolom] = nilai;
  },

  tambahRentangPesan() {
    const terakhir = Guru.pesanNilaiDraft[Guru.pesanNilaiDraft.length - 1];
    const mulai = terakhir ? Math.min(100, Number(terakhir.max) + 1) : 0;
    Guru.pesanNilaiDraft.push({ min: mulai, max: 100, pesan: '' });
    Guru.renderEditorPesanNilai();
  },

  hapusRentangPesan(i) {
    Guru.pesanNilaiDraft.splice(i, 1);
    Guru.renderEditorPesanNilai();
  },

  resetPesanNilai() {
    if (!confirm('Kembalikan semua rentang dan pesan ke pengaturan default?')) return;
    Guru.muatEditorPesanNilai('');
  },

  // Validasi + ubah editor menjadi JSON. Jika isinya sama persis dengan default
  // dikembalikan string kosong, sehingga ujian tetap memakai default terbaru.
  ambilPesanNilaiUntukSimpan() {
    const rows = Guru.pesanNilaiDraft.map(r => ({ min: Number(r.min), max: Number(r.max), pesan: String(r.pesan || '').trim() }));
    for (const r of rows) {
      if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min < 0 || r.max > 100 || r.min > r.max) {
        return { error: 'Rentang nilai pesan tidak valid. Pastikan nilai awal ≤ nilai akhir dan berada di antara 0–100.' };
      }
    }
    const urut = rows.slice().sort((a, b) => a.min - b.min);
    for (let k = 1; k < urut.length; k++) {
      if (urut[k].min <= urut[k - 1].max) {
        return { error: 'Ada rentang nilai pesan yang saling tumpang tindih (' + urut[k - 1].min + '–' + urut[k - 1].max + ' dan ' + urut[k].min + '–' + urut[k].max + ').' };
      }
    }
    const samaDenganDefault = rows.length === DEFAULT_PESAN_NILAI.length &&
      rows.every((r, i) => r.min === DEFAULT_PESAN_NILAI[i].min && r.max === DEFAULT_PESAN_NILAI[i].max && (r.pesan === '' || r.pesan === DEFAULT_PESAN_NILAI[i].pesan));
    return { json: samaDenganDefault ? '' : JSON.stringify(rows) };
  },

  async init() {
    await muatTemaGlobal();
    Guru.muatDashboard();
    UI.mulaiAutoRefreshGuru('tab-dashboard');
  },

  // ---------------- DASHBOARD ----------------
  // Halaman pertama yang dilihat guru setelah masuk: kartu-kartu ringkasan
  // (jumlah soal, ujian, siswa, dll), Aksi Cepat, dan daftar Ujian Terbaru.
  // Menarik ulang Bank Soal/Ujian/Siswa supaya angkanya selalu terbaru --
  // fungsi-fungsi itu juga tetap merender tab masing-masing di belakang
  // layar (aman dipanggil walau tab-nya sedang tidak aktif).
  async muatDashboard() {
    const namaGuru = (state.user && state.user.nama) || 'Guru';
    const elNama = document.getElementById('dash-nama'); if (elNama) elNama.textContent = namaGuru;
    const elAv = document.getElementById('dash-avatar'); if (elAv) elAv.textContent = namaGuru.trim().charAt(0).toUpperCase();
    await Promise.all([Guru.muatBankSoal(), Guru.muatDaftarUjian(), Guru.muatDaftarSiswa()]);
    Guru.renderDashboard();
  },

  renderDashboard() {
    const cont = document.getElementById('dashboard-cards');
    if (!cont) return;
    const soal = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') !== 'arsip');
    const ujian = state.guru.ujianList || [];
    const siswa = state.guru.daftarSiswa || [];
    const now = new Date();
    const statusU = u => {
      if (u.status !== 'aktif') return 'nonaktif';
      if (!u.mulai || !u.selesai || now < new Date(u.mulai)) return 'terjadwal';
      return now > new Date(u.selesai) ? 'selesai' : 'berlangsung';
    };
    const hit = { berlangsung: 0, terjadwal: 0, selesai: 0, nonaktif: 0 };
    ujian.forEach(u => hit[statusU(u)]++);
    const mapel = {};
    soal.forEach(s => { const k = s.kategori || 'Tanpa mapel'; mapel[k] = (mapel[k] || 0) + 1; });
    const online = siswa.filter(s => s.online).length;
    const set = (id, v, html) => { const el = document.getElementById(id); if (el) el[html ? 'innerHTML' : 'textContent'] = v; };

    set('dash-date', now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    set('dash-mode-chip', modeServerAktif() ? 'Tersambung ke Google Sheets' : 'Mode lokal');
    set('dash-ringkas', hit.berlangsung > 0
      ? `${hit.berlangsung} ujian sedang berlangsung dan ${online} siswa sedang login. Pantau jalannya ujian dari menu Pemantauan.`
      : `Belum ada ujian yang berlangsung saat ini. ${hit.terjadwal} ujian dijadwalkan dan ${siswa.length} siswa terdaftar.`);

    const kartu = [
      { ico: 'fa-layer-group', label: 'Total bank soal', nilai: soal.length, sub: `di ${Object.keys(mapel).length} mapel`, tab: 'tab-bank-soal', warna: '#6f9f94' },
      { ico: 'fa-bolt', label: 'Ujian berlangsung', nilai: hit.berlangsung, sub: 'sedang aktif saat ini', tab: 'tab-pemantauan', warna: '#e58a72' },
      { ico: 'fa-calendar-days', label: 'Total ujian', nilai: ujian.length, sub: `${hit.terjadwal} akan datang`, tab: 'tab-ujian', warna: '#e9b44c' },
      { ico: 'fa-users', label: 'Siswa terdaftar', nilai: siswa.length, sub: `${online} sedang login`, tab: 'tab-siswa', warna: '#8fa4d8' }
    ];
    cont.innerHTML = kartu.map(k => `
      <div class="dash-card" style="--dash-warna:${k.warna}" onclick="UI.gantiTabGuru('${k.tab}')">
        <div class="dash-card-ico"><i class="fa-solid ${k.ico}"></i></div>
        <div class="dash-card-label">${k.label}</div>
        <div class="dash-card-nilai">${k.nilai}</div>
        <div class="dash-card-sub">${k.sub}</div>
      </div>`).join('');

    // Grafik pil: 7 mapel dengan soal terbanyak
    const top = Object.entries(mapel).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const warnaPil = ['#e58a72', '#e9b44c', '#8fb3a8', '#8fa4d8', '#c79bc8', '#7fbf9a', '#e8a0b4'];
    const maks = top.length ? top[0][1] : 1;
    set('dash-chart-mapel', top.length ? `<div class="pill-chart">` + top.map(([k, n], i) => `
      <div class="pill-col" title="${escapeHtml_(k)}: ${n} soal">
        <span class="pill-val">${n}</span>
        <div class="pill" style="--pc:${warnaPil[i]};height:${Math.max(12, Math.round(n / maks * 78))}%"></div>
        <span class="pill-lbl">${escapeHtml_(k)}</span>
      </div>`).join('') + `</div>` : '<p class="kosong-info">Belum ada soal. Tambahkan soal di menu Bank Soal.</p>', true);

    // Donut status ujian
    const bagian = [['Berlangsung', hit.berlangsung, '#6f9f94'], ['Akan datang', hit.terjadwal, '#e9b44c'], ['Selesai', hit.selesai, '#8fa4d8'], ['Nonaktif', hit.nonaktif, '#e58a72']];
    let acc = 0;
    const stop = ujian.length ? bagian.map(([, n, c]) => { const dari = acc; acc += n / ujian.length * 100; return `${c} ${dari}% ${acc}%`; }).join(',') : 'var(--c-line) 0 100%';
    set('dash-donut', `<div class="donut-wrap">
      <div class="donut" style="--dg:conic-gradient(${stop})"><div class="donut-mid"><b>${ujian.length}</b><span>Ujian</span></div></div>
      <div class="legend-list">${bagian.map(([l, n, c]) => `<div class="legend-row"><span class="dot" style="--lc:${c}"></span>${l}<span class="val">${ujian.length ? Math.round(n / ujian.length * 100) : 0}% (${n})</span></div>`).join('')}</div>
    </div>`, true);

    // Tabel ujian terbaru (5 teratas; pencarian menelusuri semua ujian)
    const contUjian = document.getElementById('dashboard-ujian-terbaru');
    if (!contUjian) return;
    if (ujian.length === 0) {
      contUjian.innerHTML = '<p class="kosong-info">Belum ada ujian. Klik "Buat Ujian Baru" untuk memulai.</p>';
      return;
    }
    const label = { berlangsung: ['ok', 'Berlangsung'], terjadwal: ['warn', 'Akan datang'], selesai: ['mute', 'Selesai'], nonaktif: ['no', 'Nonaktif'] };
    contUjian.innerHTML = `<table class="ledger"><thead><tr><th>Judul</th><th>Token</th><th>Jadwal</th><th>Status</th></tr></thead><tbody>` +
      ujian.slice().reverse().map((u, i) => {
        const [kls, txt] = label[statusU(u)];
        return `<tr style="cursor:pointer;${i >= 5 ? 'display:none' : ''}" data-i="${i}" data-cari="${escapeHtml_((u.judul + ' ' + u.token).toLowerCase())}" onclick="UI.gantiTabGuru('tab-ujian')">
          <td><strong>${escapeHtml_(u.judul)}</strong></td>
          <td><code>${u.token}</code></td>
          <td style="font-size:.8rem">${formatTanggal(u.mulai)}<br>s/d ${formatTanggal(u.selesai)}</td>
          <td><span class="badge ${kls}">${txt}</span></td>
        </tr>`;
      }).join('') + `</tbody></table>`;
  },

  filterDashboardUjian(q) {
    q = String(q || '').toLowerCase().trim();
    document.querySelectorAll('#dashboard-ujian-terbaru tr[data-cari]').forEach(tr => {
      tr.style.display = (q ? tr.dataset.cari.includes(q) : Number(tr.dataset.i) < 5) ? '' : 'none';
    });
  },

  // ---------------- BANK SOAL ----------------
  // Mengambil SEMUA soal milik guru ini dari server sekali (tidak difilter di sisi
  // server), lalu memfilter & merender di klien lewat renderDaftarSoal() — supaya
  // ganti-ganti dropdown kategori/sub-kategori terasa instan tanpa round-trip baru,
  // dan dropdown sub-kategori selalu lengkap (pola sama seperti filter Kelas di tab
  // Data Siswa).
  async muatBankSoal() {
    const [res, resUjian] = await Promise.all([
      api('getBankSoal', { guruId: state.user.id }),
      api('getDaftarUjian', { guruId: state.user.id })
    ]);
    const cont = document.getElementById('daftar-bank-soal');
    if (!res.ok) { cont.textContent = 'Gagal memuat: ' + res.error; return; }
    state.guru.bankSoal = res.data;
    if (resUjian.ok) state.guru.ujianList = resUjian.data; // dipakai untuk badge "pernah dipakai" (Riwayat)
    Guru.renderUlangBankSoal_();
  },

  // Gambar ulang tampilan Bank Soal dari state lokal TANPA mengunduh ulang dari
  // server (dipakai setelah hapus/arsip supaya layar langsung berubah).
  renderUlangBankSoal_() {
    Guru.perbaruiDaftarSubkategoriSoal();
    Guru.perbaruiDaftarKategoriSoal();
    Guru.renderMapelGrid();
    Guru.renderDaftarSoal();
    if (state.guru.viewBankSoal === 'arsip') Guru.renderGridArsipKategori();
    if (state.guru.viewBankSoal === 'arsip-kategori') Guru.renderDaftarArsipKategori();
  },

  // Terapkan perubahan ke state lokal setelah server mengonfirmasi berhasil.
  hapusDariStateLokal_(idList) {
    const set = new Set(idList.map(String));
    state.guru.bankSoal = (state.guru.bankSoal || []).filter(s => !set.has(String(s.id)));
  },
  ubahStatusDiStateLokal_(idList, status) {
    const set = new Set(idList.map(String));
    (state.guru.bankSoal || []).forEach(s => { if (set.has(String(s.id))) s.status = status; });
  },

  // ---------------- BANK SOAL: GRID MAPEL (tampilan kartu per kategori) ----------------
  renderMapelGrid() {
    const cont = document.getElementById('grid-mapel-list');
    if (!cont) return;
    const semua = state.guru.bankSoal || [];
    const peta = {};
    semua.forEach(s => {
      const k = s.kategori || '(tanpa kategori)';
      const arsip = (s.status || 'aktif') === 'arsip';
      peta[k] = peta[k] || { total: 0, arsip: 0 };
      peta[k].total++;
      if (arsip) peta[k].arsip++;
    });
    // Mapel yang SELURUH soalnya sudah diarsipkan (0 soal aktif) tidak lagi
    // ditampilkan di grid utama -- tetap bisa ditemukan & dikembalikan lewat
    // tombol "🗄 Arsip" (lihat Guru.bukaArsipSoal). Begitu 1 soal saja
    // dikembalikan, mapelnya otomatis muncul lagi di sini.
    Object.values(bacaSemuaMetaMapel_()).forEach(m => {
      if (m && m.buatan && !Object.keys(peta).some(k => samaTeks_(k, m.buatan))) peta[m.buatan] = { total: 0, arsip: 0, kosong: true };
    });
    const unik = Object.keys(peta)
      .filter(k => peta[k].kosong || (peta[k].total - peta[k].arsip) > 0)
      .sort((a, b) => labelKategori(a).localeCompare(labelKategori(b), 'id'));
    const jumlahArsip = semua.filter(s => (s.status || 'aktif') === 'arsip').length;
    const tombolArsip = document.getElementById('btn-lihat-arsip');
    if (tombolArsip) tombolArsip.textContent = `🗄 Arsip${jumlahArsip ? ' (' + jumlahArsip + ')' : ''}`;
    const kartu = unik.map(k => {
      const meta = ambilMetaMapel_(k);
      const jumlahAktif = peta[k].total - peta[k].arsip;
      return `
      <div class="mapel-card" style="--mapel-warna:${meta.warna}">
        <button type="button" class="mapel-card-hapus" title="Arsipkan seluruh soal Mapel ini" onclick="event.stopPropagation();Guru.hapusKategoriSoal('${escapeHtml_(k).replace(/'/g, "\\'")}')">🗑</button>
        <div class="mapel-card-ico">💡</div>
        <div class="mapel-card-badges">
          <span class="badge token">TOKEN: ${meta.token}</span>
          <span class="badge umum">UMUM</span>
        </div>
        <div class="mapel-card-judul">${escapeHtml_(labelKategori(k))}</div>
        <div class="mapel-card-jumlah">Total Soal: <strong>${jumlahAktif}</strong>${peta[k].arsip ? ` <span class="subtitle" style="display:inline">(+${peta[k].arsip} arsip)</span>` : ''}</div>
        <div class="mapel-card-aksi">
          <button type="button" class="accent small" style="flex:1" onclick="Guru.bukaKelolaSoal('${escapeHtml_(k).replace(/'/g, "\\'")}')">Kelola Soal</button>
          <button type="button" class="secondary small icon" title="Pratinjau seluruh soal Mapel ini (tampilan sama persis dengan siswa)" onclick="event.stopPropagation();Guru.pratinjauKategoriSoal('${escapeHtml_(k).replace(/'/g, "\\'")}')">👁</button>
        </div>
      </div>`;
    }).join('');
    cont.innerHTML = kartu + `
      <div class="mapel-card mapel-card-add" onclick="Guru.tambahMapelBaru()">
        <div class="mapel-card-add-ico">+</div>
        <div class="mapel-card-add-label">Tambah Mapel Baru</div>
      </div>`;
  },

  tambahMapelBaru() {
    const nama = prompt('Nama Mapel / kategori soal baru (mis. "Matematika", "Simulasi", "Tryout"):');
    if (!nama || !nama.trim()) return;
    const bersih = nama.trim();
    // Pakai ejaan yang sudah ada kalau mapel ini sebenarnya sudah ada (beda huruf besar/kecil saja).
    const ada = (state.guru.bankSoal || []).map(x => x.kategori).find(k => samaTeks_(k, bersih));
    const namaFinal = ada || bersih;
    ambilMetaMapel_(namaFinal, true); // siapkan token/warna & tandai sbg mapel buatan guru
    Guru.bukaKelolaSoal(namaFinal);
  },

  // ---------------- BANK SOAL: KELOLA SOAL (1 mapel/kategori, dgn tab tipe soal) ----------------
  bukaKelolaSoal(kategori) {
    state.guru.viewBankSoal = 'kelola';
    state.guru.kategoriKelola = kategori;
    state.guru.tipeTabKelola = 'pilihan_ganda';
    document.getElementById('grid-mapel-view').classList.add('hidden');
    document.getElementById('arsip-soal-view').classList.add('hidden');
    document.getElementById('arsip-kategori-view').classList.add('hidden');
    document.getElementById('kelola-soal-view').classList.remove('hidden');
    document.getElementById('kelola-soal-judul').textContent = labelKategori(kategori);
    const meta = ambilMetaMapel_(kategori);
    document.getElementById('kelola-soal-token').textContent = 'TOKEN: ' + meta.token;
    const filterSel = document.getElementById('filter-kategori-soal');
    if (filterSel) filterSel.value = kategori;
    UI.renderTipeTabs();
    Guru.renderDaftarSoal();
  },

  kembaliKeGridMapel() {
    state.guru.viewBankSoal = 'grid';
    document.getElementById('kelola-soal-view').classList.add('hidden');
    document.getElementById('arsip-soal-view').classList.add('hidden');
    document.getElementById('arsip-kategori-view').classList.add('hidden');
    document.getElementById('grid-mapel-view').classList.remove('hidden');
    Guru.renderMapelGrid();
  },

  // ---------------- BANK SOAL: ARSIP ----------------
  // LEVEL A (arsip-soal-view): grid kartu per KATEGORI yang punya soal arsip -- persis
  // seperti grid Mapel di Bank Soal, tapi khusus kategori yang (sebagian/seluruh) soalnya
  // sudah diarsipkan (mis. lewat "Hapus Kategori" di Bank Soal, lihat hapusKategoriSoal).
  // LEVEL B (arsip-kategori-view, lihat Guru.bukaArsipKategori): daftar SOAL di 1 kategori
  // arsip tsb, dengan aksi per-soal (kembalikan/hapus permanen) MAUPUN aksi borongan utk
  // seluruh kategori sekaligus (Guru.kembalikanKategoriArsip / hapusKategoriArsipPermanen).
  bukaArsipSoal() {
    state.guru.viewBankSoal = 'arsip';
    document.getElementById('grid-mapel-view').classList.add('hidden');
    document.getElementById('kelola-soal-view').classList.add('hidden');
    document.getElementById('arsip-kategori-view').classList.add('hidden');
    document.getElementById('arsip-soal-view').classList.remove('hidden');
    Guru.renderGridArsipKategori();
  },

  renderGridArsipKategori() {
    const cont = document.getElementById('grid-arsip-kategori-list');
    if (!cont) return;
    const arsip = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') === 'arsip');
    const peta = {};
    arsip.forEach(s => { const k = s.kategori || '(tanpa kategori)'; peta[k] = (peta[k] || 0) + 1; });
    const unik = Object.keys(peta).sort((a, b) => labelKategori(a).localeCompare(labelKategori(b), 'id'));
    const tombolArsip = document.getElementById('btn-lihat-arsip');
    if (tombolArsip) tombolArsip.textContent = `🗄 Arsip${arsip.length ? ' (' + arsip.length + ')' : ''}`;
    if (unik.length === 0) { cont.innerHTML = '<p class="subtitle">Arsip masih kosong. Kategori/soal yang dihapus dari Bank Soal akan muncul di sini sebagai kartu tersendiri.</p>'; return; }
    cont.innerHTML = unik.map(k => {
      const meta = ambilMetaMapel_(k);
      const kAman = escapeHtml_(k).replace(/'/g, "\\'");
      return `
      <div class="mapel-card" style="--mapel-warna:${meta.warna};opacity:.85" onclick="Guru.bukaArsipKategori('${kAman}')">
        <div class="mapel-card-ico">🗄</div>
        <div class="mapel-card-badges">
          <span class="badge no">Diarsipkan</span>
        </div>
        <div class="mapel-card-judul">${escapeHtml_(labelKategori(k))}</div>
        <div class="mapel-card-jumlah">Soal di arsip: <strong>${peta[k]}</strong></div>
        <div class="mapel-card-aksi">
          <button type="button" class="accent small" style="flex:1" onclick="event.stopPropagation();Guru.bukaArsipKategori('${kAman}')">Lihat Soal</button>
          <button type="button" class="secondary small icon" title="Kembalikan semua soal kategori ini ke Bank Soal" onclick="event.stopPropagation();Guru.kembalikanKategoriArsip('${kAman}')">↩</button>
          <button type="button" class="secondary small icon" title="Hapus permanen semua soal kategori ini" onclick="event.stopPropagation();Guru.hapusKategoriArsipPermanen('${kAman}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  },

  // LEVEL B: daftar soal di 1 kategori arsip. Dipanggil dgn parameter kategori saat masuk
  // dari kartu Arsip, ATAU tanpa parameter oleh tombol borongan di header saat sudah di
  // dalam halaman ini (memakai state.guru.kategoriArsipKelola yg tersimpan).
  bukaArsipKategori(kategori) {
    state.guru.viewBankSoal = 'arsip-kategori';
    state.guru.kategoriArsipKelola = kategori;
    document.getElementById('grid-mapel-view').classList.add('hidden');
    document.getElementById('kelola-soal-view').classList.add('hidden');
    document.getElementById('arsip-soal-view').classList.add('hidden');
    document.getElementById('arsip-kategori-view').classList.remove('hidden');
    document.getElementById('arsip-kategori-judul').textContent = labelKategori(kategori);
    Guru.renderDaftarArsipKategori();
  },

  kembaliKeArsipGrid() {
    document.getElementById('arsip-kategori-view').classList.add('hidden');
    Guru.bukaArsipSoal();
  },

  renderDaftarArsipKategori() {
    const cont = document.getElementById('daftar-arsip-kategori-soal');
    if (!cont) return;
    const kategori = state.guru.kategoriArsipKelola;
    const data = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') === 'arsip' && samaTeks_(s.kategori, kategori));
    // Soal terakhir di kategori ini baru saja dikembalikan/dihapus dari tombol per-soal
    // di bawah -> kategorinya otomatis tidak ada lagi di Arsip, kembali ke grid Arsip.
    if (data.length === 0) { Guru.kembaliKeArsipGrid(); return; }
    ['btn-arsip-kategori-kembalikan', 'btn-arsip-kategori-hapus'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.onclick = () => (id === 'btn-arsip-kategori-kembalikan' ? Guru.kembalikanKategoriArsip(kategori) : Guru.hapusKategoriArsipPermanen(kategori));
    });
    cont.innerHTML = data.map((s, i) => `
      <div class="soal-item">
        <div class="soal-item-nomor">${i + 1}</div>
        <div class="soal-item-body">
          <div class="meta">${labelKategori(s.kategori)}${s.subkategori ? ' • ' + escapeHtml_(s.subkategori) : ''}${s.topik ? ' • ' + escapeHtml_(s.topik) : ''} • ${labelTipe(s.tipe)} • Bobot ${s.bobot} • ${labelKesulitan(s.tingkat_kesulitan)} • <span class="badge no">Arsip</span></div>
          <div>${kontenSoalHtml(s.pertanyaan)}</div>
          ${s.gambar ? tagGambarAman_(s.gambar, '', 'Gambar soal') : ''}
          <div class="aksi">
            <button class="secondary small" onclick="Guru.kembalikanSoal('${s.id}')">↩ Kembalikan ke Bank Soal</button>
            <button class="danger small" onclick="Guru.hapusSoalPermanen('${s.id}')">🗑 Hapus Permanen</button>
          </div>
        </div>
      </div>`).join('');
    renderMatika(cont);
  },

  // Aksi borongan 1 kategori penuh -- dipanggil baik dari kartu grid Arsip maupun dari
  // tombol header saat sudah membuka Level B (lihat renderDaftarArsipKategori). Kalau
  // dipanggil tanpa argumen, ambil dari state.guru.kategoriArsipKelola (lagi buka Level B).
  async kembalikanKategoriArsip(kategori) {
    kategori = kategori || state.guru.kategoriArsipKelola;
    const cocok = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') === 'arsip' && samaTeks_(s.kategori, kategori));
    if (cocok.length === 0) return;
    if (!confirm(`Kembalikan SEMUA ${cocok.length} soal arsip di kategori "${labelKategori(kategori)}" ke Bank Soal?`)) return;
    toast(`Mengembalikan ${cocok.length} soal...`);
    const idList = cocok.map(s => s.id);
    const res = await api('ubahStatusSoalBanyak', { ids: JSON.stringify(idList), status: 'aktif' });
    const gagal = res.ok ? 0 : cocok.length;
    if (res.ok) Guru.ubahStatusDiStateLokal_(idList, 'aktif');
    toast(gagal ? `Gagal mengembalikan: ${res.error}` : `${cocok.length} soal di kategori "${labelKategori(kategori)}" dikembalikan ke Bank Soal.`, gagal ? 'error' : 'success');
    Guru.renderUlangBankSoal_();
    if (document.getElementById('arsip-kategori-view').classList.contains('hidden')) Guru.renderGridArsipKategori();
    else Guru.renderDaftarArsipKategori();
  },

  async hapusKategoriArsipPermanen(kategori) {
    kategori = kategori || state.guru.kategoriArsipKelola;
    const cocok = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') === 'arsip' && samaTeks_(s.kategori, kategori));
    if (cocok.length === 0) return;
    if (!confirm(`Hapus PERMANEN seluruh ${cocok.length} soal arsip di kategori "${labelKategori(kategori)}"? Tindakan ini TIDAK BISA DIBATALKAN.`)) return;
    toast(`Menghapus ${cocok.length} soal...`);
    const idList = cocok.map(s => s.id);
    const res = await api('hapusSoalBanyak', { ids: JSON.stringify(idList) });
    const gagal = res.ok ? 0 : cocok.length;
    if (res.ok) Guru.hapusDariStateLokal_(idList);
    toast(gagal ? `Gagal menghapus: ${res.error}` : `Kategori "${labelKategori(kategori)}" dihapus permanen dari Arsip (${cocok.length} soal).`, gagal ? 'error' : 'success');
    Guru.renderUlangBankSoal_();
    if (document.getElementById('arsip-kategori-view').classList.contains('hidden')) Guru.renderGridArsipKategori();
    else Guru.renderDaftarArsipKategori();
  },

  gantiTipeTabKelola(tipe) {
    state.guru.tipeTabKelola = tipe;
    UI.renderTipeTabs();
    Guru.renderDaftarSoal();
  },

  perbaruiDaftarSubkategoriSoal() {
    const unik = [...new Set((state.guru.bankSoal || []).map(s => s.subkategori).filter(Boolean))].sort();
    const datalist = document.getElementById('daftar-subkategori-soal');
    if (datalist) datalist.innerHTML = unik.map(k => `<option value="${escapeHtml_(k)}">`).join('');
    const select = document.getElementById('filter-subkategori-soal');
    if (select) {
      const nilaiSaatIni = select.value;
      select.innerHTML = '<option value="">Semua sub-kategori</option>' + unik.map(k => `<option value="${escapeHtml_(k)}">${escapeHtml_(k)}</option>`).join('');
      select.value = unik.includes(nilaiSaatIni) ? nilaiSaatIni : '';
    }
  },

  // Kategori/nama soal kini bebas diketik (bukan daftar tetap Kuis/Ulangan
  // Harian/UTS/UAS saja) — daftar pilihan di filter Bank Soal, datalist form
  // Tambah Soal, dan dropdown Buat Ujian semuanya DITURUNKAN otomatis dari
  // kategori yang sedang dipakai soal AKTIF (belum diarsipkan). Kategori baru
  // otomatis muncul di sini begitu ada 1 soal aktif memakainya; kategori yang
  // semua soalnya diarsipkan otomatis hilang dari daftar (lihat hapusKategoriSoal).
  perbaruiDaftarKategoriSoal() {
    const aktif = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') !== 'arsip');
    const unik = [...new Set(aktif.map(s => s.kategori).filter(Boolean))].sort((a, b) => labelKategori(a).localeCompare(labelKategori(b), 'id'));

    const datalist = document.getElementById('daftar-kategori-soal');
    if (datalist) datalist.innerHTML = unik.map(k => `<option value="${escapeHtml_(k)}">`).join('');

    const filterSel = document.getElementById('filter-kategori-soal');
    if (filterSel) {
      const nilaiSaatIni = filterSel.value;
      filterSel.innerHTML = '<option value="">Semua kategori</option>' + unik.map(k => `<option value="${escapeHtml_(k)}">${escapeHtml_(labelKategori(k))}</option>`).join('');
      filterSel.value = unik.includes(nilaiSaatIni) ? nilaiSaatIni : '';
    }

    const ujianSel = document.getElementById('ujian-kategori');
    if (ujianSel) {
      const nilaiSaatIni = ujianSel.value;
      ujianSel.innerHTML = unik.length
        ? unik.map(k => `<option value="${escapeHtml_(k)}">${escapeHtml_(labelKategori(k))}</option>`).join('')
        : '<option value="">(Belum ada soal aktif)</option>';
      if (unik.includes(nilaiSaatIni)) ujianSel.value = nilaiSaatIni;
    }
  },

  renderDaftarSoal() {
    const cont = document.getElementById('daftar-bank-soal');
    // Di halaman "Kelola Soal" (Level B), kategori difilter berdasarkan state.guru.kategoriKelola
    // langsung (bukan lewat <select> tersembunyi) supaya tetap benar walau mapel baru belum
    // punya opsi di dropdown (mis. Mapel baru yang masih 0 soal) -- lihat Guru.bukaKelolaSoal.
    const filterKategori = state.guru.viewBankSoal === 'kelola'
      ? state.guru.kategoriKelola
      : (document.getElementById('filter-kategori-soal')?.value || '');
    const filterSubkategori = document.getElementById('filter-subkategori-soal')?.value || '';
    const filterStatus = document.getElementById('filter-status-soal')?.value || 'aktif';
    const hanyaRiwayat = document.getElementById('filter-riwayat-soal')?.checked || false;
    const hanyaBelumKunci = document.getElementById('filter-belum-kunci-soal')?.checked || false;
    const semua = state.guru.bankSoal || [];

    // id soal -> daftar judul ujian yang memakainya (dipakai untuk badge & filter Riwayat)
    const dipakaiDi = {};
    (state.guru.ujianList || []).forEach(u => {
      String(u.soal_ids || '').split(',').filter(Boolean).forEach(id => {
        (dipakaiDi[id] = dipakaiDi[id] || []).push(u.judul);
      });
    });

    const tipeTab = state.guru.viewBankSoal === 'kelola' ? state.guru.tipeTabKelola : '';

    let data = semua;
    if (filterStatus !== 'semua') data = data.filter(s => (s.status || 'aktif') === filterStatus);
    if (filterKategori) data = data.filter(s => samaTeks_(s.kategori, filterKategori));
    if (filterSubkategori) data = data.filter(s => samaTeks_(s.subkategori, filterSubkategori));
    if (hanyaRiwayat) data = data.filter(s => dipakaiDi[s.id]);
    if (tipeTab) data = data.filter(s => (s.tipe || 'pilihan_ganda') === tipeTab);

    // Ringkasan kunci dihitung SEBELUM filter "belum ada kunci" supaya angkanya tetap utuh.
    const jumlahBelumKunci = data.filter(s => { const st = statusKunciSoal_(s); return !st.ada && !st.manual; }).length;
    const jumlahTampilSemua = data.length;
    if (hanyaBelumKunci) data = data.filter(s => { const st = statusKunciSoal_(s); return !st.ada && !st.manual; });

    if (semua.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada soal.</p>'; return; }
    if (hanyaBelumKunci && data.length === 0) { cont.innerHTML = '<div class="kunci-ringkasan ok">✔ Semua soal di tampilan ini sudah punya kunci jawaban.</div>'; return; }
    if (data.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada soal yang cocok dengan filter/tab ini. Klik "Tambah Soal Manual" untuk membuat soal baru di tab ini.</p>'; return; }
    const ringkasanKunci = jumlahBelumKunci > 0
      ? `<div class="kunci-ringkasan warn">⚠ <strong>${jumlahBelumKunci}</strong> dari ${jumlahTampilSemua} soal <strong>belum ada kunci jawaban</strong> (ditandai garis merah). Centang "Belum ada kunci saja" untuk menyaringnya, lalu klik <em>Ubah</em> untuk memilih kunci.</div>`
      : (jumlahTampilSemua > 0 ? `<div class="kunci-ringkasan ok">✔ Semua ${jumlahTampilSemua} soal sudah punya kunci jawaban.</div>` : '');
    cont.innerHTML = ringkasanKunci + data.map((s, i) => {
      const arsip = (s.status || 'aktif') === 'arsip';
      const dipakai = dipakaiDi[s.id];
      const stKunci = statusKunciSoal_(s);
      const badgeKunci = stKunci.ada
        ? `<span class="badge ok" title="Kunci jawaban sudah ditetapkan">✔ Kunci: ${escapeHtml_(stKunci.label)}</span>`
        : (stKunci.manual ? `<span class="badge warn" title="Essay tanpa kata kunci, dikoreksi manual">✎ Koreksi manual</span>` : `<span class="badge no" title="Kunci jawaban belum ditetapkan">⚠ Belum ada kunci</span>`);
      return `
      <div class="soal-item${(!stKunci.ada && !stKunci.manual) ? ' soal-tanpa-kunci' : ''}">
        <div class="soal-item-nomor">${i + 1}</div>
        <div class="soal-item-body">
          <div class="meta">${labelKategori(s.kategori)}${s.subkategori ? ' • ' + escapeHtml_(s.subkategori) : ''}${s.topik ? ' • ' + escapeHtml_(s.topik) : ''} • ${labelTipe(s.tipe)} • Bobot ${s.bobot} • ${labelKesulitan(s.tingkat_kesulitan)} • ${badgeKunci}${arsip ? ' • <span class="badge no">Arsip</span>' : ''}${dipakai ? ` • <span class="badge warn" title="${escapeHtml_(dipakai.join(', '))}">🕘 Pernah dipakai (${dipakai.length}×)</span>` : ''}</div>
          <div>${kontenSoalHtml(s.pertanyaan)}</div>
          ${s.gambar ? tagGambarAman_(s.gambar, '', 'Gambar soal') : ''}
          ${s.audio ? `<audio controls src="${escapeHtml_(s.audio)}" style="margin-top:.5rem;max-width:320px"></audio>` : ''}
          ${s.video ? `<video controls src="${escapeHtml_(s.video)}" style="margin-top:.5rem;max-width:320px;display:block"></video>` : ''}
          <div class="aksi">
            <button class="secondary small" onclick='Guru.pratinjauSatuSoal("${s.id}")'>👁 Pratinjau</button>
            <button class="secondary small" onclick='Guru.bukaEditSoal("${s.id}")'>✏ Ubah</button>
            ${arsip
            ? `<button class="secondary small" onclick="Guru.kembalikanSoal('${s.id}')">↩ Kembalikan ke Bank Soal</button>`
            : `<button class="secondary small" onclick="Guru.arsipkanSoal('${s.id}')">🗄 Arsipkan</button>`}
            <button class="danger small" onclick="Guru.hapusSoal('${s.id}')">🗑 Hapus</button>
          </div>
        </div>
      </div>`;
    }).join('');
    renderMatika(cont);
  },

  // ---------------- PRATINJAU SOAL (tampilan sama persis dengan siswa) ----------------
  // Memakai renderKontenSoal() yang sama persis dipakai ExamEngine.renderSoal()
  // di layar ujian siswa (lihat komentar di definisi fungsinya) -- bedanya di
  // sini interaktif:false (opsi/kotak jawaban tidak bisa diklik/diisi, murni
  // untuk dilihat guru sebelum dipakai di ujian sungguhan).
  htmlPratinjauSatuSoal(soal, nomor, total) {
    // Baris Bank Soal menyimpan opsi sebagai teks `opsi_json`, BUKAN `opsi` --
    // tanpa soalDenganOpsi_ pilihan jawaban tidak ikut tampil di pratinjau.
    const s = soalDenganOpsi_(soal);
    const st = statusKunciSoal_(soal);
    let infoKunci;
    if (st.ada) infoKunci = `<div class="pratinjau-kunci ok">✔ Kunci jawaban sudah ditetapkan: <strong>${escapeHtml_(st.label)}</strong></div>`;
    else if (st.manual) infoKunci = `<div class="pratinjau-kunci manual">✎ Soal Essay tanpa kata kunci — dikoreksi manual.</div>`;
    else infoKunci = `<div class="pratinjau-kunci no">⚠ Kunci jawaban BELUM ditetapkan — klik Ubah pada soal ini untuk memilihnya.</div>`;
    return `<div class="question-card" style="margin-bottom:0">${renderKontenSoal(s, { nomor, total, interaktif: false, tandaiKunci: st.indeks })}${infoKunci}</div>`;
  },

  bukaModalPratinjau(judul, subjudul, bodyHtml) {
    document.getElementById('pratinjau-soal-title').textContent = judul;
    document.getElementById('pratinjau-soal-subtitle').textContent = subjudul;
    const body = document.getElementById('pratinjau-soal-body');
    body.innerHTML = bodyHtml;
    document.getElementById('modal-pratinjau-soal').classList.remove('hidden');
    renderMatika(body);
  },

  pratinjauSatuSoal(id) {
    const soal = (state.guru.bankSoal || []).find(s => s.id === id);
    if (!soal) return;
    Guru.bukaModalPratinjau(
      'Pratinjau Soal',
      'Tampilan di bawah ini sama persis dengan yang dilihat siswa saat mengerjakan ujian — hanya untuk dilihat, tidak bisa diisi/disimpan.',
      Guru.htmlPratinjauSatuSoal(soal, 1, 1)
    );
  },

  pratinjauKategoriSoal(kategori) {
    const daftar = (state.guru.bankSoal || []).filter(s => samaTeks_(s.kategori, kategori) && (s.status || 'aktif') === 'aktif');
    if (daftar.length === 0) { toast('Belum ada soal aktif di Mapel ini untuk dipratinjau.', 'error'); return; }
    Guru.bukaModalPratinjau(
      `Pratinjau Seluruh Soal — ${labelKategori(kategori)}`,
      `${daftar.length} soal aktif, ditampilkan berurutan sama persis dengan yang dilihat siswa satu per satu saat ujian — hanya untuk dilihat, tidak bisa diisi/disimpan. Soal yang diarsipkan tidak disertakan.`,
      daftar.map((s, i) => Guru.htmlPratinjauSatuSoal(s, i + 1, daftar.length))
        .join('<hr style="border:none;border-top:1px solid var(--c-line);margin:1.4rem 0">')
    );
  },

  // Dipakai tombol "👁 Pratinjau Semua Soal" di header halaman Kelola Soal --
  // mempratinjau Mapel yang sedang dibuka (state.guru.kategoriKelola).
  pratinjauKategoriAktif() {
    Guru.pratinjauKategoriSoal(state.guru.kategoriKelola);
  },

  async arsipkanSoal(id) {
    const res = await api('simpanSoal', { soal: JSON.stringify({ id, status: 'arsip' }) });
    if (res.ok) { Guru.ubahStatusDiStateLokal_([id], 'arsip'); Guru.renderUlangBankSoal_(); toast('Soal dipindahkan ke Arsip.', 'success'); }
    else toast('Gagal mengarsipkan soal: ' + res.error, 'error');
  },

  async kembalikanSoal(id) {
    const res = await api('simpanSoal', { soal: JSON.stringify({ id, status: 'aktif' }) });
    if (res.ok) { Guru.ubahStatusDiStateLokal_([id], 'aktif'); Guru.renderUlangBankSoal_(); toast('Soal dikembalikan ke Bank Soal.', 'success'); }
    else toast('Gagal mengembalikan soal: ' + res.error, 'error');
  },

  bukaModalKelolaKategori() {
    Guru.renderKelolaKategori();
    document.getElementById('modal-kelola-kategori').classList.remove('hidden');
  },

  renderKelolaKategori() {
    const cont = document.getElementById('daftar-kelola-kategori');
    const aktif = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') !== 'arsip');
    const peta = {};
    aktif.forEach(s => { const k = s.kategori || '(tanpa kategori)'; peta[k] = (peta[k] || 0) + 1; });
    const unik = Object.keys(peta).sort((a, b) => labelKategori(a).localeCompare(labelKategori(b), 'id'));
    cont.innerHTML = unik.length
      ? unik.map(k => `
        <div class="row" style="align-items:center;justify-content:space-between;margin-bottom:.5rem">
          <span><strong>${escapeHtml_(labelKategori(k))}</strong> <span class="subtitle" style="display:inline">(${peta[k]} soal aktif)</span></span>
          <button class="danger small" data-kategori="${escapeHtml_(k).replace(/"/g, '&quot;')}" onclick="Guru.hapusKategoriSoal(this.dataset.kategori)">🗑 Hapus</button>
        </div>`).join('')
      : '<p class="subtitle">Belum ada kategori aktif. Tambahkan lewat form di bawah, atau langsung ketik nama baru saat menambah soal.</p>';
  },

  tambahKategoriBaruDanTambahSoal() {
    const nama = document.getElementById('kelola-kategori-baru').value.trim();
    if (!nama) { toast('Ketik dulu nama kategori/soal baru, mis. Tryout.', 'error'); return; }
    document.getElementById('kelola-kategori-baru').value = '';
    UI.tutupModal('modal-kelola-kategori');
    UI.bukaModalSoal();
    document.getElementById('soal-kategori').value = nama;
  },

  // "Menghapus" kategori TIDAK menghapus soal secara permanen — semua soal
  // aktif di kategori itu dipindahkan ke Arsip (bisa dikembalikan kapan saja
  // lewat filter status "Arsip"), lalu kategorinya otomatis hilang dari
  // daftar aktif karena tidak ada lagi soal aktif yang memakainya.
  async hapusKategoriSoal(kategori) {
    if (!(state.guru.bankSoal || []).some(s => samaTeks_(s.kategori, kategori))) {
      // Mapel kosong buatan sendiri: cukup dilepas dari daftar kartu.
      hapusMapelBuatan_(kategori); Guru.renderMapelGrid(); Guru.renderKelolaKategori(); return;
    }
    const cocok = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') !== 'arsip' && samaTeks_(s.kategori, kategori));
    if (cocok.length === 0) { toast('Kategori ini sudah tidak memiliki soal aktif.', 'error'); Guru.renderKelolaKategori(); return; }
    if (!confirm(`Hapus kategori "${labelKategori(kategori)}"? ${cocok.length} soal di dalamnya akan dipindahkan ke Arsip (TIDAK dihapus permanen — bisa diedit & dikembalikan lagi lewat filter status "Arsip" di Bank Soal).`)) return;
    toast(`Memindahkan ${cocok.length} soal ke Arsip...`);
    const idList = cocok.map(s => s.id);
    const res = await api('ubahStatusSoalBanyak', { ids: JSON.stringify(idList), status: 'arsip' });
    const gagal = res.ok ? 0 : cocok.length;
    if (res.ok) Guru.ubahStatusDiStateLokal_(idList, 'arsip');
    toast(gagal
      ? `Kategori "${labelKategori(kategori)}": gagal diarsipkan (${res.error}).`
      : `Kategori "${labelKategori(kategori)}" dihapus — ${cocok.length} soal dipindahkan ke Arsip.`, gagal ? 'error' : 'success');
    Guru.renderUlangBankSoal_();
    Guru.renderKelolaKategori();
  },

  bukaEditSoal(id) {
    const soal = state.guru.bankSoal.find(s => s.id === id);
    if (soal) UI.bukaModalSoal(soal);
  },

  // jenis: 'gambar' | 'audio' | 'video' — dipakai ketiga kotak upload di bagian
  // "Media Pendukung Soal" pada form Tambah/Ubah Soal. Memakai action 'uploadGambar'
  // yang sama (generik, cukup dilihat dari mimeType) supaya tidak perlu endpoint baru.
  async uploadMediaSoal(ev, jenis) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      toast('Mengunggah ' + jenis + '...');
      const res = await api('uploadGambar', { base64, filename: file.name, mimeType: file.type });
      if (res.ok) {
        document.getElementById(`soal-${jenis}-url`).value = res.url;
        const prev = document.getElementById(`soal-${jenis}-preview`);
        if (jenis === 'gambar') pasangSrcGambarAman_(prev, res.url); else prev.src = res.url;
        prev.classList.remove('hidden');
        toast((jenis[0].toUpperCase() + jenis.slice(1)) + ' berhasil diunggah.', 'success');
      } else {
        toast('Gagal mengunggah ' + jenis + ': ' + res.error, 'error');
      }
    };
    reader.readAsDataURL(file);
  },
  async uploadGambarSoal(ev) { return Guru.uploadMediaSoal(ev, 'gambar'); },

  async uploadGambarOpsi(ev) {
    const row = ev.target.closest('.opsi-row');
    UI.uploadGambarOpsiDariEvent(ev, (url) => {
      row.querySelector('.opsi-gambar-url').value = url;
      const prev = row.querySelector('.opsi-gambar-preview');
      pasangSrcGambarAman_(prev, url); prev.classList.remove('hidden');
      row.querySelector('.opsi-hapus-gambar').classList.remove('hidden');
      toast('Gambar opsi berhasil diunggah.', 'success');
    });
  },

  async simpanSoal() {
    return jalankanDenganTombolSibuk('btn-simpan-soal', 'Menyimpan...', async () => {
      const tipe = document.getElementById('soal-tipe').value;
      const soal = {
        id: document.getElementById('soal-id').value || undefined,
        guru_id: state.user.id,
        kategori: document.getElementById('soal-kategori').value,
        subkategori: document.getElementById('soal-subkategori').value.trim(),
        topik: document.getElementById('soal-topik').value.trim(),
        tipe,
        pertanyaan: sanitasiHtmlKaya_(document.getElementById('soal-pertanyaan').innerHTML.trim()),
        gambar: document.getElementById('soal-gambar-url').value,
        audio: document.getElementById('soal-audio-url').value,
        video: document.getElementById('soal-video-url').value,
        bobot: Number(document.getElementById('soal-bobot').value) || 10,
        tingkat_kesulitan: document.getElementById('soal-tingkat-kesulitan').value
      };
      if (richTeksKosong_(soal.pertanyaan)) { toast('Pertanyaan tidak boleh kosong.', 'error'); return; }

      if (tipe === 'pilihan_ganda' || tipe === 'checkbox' || tipe === 'benar_salah') {
        const baris = document.querySelectorAll('#soal-form-opsi .opsi-row');
        const opsi = Array.from(baris).map(row => {
          const teks = sanitasiHtmlKaya_(row.querySelector('.opsi-teks-rich').innerHTML.trim());
          const gambar = row.querySelector('.opsi-gambar-url').value.trim();
          const o = { teks };
          if (gambar) o.gambar = gambar;
          return o;
        });
        const checkedEls = document.querySelectorAll('#soal-form-opsi input[name="opsi-benar"]:checked');
        if (opsi.length < 2) { toast('Minimal 2 opsi jawaban.', 'error'); return; }
        if (opsi.some(o => richTeksKosong_(o.teks) && !o.gambar)) { toast('Setiap opsi harus memiliki teks atau gambar.', 'error'); return; }
        if (checkedEls.length === 0) { toast('Pilih minimal satu jawaban benar.', 'error'); return; }
        soal.opsi_json = JSON.stringify(opsi);
        soal.kunci_json = tipe === 'checkbox'
          ? JSON.stringify(Array.from(checkedEls).map(c => Number(c.value)))
          : JSON.stringify(Number(checkedEls[0].value));
      } else if (tipe === 'menjodohkan') {
        const kiri = Array.from(document.querySelectorAll('.mj-kiri')).map(el => el.value.trim());
        const kanan = Array.from(document.querySelectorAll('.mj-kanan')).map(el => el.value.trim());
        const kunciStr = document.getElementById('mj-kunci').value.trim();
        if (kiri.some(k => !k) || kanan.some(k => !k)) { toast('Semua item kiri/kanan harus diisi.', 'error'); return; }
        const kunciArr = kunciStr.split(',').map(s => s.trim());
        if (kunciArr.length !== kiri.length) { toast('Jumlah kunci jawaban harus sama dengan jumlah item kiri.', 'error'); return; }
        const kunci = {}; kunciArr.forEach((v, i) => kunci[i] = v);
        soal.opsi_json = JSON.stringify({ kiri, kanan });
        soal.kunci_json = JSON.stringify(kunci);
      } else {
        const kataKunci = document.getElementById('uraian-kata-kunci').value.split(',').map(s => s.trim()).filter(Boolean);
        soal.opsi_json = '';
        soal.kunci_json = JSON.stringify({ kataKunci });
      }

      const res = await api('simpanSoal', { soal: JSON.stringify(soal) });
      if (res.ok) { toast('Soal tersimpan.', 'success'); UI.tutupModal('modal-soal'); Guru.muatBankSoal(); }
      else toast('Gagal menyimpan soal: ' + res.error, 'error');
    });
  },

  // Hapus PERMANEN — baris tetap dihapus langsung dari sheet/penyimpanan (BUKAN
  // diarsipkan) walau dipanggil dari daftar soal aktif, karena itu konfirmasinya
  // ditulis eksplisit "PERMANEN" & "tidak bisa dibatalkan". Kalau hanya ingin
  // menyembunyikan sementara, pakai tombol "🗄 Arsipkan" (Guru.arsipkanSoal).
  async hapusSoal(id) {
    if (!confirm('Hapus PERMANEN soal ini? Tindakan ini TIDAK BISA DIBATALKAN (beda dengan "Arsipkan" yang masih bisa dikembalikan).')) return;
    const res = await api('hapusSoal', { id });
    if (res.ok) { Guru.hapusDariStateLokal_([id]); Guru.renderUlangBankSoal_(); toast('Soal dihapus permanen.', 'success'); }
    else toast('Gagal menghapus soal: ' + res.error, 'error');
  },

  // Sama seperti hapusSoal, dipakai khusus di halaman Arsip (Guru.bukaArsipSoal)
  // dgn teks konfirmasi yang menegaskan soal sudah diarsipkan & akan hilang
  // selamanya kalau tetap dihapus.
  async hapusSoalPermanen(id) {
    if (!confirm('Yakin ingin menghapus soal ini secara PERMANEN dari Arsip? Soal tidak bisa dikembalikan lagi setelah ini.')) return;
    const res = await api('hapusSoal', { id });
    if (res.ok) { Guru.hapusDariStateLokal_([id]); Guru.renderUlangBankSoal_(); toast('Soal dihapus permanen.', 'success'); }
    else toast('Gagal menghapus soal: ' + res.error, 'error');
  },

  // Kumpulan gambar pendukung dipilih sekaligus (multi-file) berbarengan dgn file
  // template Excel/Word saat impor massal, dicocokkan ke tiap soal lewat NAMA
  // FILE persis yang diketik di kolom "Gambar" pada tabel (lihat barisTabelJadiSoal_).
  // Mengembalikan Map(nama-file-lowercase -> URL gambar yg sudah diunggah.
  async unggahBatchGambarImpor_(fileList) {
    const peta = new Map();
    const files = Array.from(fileList || []);
    if (!files.length) return peta;
    toast(`Mengunggah ${files.length} gambar pendukung...`);
    await jalankanParalel_(files, 4, async (file) => {
      const base64Asli = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const kecil = await perkecilGambar_({ mimeType: file.type, base64: base64Asli, ekstensi: '' });
      const res = await api('uploadGambar', { base64: kecil.base64, filename: file.name, mimeType: kecil.mimeType });
      if (res.ok) peta.set(file.name.trim().toLowerCase(), res.url);
    });
    return peta;
  },

  // Impor massal dari tabel Excel (.xlsx). Baris pertama = header (nama kolom
  // bebas urutan, lihat penjelasan lengkap di atas barisTabelJadiSoal_). Gambar
  // pendukung (opsional) dipilih sekaligus lewat input #input-import-soal-gambar
  // yg muncul begitu file .xlsx dipilih. Lihat Guru.unduhTemplateSoal.
  importSoalDariFile(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const inputGambar = document.getElementById('input-import-soal-gambar');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try { await muatPustaka_('xlsx'); } catch (err) { toast(err.message, 'error'); ev.target.value = ''; return; }
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).filter(r => r.some(c => String(c || '').trim()));
      const petaGambar = await Guru.unggahBatchGambarImpor_(inputGambar ? inputGambar.files : null);
      const peringatan = [];
      const soalList = barisTabelKeSoalList_(rows, state.user.id, state.guru.kategoriKelola, petaGambar, peringatan);
      if (soalList.length === 0) { toast('Tidak ada baris soal valid ditemukan di file. Pastikan baris pertama adalah header & kolom "Pertanyaan" terisi.', 'error'); return; }
      const res = await api('importSoal', { soalList: JSON.stringify(soalList) });
      if (res.ok) {
        toast(res.count + ' soal berhasil diimpor.', 'success');
        Guru.muatBankSoal();
        if (peringatan.length) alert('Berhasil diimpor, TAPI ada ' + peringatan.length + ' soal dengan kunci jawaban yang tidak dikenali (mohon periksa & perbaiki manual di Bank Soal):\n\n' + peringatan.join('\n\n'));
      }
      else toast('Gagal impor: ' + res.error, 'error');
      ev.target.value = '';
      if (inputGambar) inputGambar.value = '';
      UI.perbaruiLabelJumlahGambar('input-import-soal-gambar', 'label-jumlah-gambar-xlsx');
    };
    reader.readAsBinaryString(file);
  },

  // Impor massal dari tabel di dalam file Word (.docx) — 1 baris tabel = 1 soal,
  // format kolom SAMA PERSIS dgn template Excel (lihat barisTabelJadiSoal_).
  // Dibaca lewat mammoth.js (convertToHtml, BUKAN extractRawText) supaya struktur
  // tabelnya (baris & kolom) ikut terbaca lengkap, lalu diuraikan lewat DOMParser.
  //
  // GAMBAR YANG DITEMPEL LANGSUNG DI WORD (paste/insert image di dalam sel tabel --
  // kolom "Gambar" ATAUPUN disisipkan di tengah teks Pertanyaan/Opsi) otomatis
  // terdeteksi & terunggah ke Drive TANPA guru perlu memilih file gambar terpisah:
  // opsi convertImage:mammoth.images.dataUri membuat setiap gambar dalam dokumen ikut
  // terbaca sbg <img src="data:..."> pada HTML hasil konversi; kode di bawah lalu
  // mencari <img> di tiap sel data (bukan sel header), mengunggah tiap yg ditemukan
  // lewat action 'uploadGambar', dan mengganti src-nya dgn URL hasil unggahan --
  // untuk kolom "Gambar" dipakai sbg field soal.gambar (URL polos), untuk kolom lain
  // (mis. Pertanyaan/Opsi) dipakai sbg <img> inline dlm teks kaya (lihat kontenSoalHtml).
  // Input "Pilih Gambar Pendukung" (petaGambar/cocok nama file) TETAP didukung sbg
  // cara alternatif -- keduanya bisa dipakai sekaligus dlm 1 file yg sama.
  async importSoalDariDocx(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    try { await muatPustaka_('mammoth'); } catch (err) { toast('Pustaka pembaca .docx belum termuat. ' + err.message, 'error'); ev.target.value = ''; return; }
    const inputGambar = document.getElementById('input-import-soal-docx-gambar');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // PERF: gambar TIDAK disisipkan sbg data URI raksasa di HTML (membuat
        // DOMParser & innerHTML sangat berat). Cukup ditandai "cbt-img:N", isi
        // base64-nya disimpan terpisah di `gambarDokumen`.
        const gambarDokumen = [];
        const hasil = await mammoth.convertToHtml({ arrayBuffer: e.target.result }, {
          convertImage: mammoth.images.imgElement(function (image) {
            return image.read('base64').then(function (b64) {
              const idx = gambarDokumen.push({ mimeType: image.contentType, base64: b64 }) - 1;
              return { src: 'cbt-img:' + idx };
            });
          })
        });
        const dom = new DOMParser().parseFromString(hasil.value, 'text/html');

        // Tahap 1: kumpulkan gambar unik yg benar-benar dipakai di SEL DATA (bukan header).
        const dipakai = new Set();
        for (const tbl of Array.from(dom.querySelectorAll('table'))) {
          Array.from(tbl.querySelectorAll('tr')).slice(1).forEach(tr => {
            tr.querySelectorAll('img').forEach(img => {
              const m = /^cbt-img:(\d+)$/.exec(img.getAttribute('src') || '');
              if (m) dipakai.add(Number(m[1]));
            });
          });
        }
        // Hapus duplikat (gambar identik yg dipakai berulang hanya diunggah SEKALI).
        const unikMap = new Map(); // kunci isi base64 -> indeks unggahan
        const daftarUnggah = [];
        const petaIdxKeUnik = new Map();
        dipakai.forEach(idx => {
          const g = gambarDokumen[idx];
          if (!g || !g.base64) return;
          const kunci = g.mimeType + '|' + g.base64;
          if (!unikMap.has(kunci)) { unikMap.set(kunci, daftarUnggah.length); daftarUnggah.push(g); }
          petaIdxKeUnik.set(idx, unikMap.get(kunci));
        });

        // Tahap 2: perkecil + unggah PARALEL (4 sekaligus).
        let selesai = 0, gagalTempel = 0;
        if (daftarUnggah.length) toast(`Mengunggah ${daftarUnggah.length} gambar dari dokumen...`);
        const urlUnik = await jalankanParalel_(daftarUnggah, 4, async (g, i) => {
          const bagian = await perkecilGambar_({ mimeType: g.mimeType, base64: g.base64, ekstensi: (g.mimeType.split('/')[1] || 'png').split('+')[0] });
          const res = await api('uploadGambar', { base64: bagian.base64, filename: `soal-tempel-${i + 1}.${bagian.ekstensi}`, mimeType: bagian.mimeType });
          selesai++;
          if (daftarUnggah.length >= 6 && selesai % 5 === 0) toast(`Gambar terunggah ${selesai}/${daftarUnggah.length}...`);
          if (!res.ok) gagalTempel++;
          return res.ok ? res.url : null;
        });
        const jumlahTempel = daftarUnggah.length;
        gambarDokumen.length = 0; // bebaskan memori base64

        const petaGambar = await Guru.unggahBatchGambarImpor_(inputGambar ? inputGambar.files : null);

        // Tahap 3: pasang URL hasil unggahan lalu bentuk baris soal.
        let soalList = [];
        const peringatan = [];
        for (const tbl of Array.from(dom.querySelectorAll('table'))) {
          const trList = Array.from(tbl.querySelectorAll('tr'));
          if (!trList.length) continue;
          const headerKey = Array.from(trList[0].querySelectorAll('th,td')).map(td => kunciHeader_(td.textContent));
          const rows = [];
          for (let rIdx = 0; rIdx < trList.length; rIdx++) {
            const selList = Array.from(trList[rIdx].querySelectorAll('th,td'));
            const nilai = [];
            for (let cIdx = 0; cIdx < selList.length; cIdx++) {
              const td = selList[cIdx];
              if (rIdx === 0) { nilai.push(td.textContent.trim()); continue; }
              // Sel TANPA gambar -> teks biasa (penting utk kolom Tipe/Kunci/Bobot dst.
              // agar tidak terbaca sbg "<p>PGK</p>" dan salah dideteksi).
              if (!td.querySelector('img')) { nilai.push(td.textContent.trim()); continue; }
              td.querySelectorAll('img').forEach(img => {
                const m = /^cbt-img:(\d+)$/.exec(img.getAttribute('src') || '');
                const url = m && petaIdxKeUnik.has(Number(m[1])) ? urlUnik[petaIdxKeUnik.get(Number(m[1]))] : null;
                if (url) img.setAttribute('src', url); else img.remove();
              });
              if ((headerKey[cIdx] || '') === 'gambar') {
                const imgPertama = td.querySelector('img');
                nilai.push(imgPertama ? imgPertama.getAttribute('src') : td.textContent.trim());
              } else if (/^(pertanyaan|opsi[a-h])$/.test(headerKey[cIdx] || '')) {
                nilai.push(td.innerHTML.trim()); // teks kaya + <img> inline
              } else {
                nilai.push(td.textContent.trim());
              }
            }
            rows.push(nilai);
          }
          soalList = soalList.concat(barisTabelKeSoalList_(rows, state.user.id, state.guru.kategoriKelola, petaGambar, peringatan));
        }
        if (soalList.length === 0) { toast('Tidak ada tabel soal yang terbaca. Pastikan mengisi di dalam tabel template, jangan mengubah baris header.', 'error'); return; }
        toast(`Menyimpan ${soalList.length} soal...`);
        const res = await api('importSoal', { soalList: JSON.stringify(soalList) });
        if (res.ok) {
          let ket = '';
          if (jumlahTempel > 0) ket = ` (${jumlahTempel - gagalTempel} gambar tempelan di Word ikut otomatis terunggah${gagalTempel ? `, ${gagalTempel} gagal` : ''})`;
          toast(res.count + ' soal berhasil diimpor dari Word' + ket + '.', 'success');
          Guru.muatBankSoal();
          if (peringatan.length) alert('Berhasil diimpor, TAPI ada ' + peringatan.length + ' soal dengan kunci jawaban yang tidak dikenali (mohon periksa & perbaiki manual di Bank Soal):\n\n' + peringatan.join('\n\n'));
        }
        else toast('Gagal impor: ' + res.error, 'error');
      } catch (err) {
        toast('Gagal membaca file .docx: ' + err.message, 'error');
      } finally {
        ev.target.value = '';
        if (inputGambar) inputGambar.value = '';
        UI.perbaruiLabelJumlahGambar('input-import-soal-docx-gambar', 'label-jumlah-gambar-docx');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // Menulis file .docx berisi 1 TABEL siap isi (kolom sama persis dgn template
  // Excel) + 4 baris contoh (PG, PG Kompleks, Benar/Salah, Essay). Guru tinggal
  // menambah baris baru di bawah contoh mengikuti pola yang sama, TANPA perlu
  // paham format label/kode apa pun. Ditulis langsung tanpa pustaka pihak ketiga.
  unduhTemplateSoalDocx() {
    const headers = ['Kategori', 'Topik', 'Tipe', 'Pertanyaan', 'Gambar', 'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 'Opsi E', 'Kunci', 'Bobot', 'Kesulitan'];
    const rows = [
      ['', 'Sejarah Indonesia', 'PG', 'Siapakah Presiden Indonesia pada tahun 1999?', '', 'Soekarno', 'Soeharto', 'B. J. Habibie', 'Abdurrahman Wahid', '', 'C', '10', 'Sedang'],
      ['', 'Biologi', 'PGK', 'Manakah yang termasuk hewan mamalia? (kunci boleh lebih dari 1, pisah koma)', '', 'Paus', 'Ular', 'Kelelawar', 'Buaya', '', 'A,C', '10', 'Sedang'],
      ['', 'Geografi', 'BS', 'Indonesia terletak di antara dua benua, yaitu Asia dan Australia.', '', 'Benar', 'Salah', '', '', '', 'Benar', '5', 'Mudah'],
      ['', 'Biologi', 'Essay', 'Jelaskan proses terjadinya fotosintesis pada tumbuhan.', '', '', '', '', '', '', 'fotosintesis, klorofil, karbon dioksida', '15', 'Sedang'],
      ['', 'Geografi', 'Jodohkan', 'Jodohkan negara dengan ibu kotanya.', '', 'Indonesia = Jakarta', 'Jepang = Tokyo', 'Prancis = Paris', '', '', '', '10', 'Sedang'],
      ['', '', '', '(tambahkan baris baru di bawah sini, ikuti pola di atas — boleh sebanyak yang dibutuhkan)', '', '', '', '', '', '', '', '', '']
    ];
    const items = [
      { text: 'TEMPLATE IMPORT SOAL — CBT Online', heading: true },
      { text: 'Isi tabel di bawah, SATU BARIS = SATU SOAL. Kolom Tipe: PG (pilihan ganda), PGK (pilihan ganda kompleks/kunci boleh lebih dari 1), BS (benar/salah), Jodohkan, Essay. Kolom Kunci cukup diisi HURUF opsi yang benar (mis. "C"), untuk PGK pisah dgn koma (mis. "A,C"), untuk BS isi "Benar"/"Salah", untuk Essay isi kata kunci penilaian dipisah koma. Kolom Gambar: boleh dikosongkan, boleh diisi link gambar publik, ATAU cukup TEMPEL/SISIPKAN gambarnya langsung di dalam sel itu (Insert > Pictures di Word) -- saat diimpor gambar tersebut otomatis terdeteksi & terunggah sendiri, tanpa perlu file gambar terpisah. Gambar juga boleh ditempel langsung di tengah sel Pertanyaan/Opsi kalau perlu. Kolom yang tidak dipakai (mis. Opsi E utk soal 4 opsi) boleh dikosongkan. Tipe Jodohkan sebaiknya dibuat lewat "Tambah Soal Manual" karena pasangannya lebih mudah diatur lewat formulir.' },
      { table: { headers, rows } }
    ];
    unduhDocx_('Template_Import_Soal_CBT.docx', items);
    toast('Template .docx berhasil diunduh.', 'success');
  },

  // ---------------- UJIAN ----------------
  async muatDaftarUjian() {
    const res = await api('getDaftarUjian', { guruId: state.user.id });
    const cont = document.getElementById('daftar-ujian');
    if (!res.ok) { cont.textContent = 'Gagal memuat.'; return; }
    state.guru.ujianList = res.data;
    if (res.data.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada ujian.</p>'; return; }
    cont.innerHTML = `<table class="ledger"><thead><tr>
        <th>Judul</th><th>Token</th><th>Durasi</th><th>Jadwal</th><th>Maks. Pelanggaran</th><th>Status</th><th></th>

      </tr></thead><tbody>` + res.data.map(u => `
        <tr>
          <td><strong>${escapeHtml_(u.judul)}</strong><br><span style="color:var(--c-muted);font-size:.78rem">${labelKategori(u.kategori)}${u.subkategori ? ' • ' + escapeHtml_(u.subkategori) : ''}</span></td>
          <td><code style="font-size:1rem;font-weight:700">${u.token}</code></td>
          <td>${u.durasi_menit} menit</td>
          <td style="font-size:.8rem">${formatTanggal(u.mulai)}<br>s/d ${formatTanggal(u.selesai)}</td>
          <td>${u.max_pelanggaran}</td>
          <td><span class="badge ${u.status === 'aktif' ? 'ok' : 'no'}">${u.status}</span></td>
          <td>
            <button class="secondary small" onclick='Guru.bukaEditUjian("${u.id}")'>Ubah</button>
            <button class="danger small" onclick="Guru.hapusUjian('${u.id}')">Hapus</button>
          </td>
        </tr>`).join('') + `</tbody></table>`;
  },

  bukaEditUjian(id) {
    const u = state.guru.ujianList.find(x => x.id === id);
    if (u) UI.bukaModalUjian(u);
  },

  async hapusUjian(id) {
    if (!confirm('Hapus ujian ini? Rekap nilai yang sudah ada tidak akan terhapus.')) return;
    const res = await api('hapusUjian', { id });
    if (res.ok) { toast('Ujian dihapus.', 'success'); Guru.muatDaftarUjian(); }
  },

  async muatPilihanSoalUntukUjian(idsTerpilih) {
    const kategori = document.getElementById('ujian-kategori').value;
    const subkategori = document.getElementById('ujian-subkategori').value.trim();
    const res = await api('getBankSoal', { guruId: state.user.id, kategori, subkategori });
    const cont = document.getElementById('pilihan-soal-ujian');
    if (!res.ok || res.data.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada soal di kategori/sub-kategori ini.</p>'; return; }
    // Soal yang sudah diarsipkan tidak ikut ditawarkan (harus dikembalikan dulu
    // lewat Bank Soal) — KECUALI soal itu memang sudah tercentang di ujian yang
    // sedang diubah, supaya tidak "hilang" tiba-tiba dari ujian lama.
    const terpilih = idsTerpilih || [];
    const daftar = res.data.filter(s => (s.status || 'aktif') !== 'arsip' || terpilih.includes(s.id));
    if (daftar.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada soal aktif di kategori/sub-kategori ini.</p>'; return; }
    // idsTerpilih kosong/tidak diisi (ujian baru, atau kategori baru saja
    // diganti) -> semua soal yang cocok otomatis tercentang, TIDAK perlu
    // dicentang satu per satu. Ujian yang sedang diubah tetap menghormati
    // centang yang sudah tersimpan sebelumnya.
    const autoCentangSemua = !idsTerpilih;
    cont.innerHTML = daftar.map(s => `
      <label style="display:flex;gap:.5rem;align-items:flex-start;margin-bottom:.5rem;font-weight:400">
        <input type="checkbox" class="chk-soal-ujian" value="${s.id}" ${(autoCentangSemua || terpilih.includes(s.id)) ? 'checked' : ''} style="width:auto;margin-top:.2rem">
        <span>${escapeHtml_(s.pertanyaan).slice(0, 90)} <em style="color:var(--c-muted)">(bobot ${s.bobot})</em></span>
      </label>`).join('');
  },

  pilihSemuaSoalUjian(centang) {
    document.querySelectorAll('.chk-soal-ujian').forEach(c => { c.checked = centang; });
  },

  async simpanUjian() {
    return jalankanDenganTombolSibuk('btn-simpan-ujian', 'Menyimpan...', async () => {
      const soalIds = Array.from(document.querySelectorAll('.chk-soal-ujian:checked')).map(c => c.value);
      if (soalIds.length === 0) { toast('Pilih minimal satu soal.', 'error'); return; }
      const ujian = {
        id: document.getElementById('ujian-id').value || undefined,
        guru_id: state.user.id,
        judul: document.getElementById('ujian-judul').value.trim(),
        kategori: document.getElementById('ujian-kategori').value,
        subkategori: document.getElementById('ujian-subkategori').value.trim(),
        soal_ids: soalIds.join(','),
        durasi_menit: Number(document.getElementById('ujian-durasi').value),
        toleransi_menit: Number(document.getElementById('ujian-toleransi').value),
        nilai_lulus: Number(document.getElementById('ujian-kkm').value),
        max_pelanggaran: Number(document.getElementById('ujian-max-pelanggaran').value),
        mulai: document.getElementById('ujian-mulai').value ? new Date(document.getElementById('ujian-mulai').value).toISOString() : '',
        selesai: document.getElementById('ujian-selesai').value ? new Date(document.getElementById('ujian-selesai').value).toISOString() : '',
        acak_soal: document.getElementById('ujian-acak-soal').checked,
        acak_opsi: document.getElementById('ujian-acak-opsi').checked,
        instruksi_remedial: document.getElementById('ujian-instruksi-remedial').value.trim(),
        status: 'aktif'
      };
      ujian.tampil_detail = document.getElementById('ujian-tampil-detail').checked;
      const hasilPesan = Guru.ambilPesanNilaiUntukSimpan();
      if (hasilPesan.error) { toast(hasilPesan.error, 'error'); return; }
      ujian.pesan_nilai = hasilPesan.json;
      if (!ujian.judul) { toast('Judul ujian tidak boleh kosong.', 'error'); return; }
      const res = await api('simpanUjian', { ujian: JSON.stringify(ujian) });
      if (res.ok) {
        toast('Ujian tersimpan. Token: ' + (res.token || '(tetap)'), 'success');
        UI.tutupModal('modal-ujian'); Guru.muatDaftarUjian();
      } else toast('Gagal menyimpan ujian: ' + res.error, 'error');
    });
  },

  // ---------------- REKAP & LOG ----------------
  async muatPilihanUjianUntukSelect(selectId) {
    const res = await api('getDaftarUjian', { guruId: state.user.id });
    const sel = document.getElementById(selectId);
    if (!res.ok) return;
    sel.innerHTML = '<option value="">Pilih ujian...</option>' + res.data.map(u => `<option value="${u.id}">${escapeHtml_(u.judul)}</option>`).join('');
  },

  async muatRekap() {
    const ujianId = document.getElementById('pilih-ujian-rekap').value;
    const cont = document.getElementById('tabel-rekap');
    if (!ujianId) { cont.innerHTML = 'Pilih ujian terlebih dahulu.'; return; }
    const res = await api('getRekapNilai', { ujianId });
    if (!res.ok) { cont.textContent = 'Gagal memuat.'; return; }
    state.guru._rekapAktif = res.data;
    isiOpsiKelas_('kelas-rekap', kelasUnikDari_(res.data));
    Guru.renderTabelRekap_();
  },

  // Data rekap setelah Filter Kelas + kotak cari.
  rekapTersaring_() {
    return (state.guru._rekapAktif || []).filter(r => cocokFilterSiswa_(r, 'kelas-rekap', 'cari-rekap'));
  },

  renderTabelRekap_() {
    const cont = document.getElementById('tabel-rekap');
    const semua = state.guru._rekapAktif || [];
    if (semua.length === 0) { tampilkanInfoFilter_('kelas-rekap-info', 0, 0); cont.innerHTML = '<p class="subtitle">Belum ada siswa yang <strong>menyelesaikan</strong> ujian ini (siswa yang masih mengerjakan tidak dihitung di sini — lihat tab "Pemantauan Ujian" untuk yang sedang berlangsung).</p>'; return; }
    const data = Guru.rekapTersaring_();
    const angka = data.map(r => Number(r.nilai)).filter(n => !isNaN(n) && n !== null);
    const rata = angka.length ? (angka.reduce((a, b) => a + b, 0) / angka.length) : null;
    tampilkanInfoFilter_('kelas-rekap-info', data.length, semua.length, rata === null ? '' : 'rata-rata nilai ' + (Math.round(rata * 10) / 10));
    if (data.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada siswa yang cocok dengan kelas/pencarian ini.</p>'; return; }
    cont.innerHTML = `<table class="ledger"><thead><tr><th style="width:2rem"><input type="checkbox" id="rekap-pilih-semua" title="Pilih semua yang tampil" onchange="Guru.pilihSemuaRekap(this.checked)"></th><th>Nama</th><th>Kelas</th><th>Nilai</th><th>Status</th><th>Pelanggaran</th><th>Selesai</th><th>Durasi</th><th></th></tr></thead><tbody>` +
      data.map(r => `<tr>
        <td><input type="checkbox" class="rekap-cek" value="${escapeHtml_(r.sesiId || '')}" ${r.sesiId ? '' : 'disabled'}></td>
        <td>${escapeHtml_(r.nama)}</td><td>${escapeHtml_(r.kelas)}</td><td><strong>${r.nilai}</strong></td>
        <td><span class="badge ${String(r.lulus) === 'true' ? 'ok' : 'no'}">${String(r.lulus) === 'true' ? 'Lulus' : 'Remedial'}</span></td>
        <td>${r.pelanggaran || 0} ${r.status === 'diblokir' ? '<span class="badge warn">Diblokir</span>' : ''}</td>
        <td style="font-size:.8rem">${formatTanggal(r.selesai)}</td>
        <td style="font-size:.8rem;white-space:nowrap">${formatDurasi_(hitungDurasiDetik_(r.mulai, r.selesai))}</td>
        <td class="aksi">${r.sesiId ? `<button class="danger small" title="Hapus nilai siswa ini (siswa bisa mengikuti ujian ini lagi)" onclick="Guru.hapusNilaiSatu('${escapeHtml_(r.sesiId)}')">🗑 Hapus</button>` : ''}</td>
      </tr>`).join('') + `</tbody></table>`;
  },

  pilihSemuaRekap(aktif) {
    document.querySelectorAll('#tabel-rekap .rekap-cek:not(:disabled)').forEach(cb => { cb.checked = aktif; });
  },

  // Inti penghapusan nilai: kirim 1 permintaan utk banyak sesi, lalu perbarui
  // tampilan dari data lokal (tanpa unduh ulang).
  async hapusNilaiIds_(idList, pesanKonfirmasi) {
    if (!idList.length) { toast('Pilih dulu nilai siswa yang ingin dihapus (centang kotak di kiri nama).', 'error'); return; }
    if (!confirm(pesanKonfirmasi)) return;
    toast(`Menghapus ${idList.length} nilai...`);
    const res = await api('hapusNilaiSiswa', { sesiIds: JSON.stringify(idList) });
    if (!res.ok) { toast('Gagal menghapus nilai: ' + res.error, 'error'); return; }
    const set = new Set(idList.map(String));
    state.guru._rekapAktif = (state.guru._rekapAktif || []).filter(r => !set.has(String(r.sesiId)));
    Guru.renderTabelRekap_();
    toast(`${idList.length} nilai dihapus. Siswa yang bersangkutan dapat mengikuti ujian ini lagi.`, 'success');
  },

  hapusNilaiSatu(sesiId) {
    const r = (state.guru._rekapAktif || []).find(x => String(x.sesiId) === String(sesiId));
    const nama = r ? r.nama : 'siswa ini';
    return Guru.hapusNilaiIds_([sesiId], `Hapus nilai "${nama}" pada ujian ini? Jawaban & nilainya dihapus PERMANEN dan siswa bisa mengerjakan ujian ini lagi dari awal. Tidak bisa dibatalkan.`);
  },

  hapusNilaiTerpilih() {
    const ids = Array.from(document.querySelectorAll('#tabel-rekap .rekap-cek:checked')).map(cb => cb.value).filter(Boolean);
    return Guru.hapusNilaiIds_(ids, `Hapus ${ids.length} nilai siswa yang dicentang? Jawaban & nilai dihapus PERMANEN dan siswa-siswa tsb bisa mengerjakan ujian ini lagi. Tidak bisa dibatalkan.`);
  },

  hapusSemuaNilaiUjian() {
    const disaring = filterAktif_('kelas-rekap', 'cari-rekap');
    const ids = Guru.rekapTersaring_().map(r => r.sesiId).filter(Boolean);
    if (!ids.length) { toast('Belum ada nilai untuk dihapus.', 'error'); return; }
    const kelasDipilih = document.getElementById('kelas-rekap')?.value || '';
    const ruang = disaring ? `yang sedang tampil${kelasDipilih ? ' (kelas ' + kelasDipilih + ')' : ''}` : 'pada ujian ini';
    return Guru.hapusNilaiIds_(ids, `Hapus ${disaring ? '' : 'SEMUA '}${ids.length} nilai ${ruang}? Jawaban & nilai dihapus PERMANEN dan siswa-siswa tsb bisa mengerjakan ujian ini lagi. Tidak bisa dibatalkan.`);
  },

  // Unduh rekap nilai sebagai file Excel (.xlsx) sungguhan: kolom langsung rapi
  // (tidak menumpuk di satu kolom seperti CSV di Excel berpengaturan regional
  // Indonesia yang memakai titik koma), status tertulis "Lulus"/"Remedial"
  // (bukan TRUE/FALSE), dan ada kolom durasi pengerjaan.
  // Unduh nilai sebagai file Excel (.xlsx). Tiga mode:
  //  - (default)  : sesuai Filter Kelas + kotak cari yang sedang tampil
  //                 (pilih 1 kelas = nilai kelas itu saja).
  //  - 'semua'    : seluruh siswa pada ujian terpilih -> 1 sheet gabungan + 1 sheet per kelas.
  //  - 'semuaUjian': seluruh ujian sekaligus (mengikuti Filter Kelas) -> 1 sheet
  //                 gabungan + 1 sheet per kelas, ada kolom "Ujian".
  async unduhRekapCSV(mode) {
    try { await muatPustaka_('xlsx'); } catch (e) { toast(e.message, 'error'); return; }
    const sel = document.getElementById('pilih-ujian-rekap');
    const judulUjian = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : 'Ujian';
    const kelasFilter = document.getElementById('kelas-rekap')?.value || '';
    const bersih = t => String(t).replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60);
    const urut = (arr, denganUjian) => [...arr].sort((a, b) =>
      (denganUjian ? String(a._ujian || '').localeCompare(String(b._ujian || ''), 'id', { numeric: true }) : 0) ||
      String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true }) ||
      String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    const fmtWaktu = iso => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const buatSheet = (arr, denganUjian) => {
      const headers = ['No'].concat(denganUjian ? ['Ujian'] : [], ['Nama', 'Kelas', 'Nilai', 'Keterangan', 'Pelanggaran', 'Mulai', 'Selesai', 'Durasi Pengerjaan', 'Durasi (menit)']);
      const rows = urut(arr, denganUjian).map((r, i) => {
        const lulus = r.lulus === true || String(r.lulus).toLowerCase() === 'true';
        const lulusSalah = r.lulus === false || String(r.lulus).toLowerCase() === 'false';
        const detik = hitungDurasiDetik_(r.mulai, r.selesai);
        const nilai = r.nilai === '' || r.nilai === null || r.nilai === undefined ? '' : Number(r.nilai);
        return [i + 1].concat(denganUjian ? [r._ujian || ''] : [], [
          r.nama || '', r.kelas || '',
          isNaN(nilai) ? r.nilai : nilai,
          lulus ? 'Lulus' : (lulusSalah ? 'Remedial' : '-'),
          Number(r.pelanggaran) || 0,
          fmtWaktu(r.mulai), fmtWaktu(r.selesai),
          detik === null ? '-' : formatDurasi_(detik),
          detik === null ? '' : Math.round(detik / 6) / 10
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = (denganUjian ? [5, 28] : [5]).concat([30, 10, 8, 12, 12, 18, 18, 20, 14]).map(w => ({ wch: w }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: headers.length - 1 } }) };
      return ws;
    };
    // Satu sheet gabungan + satu sheet per kelas.
    const bukuPerKelas = (arr, denganUjian, namaGabungan) => {
      const wb = XLSX.utils.book_new();
      const terpakai = new Set();
      XLSX.utils.book_append_sheet(wb, buatSheet(arr, denganUjian), namaSheetUnik_(namaGabungan, terpakai));
      const perKelas = {};
      arr.forEach(r => { const k = String(r.kelas || 'Tanpa Kelas'); (perKelas[k] = perKelas[k] || []).push(r); });
      Object.keys(perKelas).sort((a, b) => a.localeCompare(b, 'id', { numeric: true })).forEach(k => {
        XLSX.utils.book_append_sheet(wb, buatSheet(perKelas[k], denganUjian), namaSheetUnik_('Kelas ' + k, terpakai));
      });
      return { wb, jumlahKelas: Object.keys(perKelas).length };
    };

    if (mode === 'semuaUjian') {
      toast('Mengumpulkan nilai dari semua ujian...');
      const daftar = await api('getDaftarUjian', { guruId: state.user.id });
      if (!daftar.ok) { toast('Gagal memuat daftar ujian: ' + daftar.error, 'error'); return; }
      let gabungan = [];
      for (const u of daftar.data) {
        const r = await api('getRekapNilai', { ujianId: u.id });
        if (r.ok) gabungan = gabungan.concat(r.data.map(x => Object.assign({}, x, { _ujian: u.judul })));
      }
      if (kelasFilter) gabungan = gabungan.filter(r => String(r.kelas || '').trim() === kelasFilter);
      if (gabungan.length === 0) { toast('Tidak ada nilai untuk diunduh.', 'error'); return; }
      const { wb, jumlahKelas } = bukuPerKelas(gabungan, true, 'Semua Ujian');
      XLSX.writeFile(wb, 'rekap-nilai-semua-ujian-' + (kelasFilter ? bersih(kelasFilter) : 'semua-kelas') + '.xlsx');
      toast(`Nilai ${gabungan.length} data (${daftar.data.length} ujian, ${jumlahKelas} kelas) berhasil diunduh.`, 'success');
      return;
    }

    const semuaData = state.guru._rekapAktif;
    if (!semuaData || semuaData.length === 0) { toast('Tidak ada data untuk diunduh.', 'error'); return; }

    if (mode === 'semua') {
      const { wb, jumlahKelas } = bukuPerKelas(semuaData, false, 'Semua Kelas');
      XLSX.writeFile(wb, 'rekap-nilai-' + bersih(judulUjian) + '-semua-kelas.xlsx');
      toast(`Rekap ${semuaData.length} siswa (${jumlahKelas} kelas) berhasil diunduh.`, 'success');
      return;
    }

    const data = Guru.rekapTersaring_();
    if (data.length === 0) { toast('Tidak ada data yang cocok dengan filter untuk diunduh.', 'error'); return; }
    const cari = (document.getElementById('cari-rekap')?.value || '').trim();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buatSheet(data, false), namaSheetUnik_(kelasFilter ? 'Kelas ' + kelasFilter : 'Rekap Nilai', new Set()));
    XLSX.writeFile(wb, 'rekap-nilai-' + bersih(judulUjian) + (kelasFilter ? '-' + bersih(kelasFilter) : '') + (cari ? '-hasil-cari' : '') + '.xlsx');
    toast(`Rekap ${data.length} siswa berhasil diunduh.`, 'success');
  },

  // Menghitung ulang nilai SEMUA siswa yang sudah selesai di ujian yang
  // sedang dipilih, memakai jawaban yang SUDAH TERSIMPAN (tidak mengulang
  // ujian, tidak mengubah jawaban) tapi lewat logika penilaian TERBARU --
  // berguna kalau ada perbaikan pada cara penilaian (mis. bug soal dengan
  // opsi teracak yang sempat salah dinilai). Aman dipanggil berkali-kali:
  // hanya sesi yang nilainya benar-benar berubah yang ditulis ulang.
  async hitungUlangNilai() {
    const ujianId = document.getElementById('pilih-ujian-rekap').value;
    if (!ujianId) { toast('Pilih ujian terlebih dahulu.', 'error'); return; }
    if (!confirm('Hitung ulang nilai SEMUA siswa yang sudah selesai di ujian ini? Jawaban siswa tidak akan diubah/dihapus, hanya nilai & status lulusnya yang mungkin diperbarui kalau ada yang sebelumnya salah dihitung.')) return;
    toast('Menghitung ulang nilai...');
    const res = await api('hitungUlangNilaiUjian', { ujianId });
    if (res.ok) {
      toast(`Selesai. ${res.totalDiperiksa} sesi diperiksa, ${res.totalBerubah} nilai diperbarui.`, 'success');
      Guru.muatRekap();
    } else {
      toast('Gagal menghitung ulang: ' + res.error, 'error');
    }
  },

  async muatLogPelanggaran() {
    const ujianId = document.getElementById('pilih-ujian-log').value;
    const cont = document.getElementById('tabel-log');
    if (!ujianId) { cont.innerHTML = 'Pilih ujian terlebih dahulu.'; return; }
    const res = await api('getLogPelanggaran', { ujianId });
    if (!res.ok) { cont.textContent = 'Gagal memuat.'; return; }
    // Butuh data siswa agar log bisa menampilkan nama & kelas (bukan ID mentah).
    if (!(state.guru.daftarSiswa || []).length) {
      const rs = await api('getDaftarSiswa', {});
      if (rs.ok) state.guru.daftarSiswa = rs.data;
    }
    state.guru._logAktif = res.data;
    Guru.renderLogPelanggaran_(true);
  },

  renderLogPelanggaran_(isiKelas) {
    const cont = document.getElementById('tabel-log');
    const peta = {};
    (state.guru.daftarSiswa || []).forEach(s => { peta[s.id] = s; });
    const semua = (state.guru._logAktif || []).map(l => {
      const s = peta[l.siswa_id];
      return Object.assign({}, l, { nama: s ? s.nama : String(l.siswa_id || ''), kelas: s ? (s.kelas || '-') : '-', username: s ? s.username : '' });
    });
    if (isiKelas === true) isiOpsiKelas_('kelas-log', kelasUnikDari_(semua));
    if (semua.length === 0) { tampilkanInfoFilter_('kelas-log-info', 0, 0); cont.innerHTML = '<p class="subtitle">Tidak ada pelanggaran tercatat.</p>'; return; }
    const data = semua.filter(l => cocokFilterSiswa_(l, 'kelas-log', 'cari-log'));
    tampilkanInfoFilter_('kelas-log-info', new Set(data.map(l => l.siswa_id)).size, new Set(semua.map(l => l.siswa_id)).size, data.length + ' catatan');
    if (data.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada pelanggaran yang cocok dengan kelas/pencarian ini.</p>'; return; }
    cont.innerHTML = `<table class="ledger"><thead><tr><th>Siswa</th><th>Kelas</th><th>Jenis Pelanggaran</th><th>Waktu</th></tr></thead><tbody>` +
      data.map(l => `<tr><td>${escapeHtml_(l.nama)}</td><td>${escapeHtml_(l.kelas)}</td><td>${labelPelanggaran(l.jenis)}</td><td>${formatTanggal(l.waktu)}</td></tr>`).join('') +
      `</tbody></table>`;
  },

  // ---------------- ANALISIS SOAL & JAWABAN SISWA ----------------
  async muatAnalisisSoal() {
    const ujianId = document.getElementById('pilih-ujian-analisis').value;
    const contSoal = document.getElementById('tabel-analisis-soal');
    const contJawaban = document.getElementById('tabel-analisis-jawaban');
    if (!ujianId) { contSoal.innerHTML = 'Pilih ujian terlebih dahulu.'; contJawaban.innerHTML = ''; return; }
    const res = await api('getAnalisisSoal', { ujianId });
    if (!res.ok) { contSoal.textContent = 'Gagal memuat: ' + res.error; contJawaban.innerHTML = ''; return; }
    state.guru._analisisSoal = res.soal;
    state.guru._analisisSiswa = res.siswa;
    state.guru._analisisTotalPeserta = res.totalPeserta;
    isiOpsiKelas_('kelas-analisis', kelasUnikDari_(res.siswa));
    Guru.renderAnalisisSoal();
    Guru.renderAnalisisJawaban();
  },

  renderAnalisisSoal() {
    const cont = document.getElementById('tabel-analisis-soal');
    const data = state.guru._analisisSoal || [];
    const totalPeserta = state.guru._analisisTotalPeserta || 0;
    if (totalPeserta === 0) { cont.innerHTML = '<p class="subtitle">Belum ada siswa yang menyelesaikan ujian ini, jadi analisis butir soal belum bisa dihitung.</p>'; return; }
    const badgeKesulitan = { mudah: 'ok', sedang: 'warn', sulit: 'no' };
    const labelKesulitanOtomatis = { mudah: 'Mudah', sedang: 'Sedang', sulit: 'Sulit', '-': '-' };
    cont.innerHTML = `<p class="subtitle">Berdasarkan <strong>${totalPeserta}</strong> siswa yang sudah menyelesaikan ujian ini.
        Label "Tingkat Kesulitan (Otomatis)" dihitung dari persentase siswa yang menjawab benar: &ge;70% = Mudah,
        40-70% = Sedang, &lt;40% = Sulit -- dibandingkan dengan label "Tingkat Kesulitan (Guru)" yang diisi manual
        saat membuat soal di Bank Soal, supaya guru bisa melihat soal mana yang ternyata lebih sulit/mudah dari
        perkiraan awal.</p>
      <table class="ledger"><thead><tr>
        <th>No</th><th>Pertanyaan</th><th>Tipe</th><th>Sulit (Guru)</th><th>Benar</th><th>Sebagian</th><th>Salah</th><th>Kosong</th><th>% Benar</th><th>Sulit (Otomatis)</th>
      </tr></thead><tbody>` +
      data.map(s => `<tr>
        <td>${s.nomor}</td>
        <td style="max-width:260px" title="${escapeHtml_(bersihkanHtml_(s.pertanyaan))}">${escapeHtml_(potongTeks_(bersihkanHtml_(s.pertanyaan), 70))}</td>
        <td>${labelTipe(s.tipe)}</td>
        <td>${labelKesulitan(s.tingkatKesulitanGuru)}</td>
        <td>${s.jumlahBenar}</td>
        <td>${s.jumlahSebagianBenar}</td>
        <td>${s.jumlahSalah}</td>
        <td>${s.jumlahKosong}</td>
        <td><strong>${s.persenBenar}%</strong></td>
        <td><span class="badge ${badgeKesulitan[s.kesulitanOtomatis] || ''}">${labelKesulitanOtomatis[s.kesulitanOtomatis] || s.kesulitanOtomatis}</span></td>
      </tr>`).join('') + `</tbody></table>`;
  },

  async unduhAnalisisSoalCSV() {
    const data = state.guru._analisisSoal;
    if (!data || data.length === 0) { toast('Tidak ada data untuk diunduh.', 'error'); return; }
    const labelOto = { mudah: 'Mudah', sedang: 'Sedang', sulit: 'Sulit', '-': '-' };
    const headers = ['No', 'Pertanyaan', 'Tipe', 'Tingkat Kesulitan (Guru)', 'Jumlah Benar', 'Jumlah Sebagian Benar', 'Jumlah Salah', 'Jumlah Kosong', 'Persen Benar (%)', 'Tingkat Kesulitan (Otomatis)'];
    const rows = data.map(s => {
      const persen = parseFloat(String(s.persenBenar).replace('%', ''));
      return [
        s.nomor, String(bersihkanHtml_(s.pertanyaan)), labelTipe(s.tipe), labelKesulitan(s.tingkatKesulitanGuru),
        Number(s.jumlahBenar) || 0, Number(s.jumlahSebagianBenar) || 0, Number(s.jumlahSalah) || 0, Number(s.jumlahKosong) || 0,
        isNaN(persen) ? '' : persen, labelOto[s.kesulitanOtomatis] || s.kesulitanOtomatis
      ];
    });
    const ok = await unduhXlsxRapi_('analisis-soal-' + namaUjianUntukFile_('pilih-ujian-analisis') + '.xlsx', 'Analisis Soal', headers, rows,
      [5, 60, 16, 22, 12, 20, 12, 13, 15, 26]);
    if (ok) toast(`Analisis ${rows.length} soal berhasil diunduh.`, 'success');
  },

  renderAnalisisJawaban() {
    const cont = document.getElementById('tabel-analisis-jawaban');
    const soalList = state.guru._analisisSoal || [];
    const semuaSiswa = state.guru._analisisSiswa || [];
    if (semuaSiswa.length === 0) { tampilkanInfoFilter_('kelas-analisis-info', 0, 0); cont.innerHTML = '<p class="subtitle">Belum ada siswa yang menyelesaikan ujian ini.</p>'; return; }
    const siswaList = semuaSiswa.filter(sw => cocokFilterSiswa_(sw, 'kelas-analisis', 'cari-analisis'));
    tampilkanInfoFilter_('kelas-analisis-info', siswaList.length, semuaSiswa.length);
    if (siswaList.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada siswa yang cocok dengan kelas/pencarian ini.</p>'; return; }
    const simbol = { benar: '<span class="jwb-cell jwb-benar">✔</span>', sebagian: '<span class="jwb-cell jwb-sebagian">◐</span>', salah: '<span class="jwb-cell jwb-salah">✘</span>', kosong: '<span class="jwb-cell jwb-kosong">–</span>', na: '<span class="jwb-cell jwb-kosong">–</span>' };
    cont.innerHTML = `<p class="subtitle">✔ = benar &nbsp; ◐ = sebagian benar (checkbox/mencocokkan/uraian) &nbsp; ✘ = salah &nbsp; – = tidak dijawab.</p>
      <div class="table-scroll-x"><table class="ledger"><thead><tr>
        <th>Nama</th><th>Kelas</th><th>Nilai</th>` + soalList.map(s => `<th title="${escapeHtml_(bersihkanHtml_(s.pertanyaan))}">No ${s.nomor}</th>`).join('') + `
      </tr></thead><tbody>` +
      siswaList.map(sw => `<tr>
        <td>${escapeHtml_(sw.nama)}</td><td>${escapeHtml_(sw.kelas)}</td><td><strong>${sw.nilai}</strong></td>` +
        soalList.map(s => `<td>${simbol[sw.jawabanDetail[s.soalId]] || simbol.kosong}</td>`).join('') + `
      </tr>`).join('') + `</tbody></table></div>`;
  },

  async unduhAnalisisJawabanCSV() {
    const soalList = state.guru._analisisSoal;
    const siswaList = (state.guru._analisisSiswa || []).filter(sw => cocokFilterSiswa_(sw, 'kelas-analisis', 'cari-analisis'));
    if (siswaList.length === 0) { toast('Tidak ada data untuk diunduh.', 'error'); return; }
    const labelSimbol = { benar: 'Benar', sebagian: 'Sebagian', salah: 'Salah', kosong: 'Kosong', na: 'Kosong' };
    const headers = ['No', 'Nama', 'Kelas', 'Nilai', ...soalList.map(s => 'No ' + s.nomor)];
    const urut = [...siswaList].sort((a, b) =>
      String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true }) ||
      String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    const rows = urut.map((sw, i) => {
      const nilai = Number(sw.nilai);
      return [i + 1, sw.nama || '', sw.kelas || '', isNaN(nilai) ? sw.nilai : nilai,
        ...soalList.map(s => labelSimbol[sw.jawabanDetail[s.soalId]] || 'Kosong')];
    });
    const ok = await unduhXlsxRapi_('analisis-jawaban-' + namaUjianUntukFile_('pilih-ujian-analisis') + '.xlsx', 'Analisis Jawaban', headers, rows,
      [5, 30, 10, 8, ...soalList.map(() => 9)]);
    if (ok) toast(`Analisis jawaban ${rows.length} siswa berhasil diunduh.`, 'success');
  },

  // ---------------- PEMANTAUAN UJIAN (live monitoring) ----------------
  async muatPemantauan() {
    const ujianId = document.getElementById('pilih-ujian-pemantauan').value;
    const cont = document.getElementById('tabel-pemantauan');
    if (!ujianId) { cont.innerHTML = 'Pilih ujian terlebih dahulu.'; return; }
    const res = await api('getPemantauanUjian', { ujianId });
    if (!res.ok) { cont.textContent = 'Gagal memuat: ' + res.error; return; }
    state.guru._pemantauanAktif = res.data;
    state.guru._pemantauanMax = res.maxPelanggaran;
    isiOpsiKelas_('kelas-pemantauan', kelasUnikDari_(res.data));
    Guru.renderTabelPemantauan();
  },

  renderTabelPemantauan() {
    const cont = document.getElementById('tabel-pemantauan');
    const semuaPemantauan = state.guru._pemantauanAktif || [];
    const maxPelanggaran = state.guru._pemantauanMax || 999;
    if (semuaPemantauan.length === 0) { tampilkanInfoFilter_('kelas-pemantauan-info', 0, 0); cont.innerHTML = '<p class="subtitle">Belum ada siswa yang membuka ujian ini.</p>'; return; }
    const data = semuaPemantauan.filter(s => cocokFilterSiswa_(s, 'kelas-pemantauan', 'cari-pemantauan'));
    tampilkanInfoFilter_('kelas-pemantauan-info', data.length, semuaPemantauan.length, data.filter(s => s.status === 'berlangsung').length + ' sedang mengerjakan');
    if (data.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada siswa yang cocok dengan kelas/pencarian ini.</p>'; return; }

    const labelStatus = { berlangsung: 'Sedang Mengerjakan', selesai: 'Selesai', diblokir: 'Diblokir (Pelanggaran)' };
    const kelasBadge = { berlangsung: 'ok', selesai: 'ok', diblokir: 'no' };

    cont.innerHTML = `<table class="ledger"><thead><tr>
        <th>Nama</th><th>Kelas</th><th>Status</th><th>Sisa Waktu</th><th>Soal Terjawab</th><th>Pelanggaran</th><th>Nilai</th><th></th>
      </tr></thead><tbody>` +
      data.map(s => {
        const sisaWaktu = s.status === 'berlangsung' ? formatSisaWaktu(s.sisaDetik) + (s.tambahanDetik ? ` <span class="subtitle" style="font-size:.75rem">(+${Math.round(s.tambahanDetik/60)} mnt)</span>` : '') : '-';
        const warnPelanggaran = s.pelanggaran > 0 && s.pelanggaran >= maxPelanggaran - 1 ? 'no' : (s.pelanggaran > 0 ? 'warn' : 'ok');
        return `<tr>
          <td>${escapeHtml_(s.nama)}</td>
          <td>${escapeHtml_(s.kelas)}</td>
          <td><span class="badge ${kelasBadge[s.status] || ''}">${labelStatus[s.status] || s.status}</span></td>
          <td>${sisaWaktu}</td>
          <td>${s.terjawab} / ${s.totalSoal}</td>
          <td><span class="badge ${warnPelanggaran}">${s.pelanggaran} / ${maxPelanggaran}</span></td>
          <td>${s.status === 'berlangsung' ? '-' : (s.nilai === '' || s.nilai === undefined ? '-' : s.nilai)}</td>
          <td class="aksi">
            <button class="secondary small" title="Tambah waktu untuk siswa ini" onclick="Guru.pemantauanTambahWaktu('${s.sesiId}', '${escapeHtml_(s.nama)}')">⏱ Tambah Waktu</button>
            ${s.pelanggaran > 0 ? `<button class="secondary small" title="Pelanggaran jadi 0, siswa lanjut dari soal terakhir tanpa mengulang dari awal" onclick="Guru.pemantauanHapusPelanggaran('${s.sesiId}', '${escapeHtml_(s.nama)}')">🧹 Hapus Pelanggaran</button>` : ''}
            ${s.status !== 'selesai' ? `<button class="secondary small" title="Selesaikan ujian siswa ini sekarang juga memakai jawaban terakhir yang tersimpan" onclick="Guru.pemantauanForceFinish('${s.sesiId}', '${escapeHtml_(s.nama)}')">✅ Selesaikan Paksa</button>` : ''}
            <button class="danger small" title="Hapus sesi ini sepenuhnya -- siswa akan mengerjakan ulang dari awal (soal, jawaban, & waktu direset)" onclick="Guru.pemantauanReset('${s.sesiId}', '${escapeHtml_(s.nama)}')">↺ Reset</button>
          </td>
        </tr>`;
      }).join('') + `</tbody></table>`;
  },

  async pemantauanTambahWaktu(sesiId, nama) {
    const menitStr = prompt(`Tambah berapa menit untuk "${nama}"? (isi angka negatif untuk mengurangi)`, '10');
    if (menitStr === null) return;
    const menit = Number(menitStr);
    if (!menit || isNaN(menit)) { toast('Masukkan jumlah menit yang valid.', 'error'); return; }
    const res = await api('pemantauanTambahWaktu', { sesiId, menit });
    if (res.ok) { toast(`Waktu untuk "${nama}" berhasil diubah.`, 'success'); Guru.muatPemantauan(); }
    else toast('Gagal: ' + res.error, 'error');
  },

  async pemantauanForceFinish(sesiId, nama) {
    if (!confirm(`Selesaikan ujian "${nama}" sekarang juga memakai jawaban terakhir yang tersimpan? Siswa tidak bisa melanjutkan lagi setelah ini.`)) return;
    const res = await api('pemantauanForceFinish', { sesiId });
    if (res.ok) { toast(`Ujian "${nama}" diselesaikan paksa. Nilai: ${res.nilai}.`, 'success'); Guru.muatPemantauan(); }
    else toast('Gagal: ' + res.error, 'error');
  },

  async pemantauanHapusPelanggaran(sesiId, nama) {
    if (!confirm(`Hapus semua pelanggaran "${nama}" (jadi 0)? Kalau sesinya sedang diblokir, siswa bisa langsung melanjutkan dari soal terakhir tanpa mengulang dari awal.`)) return;
    const res = await api('pemantauanHapusPelanggaran', { sesiId });
    if (res.ok) { toast(`Pelanggaran "${nama}" direset ke 0.`, 'success'); Guru.muatPemantauan(); }
    else toast('Gagal: ' + res.error, 'error');
  },

  async pemantauanReset(sesiId, nama) {
    if (!confirm(`Reset TOTAL sesi ujian "${nama}"? Soal akan diacak ulang, jawaban & waktu dihapus -- siswa mengerjakan dari awal lagi. Tindakan ini tidak bisa dibatalkan.`)) return;
    const res = await api('pemantauanReset', { sesiId });
    if (res.ok) { toast(`Sesi "${nama}" berhasil direset.`, 'success'); Guru.muatPemantauan(); }
    else toast('Gagal: ' + res.error, 'error');
  },

  // ---------------- SISWA ----------------
  async muatDaftarSiswa() {
    const res = await api('getDaftarSiswa', {});
    const cont = document.getElementById('daftar-siswa');
    if (!res.ok) { cont.textContent = 'Gagal memuat.'; return; }
    state.guru.daftarSiswa = res.data;
    Guru.perbaruiDaftarKelas();
    Guru.renderTabelSiswa();
  },

  perbaruiDaftarKelas() {
    const kelasUnik = [...new Set((state.guru.daftarSiswa || []).map(s => s.kelas).filter(Boolean))].sort();
    const datalist = document.getElementById('daftar-kelas-siswa');
    if (datalist) datalist.innerHTML = kelasUnik.map(k => `<option value="${escapeHtml_(k)}">`).join('');
    ['filter-kelas-siswa', 'filter-kelas-login'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const nilaiSaatIni = select.value;
      select.innerHTML = '<option value="">Semua Kelas</option>' + kelasUnik.map(k => `<option value="${escapeHtml_(k)}">${escapeHtml_(k)}</option>`).join('');
      select.value = kelasUnik.includes(nilaiSaatIni) ? nilaiSaatIni : '';
    });
  },

  renderTabelSiswa() {
    const cont = document.getElementById('daftar-siswa');
    const filterKelas = document.getElementById('filter-kelas-siswa')?.value || '';
    const semua = state.guru.daftarSiswa || [];
    const data = semua.filter(s => cocokFilterSiswa_(s, 'filter-kelas-siswa', 'cari-siswa'));
    tampilkanInfoFilter_('cari-siswa-info', data.length, semua.length);
    if (semua.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada data siswa.</p>'; return; }
    if (data.length === 0) { cont.innerHTML = `<p class="subtitle">Tidak ada siswa yang cocok${filterKelas ? ` di kelas "${escapeHtml_(filterKelas)}"` : ''} dengan pencarian ini.</p>`; return; }
    cont.innerHTML = `<table class="ledger"><thead><tr><th>Username</th><th>Password</th><th>Nama</th><th>Kelas</th><th>Status</th><th></th></tr></thead><tbody>` +
      data.map(s => `<tr>
        <td>${escapeHtml_(s.username)}</td><td>${escapeHtml_(s.password)}</td><td>${escapeHtml_(s.nama)}</td><td>${escapeHtml_(s.kelas)}</td>
        <td><span class="badge ${s.online ? 'ok' : 'no'}">${s.online ? 'Ada sesi aktif' : 'Tidak ada sesi'}</span></td>
        <td class="aksi">
          ${s.online ? `<button class="secondary small" onclick="Guru.resetDevice('${s.id}')">Lepas Kunci</button>` : ''}
          <button class="secondary small" onclick="Guru.bukaEditSiswa('${s.id}')">Ubah</button>
          <button class="danger small" onclick="Guru.hapusSiswa('${s.id}')">Hapus</button>
        </td>
      </tr>`).join('') + `</tbody></table>`;
  },

  bukaEditSiswa(id) {
    const siswa = state.guru.daftarSiswa.find(s => s.id === id);
    if (siswa) UI.bukaModalSiswa(siswa);
  },

  // ---------------- AKUN SAYA ----------------
  muatFormAkun() {
    document.getElementById('akun-nama').value = state.user.nama || '';
    document.getElementById('akun-username').value = state.user.username || '';
    document.getElementById('akun-password-lama').value = '';
    document.getElementById('akun-password-baru').value = '';
    document.getElementById('akun-password-baru2').value = '';
  },

  async simpanAkun() {
    const nama = document.getElementById('akun-nama').value.trim();
    const username = document.getElementById('akun-username').value.trim();
    const passwordLama = document.getElementById('akun-password-lama').value;
    const passwordBaru = document.getElementById('akun-password-baru').value;
    const passwordBaru2 = document.getElementById('akun-password-baru2').value;

    if (!nama || !username) { toast('Nama dan username tidak boleh kosong.', 'error'); return; }
    if (!passwordLama) { toast('Masukkan password saat ini untuk konfirmasi.', 'error'); return; }
    if (passwordBaru && passwordBaru !== passwordBaru2) { toast('Konfirmasi password baru tidak cocok.', 'error'); return; }

    const res = await api('updateAkunGuru', {
      guruId: state.user.id, passwordLama, username, password: passwordBaru, nama
    });
    if (res.ok) {
      state.user.nama = res.user.nama;
      state.user.username = res.user.username;
      document.getElementById('guru-nama-label').textContent = res.user.nama;
      toast('Akun berhasil diperbarui.' + (passwordBaru ? ' Silakan gunakan password baru saat login berikutnya.' : ''), 'success');
      Guru.muatFormAkun();
    } else {
      toast('Gagal menyimpan: ' + res.error, 'error');
    }
  },

  async simpanSiswaEdit() {
    const siswa = {
      id: document.getElementById('siswa-edit-id').value,
      username: document.getElementById('siswa-edit-username').value.trim(),
      password: document.getElementById('siswa-edit-password').value.trim(),
      nama: document.getElementById('siswa-edit-nama').value.trim(),
      kelas: document.getElementById('siswa-edit-kelas').value.trim()
    };
    if (!siswa.username || !siswa.password || !siswa.nama) { toast('Username, password, dan nama wajib diisi.', 'error'); return; }
    const res = await api('updateSiswa', { siswa: JSON.stringify(siswa) });
    if (res.ok) { toast('Data siswa diperbarui.', 'success'); UI.tutupModal('modal-siswa'); Guru.muatDaftarSiswa(); }
    else toast('Gagal menyimpan: ' + res.error, 'error');
  },

  async hapusSiswa(id) {
    if (!confirm('Hapus siswa ini? Akun tidak akan bisa login lagi.')) return;
    const res = await api('hapusSiswa', { id });
    if (res.ok) { toast('Siswa dihapus.', 'success'); Guru.muatDaftarSiswa(); }
    else toast('Gagal menghapus: ' + res.error, 'error');
  },

  async resetDevice(siswaId) {
    const res = await api('resetDevice', { siswaId });
    if (res.ok) { toast('Kunci perangkat dilepas.', 'success'); Guru.muatDaftarSiswa(); Guru.renderTabelStatusLogin(); }
  },

  // Lepas perangkat SEMUA siswa di satu kelas sekali klik (kelas diambil dari
  // dropdown Filter Kelas pada tab yang sedang dibuka; kosong = semua kelas).
  async resetDeviceKelas(sumberFilterId) {
    const kelas = document.getElementById(sumberFilterId)?.value || '';
    const semua = state.guru.daftarSiswa || [];
    const target = kelas ? semua.filter(s => s.kelas === kelas) : semua;
    const terkunci = target.filter(s => s.online).length;
    if (target.length === 0) { toast('Tidak ada siswa untuk dilepas.', 'error'); return; }
    if (terkunci === 0) { toast(kelas ? `Tidak ada perangkat yang terkunci di kelas ${kelas}.` : 'Tidak ada perangkat yang terkunci.', 'info'); return; }
    const label = kelas ? `kelas "${kelas}"` : 'SEMUA KELAS';
    if (!confirm(`Lepas perangkat ${terkunci} siswa yang sedang terkunci di ${label}?\n\nSiswa bisa login lagi dari perangkat mana pun.`)) return;
    const res = await api('resetDeviceKelas', { kelas });
    if (res.ok) {
      toast(`Perangkat ${res.count} siswa di ${label} berhasil dilepas.`, 'success');
      Guru.muatDaftarSiswa(); Guru.muatStatusLogin();
    } else toast('Gagal melepas perangkat: ' + res.error, 'error');
  },

  // ---------------- PENGATURAN KUNCI PERANGKAT (tombol Aktif / Tidak Aktif) ----------------
  // Aktif (default): perilaku lama, satu akun siswa terkunci ke satu perangkat.
  // Tidak Aktif: siswa boleh login/lanjut dari perangkat mana pun tanpa ditolak
  // atau diputus sesi (lihat pengecekan lockAktif di 'login'/'ping' & Code.gs).
  async muatPengaturanLockDevice() {
    const res = await api('getPengaturanLock', {});
    Guru.renderPengaturanLockDevice(res.ok ? res.aktif !== false : true);
  },

  renderPengaturanLockDevice(aktif) {
    const btnAktif = document.getElementById('btn-lock-aktif');
    const btnNonaktif = document.getElementById('btn-lock-nonaktif');
    const teks = document.getElementById('lock-device-status-text');
    if (btnAktif) btnAktif.classList.toggle('active', !!aktif);
    if (btnNonaktif) btnNonaktif.classList.toggle('active', !aktif);
    if (teks) teks.innerHTML = aktif
      ? '<span class="badge ok">🔒 Aktif</span> — tiap akun siswa terkunci ke satu perangkat saat login/ujian.'
      : '<span class="badge no">🔓 Tidak Aktif</span> — siswa boleh login dari perangkat mana pun, tidak ada yang terkunci.';
  },

  async setPengaturanLockDevice(aktif) {
    Guru.renderPengaturanLockDevice(aktif); // tampilkan langsung, tak perlu tunggu server
    const res = await api('simpanPengaturanLock', { aktif });
    if (res.ok) {
      toast(aktif ? 'Kunci perangkat diaktifkan.' : 'Kunci perangkat dinonaktifkan.', 'success');
    } else {
      toast('Gagal menyimpan pengaturan: ' + res.error, 'error');
      Guru.muatPengaturanLockDevice(); // gagal -> tarik ulang status asli dari server
    }
  },

  // ---------------- STATUS LOGIN (device lock per akun siswa) ----------------
  // Satu akun siswa hanya boleh login di SATU perangkat pada satu waktu (lihat
  // 'login'/'ping' di Code.gs & LocalBackend: device_id dicatat saat login, dan
  // login dari perangkat lain ditolak selama masih ada heartbeat < 15 menit
  // terakhir). Tab ini menampilkan status itu secara eksplisit per akun (device
  // ID yang sedang memegang kunci + kapan terakhir aktif), supaya guru tidak
  // perlu menebak dari tab Data Siswa -- dan bisa "Buka Kunci Akun" di sini kalau
  // siswa perlu pindah HP/komputer.
  async muatStatusLogin() {
    const res = await api('getDaftarSiswa', {});
    const cont = document.getElementById('tabel-status-login');
    if (!res.ok) { cont.textContent = 'Gagal memuat.'; return; }
    state.guru.daftarSiswa = res.data;
    Guru.perbaruiDaftarKelas();
    Guru.renderTabelStatusLogin();
  },

  renderTabelStatusLogin() {
    const cont = document.getElementById('tabel-status-login');
    if (!cont) return;
    const filterKelas = document.getElementById('filter-kelas-login')?.value || '';
    const semua = state.guru.daftarSiswa || [];
    const data = semua.filter(s => cocokFilterSiswa_(s, 'filter-kelas-login', 'cari-login'));
    tampilkanInfoFilter_('cari-login-info', data.length, semua.length);
    if (semua.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada data siswa.</p>'; return; }
    if (data.length === 0) { cont.innerHTML = `<p class="subtitle">Tidak ada siswa yang cocok${filterKelas ? ` di kelas "${escapeHtml_(filterKelas)}"` : ''} dengan pencarian ini.</p>`; return; }
    cont.innerHTML = `<table class="ledger"><thead><tr><th>Nama</th><th>Kelas</th><th>Username</th><th>Status</th><th>Device ID Terkunci</th><th>Terakhir Aktif</th><th></th></tr></thead><tbody>` +
      data.map(s => `<tr>
        <td>${escapeHtml_(s.nama)}</td><td>${escapeHtml_(s.kelas)}</td><td>${escapeHtml_(s.username)}</td>
        <td><span class="badge ${s.online ? 'ok' : 'no'}">${s.online ? '🔒 Terkunci' : '🔓 Bebas'}</span></td>
        <td style="font-family:monospace;font-size:.8rem">${s.deviceId ? escapeHtml_(s.deviceId) : '-'}</td>
        <td style="font-size:.85rem">${s.lastPing ? formatSudahBerapaLama(s.lastPing) : '-'}</td>
        <td class="aksi">${s.online ? `<button class="secondary small" onclick="Guru.resetDevice('${s.id}')">🔓 Buka Kunci Akun</button>` : ''}</td>
      </tr>`).join('') + `</tbody></table>
      <p class="subtitle" style="margin-top:.8rem">
        Satu akun siswa hanya bisa dipakai di satu perangkat (HP/komputer) dalam satu waktu, ditandai lewat
        <strong>Device ID</strong> di atas. Kalau siswa perlu pindah ke perangkat lain (HP rusak, ganti komputer,
        dsb.) sementara statusnya masih "🔒 Terkunci", klik <strong>"Buka Kunci Akun"</strong> di baris siswa
        tersebut agar ia bisa login dari perangkat yang baru.
      </p>`;
  },

  async tambahSiswaManual() {
    return jalankanDenganTombolSibuk('btn-tambah-siswa-manual', 'Menyimpan...', async () => {
      const nama = document.getElementById('siswa-manual-nama').value.trim();
      if (!nama) { toast('Nama wajib diisi.', 'error'); return; }
      const usernameManual = document.getElementById('siswa-manual-username').value.trim();
      const username = usernameManual || buatUsernameDariNama(nama, (state.guru.daftarSiswa || []).map(s => s.username));
      const password = document.getElementById('siswa-manual-password').value.trim() || buatPasswordAcak();
      const kelas = document.getElementById('siswa-manual-kelas').value.trim();
      const res = await api('importSiswa', { siswaList: JSON.stringify([{ username, password, nama, kelas }]) });
      if (res.ok) {
        toast('Siswa "' + nama + '" berhasil ditambahkan (username: ' + username + ', password: ' + password + ').', 'success');
        ['siswa-manual-username', 'siswa-manual-password', 'siswa-manual-nama'].forEach(id => document.getElementById(id).value = '');
        Guru.muatDaftarSiswa();
      } else toast('Gagal menambahkan siswa: ' + res.error, 'error');
    });
  },

  generateUsernameManual() {
    const nama = document.getElementById('siswa-manual-nama').value.trim();
    if (!nama) { toast('Isi Nama Lengkap dulu supaya username bisa dibuatkan otomatis.', 'error'); return; }
    document.getElementById('siswa-manual-username').value = buatUsernameDariNama(nama, (state.guru.daftarSiswa || []).map(s => s.username));
  },

  generateUsernameEdit() {
    const nama = document.getElementById('siswa-edit-nama').value.trim();
    if (!nama) { toast('Isi Nama Lengkap dulu supaya username bisa dibuatkan otomatis.', 'error'); return; }
    const idSaatIni = document.getElementById('siswa-edit-id').value;
    const terpakai = (state.guru.daftarSiswa || []).filter(s => s.id !== idSaatIni).map(s => s.username);
    document.getElementById('siswa-edit-username').value = buatUsernameDariNama(nama, terpakai);
  },

  generatePasswordManual() {
    document.getElementById('siswa-manual-password').value = buatPasswordAcak();
  },

  generatePasswordEdit() {
    document.getElementById('siswa-edit-password').value = buatPasswordAcak();
  },

  // Unduh username & password siswa (.xlsx), SATU SHEET PER KELAS (siap dicetak/dibagikan
  // ke wali kelas). Memakai Filter Kelas yang sedang dipilih: pilih satu kelas -> hanya
  // kelas itu; "Semua Kelas" -> semua kelas, masing-masing di sheet sendiri.
  async unduhAkunSiswa() {
    const semua = state.guru.daftarSiswa || [];
    if (semua.length === 0) { toast('Belum ada data siswa untuk diunduh.', 'error'); return; }
    try { await muatPustaka_('xlsx'); } catch (e) { toast(e.message, 'error'); return; }
    const filterKelas = document.getElementById('filter-kelas-siswa')?.value || '';
    const data = filterKelas ? semua.filter(s => s.kelas === filterKelas) : semua;
    if (data.length === 0) { toast('Tidak ada siswa di kelas ini.', 'error'); return; }
    const perKelas = {};
    data.forEach(s => { const k = String(s.kelas || 'Tanpa Kelas'); (perKelas[k] = perKelas[k] || []).push(s); });
    const wb = XLSX.utils.book_new();
    const namaTerpakai = new Set();
    Object.keys(perKelas).sort((a, b) => a.localeCompare(b, 'id', { numeric: true })).forEach(kelas => {
      const baris = perKelas[kelas].slice().sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
      const aoa = [['No', 'Nama', 'Kelas', 'Username', 'Password']]
        .concat(baris.map((s, i) => [i + 1, String(s.nama || ''), String(s.kelas || ''), String(s.username || ''), String(s.password || '')]));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 10 }, { wch: 20 }, { wch: 18 }];
      // Nama sheet: maks 31 karakter, tanpa []:*?/\ dan harus unik.
      let nama = kelas.replace(/[\[\]:*?\/\\]/g, '-').trim().slice(0, 31) || 'Kelas';
      let n = 2, calon = nama;
      while (namaTerpakai.has(calon.toLowerCase())) { calon = nama.slice(0, 28) + '-' + (n++); }
      namaTerpakai.add(calon.toLowerCase());
      XLSX.utils.book_append_sheet(wb, ws, calon);
    });
    const labelKelas = filterKelas ? filterKelas.replace(/[^\w\-]+/g, '_') : 'semua-kelas';
    XLSX.writeFile(wb, `akun-siswa-${labelKelas}.xlsx`);
    toast(`Akun ${data.length} siswa (${Object.keys(perKelas).length} kelas) berhasil diunduh.`, 'success');
  },

  unduhTemplateSiswa() {
    unduhXlsx('template-data-siswa.xlsx', ['nama', 'kelas', 'username', 'password'], [
      ['Ahmad Fauzi', '9A', 'ahmad01', 'rahasia123'],
      ['Siti Amara', '9A', 'siti01', ''],
      ['Budi Santoso', '9A', '', '']
    ]);
  },

  // Kolom username & password boleh kosong per baris — keduanya dibuatkan otomatis
  // (username dari nama, dihindarkan tabrakan dgn yang sudah dipakai di dalam file
  // ini maupun yang sudah ada di server; password acak seperti sebelumnya).
  importSiswaDariFile(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const kelasOverride = document.getElementById('siswa-import-kelas').value.trim();
    const reader = new FileReader();
    reader.onload = async (e) => {
      try { await muatPustaka_('xlsx'); } catch (err) { toast(err.message, 'error'); ev.target.value = ''; return; }
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1);
      let jumlahPasswordDibuat = 0, jumlahUsernameDibuat = 0;
      const terpakai = (state.guru.daftarSiswa || []).map(s => s.username);
      const siswaList = rows.filter(r => r.length && r[0]).map(r => {
        const password = String(r[3] || '').trim() || (() => { jumlahPasswordDibuat++; return buatPasswordAcak(); })();
        const nama = String(r[0] || '').trim();
        let username = String(r[2] || '').trim();
        if (!username) {
          username = buatUsernameDariNama(nama, terpakai);
          terpakai.push(username); // supaya baris berikutnya di file yang sama tidak tabrakan
          jumlahUsernameDibuat++;
        }
        return {
          nama,
          kelas: kelasOverride || String(r[1] || '').trim(),
          username,
          password
        };
      });
      if (siswaList.length === 0) { toast('Tidak ada baris valid.', 'error'); return; }
      const res = await api('importSiswa', { siswaList: JSON.stringify(siswaList) });
      if (res.ok) {
        let pesan = res.count + ' siswa berhasil diimpor' + (kelasOverride ? ' ke kelas ' + kelasOverride : '') + '.';
        if (jumlahUsernameDibuat > 0) pesan += ' ' + jumlahUsernameDibuat + ' username dibuatkan otomatis dari nama.';
        if (jumlahPasswordDibuat > 0) pesan += ' ' + jumlahPasswordDibuat + ' password dibuatkan otomatis (lihat tabel di bawah).';
        toast(pesan, 'success');
        document.getElementById('siswa-import-kelas').value = '';
        Guru.muatDaftarSiswa();
      } else toast('Gagal impor: ' + res.error, 'error');
      ev.target.value = '';
    };
    reader.readAsBinaryString(file);
  },

  async hapusKelas() {
    const select = document.getElementById('filter-kelas-siswa');
    const kelas = select.value;
    if (!kelas) { toast('Pilih dulu kelas yang mau dihapus lewat dropdown Filter Kelas.', 'error'); return; }
    const jumlah = (state.guru.daftarSiswa || []).filter(s => s.kelas === kelas).length;
    if (!confirm(`Hapus SEMUA ${jumlah} siswa di kelas "${kelas}"? Akun-akun ini tidak akan bisa login lagi. Tindakan ini tidak bisa dibatalkan.`)) return;
    const res = await api('hapusKelas', { kelas });
    if (res.ok) { toast(`Kelas "${kelas}" dihapus (${res.count} siswa).`, 'success'); Guru.muatDaftarSiswa(); }
    else toast('Gagal menghapus kelas: ' + res.error, 'error');
  },

  // ---------------- BANK SOAL: TEMPLATE ----------------
  // Kolom sama persis dgn template Word (lihat Guru.unduhTemplateSoalDocx &
  // barisTabelJadiSoal_) supaya guru cukup belajar 1 format saja utk kedua jenis
  // file. Baris pertama sheet = header (dibaca berdasarkan nama, bebas urutan).
  unduhTemplateSoal() {
    unduhXlsx('Template_Import_Soal_CBT.xlsx',
      ['Kategori', 'Topik', 'Tipe', 'Pertanyaan', 'Gambar', 'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 'Opsi E', 'Kunci', 'Bobot', 'Kesulitan'],
      [
        ['', 'Sejarah Indonesia', 'PG', 'Siapakah Presiden Indonesia pada tahun 1999?', '', 'Soekarno', 'Soeharto', 'B. J. Habibi', 'Abdurrahman Wahid', '', 'C', '10', 'Sedang'],
        ['', 'Biologi', 'PGK', 'Manakah yang termasuk hewan mamalia? (kunci boleh lebih dari 1, pisah koma)', '', 'Paus', 'Ular', 'Kelelawar', 'Buaya', '', 'A,C', '10', 'Sedang'],
        ['', 'Geografi', 'BS', 'Indonesia terletak di antara dua benua, yaitu Asia dan Australia.', '', 'Benar', 'Salah', '', '', '', 'Benar', '5', 'Mudah'],
        ['', 'Biologi', 'Essay', 'Jelaskan proses terjadinya fotosintesis pada tumbuhan.', '', '', '', '', '', '', 'fotosintesis, klorofil, karbon dioksida', '15', 'Sedang'],
        ['', 'Geografi', 'Jodohkan', 'Jodohkan negara dengan ibu kotanya.', '', 'Indonesia = Jakarta', 'Jepang = Tokyo', 'Prancis = Paris', '', '', '', '10', 'Sedang'],
        ['', '', '', '(tambahkan baris baru di bawah sini, ikuti pola di atas)', '', '', '', '', '', '', '', '', '']
      ]);
  },

  // ---------------- TEMA & TAMPILAN ----------------
  _ui: null, _mode: 'light', _gid: null, _tmGaleriTimer: null,

  _val(id) { return document.getElementById(id).value; },

  bacaFormTema() {
    return {
      primary: Guru._val('tema-primary'), secondary: Guru._val('tema-secondary'), accent: Guru._val('tema-accent'),
      bg: Guru._val('tema-bg'), text: Guru._val('tema-text'),
      mode: Guru._mode, rot: Guru._val('tema-rot'), ui: Guru._ui
    };
  },

  isiFormTema(p) {
    const t = Tampilan.normalisasiTema(p);
    ['primary', 'secondary', 'accent', 'bg', 'text'].forEach(k => { document.getElementById('tema-' + k).value = t[k]; });
    document.getElementById('tema-rot').value = t.rot;
    Guru._mode = t.mode; Guru._ui = Object.assign({}, t.ui);
    Guru._sinkronStudio();
  },

  // Terapkan langsung ke seluruh aplikasi (pratinjau hidup), belum disimpan.
  pratinjauTema(segarkanGaleri) {
    Tampilan.terapkan(Guru.bacaFormTema(), { tanpaRotasi: true });
    if (segarkanGaleri !== false) Guru.renderGaleriGaya(true);
  },

  renderPaletPreset() {
    const cont = document.getElementById('palet-preset-list');
    if (!cont) return;
    cont.innerHTML = PALET_PRESET.map((p, i) => `
      <button type="button" class="palet-chip" onclick="Guru.pakaiPalet(${i})" title="${p.nama}">
        <span class="dot" style="background:${p.primary}"></span>
        <span class="dot" style="background:${p.secondary}"></span>
        <span class="dot" style="background:${p.accent}"></span>
        <span class="lbl">${p.nama}</span>
      </button>`).join('');
    const h = document.getElementById('tema-harmoni');
    if (h && !h.options.length) h.innerHTML = Object.keys(HARMONI).map(k => `<option value="${k}">${HARMONI[k].nama}</option>`).join('');
  },

  // Ubah SATU warna utama -> seluruh warna aplikasi ikut berubah.
  ubahWarnaUtama() {
    const prim = Guru._val('tema-primary');
    if (document.getElementById('tema-selaras').checked) {
      const p = turunkanPalet(prim, Guru._val('tema-harmoni'));
      ['secondary', 'accent', 'bg', 'text'].forEach(k => { document.getElementById('tema-' + k).value = p[k]; });
    }
    Guru.pratinjauTema();
  },

  pakaiPalet(i) {
    const p = PALET_PRESET[i];
    ['primary', 'secondary', 'accent', 'bg', 'text'].forEach(k => { document.getElementById('tema-' + k).value = p[k]; });
    Guru.pratinjauTema();
  },

  acakPalet() {
    const p = buatPaletAcak();
    ['primary', 'secondary', 'accent', 'bg', 'text'].forEach(k => { document.getElementById('tema-' + k).value = p[k]; });
    Guru.pratinjauTema();
    toast('Palet acak diterapkan. Klik "Simpan Tema" untuk menyimpannya.', 'success');
  },

  setMode(m) { Guru._mode = m; Guru._sinkronStudio(); Guru.pratinjauTema(); },

  pakaiGaya(id) {
    const g = GAYA_BY_ID[id]; if (!g) return;
    Guru._ui = Object.assign({}, DEF_UI, g.u);
    if (g.mode) Guru._mode = g.mode; else if (Guru._mode === 'dark') Guru._mode = 'light';
    if (g.pal) ['primary', 'secondary', 'accent', 'bg', 'text'].forEach(k => { const el = document.getElementById('tema-' + k); if (el) el.value = g.pal[k]; });
    Guru._sinkronStudio(); Guru.pratinjauTema();
  },

  filterGaya(f) {
    Guru._fGaya = f;
    document.querySelectorAll('#gaya-filter button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    Guru.renderGaleriGaya();
  },

  acakGaya() {
    const g = buatGayaAcak();
    Guru._ui = Object.assign({}, DEF_UI, g.u); Guru._mode = g.mode;
    Guru._sinkronStudio(); Guru.pratinjauTema();
    toast('Gaya acak baru diterapkan — coba lagi sampai cocok!', 'success');
  },

  acakTotal() {
    const p = buatPaletAcak();
    ['primary', 'secondary', 'accent', 'bg', 'text'].forEach(k => { document.getElementById('tema-' + k).value = p[k]; });
    Guru.acakGaya();
  },

  // Slider / pilihan Studio Gaya
  studio(key, val) {
    if (['r', 'elev', 'bw', 'glass', 'grad', 'dens'].includes(key)) val = Number(val);
    else if (['pill', 'ink', 'float', 'caps', 'neon'].includes(key)) val = val ? 1 : 0;
    Guru._ui[key] = val;
    if (key === 'depth' && val === 'neu') { Guru._ui.bw = 0; Guru._ui.glass = 0; }
    if (key === 'depth' && val === 'hard') { Guru._ui.bw = Math.max(Guru._ui.bw, 2); Guru._ui.ink = 1; }
    if (key === 'glass' && val > 20 && (Guru._ui.pat === 'none' || Guru._ui.pat === 'lines')) Guru._ui.pat = 'aurora';
    Guru._ui = normalisasiUI(Guru._ui);
    Guru._sinkronStudio(); Guru.pratinjauTema();
  },

  _sinkronStudio() {
    const u = Guru._ui; if (!u) return;
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
    ['r', 'elev', 'bw', 'glass', 'grad', 'dens'].forEach(k => {
      set('st-' + k, u[k]);
      const o = document.getElementById('st-' + k + '-v'); if (o) o.textContent = u[k] + (k === 'dens' ? '%' : (k === 'r' || k === 'bw') ? 'px' : '');
    });
    ['depth', 'pat', 'side', 'font'].forEach(k => set('st-' + k, u[k]));
    ['pill', 'ink', 'float', 'caps', 'neon'].forEach(k => set('st-' + k, u[k]));
    document.querySelectorAll('#tema-mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === Guru._mode));
    const kd = document.getElementById('tema-kode'); if (kd) kd.value = '';
  },

  renderStudio() {
    const sel = (id, opsi) => { const el = document.getElementById(id); if (el && !el.options.length) el.innerHTML = Object.keys(opsi).map(k => `<option value="${k}">${typeof opsi[k] === 'string' ? opsi[k] : opsi[k].nama}</option>`).join(''); };
    sel('st-depth', OPSI_DEPTH); sel('st-pat', OPSI_POLA); sel('st-side', OPSI_SIDE); sel('st-font', GAYA_FONT);
  },

  renderGaleriGaya(tunda) {
    const cont = document.getElementById('gaya-galeri'); if (!cont) return;
    clearTimeout(Guru._tmGaleriTimer);
    const kerja = () => {
      const tema = Guru.bacaFormTema(), u = normalisasiUI(Guru._ui);
      const cocok = (g) => { const b = normalisasiUI(g.u); return Object.keys(DEF_UI).every(k => b[k] === u[k]); };
      const fl = Guru._fGaya || 'semua';
      cont.innerHTML = GAYA_PRESET.filter(g => fl === 'semua' || (fl === 'gelap' && g.mode === 'dark') || (fl === 'terang' && g.mode !== 'dark') || (fl === 'paket' && g.pal)).map(g => {
        const mode = g.mode ? g.mode : (Guru._mode === 'dark' ? 'light' : Guru._mode);
        return `<div role="button" tabindex="0" class="gaya-kartu ${cocok(g) ? 'on' : ''}" onclick="Guru.pakaiGaya('${g.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Guru.pakaiGaya('${g.id}')}" title="${g.info}">
          <div class="gt" data-g="${g.id}"><div class="gt-side"><i class="a"></i><i></i><i></i></div>
            <div class="gt-main"><div class="gt-card"><b></b><u></u><u></u><div class="gt-btns"><span class="gt-btn"></span><span class="gt-btn s"></span><span class="gt-btn c"></span></div></div></div></div>
          <span class="gn">${g.nama}</span><span class="gd">${g.info}</span></div>`;
      }).join('');
      cont.querySelectorAll('.gt').forEach(el => {
        const g = GAYA_BY_ID[el.dataset.g];
        const t2 = Object.assign({}, tema, g.pal || {}, { mode: g.mode ? g.mode : (Guru._mode === 'dark' ? 'light' : Guru._mode) });
        Tampilan.pasangVarPada(el, t2, Object.assign({}, DEF_UI, g.u));
        muatFont(g.u.font);
      });
    };
    if (tunda) Guru._tmGaleriTimer = setTimeout(kerja, 180); else kerja();
  },

  async muatFormTema() {
    Guru.renderPaletPreset(); Guru.renderStudio();
    const res = await api('getTema', { guruId: state.user.id });
    if (!res.ok) return;
    state.guru.tema = res.tema;
    Guru.isiFormTema(res.tema);
    Guru.renderGaleriGaya();
  },

  batalTema() {
    const t = Tampilan.tersimpan;
    if (!t) return;
    Guru.isiFormTema(t); Guru.pratinjauTema();
    toast('Perubahan dibatalkan, kembali ke tema tersimpan.');
  },

  async simpanTema() {
    const tema = Tampilan.normalisasiTema(Guru.bacaFormTema());
    const res = await api('simpanTema', { guruId: state.user.id, tema: JSON.stringify(tema) });
    if (res.ok) { terapkanTema(tema); toast(tema.rot === 'tetap' ? 'Tema tersimpan & diterapkan.' : 'Tema tersimpan. Gaya akan berganti otomatis tiap hari.', 'success'); }
  },

  salinKodeGaya() {
    const k = Tampilan.kode(Guru.bacaFormTema());
    const el = document.getElementById('tema-kode'); el.value = k; el.select();
    try { navigator.clipboard.writeText(k); toast('Kode gaya disalin. Tempel di perangkat/sekolah lain untuk memakai tampilan yang sama.', 'success'); }
    catch (e) { toast('Kode ditampilkan — salin manual dari kotak.'); }
  },

  terapkanKodeGaya() {
    const v = document.getElementById('tema-kode').value.trim();
    if (!v) { toast('Tempel kode gaya dulu.', 'error'); return; }
    try { const t = Tampilan.dariKode(v); Guru.isiFormTema(t); Guru.pratinjauTema(); toast('Kode gaya diterapkan. Klik "Simpan Tema" untuk menyimpan.', 'success'); }
    catch (e) { toast('Kode gaya tidak valid.', 'error'); }
  },

  // ---------------- IDENTITAS APLIKASI (Logo & Nama CBT) ----------------
  async muatFormBranding() {
    const res = await api('getBranding', {});
    if (!res.ok) return;
    document.getElementById('branding-nama').value = res.branding.namaAplikasi || '';
    const url = res.branding.logoUrl || '';
    document.getElementById('branding-logo-url').value = url;
    const prev = document.getElementById('branding-logo-preview');
    const btnHapus = document.getElementById('branding-logo-hapus-btn');
    if (url) { pasangSrcGambarAman_(prev, url); prev.classList.remove('hidden'); btnHapus.classList.remove('hidden'); }
    else { prev.classList.add('hidden'); btnHapus.classList.add('hidden'); }
  },

  async uploadLogoAplikasi(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      toast('Mengunggah logo...');
      const res = await api('uploadGambar', { base64, filename: file.name, mimeType: file.type, folder: 'CBT_Logo_Aplikasi' });
      if (res.ok) {
        document.getElementById('branding-logo-url').value = res.url;
        const prev = document.getElementById('branding-logo-preview');
        pasangSrcGambarAman_(prev, res.url); prev.classList.remove('hidden');
        document.getElementById('branding-logo-hapus-btn').classList.remove('hidden');
        toast('Logo berhasil diunggah. Klik "Simpan Identitas Aplikasi" untuk menerapkannya.', 'success');
      } else {
        toast('Gagal mengunggah logo: ' + res.error, 'error');
      }
    };
    reader.readAsDataURL(file);
  },

  hapusLogoAplikasi() {
    document.getElementById('branding-logo-url').value = '';
    document.getElementById('branding-logo-file').value = '';
    document.getElementById('branding-logo-preview').classList.add('hidden');
    document.getElementById('branding-logo-hapus-btn').classList.add('hidden');
  },

  async simpanBranding() {
    const branding = {
      namaAplikasi: document.getElementById('branding-nama').value.trim(),
      logoUrl: document.getElementById('branding-logo-url').value
    };
    const res = await api('simpanBranding', branding);
    if (res.ok) { terapkanBranding(branding); toast('Identitas aplikasi tersimpan & diterapkan ke semua perangkat.', 'success'); }
    else toast('Gagal menyimpan identitas aplikasi: ' + res.error, 'error');
  },

  // ---------------- SINKRON CADANGAN (tombol di sidebar, tampil di semua halaman) ----------------
  // Backup manual kalau Pemantauan Ujian/Rekap Nilai/Analisis Soal terasa belum
  // menunjukkan siswa yang sudah jelas-jelas sedang mengerjakan/menyelesaikan
  // ujian -- memaksa server menuliskan SEKARANG JUGA data yang masih tertahan
  // di cache (jawaban/status sesi) ke Google Sheets, tanpa menunggu jeda
  // otomatis (maks. ~1 menit).
  async paksaSinkronSekarang() {
    if (!modeServerAktif()) { toast('Mode Server belum aktif — tidak ada Google Sheets untuk disinkron.', 'error'); return; }
    toast('Mengirim data ujian yang sedang berlangsung ke Google Sheets...');
    const res = await api('paksaFlushSesiSekarang', {});
    if (!res.ok) { toast('Gagal sinkron: ' + (res.error || 'tidak diketahui'), 'error'); return; }
    toast('Berhasil dikirim ke Google Sheets.', 'success');
    Guru.tarikHalamanAktifSekarang();
  },

  // Menarik ulang data HALAMAN YANG SEDANG DIBUKA (apa pun tabnya) dari Google
  // Sheets sekarang juga, tanpa menunggu polling otomatis ~8 detik.
  tarikHalamanAktifSekarang() {
    if (!modeServerAktif()) { toast('Mode Server belum aktif — tidak ada Google Sheets untuk ditarik.', 'error'); return; }
    const activeSection = document.querySelector('#guru-portal .main > section:not(.hidden)');
    const tabId = activeSection ? activeSection.id : null;
    const aksi = {
      'tab-dashboard': () => Guru.muatDashboard(),
      'tab-bank-soal': () => Guru.muatBankSoal(),
      'tab-ujian': () => Guru.muatDaftarUjian(),
      'tab-siswa': () => Guru.muatDaftarSiswa(),
      'tab-login': () => Guru.muatStatusLogin(),
      'tab-rekap': () => { const v = document.getElementById('pilih-ujian-rekap').value; v ? Guru.muatRekap() : Guru.muatPilihanUjianUntukSelect('pilih-ujian-rekap'); },
      'tab-analisis': () => { const v = document.getElementById('pilih-ujian-analisis').value; v ? Guru.muatAnalisisSoal() : Guru.muatPilihanUjianUntukSelect('pilih-ujian-analisis'); },
      'tab-pelanggaran': () => { const v = document.getElementById('pilih-ujian-log').value; v ? Guru.muatLogPelanggaran() : Guru.muatPilihanUjianUntukSelect('pilih-ujian-log'); },
      'tab-pemantauan': () => { const v = document.getElementById('pilih-ujian-pemantauan').value; v ? Guru.muatPemantauan() : Guru.muatPilihanUjianUntukSelect('pilih-ujian-pemantauan'); },
      'tab-pengaturan': () => tampilkanBadgeMode()
    };
    const fn = tabId && aksi[tabId];
    if (fn) fn();
    toast('Data halaman ini ditarik ulang dari Google Sheets.', 'success');
  },

  // ---------------- SINKRONISASI PAKSA (lapisan kedua, lihat tab Pengaturan) ----------------

  // Menarik ulang Bank Soal, Ujian, dan Data Siswa dari Google Sheets saat ini juga
  // (tanpa menunggu polling ~8 detik), sekaligus menyimpannya sebagai cadangan ke
  // penyimpanan lokal (localStorage) perangkat ini.
  async tarikDataDariSheetPaksa() {
    if (!modeServerAktif()) { toast('Mode Server belum aktif — tidak ada Google Sheets untuk ditarik. Aktifkan dulu lewat "Atur Koneksi Google Sheets".', 'error'); return; }
    toast('Menarik data dari Google Sheets...');
    const [resSoal, resSiswa, resUjian] = await Promise.all([
      api('getBankSoal', { guruId: state.user.id }),
      api('getDaftarSiswa', {}),
      api('getDaftarUjian', { guruId: state.user.id })
    ]);
    if (!resSoal.ok || !resSiswa.ok || !resUjian.ok) {
      toast('Gagal menarik sebagian data: ' + (resSoal.error || resSiswa.error || resUjian.error || 'tidak diketahui'), 'error');
      return;
    }
    const db = bacaDbLokalMentah();
    db.bankSoal = resSoal.data;
    db.siswa = resSiswa.data;
    db.ujian = resUjian.data;
    if (tulisDbLokalMentah(db)) {
      toast(`Berhasil menarik ${resSoal.data.length} soal, ${resSiswa.data.length} siswa, ${resUjian.data.length} ujian dari Google Sheets (tersimpan juga sebagai cadangan lokal).`, 'success');
    }
    Guru.muatBankSoal(); Guru.muatDaftarSiswa(); Guru.muatDaftarUjian();
  },

  // Mengirim seluruh data di penyimpanan lokal (Mode Lokal) perangkat ini ke Google
  // Sheets yang sedang terhubung — dipakai sekali saat pindah dari Mode Lokal ke Mode
  // Server. Soal diimpor lebih dulu supaya ID baru dari server bisa dipetakan ke
  // soal_ids tiap ujian sebelum ujian ikut dikirim (kalau tidak, ujian akan menunjuk
  // ke soal yang salah/tidak ada).
  async kirimDataLokalKeSheetPaksa() {
    if (!modeServerAktif()) { toast('Aktifkan dulu Mode Server (isi URL Google Sheets) sebelum mengirim data lokal.', 'error'); return; }
    const db = bacaDbLokalMentah();
    const jumlahSoal = (db.bankSoal || []).length;
    const jumlahSiswa = (db.siswa || []).length;
    const jumlahUjian = (db.ujian || []).length;
    if (jumlahSoal + jumlahSiswa + jumlahUjian === 0) { toast('Tidak ada data Mode Lokal di perangkat ini untuk dikirim.', 'error'); return; }
    if (!confirm(`Ini akan MENAMBAHKAN salinan data lokal di perangkat ini (${jumlahSoal} soal, ${jumlahSiswa} siswa, ${jumlahUjian} ujian) ke Google Sheets yang sedang terhubung.\n\nPakai sekali saat pertama kali pindah dari Mode Lokal ke Mode Server — mengulang tindakan ini pada data yang sama akan membuat data ganda. Lanjutkan?`)) return;

    toast('Mengirim data lokal ke Google Sheets...');
    let berhasilSoal = 0, berhasilSiswa = 0, berhasilUjian = 0;
    const petaIdSoal = {};

    if (jumlahSoal > 0) {
      const soalList = db.bankSoal.map(s => { const c = Object.assign({}, s); delete c.id; c.guru_id = state.user.id; return c; });
      const r = await api('importSoal', { soalList: JSON.stringify(soalList) });
      if (r.ok) {
        berhasilSoal = r.count;
        db.bankSoal.forEach((s, i) => { if (r.ids[i]) petaIdSoal[s.id] = r.ids[i]; });
      }
    }
    if (jumlahSiswa > 0) {
      const siswaList = db.siswa.map(s => ({ username: s.username, password: s.password, nama: s.nama, kelas: s.kelas }));
      const r = await api('importSiswa', { siswaList: JSON.stringify(siswaList) });
      if (r.ok) berhasilSiswa = r.count;
    }
    for (const u of (db.ujian || [])) {
      const c = Object.assign({}, u);
      delete c.id;
      c.guru_id = state.user.id;
      // ID soal lokal berubah setelah diimpor ke server — petakan ulang soal_ids
      // ujian supaya tetap menunjuk ke soal yang benar.
      c.soal_ids = String(u.soal_ids || '').split(',').filter(Boolean).map(oldId => petaIdSoal[oldId] || oldId).join(',');
      const r = await api('simpanUjian', { ujian: JSON.stringify(c) });
      if (r.ok) berhasilUjian++;
    }
    toast(`Selesai: ${berhasilSoal} soal, ${berhasilSiswa} siswa, ${berhasilUjian} ujian terkirim ke Google Sheets.`, 'success');
    Guru.muatBankSoal(); Guru.muatDaftarSiswa(); Guru.muatDaftarUjian();
  }
};

// Perbandingan teks yang tidak sensitif huruf besar/kecil & spasi di pinggir —
// dipakai saat mencocokkan kategori/sub-kategori soal (lihat catatan di
// normalisasiKategoriSoal_ dan action getBankSoal).
function samaTeks_(a, b) {
  return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase();
}

// Kolom "kategori" di file impor soal itu teks bebas, tapi dropdown di Buat
// Ujian/Kelola Soal memakai kode baku huruf kecil ("kuis", "ulangan_harian",
// "uts", "uas"). Fungsi ini menormalkan variasi penulisan umum (huruf besar,
// spasi, dsb.) ke kode baku itu, supaya soal langsung cocok dengan filter di
// Buat Ujian tanpa perlu diketik persis huruf kecil semua di file impor.
function normalisasiKategoriSoal_(raw) {
  const asli = String(raw || '').trim() || 'Kuis';
  const bersih = asli.toLowerCase().replace(/[\s-]+/g, '_');
  // Hanya kode lama (kuis, ulangan harian, UTS, UAS) yang disatukan ke kode baku.
  // Nama bebas lain (mis. "Tekanan Zat") dibiarkan PERSIS seperti diketik -- dulu
  // diubah jadi "tekanan_zat" sehingga tidak cocok dgn mapel yang dibuka & soalnya
  // "hilang"/menumpuk di kategori lain.
  if (['kuis', 'ulangan_harian', 'uts', 'uas'].includes(bersih)) return bersih;
  if (bersih === 'ulanganharian' || bersih === 'harian') return 'ulangan_harian';
  if (/^(ujian_)?tengah_semester$|^penilaian_tengah_semester$/.test(bersih)) return 'uts';
  if (/^(ujian_)?akhir_semester$|^penilaian_akhir_semester$/.test(bersih)) return 'uas';
  return asli;
}

function labelKategori(k) {
  return { kuis: 'Kuis', ulangan_harian: 'Ulangan Harian', uts: 'UTS', uas: 'UAS' }[String(k || '').toLowerCase()] || k;
}
function labelTipe(t) {
  return { pilihan_ganda: 'PG Biasa', checkbox: 'PG Kompleks', benar_salah: 'Benar/Salah', menjodohkan: 'Mencocokkan', uraian: 'Essay' }[t] || t;
}
// Urutan & label tab tipe soal dipakai di halaman "Kelola Soal" (grid mapel) —
// lihat Guru.gantiTipeTabKelola & render tab di UI.htmlTipeTabs.
const TIPE_SOAL_TAB = [
  { tipe: 'pilihan_ganda', label: 'PG Biasa', sub: 'SINGLE CHOICE' },
  { tipe: 'checkbox', label: 'PG Kompleks', sub: 'MULTI SELECT' },
  { tipe: 'benar_salah', label: 'Benar/Salah', sub: 'PERNYATAAN' },
  { tipe: 'menjodohkan', label: 'Jodohkan', sub: 'MATCHING' },
  { tipe: 'uraian', label: 'Essay', sub: 'ISIAN SINGKAT' }
];
function labelKesulitan(k) {
  return { mudah: 'Mudah', sedang: 'Sedang', sulit: 'Sulit' }[k] || 'Sedang';
}
function labelPelanggaran(j) {
  return { keluar_fullscreen: 'Keluar dari mode layar penuh', pindah_tab: 'Berpindah tab / aplikasi', keluar_aplikasi: 'Keluar dari aplikasi' }[j] || j;
}
function formatTanggal(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; }
}

// Lama pengerjaan (detik) = waktu selesai - waktu mulai. null kalau datanya tidak lengkap.
function hitungDurasiDetik_(mulai, selesai) {
  if (!mulai || !selesai) return null;
  const a = new Date(mulai).getTime(), b = new Date(selesai).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return null;
  return Math.round((b - a) / 1000);
}

// 3725 detik -> "1 jam 2 mnt 5 dtk"; 750 -> "12 mnt 30 dtk"
function formatDurasi_(detik) {
  if (detik === null || detik === undefined) return '-';
  detik = Math.max(Math.floor(Number(detik) || 0), 0);
  const j = Math.floor(detik / 3600), m = Math.floor((detik % 3600) / 60), d = detik % 60;
  return (j ? j + ' jam ' : '') + ((j || m) ? m + ' mnt ' : '') + d + ' dtk';
}

// Dipakai tab "Pemantauan Ujian" (sisa waktu) & "Status Login" (lama tidak aktif).
function formatSisaWaktu(detik) {
  if (detik === null || detik === undefined) return '-';
  detik = Math.max(Math.floor(Number(detik) || 0), 0);
  const j = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  const d = detik % 60;
  const dua = n => String(n).padStart(2, '0');
  return j > 0 ? `${j}:${dua(m)}:${dua(d)}` : `${dua(m)}:${dua(d)}`;
}

function formatSudahBerapaLama(iso) {
  if (!iso) return '-';
  const detik = Math.floor((new Date() - new Date(iso)) / 1000);
  if (detik < 0) return 'baru saja';
  if (detik < 60) return 'baru saja';
  if (detik < 3600) return Math.floor(detik / 60) + ' menit lalu';
  if (detik < 86400) return Math.floor(detik / 3600) + ' jam lalu';
  return Math.floor(detik / 86400) + ' hari lalu';
}

// Dipakai tab "Analisis Soal": pertanyaan soal bisa berisi HTML hasil rich-text
// editor (bold, warna, dst.) -- untuk tabel analisis/CSV, tampilkan versi teks
// polosnya saja (tag dibuang, isi teksnya dipertahankan).
function bersihkanHtml_(str) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(str == null ? '' : str);
  return (tpl.content.textContent || '').replace(/\s+/g, ' ').trim();
}
function potongTeks_(str, maksPanjang) {
  const s = String(str == null ? '' : str);
  return s.length > maksPanjang ? s.slice(0, maksPanjang - 1) + '…' : s;
}
function unduhTeksSebagaiFile_(teks, namaFile) {
  const blob = new Blob(['\ufeff' + teks], { type: 'text/csv;charset=utf-8;' }); // BOM supaya Excel baca UTF-8 dgn benar
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = namaFile;
  a.click();
}

// ============================================================================
// SISWA — sebelum ujian
// ============================================================================
const Siswa = {
  mulaiPing() {
    clearInterval(state.pingHandle);
    state.pingHandle = setInterval(() => {
      api('ping', { role: 'siswa', siswaId: state.user.id, deviceId: state.deviceId });
    }, CONFIG.PING_INTERVAL_MS);
  },

  async cekToken() {
    const token = document.getElementById('input-token-ujian').value.trim().toUpperCase();
    const errEl = document.getElementById('token-error');
    errEl.textContent = '';
    if (!token) return;
    const res = await api('cekToken', { token });
    if (!res.ok) { errEl.textContent = res.error; document.getElementById('konfirmasi-ujian').classList.add('hidden'); return; }
    state.ujian = res.ujian;
    document.getElementById('konf-judul-ujian').textContent = res.ujian.judul;
    document.getElementById('konf-info-ujian').textContent = `Durasi: ${res.ujian.durasiMenit} menit • Kategori: ${labelKategori(res.ujian.kategori)}`;
    document.getElementById('konfirmasi-ujian').classList.remove('hidden');
  },

  async mulaiUjian() {
    const res = await api('mulaiUjian', { ujianId: state.ujian.id, siswaId: state.user.id, deviceId: state.deviceId });
    if (!res.ok) { toast(res.error, 'error'); return; }

    state.sesiId = res.sesiId;
    state.soal = res.soal;
    state.sisaDetik = res.sisaDetik;
    state.maxPelanggaran = res.maxPelanggaran;
    state.pelanggaran = res.pelanggaranSaatIni;
    state.idxSoal = 0;

    // gabungkan jawaban dari server dengan cache lokal (jaga-jaga koneksi sempat putus)
    const cacheLokal = ambilCacheLokal(state.sesiId);
    state.jawaban = Object.assign({}, res.jawabanTersimpan, cacheLokal.jawaban || {});
    state.ragu = (cacheLokal.ragu && cacheLokal.ragu.length) ? cacheLokal.ragu : res.raguTersimpan;

    UI.tampilkan('ujian-screen');
    document.getElementById('ujian-judul-aktif').textContent = state.ujian.judul;
    ExamEngine.renderGridSoal();
    ExamEngine.renderSoal();
    ExamEngine.mulaiTimer();
    ExamEngine.mulaiAutosave();
    AntiCheat.aktifkan();
  },

  soalSebelumnya() { if (state.idxSoal > 0) { state.idxSoal--; ExamEngine.renderSoal(); } },
  soalBerikutnya() { if (state.idxSoal < state.soal.length - 1) { state.idxSoal++; ExamEngine.renderSoal(); } },
  lompatKeSoal(i) { state.idxSoal = i; ExamEngine.renderSoal(); },

  toggleRagu() {
    const soalId = state.soal[state.idxSoal].id;
    const checked = document.getElementById('chk-ragu').checked;
    state.ragu = state.ragu.filter(id => id !== soalId);
    if (checked) state.ragu.push(soalId);
    simpanCacheLokal();
    ExamEngine.renderGridSoal();
  },

  konfirmasiSubmit() {
    const belumDijawab = state.soal.filter(s => state.jawaban[s.id] === undefined).length;
    const pesan = belumDijawab > 0
      ? `Masih ada ${belumDijawab} soal yang belum dijawab. Yakin ingin mengumpulkan ujian sekarang?`
      : 'Yakin ingin mengumpulkan ujian sekarang? Jawaban tidak dapat diubah setelah dikumpulkan.';
    if (confirm(pesan)) ExamEngine.submitUjian();
  },

  kembaliKeUjian() {
    document.getElementById('anticheat-warning').classList.add('hidden');
    AntiCheat.mintaFullscreen();
  }
};

// ============================================================================
// MESIN UJIAN (render soal, timer, autosave, submit, hasil)
// ============================================================================
const ExamEngine = {
  renderGridSoal() {
    const grid = document.getElementById('soal-grid');
    grid.innerHTML = state.soal.map((s, i) => {
      let cls = '';
      if (state.jawaban[s.id] !== undefined) cls += ' answered';
      if (state.ragu.includes(s.id)) cls += ' ragu';
      if (i === state.idxSoal) cls += ' current';
      return `<button class="${cls}" onclick="Siswa.lompatKeSoal(${i})">${i + 1}</button>`;
    }).join('');
  },

  renderSoal() {
    const soal = state.soal[state.idxSoal];
    const card = document.getElementById('question-card');
    card.innerHTML = renderKontenSoal(soal, { nomor: state.idxSoal + 1, total: state.soal.length, interaktif: true, jawaban: state.jawaban });
    renderMatika(card);
    document.getElementById('chk-ragu').checked = state.ragu.includes(soal.id);
    document.getElementById('btn-soal-prev').disabled = state.idxSoal === 0;
    document.getElementById('btn-soal-next').disabled = state.idxSoal === state.soal.length - 1;
    ExamEngine.renderGridSoal();
  },

  // PERFORMA: memilih opsi cukup mengganti kelas "selected" di elemen yang sudah ada,
  // TIDAK membangun ulang seluruh soal (yang memuat ulang gambar & menjalankan ulang
  // KaTeX tiap klik -- penyebab utama layar ujian terasa berat di HP).
  pilihJawabanTunggal(soalId, i) {
    state.jawaban[soalId] = i; simpanCacheLokal();
    const items = document.querySelectorAll('#question-card .opsi-item');
    if (items.length) items.forEach((el, k) => el.classList.toggle('selected', k === i));
    else ExamEngine.renderSoal();
    ExamEngine.renderGridSoal();
  },
  toggleJawabanGanda(soalId, i) {
    const arr = state.jawaban[soalId] || [];
    const idx = arr.indexOf(i);
    if (idx === -1) arr.push(i); else arr.splice(idx, 1);
    state.jawaban[soalId] = arr; simpanCacheLokal();
    const items = document.querySelectorAll('#question-card .opsi-item');
    if (items.length) {
      items.forEach((el, k) => {
        const dipilih = arr.includes(k);
        el.classList.toggle('selected', dipilih);
        const huruf = el.querySelector('.opsi-huruf');
        if (huruf) huruf.textContent = dipilih ? '\u2713' : String.fromCharCode(65 + k);
      });
    } else ExamEngine.renderSoal();
    ExamEngine.renderGridSoal();
  },
  pilihJodoh(soalId, i, val) {
    const jwb = state.jawaban[soalId] || {};
    jwb[i] = val; state.jawaban[soalId] = jwb; simpanCacheLokal(); ExamEngine.renderGridSoal();
  },
  // PERFORMA: jawaban uraian diketik per huruf -- simpan ke localStorage & gambar ulang
  // kotak nomor cukup setelah siswa berhenti mengetik sejenak (state langsung terbarui,
  // jadi tidak ada jawaban yang hilang saat dikumpulkan).
  isiJawabanUraian(soalId, val) {
    state.jawaban[soalId] = val;
    clearTimeout(state._uraianTimer);
    state._uraianTimer = setTimeout(() => {
      if (!state.sesiId || state.submitting) return;
      simpanCacheLokal(); ExamEngine.renderGridSoal();
    }, 350);
  },

  mulaiTimer() {
    clearInterval(state.timerHandle);
    ExamEngine.tampilkanWaktu();
    state.timerHandle = setInterval(() => {
      state.sisaDetik--;
      ExamEngine.tampilkanWaktu();
      if (state.sisaDetik <= 0) { clearInterval(state.timerHandle); toast('Waktu ujian habis. Jawaban dikumpulkan otomatis.', 'error'); ExamEngine.submitUjian(); }
    }, 1000);
  },

  tampilkanWaktu() {
    const s = Math.max(state.sisaDetik, 0);
    const jam = String(Math.floor(s / 3600)).padStart(2, '0');
    const menit = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const detik = String(s % 60).padStart(2, '0');
    const el = document.getElementById('timer-display');
    el.textContent = `${jam}:${menit}:${detik}`;
    el.classList.toggle('low', s <= CONFIG.TIMER_LOW_THRESHOLD_SEC);
  },

  mulaiAutosave() {
    clearInterval(state.autosaveHandle);
    state.autosaveHandle = setInterval(() => ExamEngine.sinkronKeServer(), CONFIG.AUTOSAVE_INTERVAL_MS);
  },

  async sinkronKeServer() {
    if (!state.sesiId || state.submitting) return;
    await api('simpanJawaban', { sesiId: state.sesiId, jawaban: JSON.stringify(state.jawaban), ragu: JSON.stringify(state.ragu) });
  },

  // Tombol "💾 Simpan Sekarang" di layar ujian — lapisan kedua manual di luar
  // penyimpanan otomatis tiap CONFIG.AUTOSAVE_INTERVAL_MS, untuk siswa yang ingin
  // memastikan jawabannya sudah terkirim (mis. sebelum sinyal internet terasa tidak stabil).
  async simpanSekarang() {
    if (!state.sesiId || state.submitting) return;
    toast('Menyimpan jawaban...');
    await ExamEngine.sinkronKeServer();
    toast('Jawaban tersimpan ke server.', 'success');
  },

  async submitUjian() {
    if (state.submitting) return;
    state.submitting = true;
    clearTimeout(state._uraianTimer);
    clearInterval(state.timerHandle);
    clearInterval(state.autosaveHandle);
    AntiCheat.nonaktifkan();
    const res = await api('submitUjian', { sesiId: state.sesiId, jawaban: JSON.stringify(state.jawaban) });
    hapusCacheLokal(state.sesiId);
    if (res.ok) {
      ExamEngine.tampilkanHasil(res.nilai, res.lulus, state.ujian.judul);
    } else {
      toast('Gagal mengumpulkan ujian, mencoba lagi...', 'error');
      setTimeout(() => ExamEngine.submitUjian(), 3000);
      state.submitting = false;
    }
  },

  // ---------------- DETAIL JAWABAN (siswa, setelah nilai keluar) ----------------
  detailItems: [],
  detailFilter: 'salah',
  detailSesiId: null,

  async bukaDetailJawaban() {
    const sesiId = ExamEngine.detailSesiId || state.sesiId;
    if (!sesiId) return;
    const btn = document.getElementById('btn-detail-jawaban');
    if (btn) btn.disabled = true;
    try {
      const res = await api('getDetailJawaban', { sesiId, siswaId: state.user ? state.user.id : '' });
      if (!res || !res.ok) { toast((res && res.error) || 'Gagal memuat detail jawaban.', 'error'); return; }
      ExamEngine.detailItems = res.items || [];
      document.getElementById('detail-judul-ujian').textContent = res.judulUjian || '-';
      document.getElementById('detail-nilai').textContent = res.nilai;
      const adaSalah = ExamEngine.detailItems.some(it => it.status !== 'benar');
      ExamEngine.detailFilter = adaSalah ? 'salah' : 'semua';
      ExamEngine.renderDetailJawaban();
      UI.tampilkan('detail-screen');
      window.scrollTo(0, 0);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  tutupDetailJawaban() { UI.tampilkan('hasil-screen'); },

  gantiFilterDetail(f) {
    ExamEngine.detailFilter = f;
    ExamEngine.renderDetailJawaban();
  },

  renderDetailJawaban() {
    const items = ExamEngine.detailItems;
    const nSalah = items.filter(it => it.status !== 'benar').length;
    const nBenar = items.length - nSalah;
    document.getElementById('detail-ringkas').textContent = items.length + ' soal · ' + nBenar + ' benar · ' + nSalah + ' perlu diperiksa';
    const f = ExamEngine.detailFilter;
    document.getElementById('detail-tab-salah').classList.toggle('active', f === 'salah');
    document.getElementById('detail-tab-semua').classList.toggle('active', f === 'semua');
    document.getElementById('detail-tab-salah').textContent = 'Yang Salah / Belum Benar (' + nSalah + ')';
    document.getElementById('detail-tab-semua').textContent = 'Semua Soal (' + items.length + ')';
    const tampil = [];
    items.forEach((it, i) => { if (f === 'semua' || it.status !== 'benar') tampil.push({ it, no: i + 1 }); });
    const cont = document.getElementById('detail-list');
    cont.innerHTML = tampil.length
      ? tampil.map(x => ExamEngine.htmlItemDetail_(x.it, x.no)).join('')
      : '<div class="dj-kosong"><i class="fa-solid fa-circle-check"></i><p>Semua jawaban Anda benar. Tidak ada soal yang perlu diperiksa.</p></div>';
    renderMatika(cont);
  },

  htmlItemDetail_(it, no) {
    const label = { benar: 'Benar', salah: 'Salah', sebagian: 'Sebagian benar', kosong: 'Tidak dijawab', manual: 'Dikoreksi guru' }[it.status] || it.status;
    const opsiObj = (o) => (o && typeof o === 'object') ? o : { teks: o || '', gambar: '' };
    let isi = '';
    if (it.tipe === 'pilihan_ganda' || it.tipe === 'benar_salah' || it.tipe === 'checkbox') {
      const dipilih = it.jawaban === null ? [] : (Array.isArray(it.jawaban) ? it.jawaban.map(Number) : [Number(it.jawaban)]);
      const kunci = it.kunciTampil || [];
      isi += '<div class="opsi-list">' + (it.opsi || []).map((o, i) => {
        const item = opsiObj(o);
        const benar = kunci.indexOf(i) !== -1;
        const pilih = dipilih.indexOf(i) !== -1;
        const kelas = benar ? 'dj-benar' : (pilih ? 'dj-salah' : '');
        const tag = benar && pilih ? 'Jawaban Anda · Kunci' : (benar ? 'Kunci jawaban' : (pilih ? 'Jawaban Anda' : ''));
        return `<div class="opsi-item opsi-readonly dj-opsi ${kelas}">
          <span class="opsi-huruf">${String.fromCharCode(65 + i)}</span>
          <span class="opsi-konten">${kontenSoalHtml(item.teks)}${item.gambar ? tagGambarAman_(item.gambar, 'opsi-gambar-tampil', 'Gambar opsi') : ''}</span>
          ${tag ? `<span class="dj-tag">${tag}</span>` : ''}
        </div>`;
      }).join('') + '</div>';
      if (kunci.length === 0) isi += '<p class="dj-catatan">Kunci jawaban soal ini belum diatur / tidak ditemukan. Mohon laporkan ke guru.</p>';
    } else if (it.tipe === 'menjodohkan') {
      const kiri = (it.opsi && it.opsi.kiri) || [], kanan = (it.opsi && it.opsi.kanan) || [];
      const jwb = (it.jawaban && typeof it.jawaban === 'object') ? it.jawaban : {};
      const kunci = it.kunciTampil || {};
      isi += '<div class="dj-jodoh">' + kiri.map((tk, i) => {
        const j = jwb[i];
        const adaJwb = j !== undefined && j !== null && j !== '';
        const benar = adaJwb && String(j) === String(kunci[i]);
        return `<div class="dj-jodoh-row ${benar ? 'dj-benar' : 'dj-salah'}">
          <div class="dj-jodoh-kiri">${escapeHtml_(tk)}</div>
          <div>Jawaban Anda: <strong>${adaJwb ? escapeHtml_(kanan[j] == null ? '-' : String(kanan[j])) : '(kosong)'}</strong></div>
          ${benar ? '' : `<div>Kunci: <strong>${kunci[i] !== undefined ? escapeHtml_(kanan[kunci[i]] == null ? '-' : String(kanan[kunci[i]])) : '(belum diatur)'}</strong></div>`}
        </div>`;
      }).join('') + '</div>';
    } else { // uraian
      const kata = ((it.kunciTampil && it.kunciTampil.kataKunci) || []).filter(k => String(k).trim());
      isi += `<div class="dj-uraian"><div class="dj-label">Jawaban Anda</div><div class="dj-uraian-teks">${it.jawaban ? escapeHtml_(String(it.jawaban)) : '<em>(kosong)</em>'}</div></div>`;
      isi += kata.length
        ? `<p class="dj-catatan">Kata kunci penilaian: <strong>${kata.map(escapeHtml_).join(', ')}</strong></p>`
        : '<p class="dj-catatan">Soal uraian ini dikoreksi manual oleh guru.</p>';
    }
    const pembahasan = it.pembahasan && !richTeksKosong_(it.pembahasan)
      ? `<div class="dj-pembahasan"><div class="dj-label">Pembahasan</div>${kontenSoalHtml(it.pembahasan)}</div>` : '';
    return `<article class="dj-card dj-status-${it.status}">
      <header class="dj-head">
        <span class="dj-no">Soal ${no}</span>
        <span class="dj-badge dj-badge-${it.status}">${label}</span>
        <span class="dj-skor">Skor ${it.skor} / ${it.bobot}</span>
      </header>
      <div class="pertanyaan">${kontenSoalHtml(it.pertanyaan)}</div>
      ${it.gambar ? tagGambarAman_(it.gambar, 'gambar-soal', 'Gambar soal') : ''}
      ${isi}
      ${pembahasan}
    </article>`;
  },

  tampilkanHasil(nilai, lulus, judul) {
    UI.tampilkan('hasil-screen');
    document.getElementById('hasil-judul-ujian').textContent = judul;
    document.getElementById('hasil-nilai').textContent = nilai;
    const statusEl = document.getElementById('hasil-status');
    const isLulus = lulus === true || String(lulus) === 'true';
    statusEl.textContent = isLulus ? 'LULUS' : 'PERLU REMEDIAL';
    statusEl.style.background = isLulus ? 'rgba(22,163,74,.12)' : 'rgba(224,67,61,.12)';
    statusEl.style.color = isLulus ? 'var(--c-success)' : 'var(--c-danger)';
    // BUG LAMA: pesan default ditampilkan dulu, lalu diganti pesan guru setelah getHasil
    // selesai. Kalau getHasil gagal/lambat (sinyal siswa jelek, server sibuk) kegagalannya
    // diam-diam ditelan dan pesan DEFAULT tertinggal -- pesan guru "kadang tidak muncul".
    // Sekarang: tampilkan "memuat", ambil pesan guru dgn beberapa kali percobaan, dan
    // pesan default HANYA dipakai bila semua percobaan gagal (atau guru memang tak mengisi).
    const elPesan = document.getElementById('hasil-instruksi');
    const btnDetail = document.getElementById('btn-detail-jawaban');
    if (btnDetail) btnDetail.style.display = 'none';
    ExamEngine.detailSesiId = state.sesiId;
    const sesiIdSaatIni = state.sesiId;
    const tokenTampil = (ExamEngine._tokenHasil = (ExamEngine._tokenHasil || 0) + 1);
    const pakaiDefault = () => { if (ExamEngine._tokenHasil === tokenTampil) elPesan.textContent = pesanUntukNilai_(nilai, ''); };
    if (!sesiIdSaatIni) { pakaiDefault(); }
    else {
      elPesan.textContent = 'Memuat pesan dari guru...';
      (async () => {
        for (let k = 1; k <= 4; k++) {
          let res = null;
          try { res = await api('getHasil', { sesiId: sesiIdSaatIni }); } catch (e) { res = null; }
          if (ExamEngine._tokenHasil !== tokenTampil) return; // layar hasil sudah berganti
          if (res && res.ok) {
            let teks = pesanUntukNilai_(nilai, res.pesanNilai);
            if (!isLulus && res.instruksiRemedial) teks += '\n\n' + res.instruksiRemedial;
            elPesan.textContent = teks;
            if (btnDetail && res.tampilDetail !== false) btnDetail.style.display = '';
            return;
          }
          await new Promise(r => setTimeout(r, 800 * k));
        }
        pakaiDefault();
      })();
    }

    // Ikon lingkaran (centang utk lulus, seru utk perlu remedial) + ring skor
    // melingkar yang terisi sesuai persentase nilai (0-100) -- murni kosmetik,
    // dianimasikan lewat transisi CSS pada stroke-dashoffset.
    const iconWrap = document.getElementById('hasil-icon-wrap');
    const icon = document.getElementById('hasil-icon');
    iconWrap.classList.toggle('gagal', !isLulus);
    icon.className = isLulus ? 'fa-solid fa-check' : 'fa-solid fa-triangle-exclamation';
    const ring = document.getElementById('hasil-skor-progress');
    const keliling = 2 * Math.PI * 52;
    const persen = Math.max(0, Math.min(100, Number(nilai) || 0));
    ring.style.stroke = isLulus ? 'var(--c-success)' : 'var(--c-danger)';
    ring.style.strokeDashoffset = keliling; // mulai kosong dulu...
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(keliling * (1 - persen / 100));
    });
  }
};

// ----------------------------------------------------------------------------
// CACHE LOKAL (menjaga jawaban tetap aman walau koneksi internet terputus)
// ----------------------------------------------------------------------------
function simpanCacheLokal() {
  if (!state.sesiId) return;
  localStorage.setItem('cbt_cache_' + state.sesiId, JSON.stringify({ jawaban: state.jawaban, ragu: state.ragu, disimpan: Date.now() }));
}
function ambilCacheLokal(sesiId) {
  try { return JSON.parse(localStorage.getItem('cbt_cache_' + sesiId) || '{}'); } catch (e) { return {}; }
}
function hapusCacheLokal(sesiId) { localStorage.removeItem('cbt_cache_' + sesiId); }

// ============================================================================
// ANTI-CHEAT
// ============================================================================
const AntiCheat = {
  aktif: false,

  aktifkan() {
    AntiCheat.aktif = true;
    AntiCheat.mintaFullscreen();
    document.addEventListener('fullscreenchange', AntiCheat.onFullscreenChange);
    document.addEventListener('visibilitychange', AntiCheat.onVisibilityChange);
    window.addEventListener('blur', AntiCheat.onBlur);
    document.addEventListener('copy', AntiCheat.blokirAksi);
    document.addEventListener('paste', AntiCheat.blokirAksi);
    document.addEventListener('cut', AntiCheat.blokirAksi);
    document.addEventListener('contextmenu', AntiCheat.blokirAksi);
    window.addEventListener('beforeunload', AntiCheat.onBeforeUnload);
  },

  nonaktifkan() {
    AntiCheat.aktif = false;
    document.removeEventListener('fullscreenchange', AntiCheat.onFullscreenChange);
    document.removeEventListener('visibilitychange', AntiCheat.onVisibilityChange);
    window.removeEventListener('blur', AntiCheat.onBlur);
    document.removeEventListener('copy', AntiCheat.blokirAksi);
    document.removeEventListener('paste', AntiCheat.blokirAksi);
    document.removeEventListener('cut', AntiCheat.blokirAksi);
    document.removeEventListener('contextmenu', AntiCheat.blokirAksi);
    window.removeEventListener('beforeunload', AntiCheat.onBeforeUnload);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  },

  mintaFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) req.call(el).catch(() => { /* beberapa browser mobile tidak mendukung fullscreen API */ });
  },

  blokirAksi(ev) { ev.preventDefault(); },

  onBeforeUnload(ev) {
    if (AntiCheat.aktif) { ev.preventDefault(); ev.returnValue = ''; }
  },

  onFullscreenChange() {
    if (AntiCheat.aktif && !document.fullscreenElement) AntiCheat.laporPelanggaran('keluar_fullscreen', 'Anda keluar dari mode layar penuh.');
  },

  onVisibilityChange() {
    if (AntiCheat.aktif && document.hidden) AntiCheat.laporPelanggaran('pindah_tab', 'Anda berpindah tab atau aplikasi lain.');
  },

  onBlur() {
    if (AntiCheat.aktif && document.hidden) AntiCheat.laporPelanggaran('keluar_aplikasi', 'Anda keluar dari aplikasi ujian.');
  },

  async laporPelanggaran(jenis, pesan) {
    if (!state.sesiId || state.submitting) return;
    document.getElementById('anticheat-pesan').textContent = pesan;
    document.getElementById('anticheat-warning').classList.remove('hidden');
    const res = await api('lapor', { sesiId: state.sesiId, jenis, jawaban: JSON.stringify(state.jawaban) });
    if (res.ok) {
      state.pelanggaran = res.pelanggaran;
      document.getElementById('pelanggaran-indikator').textContent = `Pelanggaran: ${state.pelanggaran}/${state.maxPelanggaran}`;
      document.getElementById('anticheat-sisa').textContent = `Sisa kesempatan sebelum ujian dikunci otomatis: ${Math.max(state.maxPelanggaran - state.pelanggaran, 0)}`;
      if (res.blokir) {
        state.submitting = true;
        clearInterval(state.timerHandle);
        clearInterval(state.autosaveHandle);
        AntiCheat.nonaktifkan();
        hapusCacheLokal(state.sesiId);
        document.getElementById('anticheat-pesan').textContent = 'Ujian dikunci karena melebihi batas pelanggaran yang diizinkan. Jawaban Anda telah dikumpulkan otomatis.';
        document.getElementById('anticheat-sisa').textContent = '';
        setTimeout(() => ExamEngine.tampilkanHasil(res.nilai, res.lulus, state.ujian.judul), 2500);
      }
    }
  }
};

// ============================================================================
// LIGHTBOX "PERBESAR GAMBAR" — opsi KEDUA di samping pembesaran otomatis
// (min-width) yang sudah ada lewat CSS di .question-card img.gambar-soal /
// .opsi-gambar-tampil / gambar inline pertanyaan-opsi. Fitur ini TIDAK
// mengubah ukuran/tampilan gambar yang sudah dirender di kartu soal sama
// sekali -- ia hanya menambah kemampuan siswa mengklik gambar itu untuk
// membukanya di lapisan (overlay) terpisah lalu memperbesarnya sendiri
// (tombol +/-, gulir mouse, cubit dua jari di HP, atau klik-dua-kali), dan
// menggeser gambar saat sudah diperbesar. Menutup lightbox mengembalikan
// tampilan soal persis seperti semula karena elemen gambar aslinya di kartu
// soal tidak pernah disentuh/diubah.
const ImageLightbox = {
  skala: 1, skalaMin: 1, skalaMaks: 6,
  geserX: 0, geserY: 0,
  aktif: false, menggeser: false, mulaiX: 0, mulaiY: 0,
  jarakSentuhAwal: 0, skalaAwalSentuh: 1,

  buka(src) {
    if (!src) return;
    const overlay = document.getElementById('gambar-lightbox');
    const img = document.getElementById('gambar-lightbox-img');
    img.src = src;
    ImageLightbox.reset();
    overlay.classList.remove('hidden');
    ImageLightbox.aktif = true;
  },

  tutup() {
    document.getElementById('gambar-lightbox').classList.add('hidden');
    document.getElementById('gambar-lightbox-img').src = '';
    ImageLightbox.aktif = false;
  },

  // Klik pada area gelap di luar gambar/toolbar menutup lightbox; klik pada
  // gambar atau tombol toolbar TIDAK menutup (supaya tidak mengganggu saat
  // menggeser/klik tombol zoom).
  klikBackdrop(ev) {
    if (ev.target.id === 'gambar-lightbox' || ev.target.id === 'gambar-lightbox-panel') ImageLightbox.tutup();
  },

  terapkan() {
    const img = document.getElementById('gambar-lightbox-img');
    img.style.transform = `translate(${ImageLightbox.geserX}px, ${ImageLightbox.geserY}px) scale(${ImageLightbox.skala})`;
    document.getElementById('gambar-lightbox-persen').textContent = Math.round(ImageLightbox.skala * 100) + '%';
  },

  reset() {
    ImageLightbox.skala = 1; ImageLightbox.geserX = 0; ImageLightbox.geserY = 0;
    ImageLightbox.terapkan();
  },

  zoom(arah, fokus) {
    const lama = ImageLightbox.skala;
    let baru = arah > 0 ? lama * 1.35 : lama / 1.35;
    baru = Math.max(ImageLightbox.skalaMin, Math.min(ImageLightbox.skalaMaks, baru));
    if (baru === ImageLightbox.skalaMin) { ImageLightbox.geserX = 0; ImageLightbox.geserY = 0; }
    ImageLightbox.skala = baru;
    ImageLightbox.terapkan();
  },

  toggleDobelKlik() { ImageLightbox.skala > 1 ? ImageLightbox.reset() : (ImageLightbox.skala = 2.2, ImageLightbox.terapkan()); },

  onWheel(ev) {
    ev.preventDefault();
    ImageLightbox.zoom(ev.deltaY < 0 ? 1 : -1);
  },

  onMouseDown(ev) {
    if (ImageLightbox.skala <= 1) return;
    ImageLightbox.menggeser = true;
    ImageLightbox.mulaiX = ev.clientX - ImageLightbox.geserX;
    ImageLightbox.mulaiY = ev.clientY - ImageLightbox.geserY;
    document.getElementById('gambar-lightbox-panel').classList.add('menggeser');
  },
  onMouseMove(ev) {
    if (!ImageLightbox.menggeser) return;
    ImageLightbox.geserX = ev.clientX - ImageLightbox.mulaiX;
    ImageLightbox.geserY = ev.clientY - ImageLightbox.mulaiY;
    ImageLightbox.terapkan();
  },
  onMouseUp() {
    ImageLightbox.menggeser = false;
    document.getElementById('gambar-lightbox-panel').classList.remove('menggeser');
  },

  jarakSentuh(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); },

  onTouchStart(ev) {
    if (ev.touches.length === 2) {
      ImageLightbox.jarakSentuhAwal = ImageLightbox.jarakSentuh(ev.touches);
      ImageLightbox.skalaAwalSentuh = ImageLightbox.skala;
    } else if (ev.touches.length === 1 && ImageLightbox.skala > 1) {
      ImageLightbox.menggeser = true;
      ImageLightbox.mulaiX = ev.touches[0].clientX - ImageLightbox.geserX;
      ImageLightbox.mulaiY = ev.touches[0].clientY - ImageLightbox.geserY;
    }
  },
  onTouchMove(ev) {
    if (ev.touches.length === 2 && ImageLightbox.jarakSentuhAwal) {
      ev.preventDefault();
      const rasio = ImageLightbox.jarakSentuh(ev.touches) / ImageLightbox.jarakSentuhAwal;
      ImageLightbox.skala = Math.max(ImageLightbox.skalaMin, Math.min(ImageLightbox.skalaMaks, ImageLightbox.skalaAwalSentuh * rasio));
      ImageLightbox.terapkan();
    } else if (ev.touches.length === 1 && ImageLightbox.menggeser) {
      ev.preventDefault();
      ImageLightbox.geserX = ev.touches[0].clientX - ImageLightbox.mulaiX;
      ImageLightbox.geserY = ev.touches[0].clientY - ImageLightbox.mulaiY;
      ImageLightbox.terapkan();
    }
  },
  onTouchEnd(ev) {
    if (ev.touches.length < 2) ImageLightbox.jarakSentuhAwal = 0;
    if (ev.touches.length === 0) ImageLightbox.menggeser = false;
  },

  // Dipasang sekali saat aplikasi dimuat. Memakai DELEGASI di fase capture,
  // dibatasi hanya pada gambar di dalam ".question-card" (kartu soal siswa
  // saat ujian & pratinjau soal Guru) -- TIDAK menyentuh gambar di kotak
  // rich-text editor / pratinjau upload di form Tambah-Ubah Soal, supaya
  // fitur klik-untuk-menempatkan-kursor saat mengedit soal tetap normal.
  // stopPropagation dipasang supaya klik gambar tidak ikut memicu onclick
  // pilihan jawaban (label opsi) di baliknya.
  pasang() {
    document.addEventListener('click', (ev) => {
      const img = ev.target.closest('.question-card img');
      if (!img) return;
      ev.preventDefault();
      ev.stopPropagation();
      ImageLightbox.buka(img.currentSrc || img.src);
    }, true);

    const panel = document.getElementById('gambar-lightbox-panel');
    panel.addEventListener('wheel', ImageLightbox.onWheel, { passive: false });
    panel.addEventListener('mousedown', ImageLightbox.onMouseDown);
    window.addEventListener('mousemove', ImageLightbox.onMouseMove);
    window.addEventListener('mouseup', ImageLightbox.onMouseUp);
    panel.addEventListener('touchstart', ImageLightbox.onTouchStart, { passive: true });
    panel.addEventListener('touchmove', ImageLightbox.onTouchMove, { passive: false });
    panel.addEventListener('touchend', ImageLightbox.onTouchEnd);
    document.getElementById('gambar-lightbox-img').addEventListener('dblclick', ImageLightbox.toggleDobelKlik);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ImageLightbox.aktif) ImageLightbox.tutup(); });
  }
};

// ============================================================================
// INISIALISASI
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  state.deviceId = getDeviceId();
  tampilkanBadgeMode();
  muatTemaGlobal();
  muatBrandingGlobal();
  // Penanda koneksi di layar login: langsung terlihat apakah HP ini terhubung ke server
  // (Google Sheets) atau masih Mode Lokal (penyebab umum siswa "tidak bisa login").
  (function () {
    const el = document.getElementById('login-mode-status');
    if (!el) return;
    if (modeServerAktif()) { el.textContent = '● Terhubung ke server'; el.style.color = '#16a97e'; }
    else { el.textContent = '⚠ Mode Lokal — belum terhubung ke server. Akun buatan guru tidak akan dikenali di perangkat ini.'; el.style.color = '#e0433d'; }
  })();
  Auth.pulihkanSesiLogin();
  ImageLightbox.pasang();
});

// Terus mencatat posisi kursor/seleksi terakhir di kotak Pertanyaan & Opsi
// Jawaban (lihat UI.rtExec dkk.) — supaya tombol toolbar (termasuk color
// picker, yang memindahkan fokus keluar dari kotaknya) tetap tahu di mana
// pemformatan harus diterapkan.
document.addEventListener('selectionchange', () => {
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.rich-editable')) {
    UI.rtSimpanSeleksi();
  }
});

// Hemat kuota: hentikan polling saat tab/aplikasi disembunyikan (mis. layar HP
// dikunci atau berpindah aplikasi), lalu lanjutkan lagi saat aktif kembali.
document.addEventListener('visibilitychange', () => {
  if (!state.user || state.user.role !== 'guru') return;
  if (document.hidden) {
    clearInterval(state.autoRefreshHandle);
  } else {
    const activeTab = document.querySelector('#guru-portal .main > section:not(.hidden)');
    if (activeTab) UI.mulaiAutoRefreshGuru(activeTab.id);
  }
});
