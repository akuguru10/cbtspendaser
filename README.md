# Aplikasi CBT — Portal Guru & Portal Siswa

Aplikasi ujian online (Computer Based Test) berbasis web statis (HTML/CSS/JS).

## ⭐ Baru: Pratinjau Soal (tampilan sama persis dengan siswa)

Dua tombol **👁 Pratinjau** baru di tab **Bank Soal**:

1. **Per soal** — tombol "👁 Pratinjau" di setiap soal (halaman Kelola Soal) menampilkan
   soal itu persis seperti yang akan dilihat siswa saat mengerjakan ujian (pertanyaan,
   gambar, opsi A/B/C/D atau kotak isian) — hanya untuk dilihat, tidak bisa
   diklik/diisi/disimpan.
2. **Per Mapel/kategori** — tombol 👁 di samping tombol **"Kelola Soal"** pada tiap
   kartu Mapel (dan juga tombol "👁 Pratinjau Semua Soal" di halaman Kelola Soal)
   menampilkan **seluruh soal aktif** di Mapel itu berurutan dalam satu tampilan,
   supaya bisa dicek sekaligus sebelum dipakai di ujian sungguhan. Soal yang
   berstatus Arsip tidak disertakan (karena memang tidak pernah dipakai di ujian).

Tampilannya dijamin **sama persis** dengan yang dilihat siswa karena keduanya memakai
kode render soal yang sama persis (`renderKontenSoal`) — bukan tampilan tiruan
terpisah yang bisa berbeda/basi seiring waktu.

**Tidak ada perubahan skema/`Code.gs`** untuk fitur ini (murni tampilan di
`index.html`/`app.js`, membaca ulang Bank Soal yang sudah ada) — cukup ganti kedua
file itu seperti biasa, baik Mode Lokal maupun Mode Server.

## ⭐ Baru: Identitas Aplikasi — Ganti Logo & Nama CBT

Panel baru **🏷️ Identitas Aplikasi (Logo & Nama CBT)** di tab **Pengaturan** (Portal
Guru). Guru bisa mengganti **nama aplikasi** (mis. "CBT SMA Negeri 1 Contoh") dan
mengunggah **logo** sendiri (JPG/PNG/WebP). Setelah diklik "Simpan Identitas
Aplikasi", perubahan otomatis muncul di:

- Judul tab browser
- Halaman login (sebelum siswa/guru masuk)
- Sidebar & topbar Portal Guru
- Sidebar & topbar Portal Siswa

...di **semua perangkat**, termasuk HP siswa — begitu perangkat itu membuka atau
memuat ulang aplikasi. Tidak perlu update apa pun secara manual di tiap perangkat.
Kosongkan logo untuk kembali memakai ikon topi wisuda bawaan.

⚠️ **Jika memakai Mode Server**, fitur ini memakai sheet `Config` (key/value) yang
sebenarnya **sudah ada** sejak versi lama (bagian dari skema otomatis) tapi belum
pernah dipakai fitur apa pun — jadi **tidak perlu menambah kolom baru maupun
menjalankan `pasangTriggerFlush_`/`setupAwal` ulang**. Cukup tempel `Code.gs` yang
baru lalu **Deploy > Manage deployments > New version** seperti biasa (lihat bagian
"1b." di bawah) supaya action `simpanBranding`/`getBranding` yang baru tersedia di
backend. Kalau hanya memakai **Mode Lokal**, tidak ada langkah tambahan — cukup
ganti `index.html` & `app.js`.

## ⭐ Baru: Analisis Soal & Jawaban Siswa (bisa diunduh)

Tab baru **📊 Analisis Soal** di Portal Guru. Pilih ujian, lalu tampil dua tabel
(dihitung dari siswa yang sudah **menyelesaikan** ujian tsb):

1. **Analisis Butir Soal** — per soal: jumlah/persentase siswa yang menjawab
   **benar**, **sebagian benar** (untuk tipe ceklis/mencocokkan/uraian yang
   dinilai proporsional), **salah**, dan **tidak dijawab** -- lalu dari
   persentase benar itu diturunkan label **"Tingkat Kesulitan (Otomatis)"**
   (≥70% = Mudah, 40–70% = Sedang, <40% = Sulit), ditampilkan berdampingan
   dengan **"Tingkat Kesulitan (Guru)"** yang diisi manual saat membuat soal
   di Bank Soal -- supaya kelihatan soal mana yang ternyata jauh lebih
   sulit/mudah dari perkiraan awal.
2. **Analisis Jawaban Siswa (per soal)** — matriks tiap siswa × tiap nomor
   soal (✔ benar / ◐ sebagian benar / ✘ salah / – tidak dijawab), untuk
   melihat pola kesalahan (mis. banyak siswa salah di soal yang sama).

Kedua tabel punya tombol **"⬇ Unduh CSV"** sendiri-sendiri (bisa dibuka lewat
Excel/Google Sheets) untuk didokumentasikan atau dianalisis lebih lanjut.
Tidak ada perubahan skema/kolom di `Code.gs` untuk fitur ini (murni membaca
data pelanggaran+jawaban yang sudah ada) -- cukup ganti ketiga file frontend
(`index.html`, `app.js`, dan `Code.gs` untuk Mode Server) seperti biasa.

## ⭐ Baru: Pemantauan Ujian (live monitoring) & Status Login

Dua tab baru di Portal Guru, sidebar kiri:

