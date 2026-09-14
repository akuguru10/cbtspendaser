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
  API_URL: '', // contoh: https://script.google.com/macros/s/xxxx/exec — kosongkan untuk mode lokal
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

// ----------------------------------------------------------------------------
// PALET WARNA SIAP PAKAI + PEMBUAT PALET ACAK
// ----------------------------------------------------------------------------
const PALET_PRESET = [
  { nama: 'Violet Neon', primary: '#7c3aed', secondary: '#ec4899', accent: '#eab308', bg: '#faf7ff', text: '#211334' },
  { nama: 'Gold Elegan', primary: '#8a5a00', secondary: '#4b3621', accent: '#d4af37', bg: '#fffdf6', text: '#2b2210' },
  { nama: 'Ocean Teal', primary: '#0f766e', secondary: '#0369a1', accent: '#facc15', bg: '#f2fbfa', text: '#0b2a27' },
  { nama: 'Sunset Ceria', primary: '#c2410c', secondary: '#db2777', accent: '#facc15', bg: '#fff8f2', text: '#3a1607' },
  { nama: 'Emerald Segar', primary: '#15803d', secondary: '#0d9488', accent: '#eab308', bg: '#f3fdf6', text: '#0c2a17' },
  { nama: 'Midnight Neon', primary: '#151a3d', secondary: '#3b82f6', accent: '#ec4899', bg: '#f5f6ff', text: '#12142b' },
  { nama: 'Putih Klasik', primary: '#1d3557', secondary: '#457b9d', accent: '#e76f51', bg: '#ffffff', text: '#1b1f24' }
];

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function buatPaletAcak() {
  const h = Math.floor(Math.random() * 360);
  const h2 = (h + 30 + Math.floor(Math.random() * 60)) % 360;
  const h3 = (h + 150 + Math.floor(Math.random() * 60)) % 360;
  return {
    primary: hslToHex(h, 65 + Math.random() * 15, 36 + Math.random() * 10),
    secondary: hslToHex(h2, 65 + Math.random() * 20, 48 + Math.random() * 10),
    accent: hslToHex(h3, 80 + Math.random() * 15, 52 + Math.random() * 8),
    bg: '#ffffff',
    text: hslToHex(h, 30, 14)
  };
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
function unduhXlsx(filename, headers, rows) {
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
function normalisasiTipeSoal_(s) {
  const key = String(s || '').trim().toLowerCase().replace(/[\s\/_-]+/g, '');
  return TIPE_SINONIM_[key] || TIPE_SINONIM_[key.replace(/_/g, '')] || 'pilihan_ganda';
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
  const tipe = normalisasiTipeSoal_(ambil('tipe'));
  const gambarRaw = ambil('gambar');
  let gambar = '';
  if (gambarRaw) {
    if (/^(https?:|data:)/i.test(gambarRaw)) gambar = normalisasiUrlGambar(gambarRaw);
    else if (petaGambar && petaGambar.has(gambarRaw.trim().toLowerCase())) gambar = petaGambar.get(gambarRaw.trim().toLowerCase());
  }
  const item = {
    guru_id: guruId,
    kategori: normalisasiKategoriSoal_(ambil('kategori') || kategoriDefault || 'Kuis'),
    subkategori: ambil('subkategori') || ambil('sub-kategori'),
    topik: ambil('topik'),
    tipe,
    pertanyaan,
    gambar,
    bobot: Number(ambil('bobot')) || 10,
    tingkat_kesulitan: (ambil('kesulitan') || ambil('tingkatkesulitan') || 'sedang').toLowerCase()
  };
  const potonganPertanyaan = (s) => { const teks = String(s).replace(/<[^>]*>/g, '').trim(); return teks.length > 60 ? teks.slice(0, 60) + '…' : teks; };
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
        peringatan.push(`"${potonganPertanyaan(pertanyaan)}": kunci "${kunciStr}" tidak dikenali (bukan huruf opsi A-H, Benar/Salah, atau teks opsi yang cocok) — sementara ditandai opsi A, mohon PERIKSA & PERBAIKI manual di Bank Soal.`);
      }
      item.kunci_json = JSON.stringify(idxTunggal === -1 ? 0 : idxTunggal);
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
  if (!fileId) return `<img${kelasAttr}${altAttr} src="${escapeHtml_(u)}">`;
  const src = kandidatUrlDrive_(fileId)[0];
  return `<img${kelasAttr}${altAttr} src="${escapeHtml_(src)}" data-drive-id="${escapeHtml_(fileId)}" data-drive-tahap="1">`;
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

// ---------------- Akses mentah ke database Mode Lokal (dipakai tombol paksa
// kirim/tarik data di Pengaturan, lihat Guru.kirimDataLokalKeSheet/tarikDataDariSheet) ----------------
const LOCAL_DB_KEY = 'cbt_local_db_v1';
function bacaDbLokalMentah() {
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
function ambilMetaMapel_(kategori) {
  const semua = bacaSemuaMetaMapel_();
  const kunci = String(kategori || '').toLowerCase();
  if (!semua[kunci]) {
    semua[kunci] = {
      token: Math.random().toString(36).slice(2, 8).toUpperCase(),
      warna: MAPEL_WARNA_LIST[Object.keys(semua).length % MAPEL_WARNA_LIST.length]
    };
    try { localStorage.setItem(MAPEL_META_KEY, JSON.stringify(semua)); } catch (e) {}
  }
  return semua[kunci];
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
      return `<label class="opsi-item ${selected ? 'selected' : ''}${interaktif ? '' : ' opsi-readonly'}"${onclick}>
        <span class="opsi-huruf">${String.fromCharCode(65 + i)}</span>
        <span class="opsi-konten">${kontenSoalHtml(item.teks)}${item.gambar ? tagGambarAman_(item.gambar, 'opsi-gambar-tampil', 'Gambar opsi') : ''}</span>
      </label>`;
    }).join('') + '</div>';
  } else if (soal.tipe === 'checkbox') {
    const dipilih = jawaban[soal.id] || [];
    html += '<div class="opsi-list">' + (soal.opsi || []).map((o, i) => {
      const item = opsiObj(o);
      const selected = dipilih.includes(i);
      const onclick = interaktif ? ` onclick="ExamEngine.toggleJawabanGanda('${soal.id}', ${i})"` : '';
      return `<label class="opsi-item ${selected ? 'selected' : ''}${interaktif ? '' : ' opsi-readonly'}"${onclick}>
        <span class="opsi-huruf">${selected ? '&#10003;' : String.fromCharCode(65 + i)}</span>
        <span class="opsi-konten">${kontenSoalHtml(item.teks)}${item.gambar ? tagGambarAman_(item.gambar, 'opsi-gambar-tampil', 'Gambar opsi') : ''}</span>
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
    return { primary: '#7c3aed', secondary: '#ec4899', accent: '#eab308', bg: '#faf7ff', text: '#211334' };
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

  function simpan() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      toast('Penyimpanan lokal penuh/gagal — coba hapus gambar soal berukuran besar, atau gunakan mode Server.', 'error');
      return false;
    }
  }

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
    try { kunci = JSON.parse(soal.kunci_json || 'null'); } catch (e) { kunci = null; }
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
          const siswa = D.siswa.find(s => s.username === username);
          if (!siswa || String(siswa.password) !== password) return { ok: false, error: 'Username atau password siswa salah.' };
          const now = new Date();
          const lastPing = siswa.last_ping ? new Date(siswa.last_ping) : null;
          const staleMs = 15 * 60 * 1000;
          const deviceLocked = siswa.device_id && lastPing && (now - lastPing) < staleMs && siswa.device_id !== deviceId;
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
            if (s.device_id && data.deviceId && s.device_id !== data.deviceId) return { ok: false, error: 'Sesi diambil alih oleh perangkat lain.' };
            s.last_ping = new Date().toISOString();
            simpan();
          }
        }
        return { ok: true };
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
        if (!ujian.token) ujian.token = Math.random().toString(36).slice(2, 8).toUpperCase();
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
          return { siswaId: s.siswa_id, nama: siswa.nama || '(tidak dikenal)', kelas: siswa.kelas || '-', nilai: s.nilai, lulus: s.lulus, pelanggaran: s.pelanggaran, mulai: s.mulai, selesai: s.selesai, status: s.status };
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
      case 'getHasil': {
        const sesi = D.sesi.find(s => s.id === data.sesiId);
        if (!sesi) return { ok: false, error: 'Sesi tidak ditemukan.' };
        const ujian = D.ujian.find(u => u.id === sesi.ujian_id);
        return {
          ok: true, selesai: sesi.status !== 'berlangsung', nilai: sesi.nilai, lulus: sesi.lulus, pelanggaran: sesi.pelanggaran,
          judulUjian: ujian ? ujian.judul : '-',
          instruksiRemedial: (sesi.lulus === false) ? (ujian && ujian.instruksi_remedial ? ujian.instruksi_remedial : 'Silakan hubungi guru mata pelajaran untuk instruksi remedial.') : ''
        };
      }
      default:
        return { ok: false, error: 'Aksi tidak dikenal: ' + action };
    }
  }

  return { route };
})();

// ----------------------------------------------------------------------------
// TEMA
// ----------------------------------------------------------------------------
function terapkanTema(tema) {
  if (!tema) return;
  const root = document.documentElement.style;
  if (tema.primary) root.setProperty('--c-primary', tema.primary);
  if (tema.secondary) root.setProperty('--c-secondary', tema.secondary);
  if (tema.accent) root.setProperty('--c-accent', tema.accent);
  if (tema.bg) root.setProperty('--c-bg', tema.bg);
  if (tema.text) root.setProperty('--c-text', tema.text);
}

async function muatTemaGlobal() {
  const res = await api('getTema', {});
  if (res.ok) terapkanTema(res.tema);
}

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
      if (!res.ok) { errEl.textContent = res.error || 'Login gagal.'; return; }
      state.user = res.user;
      sessionStorage.setItem('cbt_user', JSON.stringify(res.user));

      if (res.user.role === 'guru') {
        UI.tampilkan('guru-portal');
        document.getElementById('guru-nama-label').textContent = res.user.nama;
        Guru.init();
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
    ['login-screen', 'guru-portal', 'siswa-portal', 'ujian-screen', 'hasil-screen'].forEach(id => {
      document.getElementById(id).classList.toggle('hidden', id !== idLayar);
    });
  },

  gantiTabGuru(tabId) {
    document.querySelectorAll('#guru-portal .nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('#guru-portal .main > section').forEach(s => s.classList.toggle('hidden', s.id !== tabId));
    if (tabId === 'tab-ujian') Guru.muatDaftarUjian();
    if (tabId === 'tab-rekap') Guru.muatPilihanUjianUntukSelect('pilih-ujian-rekap');
    if (tabId === 'tab-analisis') Guru.muatPilihanUjianUntukSelect('pilih-ujian-analisis');
    if (tabId === 'tab-pelanggaran') Guru.muatPilihanUjianUntukSelect('pilih-ujian-log');
    if (tabId === 'tab-pemantauan') Guru.muatPilihanUjianUntukSelect('pilih-ujian-pemantauan');
    if (tabId === 'tab-login') Guru.muatStatusLogin();
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
      'tab-bank-soal': () => Guru.muatBankSoal(),
      'tab-ujian': () => Guru.muatDaftarUjian(),
      'tab-siswa': () => Guru.muatDaftarSiswa(),
      'tab-rekap': () => { if (document.getElementById('pilih-ujian-rekap').value) Guru.muatRekap(); },
      'tab-analisis': () => { if (document.getElementById('pilih-ujian-analisis').value) Guru.muatAnalisisSoal(); },
      'tab-pelanggaran': () => { if (document.getElementById('pilih-ujian-log').value) Guru.muatLogPelanggaran(); },
      'tab-pemantauan': () => { if (document.getElementById('pilih-ujian-pemantauan').value) Guru.muatPemantauan(); },
      'tab-login': () => Guru.muatStatusLogin()
    };
    const fn = refreshMap[tabId];
    if (fn) state.autoRefreshHandle = setInterval(fn, CONFIG.REALTIME_POLL_MS);
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
      try { kunci = JSON.parse(soal.kunci_json || 'null'); } catch (e) {}
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
        const checked = tipe === 'checkbox' ? (Array.isArray(kunci) && kunci.includes(i)) : (kunci === i);
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
  async init() {
    await muatTemaGlobal();
    Guru.muatBankSoal();
    UI.mulaiAutoRefreshGuru('tab-bank-soal');
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
    Guru.perbaruiDaftarSubkategoriSoal();
    Guru.perbaruiDaftarKategoriSoal();
    Guru.renderMapelGrid();
    Guru.renderDaftarSoal();
    if (state.guru.viewBankSoal === 'arsip') Guru.renderGridArsipKategori();
    if (state.guru.viewBankSoal === 'arsip-kategori') Guru.renderDaftarArsipKategori();
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
    const unik = Object.keys(peta)
      .filter(k => (peta[k].total - peta[k].arsip) > 0)
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
    ambilMetaMapel_(nama.trim()); // langsung siapkan token/warna kartunya
    Guru.bukaKelolaSoal(nama.trim());
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
    const hasil = await Promise.all(cocok.map(s => api('simpanSoal', { soal: JSON.stringify({ id: s.id, status: 'aktif' }) })));
    const gagal = hasil.filter(r => !r.ok).length;
    toast(gagal ? `${cocok.length - gagal} soal dikembalikan, ${gagal} gagal.` : `${cocok.length} soal di kategori "${labelKategori(kategori)}" dikembalikan ke Bank Soal.`, gagal ? 'error' : 'success');
    await Guru.muatBankSoal();
    if (document.getElementById('arsip-kategori-view').classList.contains('hidden')) Guru.renderGridArsipKategori();
    else Guru.renderDaftarArsipKategori();
  },

  async hapusKategoriArsipPermanen(kategori) {
    kategori = kategori || state.guru.kategoriArsipKelola;
    const cocok = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') === 'arsip' && samaTeks_(s.kategori, kategori));
    if (cocok.length === 0) return;
    if (!confirm(`Hapus PERMANEN seluruh ${cocok.length} soal arsip di kategori "${labelKategori(kategori)}"? Tindakan ini TIDAK BISA DIBATALKAN.`)) return;
    const hasil = await Promise.all(cocok.map(s => api('hapusSoal', { id: s.id })));
    const gagal = hasil.filter(r => !r.ok).length;
    toast(gagal ? `${cocok.length - gagal} soal dihapus permanen, ${gagal} gagal.` : `Kategori "${labelKategori(kategori)}" dihapus permanen dari Arsip (${cocok.length} soal).`, gagal ? 'error' : 'success');
    await Guru.muatBankSoal();
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

    if (semua.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada soal.</p>'; return; }
    if (data.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada soal yang cocok dengan filter/tab ini. Klik "Tambah Soal Manual" untuk membuat soal baru di tab ini.</p>'; return; }
    cont.innerHTML = data.map((s, i) => {
      const arsip = (s.status || 'aktif') === 'arsip';
      const dipakai = dipakaiDi[s.id];
      return `
      <div class="soal-item">
        <div class="soal-item-nomor">${i + 1}</div>
        <div class="soal-item-body">
          <div class="meta">${labelKategori(s.kategori)}${s.subkategori ? ' • ' + escapeHtml_(s.subkategori) : ''}${s.topik ? ' • ' + escapeHtml_(s.topik) : ''} • ${labelTipe(s.tipe)} • Bobot ${s.bobot} • ${labelKesulitan(s.tingkat_kesulitan)}${arsip ? ' • <span class="badge no">Arsip</span>' : ''}${dipakai ? ` • <span class="badge warn" title="${escapeHtml_(dipakai.join(', '))}">🕘 Pernah dipakai (${dipakai.length}×)</span>` : ''}</div>
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
    return `<div class="question-card" style="margin-bottom:0">${renderKontenSoal(soal, { nomor, total, interaktif: false })}</div>`;
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
    if (res.ok) { toast('Soal dipindahkan ke Arsip.', 'success'); Guru.muatBankSoal(); }
    else toast('Gagal mengarsipkan soal: ' + res.error, 'error');
  },

  async kembalikanSoal(id) {
    const res = await api('simpanSoal', { soal: JSON.stringify({ id, status: 'aktif' }) });
    if (res.ok) { toast('Soal dikembalikan ke Bank Soal.', 'success'); Guru.muatBankSoal(); }
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
    const cocok = (state.guru.bankSoal || []).filter(s => (s.status || 'aktif') !== 'arsip' && samaTeks_(s.kategori, kategori));
    if (cocok.length === 0) { toast('Kategori ini sudah tidak memiliki soal aktif.', 'error'); Guru.renderKelolaKategori(); return; }
    if (!confirm(`Hapus kategori "${labelKategori(kategori)}"? ${cocok.length} soal di dalamnya akan dipindahkan ke Arsip (TIDAK dihapus permanen — bisa diedit & dikembalikan lagi lewat filter status "Arsip" di Bank Soal).`)) return;
    const hasil = await Promise.all(cocok.map(s => api('simpanSoal', { soal: JSON.stringify({ id: s.id, status: 'arsip' }) })));
    const gagal = hasil.filter(r => !r.ok).length;
    toast(gagal
      ? `Kategori "${labelKategori(kategori)}": ${cocok.length - gagal} soal diarsipkan, ${gagal} gagal.`
      : `Kategori "${labelKategori(kategori)}" dihapus — ${cocok.length} soal dipindahkan ke Arsip.`, gagal ? 'error' : 'success');
    await Guru.muatBankSoal();
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
    if (res.ok) { toast('Soal dihapus permanen.', 'success'); Guru.muatBankSoal(); }
    else toast('Gagal menghapus soal: ' + res.error, 'error');
  },

  // Sama seperti hapusSoal, dipakai khusus di halaman Arsip (Guru.bukaArsipSoal)
  // dgn teks konfirmasi yang menegaskan soal sudah diarsipkan & akan hilang
  // selamanya kalau tetap dihapus.
  async hapusSoalPermanen(id) {
    if (!confirm('Yakin ingin menghapus soal ini secara PERMANEN dari Arsip? Soal tidak bisa dikembalikan lagi setelah ini.')) return;
    const res = await api('hapusSoal', { id });
    if (res.ok) { toast('Soal dihapus permanen.', 'success'); Guru.muatBankSoal(); }
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
    for (const file of files) {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api('uploadGambar', { base64, filename: file.name, mimeType: file.type });
      if (res.ok) peta.set(file.name.trim().toLowerCase(), res.url);
    }
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
  importSoalDariDocx(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    if (typeof mammoth === 'undefined') { toast('Pustaka pembaca .docx belum termuat. Periksa koneksi internet lalu muat ulang halaman.', 'error'); ev.target.value = ''; return; }
    const inputGambar = document.getElementById('input-import-soal-docx-gambar');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const hasil = await mammoth.convertToHtml({ arrayBuffer: e.target.result }, { convertImage: mammoth.images.dataUri });
        const dom = new DOMParser().parseFromString(hasil.value, 'text/html');
        const petaGambar = await Guru.unggahBatchGambarImpor_(inputGambar ? inputGambar.files : null);
        let soalList = [];
        let jumlahTempel = 0;
        let gagalTempel = 0;
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
              if (rIdx === 0) { nilai.push(td.textContent.trim()); continue; } // baris header: teks biasa, tidak dicek gambar
              const daftarImg = Array.from(td.querySelectorAll('img'));
              if (daftarImg.length === 0) { nilai.push(td.textContent.trim()); continue; }
              // Ada gambar tertempel langsung di sel ini -> unggah satu per satu ke Drive.
              for (const img of daftarImg) {
                const bagian = dataUriKeBagian_(img.getAttribute('src'));
                if (!bagian) { img.remove(); continue; }
                jumlahTempel++;
                const namaFile = `soal-tempel-${jumlahTempel}.${bagian.ekstensi}`;
                const res = await api('uploadGambar', { base64: bagian.base64, filename: namaFile, mimeType: bagian.mimeType });
                if (res.ok) { img.setAttribute('src', res.url); } else { gagalTempel++; img.remove(); }
              }
              if ((headerKey[cIdx] || '') === 'gambar') {
                // Kolom "Gambar": field soal.gambar berupa URL polos, bukan markup <img>.
                const imgPertama = td.querySelector('img');
                nilai.push(imgPertama ? imgPertama.getAttribute('src') : td.textContent.trim());
              } else {
                // Kolom lain (Pertanyaan/Opsi dst): simpan sbg HTML supaya <img> inline
                // ikut tampil lewat rich text (lihat kontenSoalHtml/sanitasiHtmlKaya_).
                nilai.push(td.innerHTML.trim());
              }
            }
            rows.push(nilai);
          }
          soalList = soalList.concat(barisTabelKeSoalList_(rows, state.user.id, state.guru.kategoriKelola, petaGambar, peringatan));
        }
        if (soalList.length === 0) { toast('Tidak ada tabel soal yang terbaca. Pastikan mengisi di dalam tabel template, jangan mengubah baris header.', 'error'); return; }
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
      }
      ev.target.value = '';
      if (inputGambar) inputGambar.value = '';
      UI.perbaruiLabelJumlahGambar('input-import-soal-docx-gambar', 'label-jumlah-gambar-docx');
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
      ['Simulasi', 'Sejarah Indonesia', 'PG', 'Siapakah Presiden Indonesia pada tahun 1999?', '', 'Soekarno', 'Soeharto', 'B. J. Habibie', 'Abdurrahman Wahid', '', 'C', '10', 'Sedang'],
      ['Simulasi', 'Biologi', 'PGK', 'Manakah yang termasuk hewan mamalia? (kunci boleh lebih dari 1, pisah koma)', '', 'Paus', 'Ular', 'Kelelawar', 'Buaya', '', 'A,C', '10', 'Sedang'],
      ['Simulasi', 'Geografi', 'BS', 'Indonesia terletak di antara dua benua, yaitu Asia dan Australia.', '', 'Benar', 'Salah', '', '', '', 'Benar', '5', 'Mudah'],
      ['Simulasi', 'Biologi', 'Essay', 'Jelaskan proses terjadinya fotosintesis pada tumbuhan.', '', '', '', '', '', '', 'fotosintesis, klorofil, karbon dioksida', '15', 'Sedang'],
      ['', '', '', '(tambahkan baris baru di bawah sini, ikuti pola di atas — boleh sebanyak yang dibutuhkan)', '', '', '', '', '', '', '', '', '']
    ];
    const items = [
      { text: 'TEMPLATE IMPORT SOAL — CBT Online', heading: true },
      { text: 'Isi tabel di bawah, SATU BARIS = SATU SOAL. Kolom Tipe: PG (pilihan ganda), PGK (pilihan ganda kompleks/kunci boleh lebih dari 1), BS (benar/salah), Essay. Kolom Kunci cukup diisi HURUF opsi yang benar (mis. "C"), untuk PGK pisah dgn koma (mis. "A,C"), untuk BS isi "Benar"/"Salah", untuk Essay isi kata kunci penilaian dipisah koma. Kolom Gambar: boleh dikosongkan, boleh diisi link gambar publik, ATAU cukup TEMPEL/SISIPKAN gambarnya langsung di dalam sel itu (Insert > Pictures di Word) -- saat diimpor gambar tersebut otomatis terdeteksi & terunggah sendiri, tanpa perlu file gambar terpisah. Gambar juga boleh ditempel langsung di tengah sel Pertanyaan/Opsi kalau perlu. Kolom yang tidak dipakai (mis. Opsi E utk soal 4 opsi) boleh dikosongkan. Tipe Jodohkan sebaiknya dibuat lewat "Tambah Soal Manual" karena pasangannya lebih mudah diatur lewat formulir.' },
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
    if (res.data.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada siswa yang <strong>menyelesaikan</strong> ujian ini (siswa yang masih mengerjakan tidak dihitung di sini — lihat tab "Pemantauan Ujian" untuk yang sedang berlangsung).</p>'; return; }
    cont.innerHTML = `<table class="ledger"><thead><tr><th>Nama</th><th>Kelas</th><th>Nilai</th><th>Status</th><th>Pelanggaran</th><th>Selesai</th></tr></thead><tbody>` +
      res.data.map(r => `<tr>
        <td>${escapeHtml_(r.nama)}</td><td>${escapeHtml_(r.kelas)}</td><td><strong>${r.nilai}</strong></td>
        <td><span class="badge ${String(r.lulus) === 'true' ? 'ok' : 'no'}">${String(r.lulus) === 'true' ? 'Lulus' : 'Remedial'}</span></td>
        <td>${r.pelanggaran || 0} ${r.status === 'diblokir' ? '<span class="badge warn">Diblokir</span>' : ''}</td>
        <td style="font-size:.8rem">${formatTanggal(r.selesai)}</td>
      </tr>`).join('') + `</tbody></table>`;
  },

  unduhRekapCSV() {
    const data = state.guru._rekapAktif;
    if (!data || data.length === 0) { toast('Tidak ada data untuk diunduh.', 'error'); return; }
    let csv = 'Nama,Kelas,Nilai,Lulus,Pelanggaran,Selesai\n';
    data.forEach(r => { csv += `"${r.nama}","${r.kelas}",${r.nilai},${r.lulus},${r.pelanggaran || 0},"${r.selesai}"\n`; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'rekap-nilai.csv'; a.click();
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
    if (res.data.length === 0) { cont.innerHTML = '<p class="subtitle">Tidak ada pelanggaran tercatat.</p>'; return; }
    cont.innerHTML = `<table class="ledger"><thead><tr><th>Siswa</th><th>Jenis Pelanggaran</th><th>Waktu</th></tr></thead><tbody>` +
      res.data.map(l => `<tr><td>${escapeHtml_(l.siswa_id)}</td><td>${labelPelanggaran(l.jenis)}</td><td>${formatTanggal(l.waktu)}</td></tr>`).join('') +
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

  unduhAnalisisSoalCSV() {
    const data = state.guru._analisisSoal;
    if (!data || data.length === 0) { toast('Tidak ada data untuk diunduh.', 'error'); return; }
    let csv = 'No,Pertanyaan,Tipe,Tingkat Kesulitan (Guru),Jumlah Benar,Jumlah Sebagian Benar,Jumlah Salah,Jumlah Kosong,Persen Benar,Tingkat Kesulitan (Otomatis)\n';
    data.forEach(s => {
      const pertanyaan = String(bersihkanHtml_(s.pertanyaan)).replace(/"/g, '""');
      csv += `${s.nomor},"${pertanyaan}",${labelTipe(s.tipe)},${labelKesulitan(s.tingkatKesulitanGuru)},${s.jumlahBenar},${s.jumlahSebagianBenar},${s.jumlahSalah},${s.jumlahKosong},${s.persenBenar}%,${s.kesulitanOtomatis}\n`;
    });
    unduhTeksSebagaiFile_(csv, 'analisis-soal.csv');
  },

  renderAnalisisJawaban() {
    const cont = document.getElementById('tabel-analisis-jawaban');
    const soalList = state.guru._analisisSoal || [];
    const siswaList = state.guru._analisisSiswa || [];
    if (siswaList.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada siswa yang menyelesaikan ujian ini.</p>'; return; }
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

  unduhAnalisisJawabanCSV() {
    const soalList = state.guru._analisisSoal;
    const siswaList = state.guru._analisisSiswa;
    if (!siswaList || siswaList.length === 0) { toast('Tidak ada data untuk diunduh.', 'error'); return; }
    const labelSimbol = { benar: 'Benar', sebagian: 'Sebagian', salah: 'Salah', kosong: 'Kosong', na: 'Kosong' };
    let csv = 'Nama,Kelas,Nilai,' + soalList.map(s => `"No ${s.nomor}"`).join(',') + '\n';
    siswaList.forEach(sw => {
      csv += `"${sw.nama}","${sw.kelas}",${sw.nilai},` + soalList.map(s => labelSimbol[sw.jawabanDetail[s.soalId]] || 'Kosong').join(',') + '\n';
    });
    unduhTeksSebagaiFile_(csv, 'analisis-jawaban-siswa.csv');
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
    Guru.renderTabelPemantauan();
  },

  renderTabelPemantauan() {
    const cont = document.getElementById('tabel-pemantauan');
    const data = state.guru._pemantauanAktif || [];
    const maxPelanggaran = state.guru._pemantauanMax || 999;
    if (data.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada siswa yang membuka ujian ini.</p>'; return; }

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
    const data = filterKelas ? semua.filter(s => s.kelas === filterKelas) : semua;
    if (semua.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada data siswa.</p>'; return; }
    if (data.length === 0) { cont.innerHTML = `<p class="subtitle">Tidak ada siswa di kelas "${escapeHtml_(filterKelas)}".</p>`; return; }
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
    const data = filterKelas ? semua.filter(s => s.kelas === filterKelas) : semua;
    if (semua.length === 0) { cont.innerHTML = '<p class="subtitle">Belum ada data siswa.</p>'; return; }
    if (data.length === 0) { cont.innerHTML = `<p class="subtitle">Tidak ada siswa di kelas "${escapeHtml_(filterKelas)}".</p>`; return; }
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
        ['Simulasi', 'Sejarah Indonesia', 'PG', 'Siapakah Presiden Indonesia pada tahun 1999?', '', 'Soekarno', 'Soeharto', 'B. J. Habibi', 'Abdurrahman Wahid', '', 'C', '10', 'Sedang'],
        ['Simulasi', 'Biologi', 'PGK', 'Manakah yang termasuk hewan mamalia? (kunci boleh lebih dari 1, pisah koma)', '', 'Paus', 'Ular', 'Kelelawar', 'Buaya', '', 'A,C', '10', 'Sedang'],
        ['Simulasi', 'Geografi', 'BS', 'Indonesia terletak di antara dua benua, yaitu Asia dan Australia.', '', 'Benar', 'Salah', '', '', '', 'Benar', '5', 'Mudah'],
        ['Simulasi', 'Biologi', 'Essay', 'Jelaskan proses terjadinya fotosintesis pada tumbuhan.', '', '', '', '', '', '', 'fotosintesis, klorofil, karbon dioksida', '15', 'Sedang'],
        ['', '', '', '(tambahkan baris baru di bawah sini, ikuti pola di atas)', '', '', '', '', '', '', '', '', '']
      ]);
  },

  // ---------------- TEMA ----------------
  isiFormTema(p) {
    document.getElementById('tema-primary').value = p.primary;
    document.getElementById('tema-secondary').value = p.secondary;
    document.getElementById('tema-accent').value = p.accent;
    document.getElementById('tema-bg').value = p.bg;
    document.getElementById('tema-text').value = p.text;
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
  },

  pakaiPalet(i) {
    const p = PALET_PRESET[i];
    Guru.isiFormTema(p);
    terapkanTema(p);
  },

  acakPalet() {
    const p = buatPaletAcak();
    Guru.isiFormTema(p);
    terapkanTema(p);
    toast('Palet warna acak diterapkan. Klik "Simpan Tema" untuk menyimpannya.', 'success');
  },

  async muatFormTema() {
    Guru.renderPaletPreset();
    const res = await api('getTema', { guruId: state.user.id });
    if (!res.ok) return;
    state.guru.tema = res.tema;
    Guru.isiFormTema(res.tema);
  },

  async simpanTema() {
    const tema = {
      primary: document.getElementById('tema-primary').value,
      secondary: document.getElementById('tema-secondary').value,
      accent: document.getElementById('tema-accent').value,
      bg: document.getElementById('tema-bg').value,
      text: document.getElementById('tema-text').value
    };
    const res = await api('simpanTema', { guruId: state.user.id, tema: JSON.stringify(tema) });
    if (res.ok) { terapkanTema(tema); toast('Tema tersimpan & diterapkan.', 'success'); }
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
  const KODE_BAKU = ['kuis', 'ulangan_harian', 'uts', 'uas'];
  const bersih = String(raw || 'kuis').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (KODE_BAKU.includes(bersih)) return bersih;
  if (bersih === 'ulanganharian' || bersih === 'harian') return 'ulangan_harian';
  if (bersih.indexOf('tengah') > -1) return 'uts';
  if (bersih.indexOf('akhir') > -1) return 'uas';
  return bersih || 'kuis';
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

  pilihJawabanTunggal(soalId, i) { state.jawaban[soalId] = i; simpanCacheLokal(); ExamEngine.renderSoal(); },
  toggleJawabanGanda(soalId, i) {
    const arr = state.jawaban[soalId] || [];
    const idx = arr.indexOf(i);
    if (idx === -1) arr.push(i); else arr.splice(idx, 1);
    state.jawaban[soalId] = arr; simpanCacheLokal(); ExamEngine.renderSoal();
  },
  pilihJodoh(soalId, i, val) {
    const jwb = state.jawaban[soalId] || {};
    jwb[i] = val; state.jawaban[soalId] = jwb; simpanCacheLokal(); ExamEngine.renderGridSoal();
  },
  isiJawabanUraian(soalId, val) { state.jawaban[soalId] = val; simpanCacheLokal(); ExamEngine.renderGridSoal(); },

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

  tampilkanHasil(nilai, lulus, judul) {
    UI.tampilkan('hasil-screen');
    document.getElementById('hasil-judul-ujian').textContent = judul;
    document.getElementById('hasil-nilai').textContent = nilai;
    const statusEl = document.getElementById('hasil-status');
    const isLulus = lulus === true || String(lulus) === 'true';
    statusEl.textContent = isLulus ? 'LULUS' : 'PERLU REMEDIAL';
    statusEl.style.background = isLulus ? 'rgba(22,163,74,.12)' : 'rgba(224,67,61,.12)';
    statusEl.style.color = isLulus ? 'var(--c-success)' : 'var(--c-danger)';
    document.getElementById('hasil-instruksi').textContent = isLulus ? 'Selamat! Anda telah menyelesaikan ujian ini.' : 'Silakan hubungi guru mata pelajaran untuk instruksi remedial.';

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
