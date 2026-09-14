/**
 * ============================================================================
 *  APLIKASI CBT — BACKEND (Google Apps Script)
 *  Fungsi sebagai REST-like API di atas Google Sheets sebagai database.
 * ============================================================================
 *  CARA DEPLOY (PERTAMA KALI):
 *  1. Buat Google Sheet baru (kosong), buka Extensions > Apps Script.
 *  2. Hapus isi default, tempel seluruh isi file ini ke Code.gs.
 *  3. Jalankan fungsi `setupAwal` sekali (Run > setupAwal) untuk membuat
 *     seluruh sheet, akun guru pertama, DAN trigger flush berkala (lihat
 *     "ARSITEKTUR SKALA" di bawah — WAJIB, bukan opsional). Izinkan semua
 *     permission yang diminta (termasuk izin trigger/otomatisasi).
 *  4. Deploy > New deployment > Type: Web app.
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  5. Salin URL Web App yang dihasilkan, tempel ke CONFIG.API_URL di app.js.
 *
 *  CARA UPDATE KODE INI DI KEMUDIAN HARI (mis. menambah kolom/fitur baru):
 *  1. Tempel/timpa seluruh isi Code.gs dengan versi baru.
 *  2. Deploy > Manage deployments > (ikon pensil) > Version: New version > Deploy.
 *  3. SELESAI untuk update kolom/fitur biasa — tidak perlu setupAwal lagi,
 *     dan TIDAK PERLU menambah kolom apa pun manual di Sheets (lihat "SKEMA
 *     OTOMATIS" di bawah).
 *
 *  ⚠️ KHUSUS UPDATE PERTAMA KALI KE VERSI INI (arsitektur cache+flush untuk
 *  skala 500+ siswa): setelah tempel & deploy versi baru, jalankan fungsi
 *  `pasangTriggerFlush_` SEKALI dari editor Apps Script (dropdown fungsi >
 *  pilih `pasangTriggerFlush_` > Run). Ini memasang trigger waktu (tiap 1
 *  menit) yang menuliskan data dari cache ke Sheets — TANPA trigger ini,
 *  jawaban/sesi siswa akan tersimpan di cache tapi TIDAK PERNAH masuk ke
 *  Sheets. Kalau lupa, cukup jalankan `setupAwal` lagi (aman, tidak
 *  menghapus data yang sudah ada) — itu juga memasang trigger yang sama.
 * ============================================================================
 *  SKEMA OTOMATIS — kolom baru tidak perlu ditambah manual di Sheets
 *  Daftar kolom tiap sheet didefinisikan SATU KALI di objek SCHEMA di bawah.
 *  Setiap ada request masuk (doGet/doPost), pastikanSkemaTerbaru_() otomatis
 *  membandingkan SCHEMA ini dengan header yang sudah ada di tiap sheet, dan
 *  menambahkan kolom yang belum ada ke ujung kanan sheet tsb (data lama tidak
 *  tersentuh/tergeser). Jadi kalau nanti mau menambah field baru:
 *    - Tambahkan nama kolomnya ke array SCHEMA sheet terkait di bawah ini.
 *    - Pakai field itu di action yang relevan (baca/tulis lewat nama kolom,
 *      seperti yang sudah dipakai di seluruh file ini — TIDAK perlu ubah
 *      readAll_/appendObj_/updateRowByFields_, semua sudah otomatis mengikuti
 *      nama kolom apa pun yang ada di header).
 *    - Redeploy ("New version"). Kolom baru otomatis muncul di Sheet saat
 *      permintaan pertama masuk — tidak perlu buka Sheets sama sekali.
 *  Pengecekan ini murah (dicache lewat properti skrip & hash isi SCHEMA), jadi
 *  aman dipanggil di setiap request tanpa membebani kuota secara berarti.
 * ============================================================================
 *  ARSITEKTUR SKALA — cache dulu, Sheets belakangan (untuk 500+ siswa bersamaan)
 *  Empat aksi yang paling sering dipanggil siswa (mulaiUjian, simpanJawaban/
 *  autosave tiap 20 detik, lapor pelanggaran, submitUjian) TIDAK LAGI langsung
 *  membaca/menulis Google Sheets satu per satu. Semuanya lewat CacheService
 *  dulu (super cepat, ~10-50ms, nyaris tidak pernah bentrok antar siswa karena
 *  tiap sesi punya kunci cache sendiri) — lihat fungsi ambilSesiState_ /
 *  simpanSesiState_ / tandaiPendingSesi_. Data yang tertunda itu baru
 *  benar-benar ditulis ke Sheets secara BERKALA & BERKELOMPOK (batch, paling
 *  banyak 2 operasi tulis per siklus, tidak peduil 5 atau 500 siswa) oleh
 *  flushSesiBerkala(), dipicu trigger waktu tiap 1 menit. Ping heartbeat
 *  (device lock) memakai pola yang sama lewat flushPingBerkala(). Hasilnya:
 *  500 siswa autosave/mulai/submit "bersamaan" tidak lagi berebut satu kunci
 *  global untuk operasi Sheets yang lambat (~0.5-2 detik) — nyaris semua
 *  request selesai dalam hitungan puluhan milidetik.
 *
 *  Konsekuensi yang perlu diketahui (trade-off yang disengaja & aman):
 *   - Ada jeda maksimal ~1 menit sebelum data "benar-benar" terlihat kalau
 *     guru membuka Google Sheets-nya langsung secara manual. Dari sisi
 *     aplikasi sendiri (rekap nilai, hasil ujian siswa) TIDAK ada jeda —
 *     semuanya membaca cache dulu (lihat actionGetHasil_), jadi tetap akurat
 *     & instan.
 *   - Kalau baru pertama kali pakai versi ini, WAJIB jalankan
 *     `pasangTriggerFlush_` sekali (lihat catatan di atas) — tanpa ini data
 *     akan menumpuk di cache dan tidak pernah masuk Sheets.
 *   - Sheet "Sesi" tetap punya baris sebanyak (jumlah siswa x jumlah ujian
 *     yang diikuti) — bukan tiap jawaban — jumlah baris tetap wajar.
 *   - Jika sekolah punya akun Google Workspace, quota eksekusi & concurrent
 *     lebih tinggi dibanding akun Gmail biasa — tetap disarankan untuk ujian
 *     skala besar, walau arsitektur ini sudah jauh mengurangi kebutuhannya.
 *   - Untuk skala JAUH lebih besar (ribuan siswa) atau butuh keandalan
 *     tingkat produksi, backend ini tetap bisa dimigrasikan ke Firebase/
 *     Supabase tanpa mengubah banyak di frontend (kontrak API sama).
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// KONFIGURASI
// ----------------------------------------------------------------------------
var SHEET = {
  GURU: 'Guru',
  SISWA: 'Siswa',
  BANK_SOAL: 'BankSoal',
  UJIAN: 'Ujian',
  SESI: 'Sesi',
  LOG: 'PelanggaranLog',
  CONFIG: 'Config'
};

// SATU-SATUNYA tempat mendefinisikan kolom tiap sheet. Menambah 1 nama di
// sini (lalu redeploy) = kolom itu otomatis tercipta di Sheets, tanpa perlu
// dibuka/diedit manual. Urutan array = urutan kolom untuk SHEET BARU; untuk
// sheet yang sudah ada, kolom yang belum ada akan ditambahkan di ujung kanan.
var SCHEMA = {
  Guru: ['id', 'username', 'password', 'nama', 'tema_json'],
  Siswa: ['id', 'username', 'password', 'nama', 'kelas', 'device_id', 'last_ping'],
  // 'tingkat_kesulitan' & 'subkategori' adalah CONTOH kolom yang ditambahkan lewat
  // mekanisme skema otomatis ini (lihat README bag. "Menambah kolom baru") — sudah
  // dipakai juga oleh index.html & app.js versi ini. 'subkategori' dipakai untuk
  // mengelompokkan soal dalam 1 kategori yang sama (mis. "Bab 1" vs "Bab 2" dalam
  // kategori "Ulangan Harian") supaya tidak tercampur saat memilih soal untuk ujian.
  // 'status' ('aktif'/'arsip') ditambahkan supaya soal yang dibuat tapi belum
  // dipakai bisa diarsipkan tanpa dihapus permanen (lihat README/UI "Kelola
  // Kategori" & tombol Arsipkan di Bank Soal). Kosong dianggap 'aktif'.
  // 'topik' (Topik/Kompetensi bebas diketik), 'audio' & 'video' (link media pendukung
  // soal, mis. untuk soal listening/video) ditambahkan lewat mekanisme skema otomatis
  // yang sama -- lihat README bag. "Menambah kolom baru" & tampilan "Kelola Soal".
  BankSoal: ['id', 'guru_id', 'kategori', 'subkategori', 'tipe', 'topik', 'pertanyaan', 'gambar', 'audio', 'video', 'opsi_json', 'kunci_json', 'bobot', 'tingkat_kesulitan', 'pembahasan', 'status', 'dibuat'],
  Ujian: ['id', 'guru_id', 'judul', 'kategori', 'subkategori', 'soal_ids', 'durasi_menit', 'token', 'mulai', 'selesai', 'toleransi_menit', 'max_pelanggaran', 'acak_soal', 'acak_opsi', 'nilai_lulus', 'status', 'instruksi_remedial'],
  // 'tambahan_detik' dipakai fitur "Pemantauan Ujian" (tombol "Tambah Waktu") --
  // jumlah detik ekstra yang diberikan guru ke satu sesi siswa tertentu, di luar
  // durasi_menit standar ujian. Kosong/0 berarti tidak ada tambahan.
  Sesi: ['id', 'ujian_id', 'siswa_id', 'device_id', 'mulai', 'selesai', 'status', 'pelanggaran', 'urutan_json', 'jawaban_json', 'ragu_json', 'nilai', 'lulus', 'last_ping', 'tambahan_detik'],
  PelanggaranLog: ['id', 'sesi_id', 'siswa_id', 'ujian_id', 'waktu', 'jenis'],
  Config: ['key', 'value']
};

var DEVICE_STALE_MINUTES = 15; // sesi dianggap "lepas" jika tidak ping selama ini (menit)
var CACHE = CacheService.getScriptCache();

// ----------------------------------------------------------------------------
// SKEMA OTOMATIS — lihat penjelasan panjang di komentar atas file.
// ----------------------------------------------------------------------------

// Dipanggil di awal setiap request (lihat route_). Sangat murah kalau tidak
// ada perubahan (1x baca properti skrip), dan hanya benar-benar menyentuh
// Sheets kalau isi SCHEMA di atas berubah sejak deploy terakhir.
function pastikanSkemaTerbaru_() {
  var props = PropertiesService.getScriptProperties();
  var versiSaatIni = hashSkema_();
  if (props.getProperty('schema_version') === versiSaatIni) return; // tidak ada perubahan skema, lewati
  terapkanSkema_();
  props.setProperty('schema_version', versiSaatIni);
}

// Hash otomatis dari isi SCHEMA — berubah sendiri begitu ada kolom/sheet baru
// ditambahkan di atas, TANPA perlu menaikkan nomor versi apa pun secara manual.
function hashSkema_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(SCHEMA));
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

// Benar-benar membuat sheet yang belum ada & menambahkan kolom yang belum ada
// di sheet yang sudah ada (append di ujung kanan, tidak mengubah data lama).
function terapkanSkema_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (nama) {
    pastikanSheetDanKolom_(ss, nama, SCHEMA[nama]);
  });
}

function pastikanSheetDanKolom_(ss, nama, headers) {
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    CacheService.getScriptCache().remove('headers_' + nama);
    return;
  }
  var lastCol = sh.getLastColumn();
  var headerSaatIni = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var kolomBaru = headers.filter(function (h) { return headerSaatIni.indexOf(h) === -1; });
  if (kolomBaru.length > 0) {
    sh.getRange(1, headerSaatIni.length + 1, 1, kolomBaru.length).setValues([kolomBaru]);
    CacheService.getScriptCache().remove('headers_' + nama); // header berubah -> cache lama jadi basi
    Logger.log('Kolom baru ditambahkan ke sheet "' + nama + '": ' + kolomBaru.join(', '));
  }
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
}

// Jalankan fungsi ini secara MANUAL dari editor Apps Script (dropdown fungsi
// di atas > pilih "paksaSinkronSkemaSekarang" > Run) kalau ingin memaksa
// pengecekan/penambahan kolom TERJADI SAAT INI JUGA, tanpa menunggu request
// pertama dari aplikasi (mis. untuk langsung memeriksa hasilnya di Sheets).
function paksaSinkronSkemaSekarang() {
  terapkanSkema_();
  PropertiesService.getScriptProperties().setProperty('schema_version', hashSkema_());
  Logger.log('Skema disinkronkan. Semua kolom di SCHEMA sudah dipastikan ada di tiap sheet.');
}

// ----------------------------------------------------------------------------
// SETUP AWAL — jalankan sekali secara manual dari editor Apps Script
// ----------------------------------------------------------------------------
function setupAwal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  terapkanSkema_();
  PropertiesService.getScriptProperties().setProperty('schema_version', hashSkema_());

  // Buat 1 akun guru contoh jika sheet Guru masih kosong
  var guruSheet = ss.getSheetByName(SHEET.GURU);
  if (guruSheet.getLastRow() < 2) {
    guruSheet.appendRow(['G001', 'admin', 'admin123', 'Administrator', JSON.stringify(defaultTema_())]);
  }

  // WAJIB untuk skala 500+ siswa bersamaan: trigger ini yang menuliskan
  // jawaban/sesi/ping dari cache ke Sheets secara berkala (tiap 1 menit).
  // Tanpa trigger ini, data akan menumpuk di cache & TIDAK PERNAH masuk ke
  // Sheets. Aman dijalankan berulang (trigger lama otomatis diganti).
  pasangTriggerFlush_();

  Logger.log('Setup selesai. Login guru default -> username: admin / password: admin123 (SEGERA GANTI).');
}

function defaultTema_() {
  return { primary: '#7c3aed', secondary: '#ec4899', accent: '#eab308', bg: '#faf7ff', text: '#211334' };
}

// ----------------------------------------------------------------------------
// ENTRY POINTS
// ----------------------------------------------------------------------------
function doGet(e) {
  try {
    var action = e.parameter.action;
    var data = e.parameter;
    return route_(action, data);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    return route_(body.action, body);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function route_(action, data) {
  pastikanSkemaTerbaru_(); // self-healing: tambahkan kolom baru dari SCHEMA jika belum ada
  var lock = LockService.getScriptLock();
  switch (action) {
    // --- AUTH ---
    case 'login': return actionLogin_(data);
    case 'logout': return actionLogout_(data);
    case 'ping': return actionPing_(data);

    // --- GURU: BANK SOAL ---
    case 'simpanSoal': return withLock_(lock, function () { return actionSimpanSoal_(data); });
    case 'importSoal': return withLock_(lock, function () { return actionImportSoal_(data); });
    case 'hapusSoal': return withLock_(lock, function () { return actionHapusSoal_(data); });
    case 'getBankSoal': return actionGetBankSoal_(data);

    // --- GURU: UJIAN ---
    case 'simpanUjian': return withLock_(lock, function () { return actionSimpanUjian_(data); });
    case 'hapusUjian': return withLock_(lock, function () { return actionHapusUjian_(data); });
    case 'getDaftarUjian': return actionGetDaftarUjian_(data);
    case 'getRekapNilai': return actionGetRekapNilai_(data);
    case 'hitungUlangNilaiUjian': return withLock_(lock, function () { return actionHitungUlangNilaiUjian_(data); });
    case 'getAnalisisSoal': return actionGetAnalisisSoal_(data);
    case 'getLogPelanggaran': return actionGetLogPelanggaran_(data);
    case 'resetDevice': return withLock_(lock, function () { return actionResetDevice_(data); });

    // --- GURU: PEMANTAUAN UJIAN (live monitoring) ---
    case 'getPemantauanUjian': return actionGetPemantauanUjian_(data);
    case 'pemantauanTambahWaktu': return withLock_(lock, function () { return actionPemantauanTambahWaktu_(data); });
    case 'pemantauanForceFinish': return withLock_(lock, function () { return actionPemantauanForceFinish_(data); });
    case 'pemantauanHapusPelanggaran': return withLock_(lock, function () { return actionPemantauanHapusPelanggaran_(data); });
    case 'pemantauanReset': return withLock_(lock, function () { return actionPemantauanReset_(data); });
    // Tombol "Kirim ke Spreadsheet" (opsi cadangan di sidebar guru): memaksa
    // seluruh sesi/ping yang masih tertahan di cache langsung ditulis ke
    // Sheets sekarang juga, tanpa menunggu trigger otomatis (maks. ~1 menit).
    case 'paksaFlushSesiSekarang': return actionPaksaFlushSesiSekarang_(data);

    // --- GURU: SISWA & TEMA ---
    case 'importSiswa': return withLock_(lock, function () { return actionImportSiswa_(data); });
    case 'updateSiswa': return withLock_(lock, function () { return actionUpdateSiswa_(data); });
    case 'hapusSiswa': return withLock_(lock, function () { return actionHapusSiswa_(data); });
    case 'hapusKelas': return withLock_(lock, function () { return actionHapusKelas_(data); });
    case 'getDaftarSiswa': return actionGetDaftarSiswa_(data);
    case 'updateAkunGuru': return withLock_(lock, function () { return actionUpdateAkunGuru_(data); });
    case 'simpanTema': return withLock_(lock, function () { return actionSimpanTema_(data); });
    case 'getTema': return actionGetTema_(data);
    case 'simpanBranding': return withLock_(lock, function () { return actionSimpanBranding_(data); });
    case 'getBranding': return actionGetBranding_(data);
    case 'uploadGambar': return actionUploadGambar_(data);

    // --- SISWA: UJIAN ---
    // CATATAN SKALA: mulaiUjian/simpanJawaban/lapor/submitUjian TIDAK lagi
    // dibungkus withLock_ di sini. Dulu setiap panggilan (autosave tiap 20
    // detik x 500 siswa) berebut SATU kunci global untuk baca-ubah-tulis
    // langsung ke Sheets (lambat, ~0.5-2 detik/operasi) -> gampang timeout
    // "Server sedang sibuk" saat banyak siswa bersamaan. Sekarang keempat
    // aksi ini menulis ke CacheService dulu (super cepat, hampir tidak
    // pernah bentrok karena tiap siswa punya kunci cache sendiri-sendiri),
    // lalu data itu benar-benar ditulis ke Sheets secara BERKALA & BERKELOMPOK
    // oleh flushSesiBerkala() (dipicu trigger tiap 1 menit, lihat
    // pasangTriggerFlush_ & README). Kunci global cuma dipakai sebentar sekali
    // (hitungan milidetik) untuk menjaga daftar "sesi yang perlu di-flush"
    // tetap konsisten -- lihat tandaiPendingSesi_.
    case 'cekToken': return actionCekToken_(data);
    case 'mulaiUjian': return actionMulaiUjian_(data);
    case 'simpanJawaban': return actionSimpanJawaban_(data);
    case 'lapor': return actionLapor_(data);
    case 'submitUjian': return actionSubmitUjian_(data);
    case 'getHasil': return actionGetHasil_(data);

    default: return jsonOut_({ ok: false, error: 'Aksi tidak dikenal: ' + action });
  }
}

function withLock_(lock, fn) {
  var got = lock.tryLock(8000);
  if (!got) return jsonOut_({ ok: false, error: 'Server sedang sibuk, silakan coba lagi.' });
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------------
// HELPERS SHEET
// ----------------------------------------------------------------------------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(name) { return ss_().getSheetByName(name); }

function readAll_(name) {
  var sh = sh_(name);
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function findRowIndexById_(name, id) {
  var sh = sh_(name);
  var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 0), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // 1-indexed + header
  }
  return -1;
}

function genId_(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0] + Date.now().toString(36).slice(-4);
}

function appendObj_(name, headers, obj) {
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sh_(name).appendRow(row);
}

function updateRowByFields_(name, headers, rowIndex, fields) {
  var sh = sh_(name);
  var current = sh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (h, i) {
    if (fields.hasOwnProperty(h)) current[i] = fields[h];
  });
  sh.getRange(rowIndex, 1, 1, headers.length).setValues([current]);
}

function headersOf_(name) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('headers_' + name);
  if (cached) return JSON.parse(cached);
  var headers = sh_(name).getRange(1, 1, 1, sh_(name).getLastColumn()).getValues()[0];
  cache.put('headers_' + name, JSON.stringify(headers), 21600);
  return headers;
}

// ----------------------------------------------------------------------------
// AUTH
// ----------------------------------------------------------------------------
function actionLogin_(data) {
  var role = data.role; // 'guru' | 'siswa'
  var username = String(data.username || '').trim();
  var password = String(data.password || '');
  var deviceId = String(data.deviceId || '');

  if (role === 'guru') {
    var guru = readAll_(SHEET.GURU).filter(function (g) { return g.username === username; })[0];
    if (!guru || String(guru.password) !== password) {
      return jsonOut_({ ok: false, error: 'Username atau password guru salah.' });
    }
    return jsonOut_({ ok: true, user: { id: guru.id, nama: guru.nama, username: guru.username, role: 'guru' } });
  }

  if (role === 'siswa') {
    var rows = readAll_(SHEET.SISWA);
    var idx = -1, siswa = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].username === username) { siswa = rows[i]; idx = i + 2; break; }
    }
    if (!siswa || String(siswa.password) !== password) {
      return jsonOut_({ ok: false, error: 'Username atau password siswa salah.' });
    }

    // --- single device session lock ---
    var now = new Date();
    var lastPing = siswa.last_ping ? new Date(siswa.last_ping) : null;
    var staleMs = DEVICE_STALE_MINUTES * 60 * 1000;
    var deviceLocked = siswa.device_id && lastPing && (now - lastPing) < staleMs && siswa.device_id !== deviceId;
    if (deviceLocked) {
      return jsonOut_({ ok: false, error: 'Akun ini sedang aktif di perangkat lain. Tutup sesi di perangkat tersebut atau tunggu beberapa menit, lalu coba lagi.' });
    }

    var headers = headersOf_(SHEET.SISWA);
    updateRowByFields_(SHEET.SISWA, headers, idx, { device_id: deviceId, last_ping: now.toISOString() });
    // Login jarang terjadi (sekali per sesi ujian, bukan tiap 20-60 detik
    // seperti autosave/ping) jadi tulis langsung ke Sheets di sini aman &
    // tidak jadi bottleneck. Cache device_id juga di-tulis di sini supaya
    // ping berikutnya (yang cache-first) langsung konsisten, tidak perlu
    // fallback baca Sheets dulu.
    CacheService.getScriptCache().put('siswa_device_' + siswa.id, deviceId, CACHE_TTL_DETIK);

    return jsonOut_({ ok: true, user: { id: siswa.id, nama: siswa.nama, kelas: siswa.kelas, role: 'siswa', deviceId: deviceId } });
  }

  return jsonOut_({ ok: false, error: 'Role tidak valid.' });
}

function actionLogout_(data) {
  if (data.role === 'siswa' && data.siswaId) {
    var idx = findRowIndexById_(SHEET.SISWA, data.siswaId);
    if (idx > 0) updateRowByFields_(SHEET.SISWA, headersOf_(SHEET.SISWA), idx, { device_id: '', last_ping: '' });
    CacheService.getScriptCache().remove('siswa_device_' + data.siswaId);
  }
  return jsonOut_({ ok: true });
}

// Dipanggil berkala oleh klien siswa (heartbeat, tiap 60 detik x bisa
// ratusan siswa sekaligus) supaya device lock tetap "hidup" & guru bisa
// melihat siapa yang online. Cache-first: cek/​perbarui device_id & last_ping
// lewat CacheService (cepat, tidak membebani Sheets), baru benar-benar
// ditulis ke Sheets secara berkala oleh flushPingBerkala() (lihat di atas).
function actionPing_(data) {
  if (data.role === 'siswa' && data.siswaId) {
    var cache = CacheService.getScriptCache();
    var kunciDevice = 'siswa_device_' + data.siswaId;
    var deviceTercatat = cache.get(kunciDevice);
    if (deviceTercatat === null) {
      // Belum ada di cache (mis. baru pertama kali sejak deploy/restart) ->
      // ambil sekali dari Sheets sebagai fallback, lalu simpan ke cache.
      var idx = findRowIndexById_(SHEET.SISWA, data.siswaId);
      if (idx > 0) {
        var headers = headersOf_(SHEET.SISWA);
        var row = sh_(SHEET.SISWA).getRange(idx, 1, 1, headers.length).getValues()[0];
        deviceTercatat = row[headers.indexOf('device_id')] || '';
      } else {
        deviceTercatat = '';
      }
      cache.put(kunciDevice, deviceTercatat, CACHE_TTL_DETIK);
    }
    if (deviceTercatat && data.deviceId && deviceTercatat !== data.deviceId) {
      return jsonOut_({ ok: false, error: 'Sesi diambil alih oleh perangkat lain.' });
    }
    tandaiPendingPing_(data.siswaId, { device_id: deviceTercatat || data.deviceId, last_ping: new Date().toISOString() });
  }
  return jsonOut_({ ok: true });
}

// ----------------------------------------------------------------------------
// GURU — BANK SOAL
// ----------------------------------------------------------------------------
function actionSimpanSoal_(data) {
  var headers = headersOf_(SHEET.BANK_SOAL);
  var soal = JSON.parse(data.soal);
  if (soal.id) {
    var idx = findRowIndexById_(SHEET.BANK_SOAL, soal.id);
    if (idx > 0) {
      updateRowByFields_(SHEET.BANK_SOAL, headers, idx, soal);
      return jsonOut_({ ok: true, id: soal.id });
    }
  }
  soal.id = genId_('S');
  soal.dibuat = new Date().toISOString();
  soal.status = soal.status || 'aktif';
  appendObj_(SHEET.BANK_SOAL, headers, soal);
  return jsonOut_({ ok: true, id: soal.id });
}

// data.soalList = JSON string array of soal objects (dari import CSV/XLSX di klien)
function actionImportSoal_(data) {
  var headers = headersOf_(SHEET.BANK_SOAL);
  var list = JSON.parse(data.soalList);
  var ids = [];
  list.forEach(function (soal) {
    soal.id = genId_('S');
    soal.dibuat = new Date().toISOString();
    soal.status = soal.status || 'aktif';
    appendObj_(SHEET.BANK_SOAL, headers, soal);
    ids.push(soal.id);
  });
  return jsonOut_({ ok: true, count: ids.length, ids: ids });
}

function actionHapusSoal_(data) {
  var idx = findRowIndexById_(SHEET.BANK_SOAL, data.id);
  if (idx > 0) sh_(SHEET.BANK_SOAL).deleteRow(idx);
  return jsonOut_({ ok: true });
}

// Perbandingan teks yang tidak sensitif huruf besar/kecil & spasi di pinggir —
// supaya soal hasil impor (mis. kategori tertulis "Kuis" atau "KUIS" di file)
// tetap cocok dengan kode kategori baku ("kuis") yang dipakai dropdown di klien.
function samaTeks_(a, b) {
  return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase();
}

function actionGetBankSoal_(data) {
  var list = readAll_(SHEET.BANK_SOAL);
  if (data.guruId) list = list.filter(function (s) { return s.guru_id === data.guruId; });
  if (data.kategori) list = list.filter(function (s) { return samaTeks_(s.kategori, data.kategori); });
  if (data.subkategori) list = list.filter(function (s) { return samaTeks_(s.subkategori, data.subkategori); });
  return jsonOut_({ ok: true, data: list });
}

// ----------------------------------------------------------------------------
// GURU — UJIAN
// ----------------------------------------------------------------------------
function actionSimpanUjian_(data) {
  var headers = headersOf_(SHEET.UJIAN);
  var ujian = JSON.parse(data.ujian);
  if (ujian.id) {
    var idx = findRowIndexById_(SHEET.UJIAN, ujian.id);
    if (idx > 0) {
      updateRowByFields_(SHEET.UJIAN, headers, idx, ujian);
      return jsonOut_({ ok: true, id: ujian.id });
    }
  }
  ujian.id = genId_('U');
  if (!ujian.token) ujian.token = Math.random().toString(36).slice(2, 8).toUpperCase();
  ujian.status = ujian.status || 'aktif';
  appendObj_(SHEET.UJIAN, headers, ujian);
  return jsonOut_({ ok: true, id: ujian.id, token: ujian.token });
}

function actionHapusUjian_(data) {
  var idx = findRowIndexById_(SHEET.UJIAN, data.id);
  if (idx > 0) sh_(SHEET.UJIAN).deleteRow(idx);
  return jsonOut_({ ok: true });
}

function actionGetDaftarUjian_(data) {
  var list = readAll_(SHEET.UJIAN);
  if (data.guruId) list = list.filter(function (u) { return u.guru_id === data.guruId; });
  return jsonOut_({ ok: true, data: list });
}

function actionGetRekapNilai_(data) {
  // PERBAIKAN BUG: sebelumnya baris di sini dipakai APA ADANYA dari Sheets/cache
  // gabungan tanpa disegarkan lagi -- padahal begitu siswa klik "Selesai",
  // simpanSesiState_ HANYA mengubah cache (supaya cepat & tidak membebani
  // Sheets) dan baru benar-benar ditulis ke Sheets oleh trigger flush 1 menit
  // kemudian. Kalau baris siswa itu SUDAH SEMPAT tersimpan ke Sheets sebelumnya
  // (mis. saat ia pertama kali klik "Mulai Ujian", saat itu statusnya masih
  // 'berlangsung'), maka baris di Sheets akan tetap berstatus 'berlangsung'
  // sampai flush berikutnya -- sehingga filter di bawah SALAH MEMBUANG siswa
  // ini dari rekap, walau ia sebenarnya sudah selesai & sudah dapat nilai.
  // Refresh per-baris lewat ambilSesiState_ (sama seperti actionGetPemantauanUjian_)
  // memastikan status & nilai yang dipakai selalu yang terbaru dari cache.
  var sesiList = bacaSesiGabunganUntukUjian_(data.ujianId)
    .map(function (baris) { return ambilSesiState_(baris.id) || baris; })
    .filter(function (s) { return s.status !== 'berlangsung'; });
  var siswaMap = {};
  readAll_(SHEET.SISWA).forEach(function (s) { siswaMap[s.id] = s; });
  var rekap = sesiList.map(function (s) {
    var siswa = siswaMap[s.siswa_id] || {};
    return {
      siswaId: s.siswa_id, nama: siswa.nama || '(tidak dikenal)', kelas: siswa.kelas || '-',
      nilai: s.nilai, lulus: s.lulus, pelanggaran: s.pelanggaran, mulai: s.mulai, selesai: s.selesai, status: s.status
    };
  });
  return jsonOut_({ ok: true, data: rekap });
}

// Menghitung ULANG nilai SEMUA sesi (status != 'berlangsung') di satu ujian,
// memakai jawaban yang SUDAH TERSIMPAN (tidak diubah) tapi lewat logika
// penilaian TERBARU di skorSoal_()/hitungNilai_() -- dipakai tombol
// "Hitung Ulang Nilai" di Portal Guru > Rekap Nilai, terutama berguna
// setelah perbaikan bug penilaian (mis. soal dengan opsi teracak yang
// sempat salah dinilai karena posisi tampil tidak diterjemahkan dulu ke
// indeks opsi asli sebelum dibandingkan dgn kunci jawaban -- lihat
// skorSoal_()). Memakai bacaSesiGabunganUntukUjian_ + ambilSesiState_ (sama
// seperti actionGetRekapNilai_) supaya sesi yang baru selesai tapi belum
// sempat di-flush ke Sheets ikut dihitung ulang dgn data terkininya. Hanya
// menulis ulang (lewat simpanSesiState_) kalau nilai/status lulus memang
// BERUBAH -- aman dipanggil berkali-kali tanpa efek samping tambahan, dan
// TIDAK menyentuh jawaban_json/urutan_json/status/tanggal selesai sama sekali.
function actionHitungUlangNilaiUjian_(data) {
  var sesiList = bacaSesiGabunganUntukUjian_(data.ujianId)
    .map(function (baris) { return ambilSesiState_(baris.id) || baris; })
    .filter(function (s) { return s.status !== 'berlangsung'; });

  var totalBerubah = 0;
  sesiList.forEach(function (s) {
    var jawaban = {};
    try { jawaban = JSON.parse(s.jawaban_json || '{}'); } catch (e) {}
    var hasil = hitungNilai_(s, jawaban);
    if (Number(s.nilai) !== Number(hasil.nilai) || String(s.lulus) !== String(hasil.lulus)) {
      simpanSesiState_(s.id, { nilai: hasil.nilai, lulus: hasil.lulus });
      totalBerubah++;
    }
  });

  return jsonOut_({ ok: true, totalDiperiksa: sesiList.length, totalBerubah: totalBerubah });
}

// ----------------------------------------------------------------------------
// GURU — ANALISIS SOAL & JAWABAN SISWA
// ----------------------------------------------------------------------------
// Untuk 1 ujian: (a) analisis tiap BUTIR SOAL -- persentase peserta yang
// menjawab benar, dan dari situ diturunkan label "mudah/sedang/sulit" secara
// otomatis (konvensi umum analisis butir soal / p-value: >=70% mudah, 40-70%
// sedang, <40% sulit) -- dan (b) matriks JAWABAN tiap siswa per soal (benar/
// sebagian benar/salah/kosong), supaya guru bisa melihat pola kesalahan.
// Hanya sesi yang SUDAH SELESAI (status != 'berlangsung') yang dihitung --
// sama seperti actionGetRekapNilai_ -- karena jawaban yang masih dikerjakan
// belum final.
function actionGetAnalisisSoal_(data) {
  var ujian = readAll_(SHEET.UJIAN).filter(function (u) { return u.id === data.ujianId; })[0];
  if (!ujian) return jsonOut_({ ok: false, error: 'Ujian tidak ditemukan.' });

  var soalIds = String(ujian.soal_ids || '').split(',').filter(Boolean);
  var soalMap = {};
  readAll_(SHEET.BANK_SOAL).forEach(function (s) { soalMap[s.id] = s; });
  var siswaMap = {};
  readAll_(SHEET.SISWA).forEach(function (s) { siswaMap[s.id] = s; });
  var sesiList = bacaSesiGabunganUntukUjian_(data.ujianId)
    .map(function (baris) { return ambilSesiState_(baris.id) || baris; }) // lihat catatan PERBAIKAN BUG di actionGetRekapNilai_
    .filter(function (s) { return s.status !== 'berlangsung'; });
  var totalPeserta = sesiList.length;

  var agregat = {}; // soalId -> {benar, sebagian, salah, kosong}
  soalIds.forEach(function (sid) { agregat[sid] = { benar: 0, sebagian: 0, salah: 0, kosong: 0 }; });

  var jawabanSiswa = sesiList.map(function (sesi) {
    var siswa = siswaMap[sesi.siswa_id] || {};
    var jawaban = {};
    try { jawaban = JSON.parse(sesi.jawaban_json || '{}'); } catch (e) {}
    var urutanSesi = {};
    try { urutanSesi = JSON.parse(sesi.urutan_json || '{}'); } catch (e) {}
    var opsiAcakMap = urutanSesi.opsiAcak || {};

    var detail = {};
    soalIds.forEach(function (sid) {
      var soal = soalMap[sid];
      if (!soal) { detail[sid] = 'na'; return; }
      var jwb = jawaban[sid];
      var kosong = (jwb === undefined || jwb === null || jwb === '' || (Array.isArray(jwb) && jwb.length === 0));
      if (kosong) {
        detail[sid] = 'kosong';
        agregat[sid].kosong++;
        return;
      }
      var bobot = Number(soal.bobot) || 0;
      var skor = skorSoal_(soal, jwb, opsiAcakMap[sid]);
      var status;
      if (bobot > 0 && skor >= bobot - 0.001) { status = 'benar'; agregat[sid].benar++; }
      else if (skor > 0) { status = 'sebagian'; agregat[sid].sebagian++; }
      else { status = 'salah'; agregat[sid].salah++; }
      detail[sid] = status;
    });

    return {
      siswaId: sesi.siswa_id, nama: siswa.nama || '(tidak dikenal)', kelas: siswa.kelas || '-',
      nilai: sesi.nilai, lulus: sesi.lulus, jawabanDetail: detail
    };
  });

  var analisisSoal = soalIds.map(function (sid, i) {
    var soal = soalMap[sid];
    var agg = agregat[sid];
    var persenBenar = totalPeserta > 0 ? Math.round((agg.benar / totalPeserta) * 1000) / 10 : 0;
    var kesulitanOtomatis;
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
      persenBenar: persenBenar, kesulitanOtomatis: kesulitanOtomatis
    };
  });

  return jsonOut_({ ok: true, totalPeserta: totalPeserta, soal: analisisSoal, siswa: jawabanSiswa });
}

function actionGetLogPelanggaran_(data) {
  var logs = readAll_(SHEET.LOG);
  if (data.ujianId) logs = logs.filter(function (l) { return l.ujian_id === data.ujianId; });
  return jsonOut_({ ok: true, data: logs });
}

function actionResetDevice_(data) {
  var idx = findRowIndexById_(SHEET.SISWA, data.siswaId);
  if (idx > 0) updateRowByFields_(SHEET.SISWA, headersOf_(SHEET.SISWA), idx, { device_id: '', last_ping: '' });
  // Penting: cache device_id juga harus dikosongkan, kalau tidak ping
  // berikutnya dari siswa itu akan tetap membaca device_id LAMA dari cache
  // (bukan dari Sheets yang baru saja direset di atas) dan lock-nya seolah
  // tidak pernah direset.
  CacheService.getScriptCache().remove('siswa_device_' + data.siswaId);
  return jsonOut_({ ok: true });
}

// ----------------------------------------------------------------------------
// GURU — PEMANTAUAN UJIAN (live monitoring)
// ----------------------------------------------------------------------------
// Menampilkan daftar siswa yang sedang/​sudah mengerjakan 1 ujian tertentu,
// lengkap dengan sisa waktu, jumlah pelanggaran, dan jumlah soal yang sudah
// terjawab -- serta aksi guru: reset (ulang dari awal), tambah waktu, selesaikan
// paksa, dan hapus pelanggaran (buka blokir tanpa mengulang dari awal).
//
// Sengaja membaca state lewat ambilSesiState_ (cache-first, sama seperti jalur
// siswa) supaya angkanya benar-benar terkini untuk sesi yang sedang aktif --
// bukan menunggu hingga 1 menit flush berkala seperti kalau guru buka Sheets
// manual. readAll_(SESI) di sini hanya dipakai untuk mendapatkan DAFTAR sesi
// (baris mana saja yang ada), bukan sebagai sumber angka pelanggaran/jawaban.
function actionGetPemantauanUjian_(data) {
  var ujian = readAll_(SHEET.UJIAN).filter(function (u) { return u.id === data.ujianId; })[0];
  if (!ujian) return jsonOut_({ ok: false, error: 'Ujian tidak ditemukan.' });

  var sesiList = bacaSesiGabunganUntukUjian_(data.ujianId);
  var siswaMap = {};
  readAll_(SHEET.SISWA).forEach(function (s) { siswaMap[s.id] = s; });

  var durasiMs = (Number(ujian.durasi_menit) || 0) * 60000;
  var now = new Date();

  var hasil = sesiList.map(function (baris) {
    var s = ambilSesiState_(baris.id) || baris; // ambil versi terbaru (cache-first)
    var siswa = siswaMap[s.siswa_id] || {};

    var urutan = {};
    try { urutan = JSON.parse(s.urutan_json || '{}'); } catch (e) {}
    var totalSoal = (urutan.order || []).length;

    var jawaban = {};
    try { jawaban = JSON.parse(s.jawaban_json || '{}'); } catch (e) {}
    var terjawab = Object.keys(jawaban).filter(function (k) {
      var v = jawaban[k];
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
    }).length;

    var sisaDetik = null;
    if (s.status === 'berlangsung' && s.mulai) {
      var tambahanMs = (Number(s.tambahan_detik) || 0) * 1000;
      var sisaMs = durasiMs + tambahanMs - (now - new Date(s.mulai));
      sisaDetik = Math.max(Math.floor(sisaMs / 1000), 0);
    }

    return {
      sesiId: s.id, siswaId: s.siswa_id, nama: siswa.nama || '(tidak dikenal)', kelas: siswa.kelas || '-',
      status: s.status, pelanggaran: Number(s.pelanggaran) || 0,
      terjawab: terjawab, totalSoal: totalSoal, sisaDetik: sisaDetik,
      tambahanDetik: Number(s.tambahan_detik) || 0, mulai: s.mulai, selesai: s.selesai,
      nilai: s.nilai, lulus: s.lulus
    };
  });

  return jsonOut_({ ok: true, data: hasil, maxPelanggaran: Number(ujian.max_pelanggaran) || 999 });
}

// Menambah waktu ekstra untuk SATU sesi siswa (menit bisa negatif untuk mengurangi,
// tapi hasil akhir tidak dipaksa >= 0 di sini -- sisa waktu tetap dihitung normal
// oleh klien/actionMulaiUjian_, jadi kalau jadi negatif ujian otomatis dianggap habis).
function actionPemantauanTambahWaktu_(data) {
  var state = ambilSesiState_(data.sesiId);
  if (!state) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  var tambahanBaru = (Number(state.tambahan_detik) || 0) + (Number(data.menit) || 0) * 60;
  state = simpanSesiState_(data.sesiId, { tambahan_detik: tambahanBaru });
  return jsonOut_({ ok: true, tambahanDetik: tambahanBaru });
}

// Menyelesaikan sesi SEKARANG JUGA memakai jawaban yang sudah tersimpan sejauh
// ini (autosave terakhir) -- dipakai kalau guru perlu memaksa seorang siswa
// selesai (mis. waktu ujian sudah lewat tapi siswa tidak kunjung submit).
function actionPemantauanForceFinish_(data) {
  var state = ambilSesiState_(data.sesiId);
  if (!state) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  if (state.status === 'selesai') return jsonOut_({ ok: true, sudahSelesai: true, nilai: state.nilai, lulus: state.lulus });
  var jawaban = JSON.parse(state.jawaban_json || '{}');
  var hasil = hitungNilai_(state, jawaban);
  simpanSesiState_(data.sesiId, {
    status: 'selesai', selesai: new Date().toISOString(), nilai: hasil.nilai, lulus: hasil.lulus
  });
  return jsonOut_({ ok: true, nilai: hasil.nilai, lulus: hasil.lulus });
}

// Menghapus SEMUA pelanggaran sesi ini (kembali ke 0). Kalau sesi sedang
// "diblokir" (terkena force-submit otomatis akibat pelanggaran mencapai batas),
// sekalian dibuka kembali jadi "berlangsung" -- jawaban, urutan soal, dan waktu
// mulai TIDAK diubah, jadi begitu siswa membuka lagi (mulaiUjian), ia lanjut
// persis dari soal terakhir yang dikerjakan, TANPA perlu mengulang dari awal.
function actionPemantauanHapusPelanggaran_(data) {
  var state = ambilSesiState_(data.sesiId);
  if (!state) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  var perubahan = { pelanggaran: 0 };
  if (state.status === 'diblokir') {
    perubahan.status = 'berlangsung';
    perubahan.selesai = '';
    perubahan.nilai = '';
    perubahan.lulus = '';
  }
  state = simpanSesiState_(data.sesiId, perubahan);
  return jsonOut_({ ok: true, status: state.status });
}

// Reset TOTAL sebuah sesi (ulang dari awal): sesi dihapus sepenuhnya (cache +
// baris di Sheets), termasuk peta cache "siswa+ujian -> sesiId" -- supaya lain
// kali siswa itu membuka ujian ini, actionMulaiUjian_ menganggapnya BELUM PERNAH
// mengerjakan (soal diacak ulang, jawaban kosong, timer mulai dari 0 lagi).
// Beda dengan "Hapus Pelanggaran" di atas yang mempertahankan progres siswa.
function actionPemantauanReset_(data) {
  var state = ambilSesiState_(data.sesiId);
  if (!state) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  var cache = CacheService.getScriptCache();
  cache.remove(sesiCacheKey_(data.sesiId));
  cache.remove('map_sesi_' + state.ujian_id + '_' + state.siswa_id);
  var idx = findRowIndexById_(SHEET.SESI, data.sesiId);
  if (idx > 0) sh_(SHEET.SESI).deleteRow(idx);
  return jsonOut_({ ok: true });
}

// ----------------------------------------------------------------------------
// GURU — SISWA & TEMA
// ----------------------------------------------------------------------------
// data.siswaList = JSON string array [{username,password,nama,kelas}]
function actionImportSiswa_(data) {
  var headers = headersOf_(SHEET.SISWA);
  var list = JSON.parse(data.siswaList);
  var ids = [];
  list.forEach(function (s) {
    s.id = genId_('SW');
    s.device_id = '';
    s.last_ping = '';
    appendObj_(SHEET.SISWA, headers, s);
    ids.push(s.id);
  });
  return jsonOut_({ ok: true, count: ids.length });
}

function actionGetDaftarSiswa_(data) {
  var list = readAll_(SHEET.SISWA).map(function (s) {
    // deviceId & lastPing disertakan (bukan cuma flag online) supaya tab "Status
    // Login" guru bisa menampilkan perangkat mana yang sedang mengunci akun ini,
    // dan sejak kapan -- tanpa keduanya, guru cuma tahu "online/tidak" tanpa detail.
    return {
      id: s.id, username: s.username, password: s.password, nama: s.nama, kelas: s.kelas,
      online: !!s.device_id, deviceId: s.device_id || '', lastPing: s.last_ping || ''
    };
  });
  if (data.kelas) list = list.filter(function (s) { return s.kelas === data.kelas; });
  return jsonOut_({ ok: true, data: list });
}

// data.siswa = JSON string {id, username, password, nama, kelas}
function actionUpdateSiswa_(data) {
  var headers = headersOf_(SHEET.SISWA);
  var siswa = JSON.parse(data.siswa);
  var idx = findRowIndexById_(SHEET.SISWA, siswa.id);
  if (idx < 0) return jsonOut_({ ok: false, error: 'Siswa tidak ditemukan.' });
  updateRowByFields_(SHEET.SISWA, headers, idx, siswa);
  return jsonOut_({ ok: true });
}

function actionHapusSiswa_(data) {
  var idx = findRowIndexById_(SHEET.SISWA, data.id);
  if (idx > 0) sh_(SHEET.SISWA).deleteRow(idx);
  return jsonOut_({ ok: true });
}

// Hapus semua siswa dalam satu kelas sekaligus (mis. hapus seluruh "9A").
function actionHapusKelas_(data) {
  var kelas = String(data.kelas || '');
  if (!kelas) return jsonOut_({ ok: false, error: 'Nama kelas tidak boleh kosong.' });
  var sheet = sh_(SHEET.SISWA);
  var headers = headersOf_(SHEET.SISWA);
  var kelasCol = headers.indexOf('kelas') + 1;
  var values = sheet.getDataRange().getValues();
  var dihapus = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][kelasCol - 1]) === kelas) { sheet.deleteRow(i + 1); dihapus++; }
  }
  return jsonOut_({ ok: true, count: dihapus });
}

// data: { guruId, passwordLama, username, password (opsional, kosongkan jika tidak diganti), nama }
function actionUpdateAkunGuru_(data) {
  var idx = findRowIndexById_(SHEET.GURU, data.guruId);
  if (idx < 0) return jsonOut_({ ok: false, error: 'Akun guru tidak ditemukan.' });
  var headers = headersOf_(SHEET.GURU);
  var row = sh_(SHEET.GURU).getRange(idx, 1, 1, headers.length).getValues()[0];
  var current = {};
  headers.forEach(function (h, i) { current[h] = row[i]; });

  if (String(current.password) !== String(data.passwordLama || '')) {
    return jsonOut_({ ok: false, error: 'Password saat ini salah.' });
  }

  var usernameBaru = String(data.username || '').trim();
  if (!usernameBaru) return jsonOut_({ ok: false, error: 'Username tidak boleh kosong.' });

  var dipakaiGuruLain = readAll_(SHEET.GURU).some(function (g) {
    return g.username === usernameBaru && String(g.id) !== String(data.guruId);
  });
  if (dipakaiGuruLain) return jsonOut_({ ok: false, error: 'Username sudah dipakai akun guru lain.' });

  var fields = { username: usernameBaru, nama: String(data.nama || current.nama) };
  if (data.password) fields.password = String(data.password);
  updateRowByFields_(SHEET.GURU, headers, idx, fields);

  return jsonOut_({ ok: true, user: { id: data.guruId, nama: fields.nama, role: 'guru', username: usernameBaru } });
}

function actionSimpanTema_(data) {
  var idx = findRowIndexById_(SHEET.GURU, data.guruId);
  if (idx > 0) updateRowByFields_(SHEET.GURU, headersOf_(SHEET.GURU), idx, { tema_json: data.tema });
  return jsonOut_({ ok: true });
}

function actionGetTema_(data) {
  var guru = readAll_(SHEET.GURU)[0]; // 1 sekolah = 1 tema aktif (bisa dikembangkan per-guru)
  if (data.guruId) {
    var found = readAll_(SHEET.GURU).filter(function (g) { return g.id === data.guruId; })[0];
    if (found) guru = found;
  }
  var tema = defaultTema_();
  try { if (guru && guru.tema_json) tema = JSON.parse(guru.tema_json); } catch (e) {}
  return jsonOut_({ ok: true, tema: tema });
}

// Upload gambar soal (atau logo aplikasi, dsb.) ke Google Drive (base64 dari
// klien) -> mengembalikan URL publik. data.folder opsional (default folder
// gambar soal lama) supaya file logo bisa dipisah ke foldernya sendiri tanpa
// perlu endpoint baru.
function actionUploadGambar_(data) {
  var namaFolder = data.folder ? String(data.folder) : 'CBT_Gambar_Soal';
  var folder = getOrCreateFolder_(namaFolder);
  var bytes = Utilities.base64Decode(data.base64);
  var blob = Utilities.newBlob(bytes, data.mimeType, data.filename);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // CATATAN: sejak awal 2024 Google mematikan pola lama "uc?export=view&id=..." untuk
  // hotlink <img src> lintas domain (lihat https://issuetracker.google.com/issues/319531488) --
  // pola itu sekarang tampil sebagai ikon "gambar rusak" di browser siswa/guru. Pola pengganti
  // yang masih berfungsi adalah "thumbnail?id=...&sz=...".
  var url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  return jsonOut_({ ok: true, url: url });
}

// ----------------------------------------------------------------------------
// IDENTITAS APLIKASI (Logo & Nama CBT) — 1 sekolah = 1 identitas aktif,
// dipakai otomatis di Portal Guru maupun Portal Siswa (termasuk sebelum
// login). Disimpan di sheet "Config" (key/value) yang memang sudah ada di
// SCHEMA sejak awal tapi belum dipakai fitur apa pun -- jadi TIDAK perlu
// kolom/sheet baru maupun redeploy khusus untuk memakai fitur ini.
// ----------------------------------------------------------------------------
function getConfigValue_(key) {
  var row = readAll_(SHEET.CONFIG).filter(function (r) { return String(r.key) === String(key); })[0];
  return row ? row.value : '';
}

function setConfigValue_(key, value) {
  var headers = headersOf_(SHEET.CONFIG);
  var sh = sh_(SHEET.CONFIG);
  // Cek jumlah baris data dulu sebelum memakai findRowIndexById_ -- kalau
  // sheet Config masih kosong (cuma baris header, mis. baru pertama kali
  // dipakai lewat fitur ini), getRange(2,...) di findRowIndexById_ akan
  // error "number of rows... must be at least 1" karena tidak ada baris
  // ke-2 sama sekali. Di sini cukup anggap belum ada baris cocok (idx -1)
  // supaya langsung ditambahkan sebagai baris baru, tanpa mengubah
  // findRowIndexById_ itu sendiri (dipakai banyak fitur lain yang sudah
  // berjalan normal).
  var idx = sh.getLastRow() >= 2 ? findRowIndexById_(SHEET.CONFIG, key) : -1; // kolom pertama (key) dipakai sebagai pencocok baris
  if (idx > 0) {
    updateRowByFields_(SHEET.CONFIG, headers, idx, { value: value });
  } else {
    appendObj_(SHEET.CONFIG, headers, { key: key, value: value });
  }
}

function actionGetBranding_(data) {
  return jsonOut_({
    ok: true,
    branding: {
      namaAplikasi: getConfigValue_('nama_aplikasi') || '',
      logoUrl: getConfigValue_('logo_url') || ''
    }
  });
}

function actionSimpanBranding_(data) {
  setConfigValue_('nama_aplikasi', String(data.namaAplikasi || '').trim());
  setConfigValue_('logo_url', String(data.logoUrl || ''));
  return jsonOut_({ ok: true });
}

function getOrCreateFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

// ----------------------------------------------------------------------------
// SKALA: STATE SESI VIA CACHE + FLUSH BERKALA
// ----------------------------------------------------------------------------
// Inti perbaikan supaya tahan 500+ siswa bersamaan: baca/tulis sesi TIDAK lagi
// langsung ke Google Sheets di jalur yang sering dipanggil (autosave jawaban
// tiap 20 detik, mulai ujian, lapor pelanggaran, submit). Semua itu sekarang
// membaca/menulis ke CacheService (super cepat, ~10-50ms, dan HAMPIR TIDAK
// PERNAH bentrok antar siswa karena tiap sesi punya kuncinya sendiri:
// 'sesi_state_<id>'). Data itu baru benar-benar ditulis ke Sheets secara
// BERKALA & BERKELOMPOK (batch) oleh flushSesiBerkala(), dipicu oleh trigger
// waktu tiap 1 menit (lihat pasangTriggerFlush_). Jadi 500 siswa yang
// autosave "bersamaan" cukup 1x tulis batch ke Sheets/menit, bukan 500x
// tulis satu-satu yang berebut kunci.
//
// Konsekuensi yang perlu diketahui (trade-off yang disengaja):
//  - Ada jeda maksimal ~1 menit sebelum jawaban/skor "benar-benar" muncul di
//    Google Sheets (kalau guru buka Sheets-nya langsung). Siswa sendiri TIDAK
//    terpengaruh — getHasil/getRekapNilai membaca cache dulu, jadi tetap
//    akurat & instan dari sisi siswa maupun saat guru buka rekap di aplikasi.
//  - Cache Apps Script bertahan maksimal 6 jam. Untuk ujian yang jauh lebih
//    panjang dari itu (jarang terjadi), sebaiknya biarkan flush berjalan
//    normal (tiap 1 menit) supaya data keburu masuk Sheets sebelum cache
//    kadaluarsa -- ini otomatis terjadi selama trigger tetap aktif, tidak
//    perlu tindakan tambahan.
// ----------------------------------------------------------------------------

var CACHE_TTL_DETIK = 21600; // 6 jam — maksimum yang diizinkan CacheService

function sesiCacheKey_(sesiId) { return 'sesi_state_' + sesiId; }

// Ambil state sesi TERBARU yang diketahui sistem: dari cache kalau ada
// (paling sering, karena sesi yang sedang aktif selalu di-cache), atau dari
// Sheets sebagai fallback (mis. sesi lama yang cache-nya sudah kadaluarsa,
// atau baru saja restart) -- ini jalur DINGIN, jarang terjadi, jadi linear
// scan di findRowIndexById_ tidak masalah di sini.
function ambilSesiState_(sesiId) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(sesiCacheKey_(sesiId));
  if (cached) return JSON.parse(cached);
  var idx = findRowIndexById_(SHEET.SESI, sesiId);
  if (idx < 1) return null;
  var headers = headersOf_(SHEET.SESI);
  var row = sh_(SHEET.SESI).getRange(idx, 1, 1, headers.length).getValues()[0];
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = row[i]; });
  cache.put(sesiCacheKey_(sesiId), JSON.stringify(obj), CACHE_TTL_DETIK);
  return obj;
}

// Gabungkan `perubahan` ke state sesi yang sudah ada (atau buat baru kalau
// belum ada), simpan ke cache, lalu tandai sesi ini perlu di-flush ke Sheets.
// TIDAK menyentuh Sheets sama sekali -> ini yang membuatnya cepat & tidak
// gampang bentrok walau dipanggil ratusan kali per detik dari siswa berbeda.
function simpanSesiState_(sesiId, perubahan) {
  var current = ambilSesiState_(sesiId) || { id: sesiId };
  var updated = Object.assign({}, current, perubahan, { id: sesiId });
  CacheService.getScriptCache().put(sesiCacheKey_(sesiId), JSON.stringify(updated), CACHE_TTL_DETIK);
  tandaiPendingSesi_(sesiId);
  return updated;
}

// PERBAIKAN BUG: menggabungkan baris Sesi dari Sheets dengan sesi yang BARU
// DIBUAT (siswa baru saja klik "Mulai Ujian") tapi belum sempat di-flush ke
// Sheets oleh flushSesiBerkala() (jeda hingga 1 menit, lihat tandaiPendingSesi_).
// Tanpa fungsi ini, sesi yang benar-benar baru TIDAK PUNYA baris fisik di
// Sheets sama sekali, sehingga readAll_(SHEET.SESI) tidak menemukannya --
// akibatnya Pemantauan Ujian/Rekap Nilai/Analisis Soal salah menampilkan
// "belum ada siswa yang mengerjakan/menyelesaikan" padahal sebenarnya sudah
// ada siswa yang aktif mengerjakan (datanya cuma masih di cache).
// Dipakai oleh actionGetPemantauanUjian_, actionGetRekapNilai_, dan
// actionGetAnalisisSoal_ sebagai pengganti readAll_(SHEET.SESI).filter(...).
function bacaSesiGabunganUntukUjian_(ujianId) {
  var sesiList = readAll_(SHEET.SESI).filter(function (s) { return s.ujian_id === ujianId; });
  var idSudahAda = {};
  sesiList.forEach(function (s) { idSudahAda[s.id] = true; });

  var raw = CacheService.getScriptCache().get('pending_sesi_ids');
  var pendingIds = raw ? JSON.parse(raw) : [];
  pendingIds.forEach(function (id) {
    if (idSudahAda[id]) return; // sudah punya baris (tinggal di-update, bukan baris baru) -> nanti tetap disegarkan lewat ambilSesiState_ oleh pemanggil
    var state = ambilSesiState_(id);
    if (state && state.ujian_id === ujianId) { sesiList.push(state); idSudahAda[id] = true; }
  });
  return sesiList;
}

// Menambahkan sesiId ke daftar "perlu di-flush" (daftar ID saja, bukan
// datanya -> tetap kecil walau ribuan sesi, jauh di bawah batas 100KB per
// key CacheService). Pakai kunci global, TAPI critical section-nya sangat
// singkat (cuma baca-tambah-tulis satu array kecil di cache, hitungan
// milidetik) -- beda jauh dari dulu yang menahan kunci selama baca-ubah-tulis
// ke Sheets (ratusan ms - detik). Kalau (sangat jarang) gagal dapat kunci
// dalam 5 detik, TIDAK dianggap error ke siswa: state terbarunya tetap aman
// tersimpan di cache (baris di atas), dan otomatis ikut ke-flush di
// kesempatan berikutnya begitu ada aksi lain yang berhasil menandai sesi ini
// (mis. autosave berikutnya 20 detik kemudian) -- jadi self-healing, tidak
// ada data yang hilang, cuma mungkin telat 1 siklus flush.
function tandaiPendingSesi_(sesiId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get('pending_sesi_ids');
    var ids = raw ? JSON.parse(raw) : [];
    if (ids.indexOf(sesiId) === -1) ids.push(sesiId);
    cache.put('pending_sesi_ids', JSON.stringify(ids), CACHE_TTL_DETIK);
  } finally {
    lock.releaseLock();
  }
}

// Dipanggil oleh trigger waktu tiap 1 menit (lihat pasangTriggerFlush_).
// Menulis SEMUA perubahan sesi yang tertunda ke Sheets dalam PALING BANYAK 2
// operasi tulis (satu untuk baris yang sudah ada, satu lagi untuk baris
// baru) -- tidak peduli apakah itu untuk 5 siswa atau 500 siswa sekaligus.
function flushSesiBerkala() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return; // sedang diproses siklus lain / sibuk -> coba lagi 1 menit berikutnya
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get('pending_sesi_ids');
    if (!raw) return;
    var ids = JSON.parse(raw);
    // Kosongkan antrean SEKARANG (sebelum diproses) -- perubahan baru yang
    // masuk SELAMA proses flush ini berjalan akan otomatis membuat antrean
    // baru lagi lewat tandaiPendingSesi_, jadi tidak akan pernah hilang.
    cache.remove('pending_sesi_ids');
    if (!ids || ids.length === 0) return;

    var sh = sh_(SHEET.SESI);
    var headers = headersOf_(SHEET.SESI);
    var lastRow = sh.getLastRow();
    var jumlahBaris = Math.max(lastRow - 1, 0);
    var data = jumlahBaris > 0 ? sh.getRange(2, 1, jumlahBaris, headers.length).getValues() : [];
    var idCol = headers.indexOf('id');
    var peta = {};
    data.forEach(function (row, i) { peta[String(row[idCol])] = i; });

    var barisBaru = [];
    ids.forEach(function (id) {
      var stateRaw = cache.get(sesiCacheKey_(id));
      if (!stateRaw) return; // sudah kadaluarsa dari cache, lewati (data lama di Sheets tetap dipakai)
      var obj = JSON.parse(stateRaw);
      var row = headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
      if (peta.hasOwnProperty(id)) {
        data[peta[id]] = row; // update baris yang sudah ada, di memori dulu
      } else {
        barisBaru.push(row); // sesi baru, belum pernah ada barisnya di Sheets
      }
    });

    if (data.length > 0) sh.getRange(2, 1, data.length, headers.length).setValues(data);
    if (barisBaru.length > 0) sh.getRange(2 + data.length, 1, barisBaru.length, headers.length).setValues(barisBaru);
  } finally {
    lock.releaseLock();
  }
}

// --- Heartbeat/ping siswa: pola yang sama (cache dulu, flush berkala) ---
// khusus untuk kolom device_id & last_ping di sheet Siswa, supaya ping tiap
// 60 detik x 500 siswa juga tidak membebani Sheets satu-satu.
function pingCacheKey_(siswaId) { return 'ping_state_' + siswaId; }

function tandaiPendingPing_(siswaId, perubahan) {
  var cache = CacheService.getScriptCache();
  var current = cache.get(pingCacheKey_(siswaId));
  var obj = current ? JSON.parse(current) : {};
  Object.assign(obj, perubahan);
  cache.put(pingCacheKey_(siswaId), JSON.stringify(obj), CACHE_TTL_DETIK);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return; // best-effort, self-healing lewat ping berikutnya (60 detik lagi)
  try {
    var raw = cache.get('pending_ping_ids');
    var ids = raw ? JSON.parse(raw) : [];
    if (ids.indexOf(siswaId) === -1) ids.push(siswaId);
    cache.put('pending_ping_ids', JSON.stringify(ids), CACHE_TTL_DETIK);
  } finally {
    lock.releaseLock();
  }
}

function flushPingBerkala() {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('pending_ping_ids');
  if (!raw) return;
  var ids = JSON.parse(raw);
  cache.remove('pending_ping_ids');
  if (!ids || ids.length === 0) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    var sh = sh_(SHEET.SISWA);
    var headers = headersOf_(SHEET.SISWA);
    var lastRow = sh.getLastRow();
    var jumlahBaris = Math.max(lastRow - 1, 0);
    var data = jumlahBaris > 0 ? sh.getRange(2, 1, jumlahBaris, headers.length).getValues() : [];
    var idCol = headers.indexOf('id');
    var deviceCol = headers.indexOf('device_id');
    var pingCol = headers.indexOf('last_ping');
    var peta = {};
    data.forEach(function (row, i) { peta[String(row[idCol])] = i; });

    var berubah = false;
    ids.forEach(function (id) {
      var stateRaw = cache.get(pingCacheKey_(id));
      if (!stateRaw || !peta.hasOwnProperty(id)) return;
      var obj = JSON.parse(stateRaw);
      var i = peta[id];
      if (obj.hasOwnProperty('device_id')) { data[i][deviceCol] = obj.device_id; berubah = true; }
      if (obj.hasOwnProperty('last_ping')) { data[i][pingCol] = obj.last_ping; berubah = true; }
    });
    if (berubah) sh.getRange(2, 1, data.length, headers.length).setValues(data);
  } finally {
    lock.releaseLock();
  }
}

// Dipanggil oleh trigger waktu (tiap 1 menit) -- lihat pasangTriggerFlush_.
// Kalau salah satu gagal (mis. lock/timeout langka), yang lain tetap jalan.
function jalankanFlushBerkala() {
  try { flushSesiBerkala(); } catch (e) { Logger.log('flushSesiBerkala error: ' + e); }
  try { flushPingBerkala(); } catch (e) { Logger.log('flushPingBerkala error: ' + e); }
}

// Dipanggil dari tombol "⬆ Kirim ke Spreadsheet" di sidebar Portal Guru
// (opsi cadangan, tampil di semua halaman) -- sama persis dengan yang
// dikerjakan trigger otomatis tiap 1 menit (jalankanFlushBerkala), cuma
// dipicu manual oleh guru saat itu juga, tanpa perlu menunggu.
function actionPaksaFlushSesiSekarang_(data) {
  jalankanFlushBerkala();
  return jsonOut_({ ok: true });
}

// Pasang trigger waktu (tiap 1 menit) yang menjalankan jalankanFlushBerkala.
// AMAN dipanggil berkali-kali -- trigger lama dengan nama fungsi yang sama
// selalu dihapus dulu sebelum membuat yang baru, supaya tidak menumpuk
// trigger duplikat kalau fungsi ini dijalankan ulang.
function pasangTriggerFlush_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'jalankanFlushBerkala') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('jalankanFlushBerkala').timeBased().everyMinutes(1).create();
  Logger.log('Trigger flush berkala (tiap 1 menit) terpasang.');
}

// ----------------------------------------------------------------------------
// SISWA — ALUR UJIAN
// ----------------------------------------------------------------------------
function actionCekToken_(data) {
  var ujian = readAll_(SHEET.UJIAN).filter(function (u) { return u.token === String(data.token || '').toUpperCase(); })[0];
  if (!ujian) return jsonOut_({ ok: false, error: 'Token ujian tidak ditemukan.' });
  var now = new Date();
  if (ujian.mulai && now < new Date(ujian.mulai)) return jsonOut_({ ok: false, error: 'Ujian belum dibuka.' });
  var batasTelat = ujian.selesai ? new Date(new Date(ujian.selesai).getTime() + (Number(ujian.toleransi_menit) || 0) * 60000) : null;
  if (batasTelat && now > batasTelat) return jsonOut_({ ok: false, error: 'Waktu akses ujian sudah berakhir.' });
  if (ujian.status !== 'aktif') return jsonOut_({ ok: false, error: 'Ujian ini sedang tidak aktif.' });
  return jsonOut_({ ok: true, ujian: { id: ujian.id, judul: ujian.judul, durasiMenit: ujian.durasi_menit, kategori: ujian.kategori } });
}

// Membuat / melanjutkan sesi ujian siswa. Soal diacak SEKALI per siswa dan disimpan,
// supaya urutan tetap konsisten walau reload/refresh.
function actionMulaiUjian_(data) {
  var ujian = readAll_(SHEET.UJIAN).filter(function (u) { return u.id === data.ujianId; })[0];
  if (!ujian) return jsonOut_({ ok: false, error: 'Ujian tidak ditemukan.' });

  // Cache-first: kunci "siswa+ujian -> sesiId" supaya TIDAK perlu baca ulang
  // SELURUH sheet Sesi (readAll_) setiap kali siswa membuka/reload halaman
  // ujian -- penting saat banyak siswa mulai/reload bersamaan.
  var cache = CacheService.getScriptCache();
  var kunciMap = 'map_sesi_' + data.ujianId + '_' + data.siswaId;
  var sesiId = cache.get(kunciMap);
  var existing = sesiId ? ambilSesiState_(sesiId) : null;

  if (!existing) {
    // Belum ada di cache -> baru cek Sheets (jalur dingin: hanya kejadian
    // pertama kali per siswa per ujian, atau kalau cache sempat kadaluarsa).
    var sesiList = readAll_(SHEET.SESI);
    for (var i = 0; i < sesiList.length; i++) {
      if (sesiList[i].ujian_id === data.ujianId && sesiList[i].siswa_id === data.siswaId) { existing = sesiList[i]; sesiId = existing.id; break; }
    }
    if (sesiId) cache.put(kunciMap, sesiId, CACHE_TTL_DETIK);
  }

  if (existing && existing.status === 'selesai') {
    return jsonOut_({ ok: false, error: 'Anda sudah menyelesaikan ujian ini.' });
  }
  if (existing && existing.status === 'diblokir') {
    return jsonOut_({ ok: false, error: 'Sesi ujian Anda telah diblokir karena pelanggaran. Hubungi guru.' });
  }

  var soalIds = String(ujian.soal_ids || '').split(',').filter(Boolean);
  var bankSoal = readAll_(SHEET.BANK_SOAL);
  var soalMap = {}; bankSoal.forEach(function (s) { soalMap[s.id] = s; });

  var urutan, jawaban, ragu, mulai, opsiAcakMap;

  if (existing) {
    urutan = JSON.parse(existing.urutan_json || '{}');
    jawaban = JSON.parse(existing.jawaban_json || '{}');
    ragu = JSON.parse(existing.ragu_json || '[]');
    mulai = existing.mulai;
    opsiAcakMap = urutan.opsiAcak || {};
  } else {
    var order = soalIds.slice();
    if (String(ujian.acak_soal) === 'true' || ujian.acak_soal === true) {
      order = shuffleSeeded_(order, data.siswaId + data.ujianId);
    }
    opsiAcakMap = {};
    order.forEach(function (sid) {
      var soal = soalMap[sid];
      if (soal && (soal.tipe === 'pilihan_ganda' || soal.tipe === 'checkbox' || soal.tipe === 'benar_salah')) {
        var opsi = JSON.parse(soal.opsi_json || '[]');
        var idxArr = opsi.map(function (_, i) { return i; });
        if (String(ujian.acak_opsi) === 'true' || ujian.acak_opsi === true) {
          idxArr = shuffleSeeded_(idxArr, data.siswaId + data.ujianId + sid);
        }
        opsiAcakMap[sid] = idxArr;
      }
    });
    urutan = { order: order, opsiAcak: opsiAcakMap };
    jawaban = {};
    ragu = [];
    mulai = new Date().toISOString();
    sesiId = genId_('SES');
    // Ditulis ke CACHE dulu (instan, tidak perlu kunci Sheets) -- baris
    // sesungguhnya di Sheets baru dibuat oleh flushSesiBerkala() dalam <=1
    // menit. Ini yang membuat 500 siswa klik "Mulai Ujian" hampir bersamaan
    // tetap cepat & tidak saling menunggu.
    simpanSesiState_(sesiId, {
      id: sesiId, ujian_id: data.ujianId, siswa_id: data.siswaId, device_id: data.deviceId,
      mulai: mulai, selesai: '', status: 'berlangsung', pelanggaran: 0,
      urutan_json: JSON.stringify(urutan), jawaban_json: '{}', ragu_json: '[]',
      nilai: '', lulus: '', last_ping: mulai
    });
    cache.put(kunciMap, sesiId, CACHE_TTL_DETIK);
  }

  // Susun soal untuk dikirim ke klien TANPA kunci jawaban
  var soalUntukSiswa = urutan.order.map(function (sid) {
    var s = soalMap[sid];
    if (!s) return null;
    var opsi = null;
    if (s.tipe === 'pilihan_ganda' || s.tipe === 'checkbox' || s.tipe === 'benar_salah') {
      var opsiAsli = JSON.parse(s.opsi_json || '[]');
      var idxOrder = opsiAcakMap[sid] || opsiAsli.map(function (_, i) { return i; });
      opsi = idxOrder.map(function (i) { return opsiAsli[i]; });
    } else if (s.tipe === 'menjodohkan') {
      opsi = JSON.parse(s.opsi_json || '{}');
    }
    return { id: s.id, tipe: s.tipe, pertanyaan: s.pertanyaan, gambar: s.gambar, opsi: opsi, bobot: s.bobot };
  }).filter(Boolean);

  // sisa waktu dihitung dari waktu mulai sesi (bukan waktu buka halaman) -> anti reload untuk nambah waktu.
  // tambahanMs = waktu ekstra yang diberikan guru lewat tab "Pemantauan Ujian" (0 kalau belum pernah).
  var durasiMs = (Number(ujian.durasi_menit) || 0) * 60000;
  var tambahanMs = (Number(existing && existing.tambahan_detik) || 0) * 1000;
  var sisaMs = durasiMs + tambahanMs - (new Date() - new Date(mulai));

  return jsonOut_({
    ok: true,
    sesiId: sesiId,
    soal: soalUntukSiswa,
    jawabanTersimpan: jawaban,
    raguTersimpan: ragu,
    sisaDetik: Math.max(Math.floor(sisaMs / 1000), 0),
    maxPelanggaran: Number(ujian.max_pelanggaran) || 999,
    pelanggaranSaatIni: existing ? Number(existing.pelanggaran) || 0 : 0
  });
}

// shuffle deterministik berdasarkan seed string (Fisher-Yates + PRNG sederhana)
function shuffleSeeded_(arr, seedStr) {
  var seed = 0;
  for (var i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  var a = arr.slice();
  function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  for (var j = a.length - 1; j > 0; j--) {
    var k = Math.floor(rand() * (j + 1));
    var tmp = a[j]; a[j] = a[k]; a[k] = tmp;
  }
  return a;
}

// Autosave berkala (throttled dari klien) — hanya update kolom jawaban_json & ragu_json
// Autosave berkala (throttled dari klien, tiap 20 detik). Dulu ini yang
// paling sering memicu error "server sedang sibuk" karena 500 siswa
// berebut satu kunci untuk tulis langsung ke Sheets. Sekarang HANYA menulis
// ke cache (lihat simpanSesiState_) -- tidak ada kunci, tidak ada Sheets,
// jadi hampir tidak mungkin gagal/lambat walau ratusan siswa autosave
// bersamaan. Ditulis ke Sheets belakangan oleh flushSesiBerkala().
function actionSimpanJawaban_(data) {
  var state = ambilSesiState_(data.sesiId);
  if (!state) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  if (state.status !== 'berlangsung') return jsonOut_({ ok: false, error: 'Sesi sudah tidak aktif.' });
  simpanSesiState_(data.sesiId, {
    jawaban_json: data.jawaban, ragu_json: data.ragu || '[]', last_ping: new Date().toISOString()
  });
  return jsonOut_({ ok: true });
}

// Klien melaporkan pelanggaran anti-cheat (pindah tab, keluar fullscreen, dst).
// Server menambah counter & memutuskan apakah harus force-submit.
function actionLapor_(data) {
  var state = ambilSesiState_(data.sesiId);
  if (!state) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  if (state.status !== 'berlangsung') return jsonOut_({ ok: true, blokir: false });

  var pelanggaranBaru = (Number(state.pelanggaran) || 0) + 1;
  state = simpanSesiState_(data.sesiId, { pelanggaran: pelanggaranBaru });

  // Log pelanggaran: frekuensinya jauh lebih rendah daripada autosave
  // (hanya saat benar-benar terdeteksi curang), jadi tulis langsung ke
  // Sheets di sini masih wajar -- tapi tetap dibuat best-effort (kalau lock
  // pendek ini kebetulan gagal didapat, pelanggaran tetap tercatat di
  // counter/cache di atas, cuma baris LOG detailnya yang mungkin terlewat).
  var lockLog = LockService.getScriptLock();
  if (lockLog.tryLock(8000)) {
    try {
      appendObj_(SHEET.LOG, headersOf_(SHEET.LOG), {
        id: genId_('LOG'), sesi_id: data.sesiId, siswa_id: state.siswa_id, ujian_id: state.ujian_id,
        waktu: new Date().toISOString(), jenis: data.jenis || 'tidak diketahui'
      });
    } finally {
      lockLog.releaseLock();
    }
  }

  var ujian = readAll_(SHEET.UJIAN).filter(function (u) { return u.id === state.ujian_id; })[0];
  var maxPelanggaran = ujian ? Number(ujian.max_pelanggaran) || 999 : 999;

  if (pelanggaranBaru >= maxPelanggaran) {
    // force submit otomatis
    var jawabanSaatIni = JSON.parse(data.jawaban || state.jawaban_json || '{}');
    var hasilForce = hitungNilai_(state, jawabanSaatIni);
    simpanSesiState_(data.sesiId, {
      status: 'diblokir', selesai: new Date().toISOString(),
      jawaban_json: JSON.stringify(jawabanSaatIni), nilai: hasilForce.nilai, lulus: hasilForce.lulus
    });
    return jsonOut_({ ok: true, blokir: true, pelanggaran: pelanggaranBaru, nilai: hasilForce.nilai, lulus: hasilForce.lulus });
  }
  return jsonOut_({ ok: true, blokir: false, pelanggaran: pelanggaranBaru });
}

function actionSubmitUjian_(data) {
  var state = ambilSesiState_(data.sesiId);
  if (!state) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  if (state.status === 'selesai') {
    return jsonOut_({ ok: true, nilai: state.nilai, lulus: state.lulus, sudahSelesai: true });
  }
  var jawaban = JSON.parse(data.jawaban || '{}');
  var hasil = hitungNilai_(state, jawaban);
  simpanSesiState_(data.sesiId, {
    status: 'selesai', selesai: new Date().toISOString(),
    jawaban_json: JSON.stringify(jawaban), nilai: hasil.nilai, lulus: hasil.lulus
  });
  return jsonOut_({ ok: true, nilai: hasil.nilai, lulus: hasil.lulus, detail: hasil.detail });
}

// Menghitung nilai (auto-grading, termasuk uraian dengan pencocokan kata
// kunci) dari STATE sesi (cache atau Sheets, lewat ambilSesiState_) TANPA
// menyentuh Sheets -- murni komputasi. Penandaan status
// selesai/diblokir + nilai dilakukan terpisah oleh pemanggil lewat
// simpanSesiState_, supaya baik submit normal maupun force-submit akibat
// pelanggaran memakai jalur cache yang sama (cepat, tidak berebut kunci
// walau banyak siswa submit di waktu yang berdekatan, mis. mendekati batas
// waktu ujian).
function hitungNilai_(sesiState, jawaban) {
  var urutan = JSON.parse(sesiState.urutan_json || '{}');
  var opsiAcakMap = urutan.opsiAcak || {};
  var ujian = readAll_(SHEET.UJIAN).filter(function (u) { return u.id === sesiState.ujian_id; })[0];
  var bankSoal = readAll_(SHEET.BANK_SOAL);
  var soalMap = {}; bankSoal.forEach(function (s) { soalMap[s.id] = s; });

  var totalBobot = 0, totalDapat = 0, detail = [];
  (urutan.order || []).forEach(function (sid) {
    var soal = soalMap[sid];
    if (!soal) return;
    var bobot = Number(soal.bobot) || 0;
    totalBobot += bobot;
    var jwbSiswa = jawaban[sid];
    var skor = skorSoal_(soal, jwbSiswa, opsiAcakMap[sid]);
    totalDapat += skor;
    detail.push({ id: sid, tipe: soal.tipe, bobot: bobot, skor: skor });
  });

  var nilaiAkhir = totalBobot > 0 ? Math.round((totalDapat / totalBobot) * 10000) / 100 : 0;
  var nilaiLulus = ujian ? Number(ujian.nilai_lulus) || 0 : 0;
  var lulus = nilaiAkhir >= nilaiLulus;

  return { nilai: nilaiAkhir, lulus: lulus, detail: detail };
}

function skorSoal_(soal, jwb, idxOrder) {
  var bobot = Number(soal.bobot) || 0;
  if (jwb === undefined || jwb === null || jwb === '') return 0;
  var kunci;
  try { kunci = JSON.parse(soal.kunci_json || 'null'); } catch (e) { kunci = null; }
  if (kunci === null) return 0;

  // `idxOrder` (opsional): peta posisi-tampil -> indeks-opsi-asli, KHUSUS untuk
  // soal yang opsinya diacak per siswa (lihat opsiAcakMap di actionMulaiUjian_).
  // Siswa menjawab berdasarkan POSISI YANG TAMPIL di layarnya (sudah diacak),
  // sedangkan `kunci` selalu memakai INDEKS OPSI ASLI (urutan sebelum diacak,
  // sesuai saat guru membuat soal). Tanpa penerjemahan ini, soal dengan opsi
  // teracak akan dianggap salah setiap kali posisi jawaban yang benar bergeser
  // dari indeks aslinya -- walau kunci jawaban yang diisi guru sudah benar.
  function keIndeksAsli(posisiTampil) {
    var p = Number(posisiTampil);
    return (idxOrder && idxOrder[p] !== undefined) ? Number(idxOrder[p]) : p;
  }

  switch (soal.tipe) {
    case 'pilihan_ganda':
    case 'benar_salah':
      return keIndeksAsli(jwb) === Number(kunci) ? bobot : 0;

    case 'checkbox': {
      var benar = Array.isArray(kunci) ? kunci.map(Number) : [];
      var pilihan = Array.isArray(jwb) ? jwb.map(function (p) { return keIndeksAsli(p); }) : [];
      var cocok = pilihan.filter(function (p) { return benar.indexOf(p) !== -1; }).length;
      var salah = pilihan.filter(function (p) { return benar.indexOf(p) === -1; }).length;
      var proporsi = benar.length > 0 ? Math.max(cocok - salah, 0) / benar.length : 0;
      return Math.round(proporsi * bobot * 100) / 100;
    }

    case 'menjodohkan': {
      // kunci: {"0":"2", "1":"0", ...} — jwb sama bentuknya
      var totalPasang = Object.keys(kunci).length;
      if (totalPasang === 0) return 0;
      var benarPasang = 0;
      Object.keys(kunci).forEach(function (k) {
        if (jwb && String(jwb[k]) === String(kunci[k])) benarPasang++;
      });
      return Math.round((benarPasang / totalPasang) * bobot * 100) / 100;
    }

    case 'uraian': {
      // kunci: { kataKunci: ["fotosintesis","klorofil", ...] }
      var kataKunci = (kunci.kataKunci || []).map(function (k) { return String(k).toLowerCase().trim(); }).filter(Boolean);
      if (kataKunci.length === 0) return 0; // tidak ada rubrik -> perlu koreksi manual guru di sheet
      var teks = String(jwb).toLowerCase();
      var ditemukan = kataKunci.filter(function (k) { return teks.indexOf(k) !== -1; }).length;
      return Math.round((ditemukan / kataKunci.length) * bobot * 100) / 100;
    }

    default:
      return 0;
  }
}

// Cache-first (lewat ambilSesiState_) supaya siswa yang BARU SAJA submit
// langsung melihat nilainya yang benar, walau flushSesiBerkala belum sempat
// menuliskannya ke Sheets (jeda maksimal ~1 menit, lihat catatan di atas
// ambilSesiState_).
function actionGetHasil_(data) {
  var sesi = ambilSesiState_(data.sesiId);
  if (!sesi) return jsonOut_({ ok: false, error: 'Sesi tidak ditemukan.' });
  var ujian = readAll_(SHEET.UJIAN).filter(function (u) { return u.id === sesi.ujian_id; })[0];
  return jsonOut_({
    ok: true,
    selesai: sesi.status !== 'berlangsung',
    nilai: sesi.nilai, lulus: sesi.lulus, pelanggaran: sesi.pelanggaran,
    judulUjian: ujian ? ujian.judul : '-',
    instruksiRemedial: (sesi.lulus === false || sesi.lulus === 'FALSE') ? (ujian && ujian.instruksi_remedial ? ujian.instruksi_remedial : 'Silakan hubungi guru mata pelajaran untuk instruksi remedial.') : ''
  });
}