1. **🖥 Pemantauan Ujian** — pilih ujian, lalu lihat daftar siswa yang sedang
   mengerjakan/​sudah selesai, **sisa waktu**, **jumlah soal yang sudah terjawab**
   (mis. "7 / 20"), dan **jumlah pelanggaran** anti-cheat -- semuanya tampil per
   siswa dan menarik data terkini (bukan menunggu jeda flush 1 menit). Tiap
   siswa punya 4 tombol aksi:
   - **⏱ Tambah Waktu** — memberi waktu ekstra ke satu siswa saja (mis. karena
     sempat mati listrik/koneksi putus), tanpa mengubah durasi siswa lain.
   - **🧹 Hapus Pelanggaran** — pelanggaran siswa itu langsung jadi 0. Kalau
     sesinya sedang **diblokir** (karena pelanggaran sudah mencapai batas
     maksimal dan otomatis di-force-submit), sesi ini otomatis dibuka lagi dan
     siswa bisa **langsung melanjutkan dari soal terakhir yang ia kerjakan**
     (jawaban yang sudah terisi tetap ada) — **tanpa perlu mengulang ujian dari
     awal**.
   - **✅ Selesaikan Paksa** — mengakhiri ujian siswa itu sekarang juga memakai
     jawaban terakhir yang tersimpan (autosave), nilai langsung dihitung.
   - **↺ Reset** — kebalikan dari "Hapus Pelanggaran": menghapus sesi
     sepenuhnya, siswa dianggap belum pernah mengerjakan sama sekali (soal
     diacak ulang, jawaban kosong, waktu mulai dari 0). Pakai ini hanya kalau
     memang ingin siswa mengulang total dari awal.
2. **🔐 Status Login** — daftar semua akun siswa beserta status kunci
   perangkatnya: **Device ID** yang sedang memegang kunci, dan **kapan terakhir
   aktif**. Satu akun siswa memang sudah sejak awal hanya bisa dipakai di satu
   perangkat dalam satu waktu (lihat bagian "Single device session" di bawah);
   tab ini membuat status itu terlihat jelas per akun, dan tombol
   **"🔓 Buka Kunci Akun"** di tiap baris memakai aksi yang sama seperti tombol
   "Lepas Kunci" di tab Data Siswa — perlu dipakai kalau siswa mau pindah
   login ke HP/komputer lain sementara akunnya masih tercatat "Terkunci".

⚠️ **`Code.gs` berubah** (menambah kolom `tambahan_detik` di sheet `Sesi`, untuk
fitur "Tambah Waktu"). Kalau memakai **Mode Server**, tempel ulang `Code.gs`
lalu **Deploy > Manage deployments > New version** (lihat bagian "1b." di
bawah) — kolom baru otomatis tercipta sendiri di Sheets. Kalau hanya memakai
**Mode Lokal**, tidak ada langkah tambahan — cukup ganti `index.html` & `app.js`.

## ⭐⭐ Baru: Sanggup 500+ siswa bersamaan (perbaikan arsitektur backend)

**Ini perubahan paling penting di paket ini — mohon dibaca sebelum update.**

Sebelumnya, setiap autosave jawaban (tiap 20 detik x tiap siswa), mulai ujian,
lapor pelanggaran, dan submit ujian langsung menulis ke Google Sheets sambil
berebut **satu kunci global** — dengan 500 siswa aktif bersamaan, ini gampang
memicu error **"Server sedang sibuk, silakan coba lagi"** dan jawaban yang gagal
tersimpan.

Sekarang, keempat aksi tersebut menulis ke **cache** dulu (super cepat, ~10-50ms,
nyaris tidak pernah bentrok karena tiap siswa punya kunci cache sendiri-sendiri),
dan baru benar-benar dituliskan ke Google Sheets secara **berkala & berkelompok**
(1x per menit, lewat trigger otomatis) — jadi 500 siswa yang autosave "bersamaan"
cukup 1x operasi tulis batch ke Sheets per menit, bukan 500x operasi satu-satu yang
saling menunggu. Ping heartbeat (deteksi 1 akun 1 perangkat) juga memakai pola yang
sama. Dari sisi siswa/guru yang memakai aplikasi, semuanya tetap terlihat instan —
jeda ~1 menit itu HANYA terasa kalau guru membuka Google Sheets-nya secara manual
langsung.

⚠️ **WAJIB dilakukan setelah update (sekali saja):** setelah tempel `Code.gs` yang
baru & Deploy versi baru, buka editor Apps Script, pilih fungsi
**`pasangTriggerFlush_`** dari dropdown di atas, lalu klik **Run**. Ini memasang
trigger yang menuliskan data dari cache ke Sheets setiap 1 menit. **Tanpa langkah
ini, jawaban siswa akan tersimpan di cache tapi TIDAK PERNAH masuk ke Google
Sheets!** (Kalau lupa/ragu, jalankan `setupAwal` lagi saja — aman, tidak menghapus
data, dan otomatis memasang trigger yang sama.)

Perkiraan kapasitas sesudah perbaikan ini: nyaman untuk ratusan siswa bersamaan
pada akun Gmail biasa, dan lebih tinggi lagi pada akun Google Workspace (sekolah).
Untuk skala ribuan siswa atau kebutuhan keandalan tingkat produksi, backend ini
tetap bisa dimigrasikan ke Firebase/Supabase tanpa mengubah banyak di frontend.
Detail teknis lengkap ada di komentar bagian atas `Code.gs` ("ARSITEKTUR SKALA").

## ⭐ Kategori/Nama Soal bebas + Arsip + Riwayat pemakaian

Perubahan di paket ini, semuanya di tab **Bank Soal** & **Kelola Ujian**:

1. **Kategori/Nama Soal bebas diketik** — kolom "Kategori" di form Tambah/Ubah Soal
   sekarang kolom bebas (bukan pilihan tetap Kuis/Ulangan Harian/UTS/UAS saja). Ketik
   nama apa pun (mis. "Kuis 1", "Kuis 2", "Ulangan Harian 1", "Ulangan Harian 2",
   "UTS 1", "Tryout", dst.) — begitu dipakai di 1 soal, nama itu **otomatis muncul**
   sebagai pilihan filter di Bank Soal dan pilihan "Kategori Soal yang Digunakan" di
   Buat Ujian, tanpa perlu didaftarkan dulu.
2. **Buat Ujian: tidak perlu centang satu-satu** — begitu Kategori (dan/atau
   Sub-Kategori) dipilih di form Buat Ujian, **semua soal yang cocok otomatis
   tercentang**. Tinggal klik "Simpan Ujian", atau hapus centang soal tertentu kalau
   memang tidak mau dipakai. Tersedia juga tombol pintas **"Pilih Semua"** /
   **"Kosongkan Semua"**.
3. **Arsip** — tombol **"🗄 Arsipkan"** di tiap soal (Bank Soal) memindahkan soal yang
   dibuat tapi belum/tidak jadi dipakai ke Arsip, tanpa menghapusnya permanen. Ganti
   filter status di atas daftar soal ke **"Arsip"** untuk melihatnya, edit isinya
   kapan saja, lalu klik **"↩ Kembalikan ke Bank Soal"** untuk mengaktifkannya lagi.
4. **Riwayat pemakaian** — soal yang sudah pernah dipakai di ujian mana pun otomatis
   diberi label **"🕘 Pernah dipakai"** (arahkan kursor untuk melihat nama ujiannya).
   Centang **"Riwayat (pernah dipakai saja)"** di toolbar Bank Soal untuk menyaring
   khusus soal yang sudah pernah dipakai.
5. **Kelola Kategori** (tombol "⚙ Kelola Kategori" di Bank Soal) — melihat semua
   kategori aktif beserta jumlah soalnya, membuat kategori baru (langsung membuka
   form Tambah Soal dengan nama itu terisi), atau **menghapus kategori** — soal di
   dalamnya otomatis dipindahkan ke Arsip (bukan dihapus permanen), lalu kategorinya
   otomatis hilang dari daftar aktif.

⚠️ **`Code.gs` berubah** (menambah kolom `status` di sheet BankSoal, untuk fitur
Arsip). Kalau memakai **Mode Server**, Anda **perlu** tempel ulang `Code.gs` yang
baru lalu **Deploy > Manage deployments > New version** (lihat bagian "1b." di
bawah) — kolom `status` akan otomatis tercipta sendiri di Sheets, tidak perlu
diedit manual. Kalau hanya memakai **Mode Lokal** (localStorage), tidak ada langkah
tambahan — cukup ganti `index.html` & `app.js`.

**Langsung bisa dipakai tanpa setup apa pun** — cukup buka `index.html` di browser.
Secara default aplikasi berjalan dalam **Mode Lokal**: semua data (bank soal, data
siswa, ujian, hasil) disimpan di `localStorage` browser tempat Anda membuka aplikasi.
Cocok untuk mencoba semua fitur, atau untuk ujian yang dikerjakan bergiliran di
**satu komputer/perangkat yang sama** (mis. lab komputer dengan 1 device per shift).

Untuk ujian dengan **banyak siswa di banyak perangkat/HP berbeda secara bersamaan**,
Anda perlu menghubungkan aplikasi ke backend **Google Apps Script + Google Sheets**
(gratis) — lihat bagian "Mode Server" di bawah. Kontrak datanya sama persis, jadi
tinggal isi satu baris konfigurasi di `app.js`, tidak perlu mengubah kode lain.

## ⭐ Baru: kolom Sheets otomatis — cukup ganti script, tidak perlu edit Sheets manual

Versi ini punya **skema otomatis**: daftar kolom tiap sheet didefinisikan satu kali
di `Code.gs` (objek `SCHEMA`). Setiap kali ada permintaan masuk ke Web App, backend
otomatis memeriksa apakah semua kolom di `SCHEMA` sudah ada di Google Sheets — kalau
belum, kolom yang kurang **langsung ditambahkan sendiri** ke ujung kanan sheet terkait,
tanpa Anda perlu membuka Google Sheets sama sekali, apalagi menambah kolom manual.

Artinya, kalau nanti Anda (atau siapa pun) menambah field baru ke aplikasi, alurnya
jadi:
1. Tempel/timpa `Code.gs` dengan versi barunya (yang sudah memuat kolom baru di `SCHEMA`).
2. **Manage deployments > New version** di Apps Script.
3. Selesai — kolom baru otomatis muncul di Sheets pada permintaan pertama setelahnya.

Lihat bagian **"Menambah kolom baru"** di bawah untuk langkah detail + contoh kerja
nyata (kolom "Tingkat Kesulitan" di Bank Soal, yang sudah dipasang penuh di versi ini
sebagai contoh — form-nya di `index.html`, logikanya di `app.js`, kolomnya otomatis
tercipta oleh `Code.gs`).

## Isi proyek
```
index.html   -> struktur halaman (login, portal guru, portal siswa, layar ujian, hasil)
style.css    -> tampilan & sistem tema (palet warna siap pakai + bisa diacak/diubah guru)
app.js       -> seluruh logika: auth, CRUD soal/ujian, timer, anti-cheat, autosave,
                + LocalBackend (penyimpanan lokal di browser, aktif secara default)
Code.gs      -> backend API opsional (tempel ke Google Apps Script) untuk Mode Server,
                termasuk mesin skema-otomatis (SCHEMA, pastikanSkemaTerbaru_, dst.)
```

## 0. Login default (Mode Lokal, langsung aktif)
Buka `index.html`, pilih **Portal Guru**, lalu masuk dengan:
- Username: `admin`
- Password: `admin123`

Segera ganti password ini lewat tab **Data Siswa/Guru** jika akan dipakai sungguhan
di sekolah, atau gunakan Mode Server yang punya kredensial per-guru.

Fitur yang sudah bisa langsung dipakai tanpa setup apa pun:
- **Tambah soal** manual lewat form (tab Bank Soal → "+ Tambah Soal"), **lihat, dan
  ubah/edit** soal yang sudah dibuat — termasuk kategori, **sub-kategori/kelompok**
  (mis. "Bab 1" vs "Bab 2" dalam kategori Ulangan Harian, supaya tidak tercampur),
  tipe, bobot, dan **tingkat kesulitan** (Mudah/Sedang/Sulit).
- **Impor soal massal** dari file .xlsx/.csv, termasuk soal bergambar (kolom link
  gambar) — klik dulu **"Unduh Template"** untuk mendapatkan contoh file dengan
  format kolom yang benar, isi, lalu impor kembali.
- **Tambah siswa satu per satu** lewat form manual (tab Data Siswa) — **username bisa
  dibuatkan otomatis dari nama** (tombol 🪄), begitu juga password (tombol 🎲) — atau
  **impor massal** dari file .xlsx/.csv (juga tersedia tombol "Unduh Template",
  kolom username & password boleh dikosongkan untuk dibuatkan otomatis).
- **Palet warna**: pilih salah satu dari beberapa palet siap pakai (Violet Neon, Gold
  Elegan, Ocean Teal, Sunset Ceria, dll), klik **"Acak Palet Warna"** untuk kombinasi
  acak baru, atau atur warna sendiri lewat color picker — lalu klik "Simpan Tema".

## 1. (Opsional) Mode Server — Setup Backend Google Apps Script

Lewati bagian ini jika hanya memakai Mode Lokal (1 perangkat). Ikuti langkah ini
jika ingin banyak siswa mengerjakan dari perangkat masing-masing.

### 1a. Setup pertama kali
1. Buka [sheets.google.com](https://sheets.google.com) → buat Spreadsheet baru, beri nama misalnya **DB_CBT**.
2. Menu **Extensions > Apps Script**. Hapus kode default, tempel seluruh isi `Code.gs`.
3. Di dropdown fungsi (atas), pilih `setupAwal`, lalu klik **Run**. Izinkan semua permission yang diminta Google.
   - Ini otomatis membuat semua sheet (Guru, Siswa, BankSoal, Ujian, Sesi, PelanggaranLog, Config) beserta seluruh kolomnya sesuai `SCHEMA` di `Code.gs`.
   - Serta 1 akun guru default: **username `admin` / password `admin123`** — segera ganti lewat sheet "Guru".
4. Klik **Deploy > New deployment**:
   - Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Salin **Web app URL** yang muncul (formatnya `https://script.google.com/macros/s/XXXXX/exec`).

### 1b. Cara mengganti/update `Code.gs` di kemudian hari (mis. menambah fitur/kolom)
Ini bagian yang berubah paling sering, jadi disederhanakan:
1. Buka lagi project Apps Script yang sama (dari Sheets: **Extensions > Apps Script**).
2. **Hapus semua isi `Code.gs` lama, tempel versi baru.**
3. **Deploy > Manage deployments** → klik ikon pensil (Edit) pada deployment yang aktif
   → di dropdown **Version** pilih **New version** → **Deploy**.
   (Web app URL yang lama tetap sama, tidak berubah — jadi `CONFIG.API_URL` di `app.js`
   tidak perlu diganti.)
4. **Selesai.** Anda **tidak perlu** menjalankan `setupAwal` lagi, dan **tidak perlu**
   membuka/mengedit Google Sheets sama sekali — kalau versi baru itu menambah kolom
   baru, kolom tsb otomatis muncul sendiri di Sheets begitu ada permintaan pertama
   masuk dari aplikasi (guru login, siswa buka ujian, dsb).
   - Ingin melihat hasilnya seketika tanpa menunggu ada yang membuka aplikasi dulu?
     Di editor Apps Script, pilih fungsi `paksaSinkronSkemaSekarang` di dropdown lalu
     **Run** — kolom baru langsung muncul di Sheets saat itu juga.

## 2. Hubungkan Frontend ke Backend (mengaktifkan Mode Server)

Pengaturan koneksi Google Sheets sengaja **hanya bisa diakses dari Portal Guru**
(tab **⚙ Pengaturan**) — tidak ada tombol pengaturan server di layar login maupun
di Portal Siswa, supaya tampilan awal & portal siswa tetap sederhana dan urusan
"tersambung ke Google Sheets atau tidak" murni jadi keputusan/urusan guru, bukan
sesuatu yang perlu dipikirkan siswa. Konsekuensinya, ada 2 cara mengaktifkannya —
pilih salah satu sesuai kebutuhan:

**Cara A — lewat aplikasi, tanpa edit kode (cocok untuk 1 perangkat guru saja):**
Login ke **Portal Guru** (default Mode Lokal selalu bisa dipakai untuk login
pertama kali: username `admin` / password `admin123`) → buka tab **⚙ Pengaturan**
→ klik **"Atur Koneksi Google Sheets"** → tempel URL Web App dari langkah di atas
→ **"Tes Koneksi"** → **"Simpan (perangkat ini saja)"**. Pengaturan ini tersimpan per-perangkat
(localStorage), jadi **hanya berlaku di browser/perangkat itu saja** — siswa yang
login dari HP/perangkat lain TIDAK ikut memakai Google Sheets ini, karena mereka
tidak punya akses ke layar pengaturan ini sama sekali (sesuai permintaan, akses
diprivatkan hanya untuk guru). Cara ini cocok untuk uji coba, atau kalau memang
hanya guru sendiri yang perlu terhubung ke Sheets (mis. sekadar mengelola Bank
Soal dari Sheets, ujian tetap dikerjakan siswa di Mode Lokal 1 komputer/lab).

**Cara B — dibakukan di kode (WAJIB dipakai kalau siswa mengerjakan dari
perangkat/HP masing-masing):** karena siswa tidak punya cara mengisi URL sendiri
dari antarmuka aplikasi, satu-satunya jalan supaya SEMUA orang (guru & siswa)
otomatis memakai Google Sheets yang sama adalah membakukannya langsung di kode.

Supaya tidak perlu mengetik manual, setelah **"Tes Koneksi"** berhasil di modal
Cara A di atas, aplikasi otomatis menampilkan kotak cuplikan kode berisi baris
`API_URL: 'https://script.google.com/...',` yang sudah terisi URL yang baru saja
diuji, lengkap dengan tombol **"📋 Salin"**. Tinggal:
1. Klik **"📋 Salin"**.
2. Buka `app.js`, cari baris `API_URL: ''` (dekat baris paling atas).
3. Tempel (timpa) baris itu dengan hasil salinan tadi.
4. Deploy ulang situs (Netlify/GitHub Pages) — lihat bagian 4.

Atau isi manual kalau lebih suka:
```js
const CONFIG = {
  API_URL: '', // isi di sini agar berlaku untuk SEMUA perangkat yang membuka situs ini
  ...
};
```
Ini cara yang disarankan untuk pemakaian sekolah sungguhan: sekali diisi &
di-deploy, guru maupun siswa yang membuka situs tersebut otomatis memakai Google
Sheets yang sama tanpa perlu mengatur apa pun di perangkat masing-masing.

Pengaturan Cara A (kalau diisi di perangkat guru) selalu didahulukan dibanding
Cara B pada perangkat itu saja — jadi guru tetap bisa mencoba backend lain di
perangkat sendiri tanpa mengganggu `CONFIG.API_URL` yang berlaku untuk siswa.

## 3. Bagaimana "realtime"-nya bekerja
- **Menulis data** (tambah/ubah/hapus soal, tambah/impor siswa, buat ujian, jawaban
  siswa, dsb) selalu langsung dikirim ke Google Sheets saat itu juga — tidak
  disimpan lokal dulu, kecuali cadangan jawaban ujian di `localStorage` siswa untuk
  jaga-jaga internet terputus sesaat.
- **Membaca data**: begitu Mode Server aktif, setiap tab yang sedang dibuka guru
  (Bank Soal, Kelola Ujian, Data Siswa, Rekap Nilai, Log Pelanggaran) otomatis
  menarik ulang data dari Google Sheets tiap **8 detik** (`CONFIG.REALTIME_POLL_MS`)
  selama tab tersebut aktif — jadi kalau ada siswa yang baru login atau mengumpulkan
  ujian dari HP-nya, guru yang membuka tab terkait di perangkat lain akan melihat
  perubahannya dalam hitungan detik tanpa perlu me-refresh halaman. Ada juga tombol
  **🔄** di tiap tab untuk menyegarkan seketika. Polling otomatis berhenti saat layar
  disembunyikan/dikunci untuk menghemat kuota, dan lanjut lagi saat dibuka kembali.
- Ini BUKAN realtime push (seperti WebSocket) — Google Apps Script tidak mendukung
  itu — melainkan polling berkala yang terasa "hampir realtime". Jika ingin interval
  lebih cepat/lambat, ubah `CONFIG.REALTIME_POLL_MS` di `app.js` (nilai dalam
  milidetik), dengan mempertimbangkan batas kuota eksekusi Apps Script (lihat
  bagian 9).

## 4. Deploy Frontend ke Netlify

**Deploy pertama kali (drag & drop, tanpa akun Git):**
1. Login ke [netlify.com](https://netlify.com) (bisa pakai akun Google).
2. Di dashboard, klik **"Add new site" > "Deploy manually"**.
3. Seret folder yang berisi `index.html`, `style.css`, `app.js` ke area upload
   (seret **isi foldernya**, bukan foldernya sendiri, jika diminta memilih file).
4. Netlify langsung memberi URL publik acak (mis. `random-name-123.netlify.app`) —
   bisa diganti jadi nama yang lebih mudah diingat lewat **Site settings > Change
   site name**.
5. Tidak perlu proses build apa pun — ini murni HTML/CSS/JS statis.

**Update situs setelah mengedit `app.js`/`index.html`/`style.css` (mis. setelah
mengisi `CONFIG.API_URL` atau menambah fitur baru):**
- Cara tercepat: buka situs Anda di Netlify dashboard → tab **Deploys** → seret
  ulang folder (berisi ketiga file, versi terbaru) ke area **"Drag and drop your
  site output folder here"** di bagian atas tab tersebut. Netlify otomatis mengganti
  seluruh isi situs dengan file yang baru diseret, URL tetap sama.
- Alternatif yang lebih rapi untuk jangka panjang: hubungkan repo GitHub ke Netlify
  (**"Add new site" > "Import an existing project"**) supaya setiap kali Anda push
  perubahan ke GitHub, Netlify otomatis redeploy sendiri — tidak wajib, tapi enak
  kalau filenya sering diubah.

**Alternatif: GitHub Pages**
1. Buat repository baru, upload `index.html`, `style.css`, `app.js`.
2. Settings > Pages > Branch: `main`, folder `/root` → Save.
3. Situs akan aktif di `https://<username>.github.io/<repo>/`. Untuk update, cukup
   commit/push perubahan file — GitHub Pages otomatis redeploy.

## 5. Alur pemakaian

**Guru**: login (Portal Guru) → isi Bank Soal → buat Ujian (pilih soal, atur durasi,
jadwal token, toleransi telat, KKM, maks. pelanggaran) → bagikan **token ujian** ke siswa.

**Siswa**: login (Portal Siswa) dengan akun yang diimpor guru → masukkan token →
ujian berjalan fullscreen dengan timer, navigasi soal, tanda ragu-ragu, dan
anti-cheat aktif → nilai muncul otomatis setelah submit.

### Format impor Bank Soal (.xlsx/.csv)
Klik tombol **"Unduh Template"** di tab Bank Soal untuk mendapatkan file contoh siap isi.
Kolom per baris (baris pertama adalah header, otomatis dilewati saat impor):
```
kategori | subkategori | tipe | pertanyaan | opsi (pisah dgn |) | kunci | bobot | tingkat_kesulitan | gambar
```
- `tipe`: `pilihan_ganda`, `checkbox`, `uraian` (untuk `menjodohkan`, buat manual lewat form — polanya lebih kompleks).
- `kunci` pilihan_ganda: indeks opsi benar (0 = opsi pertama).
- `kunci` checkbox: indeks-indeks benar dipisah `|`, contoh `0|2`.
- `kunci` uraian: kata kunci penilaian otomatis dipisah `|`.
- `subkategori`: teks bebas untuk mengelompokkan soal **dalam 1 kategori yang sama**
  (mis. kategori `ulangan_harian` dengan sub-kategori `Bab 1` vs `Bab 2`), supaya saat
  memilih soal untuk sebuah ujian, soal Bab 1 tidak tercampur dengan Bab 2 — **kolom
  opsional**, kosongkan kalau tidak perlu pengelompokan lebih detail.
- `tingkat_kesulitan`: `mudah` / `sedang` / `sulit` — **kolom opsional**; file template
  lama tanpa kolom ini tetap bisa diimpor, otomatis dianggap `sedang`.
- `gambar`: **kolom opsional** untuk soal bergambar saat impor massal. Isi dengan link
  gambar publik — cara paling praktis: unggah gambar ke Google Drive → klik kanan pada
  filenya → **Bagikan** → ubah akses jadi **"Siapa saja yang memiliki link"** → salin
  link tsb apa adanya ke kolom ini (contoh: `https://drive.google.com/file/d/xxxx/view?usp=sharing`).
  Aplikasi otomatis mengubah link share Google Drive itu menjadi link tampilan gambar
  yang benar (`normalisasiUrlGambar()` di `app.js`) — link dari hosting gambar lain
  (Imgur, dll.) juga didukung, dipakai apa adanya. Untuk soal satuan (bukan impor
  massal), tetap bisa unggah langsung lewat form "+ Tambah Soal" seperti biasa.

### Format impor Data Siswa (.xlsx/.csv)
Klik tombol **"Unduh Template"** di tab Data Siswa untuk mendapatkan file contoh siap isi,
atau tambahkan siswa satu per satu lewat form "Tambah Siswa Manual" tanpa perlu file sama sekali.
```
nama | kelas | username | password
```
Kolom **username** dan **password** boleh dikosongkan per baris:
- Username kosong → dibuatkan otomatis dari nama (mis. "Budi Santoso" → `budisantoso`),
  dihindarkan tabrakan dengan username yang sudah dipakai (baik yang sudah ada di
  server, maupun sesama baris di file yang sama) dengan menambah angka di belakang
  (`budisantoso2`, dst).
- Password kosong → dibuatkan password acak otomatis seperti sebelumnya.
Pola yang sama (tombol 🪄 buat username / 🎲 buat password) juga tersedia di form
tambah-manual dan form ubah data siswa.

## 6. Cara kerja fitur-fitur utama

- **Equation/Matematika**: guru menulis `$...$` di teks soal (format LaTeX), dirender otomatis oleh KaTeX di sisi siswa.
- **Gambar/diagram soal**: diunggah lewat form soal → disimpan ke folder Google Drive `CBT_Gambar_Soal` milik akun guru, otomatis dibuat publik "anyone with link".
- **Perbesar gambar soal — dua opsi sekaligus**: (1) otomatis, gambar soal/opsi
  tampil dengan lebar minimum tertentu (lihat `min-width` pada `.question-card
  img` di `style.css`) supaya tidak terlalu kecil di layar sempit; (2) manual,
  siswa bisa mengklik gambar apa pun di kartu soal untuk membukanya di
  lightbox layar penuh, lalu memperbesarnya sendiri dengan tombol +/-, gulir
  mouse, cubit dua jari (HP), atau klik dua kali, serta menggeser gambar saat
  sudah diperbesar (lihat objek `ImageLightbox` di `app.js`). Opsi kedua ini
  tidak mengubah tampilan/ukuran gambar di kartu soal sama sekali — murni
  lapisan overlay terpisah.

### Perbaikan (penting): soal dengan opsi teracak sempat SALAH dinilai walau kunci sudah benar
Ditemukan & diperbaiki bug penilaian: saat pengaturan ujian **"Acak Opsi
Jawaban"** aktif (default-nya AKTIF untuk ujian baru), setiap siswa melihat
urutan pilihan A/B/C/D yang berbeda-beda. Sebelum perbaikan ini, jawaban siswa
disimpan berdasarkan POSISI YANG TAMPIL di layarnya, tapi dibandingkan
langsung ke kunci jawaban yang memakai INDEKS OPSI ASLI (urutan saat guru
membuat soal) -- tanpa diterjemahkan dulu. Akibatnya, begitu urutan opsi
teracak menggeser posisi jawaban yang benar, siswa yang memilih jawaban yang
sudah benar tetap dinyatakan salah, meski kunci jawaban di Bank Soal sudah
tepat. Sekarang penilaian menerjemahkan posisi-tampil siswa kembali ke indeks
opsi asli terlebih dahulu (lihat `skorSoal_()`/`hitungNilai_()` di `Code.gs`
dan `skorSoal()`/`hitungDanSelesaikanSesi()`/`getAnalisisSoal` di `app.js`)
sebelum dibandingkan dengan kunci -- berlaku untuk pilihan ganda, pilihan
ganda kompleks (checkbox), dan benar/salah.
**Catatan untuk ujian yang SUDAH TERLANJUR selesai dikerjakan siswa sebelum
update ini**: nilai yang sudah tersimpan TIDAK otomatis dihitung ulang begitu
Anda memasang update ini. Gunakan tombol **"🔄 Hitung Ulang Nilai"** di Portal
Guru → menu **Rekap Nilai** (pilih ujiannya dulu di dropdown, lalu klik
tombol itu) untuk menghitung ulang nilai SEMUA siswa yang sudah selesai di
ujian tersebut, memakai jawaban yang sudah tersimpan (tidak mengulang ujian,
tidak mengubah jawaban siswa) tapi lewat logika penilaian yang sudah benar.
Tombol ini aman diklik berkali-kali -- hanya sesi yang nilainya benar-benar
berubah yang ditulis ulang, dan akan muncul ringkasan "sekian sesi diperiksa,
sekian nilai diperbarui" setelah selesai (lihat `Guru.hitungUlangNilai()` di
`app.js` dan `actionHitungUlangNilaiUjian_()` di `Code.gs`).

### Perbaikan lain: kunci jawaban impor massal yang diisi TEKS (bukan huruf opsi)
Saat impor soal massal dari Excel/Word, kolom **Kunci** seharusnya diisi
HURUF opsi (mis. "C"), tapi kalau guru mengetik teks jawabannya langsung
(mis. "Sel" alih-alih "A"), sebelumnya sistem diam-diam menganggapnya sebagai
opsi A tanpa pemberitahuan apa pun -- berpotensi salah kalau jawaban benar
bukan opsi A. Sekarang sistem mencoba mencocokkan teks itu ke teks opsi yang
ada terlebih dahulu (jadi mengetik "Sel" akan tetap ditemukan & benar kalau
memang itu salah satu opsi), dan kalau tetap sama sekali tidak dikenali,
guru akan diberi tahu lewat kotak peringatan berisi daftar soal yang perlu
diperiksa manual -- bukan didiamkan.
- **Acak soal & opsi per siswa**: dibuat sekali saat siswa pertama kali membuka ujian (`shuffleSeeded_` di `Code.gs`), disimpan di sheet `Sesi` agar urutan tetap konsisten walau reload.
- **Local caching jawaban**: setiap perubahan jawaban langsung disimpan ke `localStorage` di perangkat siswa; sinkron ke server hanya tiap ~20 detik (throttled) + saat submit, supaya jawaban tidak hilang saat internet putus sebentar.
- **Single device session**: saat login, `device_id` (acak per-browser, disimpan di `localStorage`) dicatat di sheet `Siswa`. Login dari perangkat lain akan ditolak selama sesi masih "hidup" (ada heartbeat/ping dalam 15 menit terakhir). Guru bisa memaksa lepas kunci lewat tab **Data Siswa**.
- **Anti-cheat**: mode fullscreen dipaksa saat ujian dimulai; keluar fullscreen atau berpindah tab dicatat sebagai pelanggaran ke server. Copy/paste/klik kanan diblokir langsung di browser. Saat pelanggaran mencapai batas yang diatur guru, sistem otomatis mengunci sesi dan mengumpulkan jawaban yang sudah terisi (force submit).
- **Penilaian otomatis**: pilihan ganda & checkbox dicocokkan dengan kunci; mencocokkan dinilai per pasangan yang benar; **uraian dinilai otomatis dengan pencocokan kata kunci** (proporsi kata kunci yang muncul di jawaban siswa × bobot). Ini adalah pendekatan yang disederhanakan — bukan pemahaman makna seperti manusia. Untuk soal uraian yang butuh penilaian lebih cermat, guru tetap bisa membuka sheet `Sesi`, melihat kolom `jawaban_json`, dan menimpa kolom `nilai` secara manual.
- **Rekap nilai**: sudah otomatis berada di Google Sheets (sheet `Sesi`); tab "Rekap Nilai" di portal guru juga menyediakan tombol unduh CSV per ujian/kelas.
- **Tingkat kesulitan soal** *(contoh kolom baru — lihat bagian 8)*: dipilih guru saat membuat/mengubah soal (Mudah/Sedang/Sulit), tampil di daftar Bank Soal, dan ikut tersimpan lewat impor massal (kolom opsional).
- **Sub-kategori/kelompok soal**: kolom teks bebas di form Bank Soal & form Ujian (mis. "Bab 1", "Bab 2") untuk mengelompokkan soal **dalam 1 kategori yang sama**. Filter di tab Bank Soal dan pemilih soal saat membuat Ujian sama-sama otomatis mengikuti kategori + sub-kategori yang dipilih, jadi soal Ulangan Harian Bab 1 tidak akan tercampur/muncul saat sedang menyusun ujian Bab 2, UTS, UAS, dst.
- **Username otomatis**: tombol 🪄 di form Tambah/Ubah Siswa membuatkan username dari Nama Lengkap (disederhanakan jadi huruf kecil tanpa spasi, dihindarkan tabrakan dengan username yang sudah dipakai). Kolom username juga boleh dikosongkan saat impor massal — akan dibuatkan otomatis per baris dengan cara yang sama.

## 7. Sinkronisasi paksa (lapisan kedua) — tab Pengaturan & layar ujian

Di luar sinkronisasi otomatis (bagian 3), tersedia beberapa tombol manual sebagai
lapisan cadangan:

- **💾 "Simpan Sekarang"** (layar ujian siswa, pojok kanan atas): mengirim jawaban
  yang sedang dikerjakan ke server saat itu juga, tanpa menunggu penyimpanan otomatis
  tiap `CONFIG.AUTOSAVE_INTERVAL_MS` (default 20 detik). Berguna kalau siswa merasa
  koneksinya kurang stabil dan ingin memastikan jawabannya sudah terkirim sebelum
  melanjutkan.
- **⬇ "Tarik Data dari Spreadsheet Sekarang"** (tab Pengaturan guru): menarik ulang
  Bank Soal, Ujian, dan Data Siswa dari Google Sheets saat itu juga (tanpa menunggu
  polling ~8 detik), sekaligus menyimpan salinannya sebagai cadangan ke penyimpanan
  lokal (`localStorage`) perangkat itu.
- **⬆ "Kirim Data Lokal ke Spreadsheet Sekarang"** (tab Pengaturan guru): mengirim
  seluruh data yang sempat dibuat di **Mode Lokal** (sebelum Mode Server diaktifkan)
  ke Google Sheets yang sedang terhubung — Bank Soal, Data Siswa, dan Ujian, termasuk
  otomatis memetakan ulang `soal_ids` tiap ujian ke ID soal yang baru dibuat di server
  (ID lokal & ID server tidak sama). **Pakai sekali saja** saat pertama kali pindah
  dari Mode Lokal ke Mode Server — mengulang tindakan ini pada data yang sama akan
  membuat data ganda di Sheets, karena tombol ini menambahkan, bukan menimpa.

Ketiga tombol ini murni di sisi `app.js` (memanggil action API yang sudah ada:
`simpanJawaban`, `getBankSoal`/`getDaftarSiswa`/`getDaftarUjian`, `importSoal`/
`importSiswa`/`simpanUjian`) — tidak ada endpoint baru di `Code.gs` yang diperlukan.

## 8. Menambah kolom baru (tanpa edit Google Sheets manual)

Sejak versi ini, menambah data baru ke aplikasi **tidak pernah butuh membuka Google
Sheets untuk menambah kolom secara manual**. Kolom "Tingkat Kesulitan" pada Bank Soal
sudah dipasang penuh di versi ini sebagai contoh kerja nyata — ikuti pola yang sama
untuk menambah field lain (mis. "sumber soal", "catatan guru", "prioritas", dst).

**Langkah untuk menambah kolom yang hanya perlu tersimpan (tanpa tampilan khusus):**
1. Buka `Code.gs`, cari objek `SCHEMA` di bagian atas file.
2. Tambahkan nama kolom baru ke array sheet yang sesuai, contoh:
   ```js
   BankSoal: [..., 'bobot', 'tingkat_kesulitan', 'sumber_soal', 'pembahasan', 'dibuat'],
   ```
3. Redeploy (**Manage deployments > New version**) — lihat bagian 1b.

Sampai di sini saja pun sudah cukup: `readAll_`, `appendObj_`, dan
`updateRowByFields_` di `Code.gs` semuanya bekerja berdasarkan **nama kolom**, bukan
posisi tetap — jadi begitu kolom `sumber_soal` ada di header sheet, mengirim field
`sumber_soal` dari mana pun (form guru, impor file, dll.) otomatis tersimpan ke sana,
dan `getBankSoal` otomatis mengembalikannya kembali ke `app.js` sebagai properti
`s.sumber_soal` pada tiap soal — **tidak ada kode lain di `Code.gs` yang perlu diubah.**

**Kalau kolom itu juga perlu diisi/ditampilkan lewat form guru (kasus paling umum),
tambahkan 3 potongan kecil di `app.js`/`index.html`** — inilah bagian "mengedit
app.js" yang memang tidak bisa dihindari, karena aplikasi perlu tahu *di mana* nilai
itu diketik dan *di mana* ditampilkan. Polanya persis seperti yang dipakai untuk
`tingkat_kesulitan`:
1. **`index.html`** — tambah elemen form-nya (mis. `<select id="soal-sumber-soal">`)
   di dalam `#modal-soal`.
2. **`app.js` → `UI.bukaModalSoal(soal)`** — isi elemen itu dari data yang sedang
   diedit: `document.getElementById('soal-sumber-soal').value = soal ? soal.sumber_soal : '';`
3. **`app.js` → `Guru.simpanSoal()`** — sertakan nilainya saat mengirim ke server:
   `sumber_soal: document.getElementById('soal-sumber-soal').value` di dalam objek
   `soal` yang dibangun.
4. *(opsional)* tampilkan di daftar Bank Soal — di `Guru.muatBankSoal()`, tambahkan
   `${s.sumber_soal}` ke template HTML barisnya.

Setelah 4 langkah itu, redeploy Apps Script (bagian 1b) **dan** upload ulang file
frontend ke Netlify (bagian 4) — kolom baru langsung aktif di kedua sisi tanpa
menyentuh Google Sheets sama sekali.

**Catatan untuk Mode Lokal (`LocalBackend` di `app.js`)**: bagian ini sebenarnya
sudah "auto sync" sejak awal, karena `LocalBackend` menyimpan seluruh objek soal apa
adanya (bukan kolom tetap) — jadi field baru otomatis ikut tersimpan begitu form
mengirimkannya, tanpa perlu mengubah `LocalBackend` sama sekali. Yang perlu diubah
untuk Mode Lokal, sama seperti Mode Server: hanya bagian form (`index.html`) dan
pembacaan/penulisan form (`app.js`), bukan mesin penyimpanannya.

**Pengecualian yang perlu diingat**: dua fungsi di `Code.gs`/`app.js` sengaja
**menyaring** field yang dikembalikan demi keamanan, jadi kolom baru tidak otomatis
muncul di sana meski sudah ada di Sheets:
- `actionGetDaftarSiswa_` (Code.gs) / bagian setara di `LocalBackend` — sengaja hanya
  mengembalikan `id, username, nama, kelas, online` (menyembunyikan `password`).
  Kalau kolom baru di sheet `Siswa` perlu tampil di tab **Data Siswa** milik guru,
  tambahkan namanya secara eksplisit di objek yang dikembalikan fungsi tsb.
- `actionGetHasil_` (Code.gs) — hanya mengembalikan ringkasan hasil ke siswa (nilai,
  lulus, pelanggaran, instruksi remedial), bukan seluruh isi sesi, supaya siswa tidak
  bisa melihat kunci jawaban/jawaban siswa lain lewat respons API.

## 9. Catatan penting soal skala (±500 siswa bersamaan)

Google Apps Script + Sheets **bukan** database production-grade, jadi mohon perhatikan:

- **Kuota eksekusi**: akun Google gratis punya batas jumlah eksekusi script per hari
  dan jumlah eksekusi *bersamaan* yang jauh di bawah 500. Akun **Google Workspace**
  (sekolah/instansi) punya kuota jauh lebih tinggi — sangat disarankan dipakai jika tersedia.
- Untuk menekan beban:
  - Klien **tidak** mengirim tiap perubahan jawaban ke server — hanya tiap ~20 detik
    (bisa diperbesar lewat `CONFIG.AUTOSAVE_INTERVAL_MS` di `app.js`) + saat submit.
  - Pertimbangkan menambah jeda `PING_INTERVAL_MS` bila jumlah siswa sangat besar.
  - `LockService` di `Code.gs` sudah dipakai supaya penulisan ke Sheet tidak bentrok,
    tapi ini juga berarti request akan mengantre saat traffic sangat tinggi — uji coba
    dengan jumlah siswa bertahap (mis. 50 → 150 → 500) sebelum ujian sungguhan.
  - Sebisa mungkin **jadwalkan ujian bergiliran per kelas/rombel** (mis. beda 15–30 menit)
    daripada seluruh 500 siswa mulai di detik yang sama — ini paling efektif menurunkan risiko.
  - Pengecekan skema otomatis (`pastikanSkemaTerbaru_`) sudah dibuat murah: begitu
    versi `SCHEMA` sama dengan yang tersimpan di properti skrip, ia hanya melakukan
    1 pembacaan properti lalu berhenti — tidak menambah beban berarti ke kuota Sheets
    saat traffic tinggi.
- Jika ke depannya butuh keandalan lebih tinggi untuk ratusan peserta bersamaan secara
  rutin, arsitektur ini bisa dimigrasikan ke backend seperti Firebase/Supabase tanpa
  banyak mengubah `app.js` (kontrak fungsi `api()` bisa dipertahankan, tinggal ganti isi `Code.gs`
  dengan endpoint baru).

## 10. Pengembangan lanjutan yang disarankan

- Penilaian uraian dengan AI (mis. memanggil Anthropic/OpenAI API dari `Code.gs`
  via `UrlFetchApp`) untuk hasil penilaian yang lebih akurat daripada pencocokan kata kunci.
- Enkripsi password (saat ini disimpan plain text di Sheet — cukup untuk lingkungan
  sekolah tertutup, tapi sebaiknya di-hash bila memungkinkan).
- Log lebih rinci (mis. rekam jumlah kali fullscreen keluar per jenis, snapshot webcam)
  bila kebutuhan pengawasan lebih ketat.
