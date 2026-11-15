# v44 — Ubah Nama Mapel di Bank Soal

- Kartu Mapel di **Bank Soal** kini punya tombol **✏** (di kiri tombol 🗑) untuk mengubah nama, misalnya membetulkan salah ketik. Tombol **✏ Ubah Nama** juga ada di halaman *Kelola Soal* tiap Mapel.
- Nama baru otomatis diterapkan ke **semua soal Mapel itu (termasuk yang diarsipkan)** dan **semua ujian yang memakai Mapel itu**, jadi ujian tidak kehilangan soalnya. Token dan warna kartu tetap sama.
- Nama yang sudah dipakai Mapel lain ditolak (supaya soal tidak tercampur tanpa sengaja). Mengubah huruf besar/kecil saja diperbolehkan.
- **Mode Server**: tempel ulang `Code.gs` lalu *Deploy > Manage deployments > New version* (aksi baru `ubahNamaKategori`; tanpa kolom/sheet baru). **Mode Lokal**: cukup ganti `app.js`, `index.html`, `style.css`.
- File berubah: `app.js`, `index.html`, `style.css`, `Code.gs`, `README.md`. Versi tampilan 44.

# v43 — Menu Leaderboard (peringkat siswa)

- Menu baru **🏆 Leaderboard** di Portal Guru (sidebar, di bawah Rekap Nilai; di HP lewat tombol *Lainnya*).
- **Berdasarkan**: pilih salah satu tes (Tes 1, Tes 2, dst. sesuai nama ujian) atau **Rata-rata Seluruh Tes**. **Kelas**: satu kelas atau Semua Kelas. Ada kotak cari nama.
- Tampilan: ringkasan (peserta, tertinggi, rata-rata, terendah), **podium juara 1-3**, lalu daftar peringkat 1, 2, 3, dst. **sampai siswa terakhir** (nama siswa, kelas, nilai + bar, status Lulus/Remedial). Mode rata-rata menampilkan nilai tiap tes dan jumlah tes yang diikuti.
- Nilai sama = peringkat sama. Bila satu siswa punya lebih dari satu sesi pada tes yang sama, nilai tertinggi dipakai. Rata-rata dihitung dari tes yang diikuti; kotak *Hanya yang ikut semua tes* membatasi ke siswa yang lengkap.
- **⬇ Unduh Excel** menyimpan leaderboard yang sedang tampil. Data dimuat saat menu dibuka dan lewat tombol **Segarkan** (tanpa polling otomatis agar server ringan).
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. Tidak ada perubahan `Code.gs`. Versi tampilan 43.

# v42 — Ubah & Hapus Gambar pada form Ubah Soal

- Pada **Ubah Soal** (dan Tambah Soal), bila soal sudah punya gambar, kotak "Gambar Soal" kini menampilkan tombol **🔄 Ubah Gambar** (pilih gambar pengganti) dan **🗑 Hapus Gambar** (menghapus gambar dari soal). Bila belum ada gambar, tampil kotak "Klik untuk upload" seperti biasa.
- Perubahan baru tersimpan setelah klik **Simpan**. Memilih ulang file yang sama setelah dihapus kini juga berfungsi.
- Gambar pada opsi jawaban sudah punya tombol "Hapus gambar" dan input ganti gambar sejak sebelumnya.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. Tidak ada perubahan `Code.gs`. Versi tampilan 42.

# v41 — Perbaikan cetak: gambar pada opsi & kartu panjang

- Perbaikan tata letak cetak PDF: soal dengan gambar (di soal maupun di opsi) tidak lagi menyisakan halaman setengah kosong atau baris opsi yang membesar. Contoh uji: 5 halaman menjadi 2 halaman.
- Gambar opsi tampil di samping teks opsi; kartu yang lebih tinggi dari satu halaman boleh terpotong antar halaman. Detail yang kosong dari server dianggap gagal dimuat pada Cetak Detail Kelas.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. Versi tampilan 41.

# v40 — Cetak Detail Kelas (PDF) di Rekap Nilai

- Tombol baru **🖨 Cetak Detail Kelas (PDF)** di toolbar Rekap Nilai. Pilih ujian dan **Filter Kelas** (bisa juga cari / Lulus-Remedial), lalu klik: aplikasi mengambil detail jawaban semua siswa yang tampil dan membuka dialog cetak (pilih *Save as PDF*).
- **Halaman 1**: daftar nama, kelas, nilai, status, dan jumlah soal belum benar (urut kelas lalu nama). Setelah itu **tiap siswa mulai di halaman baru** dengan banner nama + nilai, ringkasan, dan soal yang salah beserta jawaban siswa, kunci, dan pembahasan. Siswa yang semua benar tetap punya bagian dengan keterangan "Semua jawaban benar".
- Nama siswa juga tertera di setiap kartu soal sehingga halaman lanjutan tetap jelas milik siapa. Siswa yang detailnya gagal dimuat dicatat di halaman 1.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. Tidak ada perubahan `Code.gs`. Versi tampilan 40.

# v39 — Perbaikan Detail Jawaban: area kosong & cetak PDF blank

- **Detail Jawaban (layar)**: jendela kini berupa kolom tetap — judul & tombol selalu terlihat, hanya daftar soal yang bisa di-scroll (tidak ada scroll ganda).
  Baris/paragraf kosong berlebih di awal & akhir soal, opsi, dan pembahasan (sering ikut dari impor Word) otomatis dibuang, sehingga tidak ada lagi ruang kosong panjang.
- **Cetak / PDF**: sekarang membuat lembar cetak khusus A4 — kop sekolah (logo & nama), judul laporan, identitas siswa (nama, kelas, nilai, status, waktu selesai),
  ringkasan, daftar nomor yang perlu dievaluasi, lalu kartu soal yang ringkas. Warna selalu terang (tema gelap tidak ikut) sehingga **tidak blank lagi**.
  Opsi pendek ditata 2 kolom, gambar dibatasi ukurannya, kartu tidak terpotong antar halaman, ada nomor halaman. Nama file PDF otomatis "Detail Jawaban - Nama - Kelas".
- File berubah: `app.js`, `style.css`, `index.html` (versi), `README.md`. Tidak ada perubahan `Code.gs`. Versi tampilan 39.

# v38 — Detail Jawaban per Siswa di Rekap Nilai (untuk evaluasi guru)

Guru kini bisa melihat **soal mana yang dijawab salah oleh tiap siswa dan apa jawaban siswa tersebut**, sebagai bahan evaluasi/remedial.

- **Rekap Nilai**: tombol **🔍 Detail Jawaban** di setiap baris siswa. Membuka jendela berisi nama, kelas, nilai, status Lulus/Remedial, ringkasan
  (benar / sebagian benar / salah / tidak dijawab / perlu dikoreksi), dan daftar **nomor soal yang perlu dievaluasi**.
- Tab **Yang Salah / Belum Benar** (default) dan **Semua Soal**. Tiap soal menampilkan pertanyaan, gambar, **jawaban yang dipilih siswa** (merah),
  **kunci jawaban** (hijau), skor, dan pembahasan. Mendukung pilihan ganda, kompleks, benar/salah, menjodohkan, dan uraian.
- Urutan opsi yang tampil **sama dengan yang dilihat siswa** (opsi teracak diterjemahkan dengan benar). Nomor soal mengikuti lembar siswa tersebut
  (soal diacak per siswa).
- Tombol **Sebelumnya / Berikutnya** untuk berpindah antar siswa (mengikuti Filter Kelas, cari, dan filter Lulus/Remedial yang sedang aktif).
- **Cetak / PDF**: mencetak (atau menyimpan PDF) detail siswa yang sedang dibuka, untuk diberikan ke siswa. Mengikuti tab yang tampil.
- **⬇ Evaluasi Jawaban Salah** (toolbar Rekap Nilai): unduh Excel untuk semua siswa yang sedang tampil — sheet *Ringkasan* (1 baris per siswa)
  dan sheet *Jawaban Salah* (1 baris per soal yang salah: pertanyaan, jawaban siswa, kunci, status, skor, pembahasan).
- Guru **selalu** boleh melihat detail ini, walau opsi *Izinkan siswa melihat detail jawaban* dimatikan pada ujian (opsi itu hanya membatasi siswa).
- **Mode Server**: tempel ulang `Code.gs` lalu *Deploy > Manage deployments > New version* (aksi `getDetailJawaban` kini menerima `guruId`).
  Tidak ada kolom/sheet baru. **Mode Lokal**: cukup ganti `app.js`, `index.html`, `style.css`.
- File berubah: `app.js`, `index.html`, `style.css`, `Code.gs`, `README.md`. Versi tampilan 38.

# v37 — Filter Lulus / Remedial di Rekap Nilai

- Pilihan **Semua Hasil / ✅ Lulus / 🔁 Remedial** di Rekap Nilai, bisa digabung dengan Filter Kelas, kotak cari, dan *Diblokir saja*.
- Info di atas tabel menampilkan jumlah lulus dan remedial dari yang sedang tampil. Unduh "sesuai filter" dan Hapus Semua Nilai mengikuti filter ini.
- File berubah: `app.js`, `index.html`, `style.css` (versi), `README.md`. Versi tampilan 37.

# v36 — Filter "Diblokir saja"

- **Data Siswa**: kotak centang *🚫 Akun diblokir saja (N)* di samping kotak cari; hanya akun yang diblokir guru yang tampil (bisa digabung dengan Filter Kelas & cari).
- **Pemantauan Ujian** dan **Rekap Nilai**: kotak centang *🚫 Diblokir saja (N)* untuk siswa yang sesi ujiannya diblokir karena melewati batas pelanggaran.
- Angka (N) = jumlah yang diblokir; merah bila ada. Ikut diperbarui oleh tombol Segarkan. "Hapus Semua Nilai"/unduh di Rekap mengikuti filter yang tampil.
- File berubah: `app.js`, `index.html`, `style.css` (versi), `README.md`. Versi tampilan 36.

# v35 — Peringatan pindah aplikasi/tab juga muncul di iPhone

- Peringatan *"Wajib Unggah Bukti"* saat siswa berpindah tab/aplikasi kini tampil di SEMUA perangkat, termasuk iPhone/iPad yang tidak mendukung layar penuh
  (sebelumnya hanya perangkat yang mendukung layar penuh). Di perangkat tanpa layar penuh, tombol peringatan berbunyi *"Mengerti, Lanjut Unggah"*.
- Masa tenggang saat membuka kamera/galeri tetap berlaku. File berubah: `app.js`, `index.html`, `style.css` (versi), `README.md`. Versi tampilan 35.

# v34 — Halaman unggah bukti wajib layar penuh

- Selama bukti **belum terkirim** (wajib: belum ada foto terkirim, atau ada foto yang masih diproses/dikirim/gagal), halaman unggah masuk **layar penuh**.
- **Keluar layar penuh** (Esc, dll.) atau **pindah tab/aplikasi**: muncul peringatan *"Wajib Unggah Bukti"*; tombolnya mengembalikan ke layar penuh.
- Bila browser menolak layar penuh otomatis (mis. halaman dimuat ulang), muncul **penutup "Wajib Layar Penuh"** dengan tombol *Masuk Layar Penuh* sampai siswa menekannya.
- Di Chrome/Edge, tombol **Esc dikunci** (harus ditahan beberapa detik untuk keluar) bila didukung.
- **Kamera/galeri tetap bebas dipakai**: ada masa tenggang saat memilih foto, jadi tidak dianggap meninggalkan halaman.
- Tidak menambah hitungan pelanggaran (nilai sudah tersimpan). Pembatasan hilang otomatis setelah semua foto berstatus **Terkirim**; layar penuh ditutup saat nilai ditampilkan.
- Perangkat tanpa dukungan layar penuh (mis. iPhone) dilewati agar siswa tidak tertahan.
- Pemblokiran tombol Back/F5/Keluar dari v31 tetap berlaku. File berubah: `app.js`, `index.html`, `style.css` (versi), `README.md`. `Code.gs` & `config.js` tidak berubah. Versi tampilan 34.

# v33 — Sidebar guru lebih lega: Mode Server & Opsi Cadangan dipindah ke Pengaturan

- **Dihapus dari sidebar**: kotak "Mode: Server (Google Sheets)…" dan blok "Opsi Cadangan". Sidebar kini hanya menu + info akun + Keluar.
- **Pengaturan**: status koneksi tetap tampil di panel *Koneksi Google Sheets* (lengkap dengan interval sinkron); panel baru *Opsi Cadangan*
  (tombol Kirim ke Spreadsheet) muncul otomatis hanya saat Mode Server aktif. Tombol "Tarik Data Terbaru" diganti tombol **Segarkan** di tiap halaman.
- File berubah: `app.js`, `index.html`, `style.css` (nomor versi), `README.md`. `Code.gs` & `config.js` tidak berubah. Versi tampilan 33.

# v32 — Tombol "Segarkan" di halaman guru (data terbaru tanpa memuat ulang halaman)

Masalah: untuk melihat nilai siswa yang baru mengirim, guru harus memuat ulang seluruh halaman lalu memilih lagi jenis ujian dan kelas.

- **Tombol 🔄 Segarkan** kini ada di: **Rekap Nilai**, **Log Pelanggaran**, **Analisis Soal**, **Pemantauan Ujian**, **Kelola Ujian**,
  **Bank Soal**, **Data Siswa**, **Status Login**, dan **Dashboard**. Ikon berputar selama data diambil.
- **Pilihan tetap**: ujian yang dipilih, Filter Kelas, dan kotak cari TIDAK berubah. Hanya isi tabel yang diperbarui, jadi nilai siswa
  yang baru mengirim langsung muncul di tempat yang sama.
- Di sebelah tombol tampil **"Diperbarui jj.mm.dd"** (juga ikut berubah saat pembaruan otomatis berjalan di Mode Server).
- **Centang di Rekap Nilai tidak hilang** saat disegarkan (aman bila sedang memilih nilai untuk dihapus).
- **Bila gagal terhubung**, tabel sebelumnya tetap tampil (tidak dikosongkan) dan muncul pemberitahuan.
- Belum memilih ujian: tombol hanya menyegarkan daftar ujian dan mengingatkan untuk memilih ujian.
- Bekerja di Mode Server maupun Mode Lokal.
- File berubah: `app.js`, `style.css` (hanya nomor versi), `index.html`, `README.md`. `Code.gs` & `config.js` tidak berubah. Versi tampilan 32.

# v31 — Siswa tidak bisa meninggalkan halaman unggah bukti sebelum foto terkirim (screenshot tetap bebas)

**Penjaga halaman unggah bukti orak-orik.** Terkunci bila bukti WAJIB dan belum ada satu foto pun terkirim, atau ada foto yang
masih diproses / dikirim / gagal. Mode *boleh dilewati*: terkunci hanya selama ada foto yang belum selesai terkirim.
Kunci terbuka otomatis setelah semua foto berstatus **Terkirim** (banner berubah dari oranye ke hijau).

- **Tombol Back / geser kembali (HP)**: dibatalkan, siswa tetap di halaman, muncul peringatan *"Bukti belum diunggah dan dikirim ke
  server. Anda tidak bisa meninggalkan halaman ini. Unggah terlebih dahulu foto bukti…"*. Ditekan berkali-kali tidak menumpuk.
- **F5, Ctrl+R, Ctrl+Shift+R, Cmd+R, Alt+Kiri**: diblokir + peringatan yang sama.
- **Tombol Keluar/logout**: ditahan sampai bukti terkirim.
- **Menutup tab / tombol muat-ulang browser**: memunculkan peringatan bawaan browser (browser tidak mengizinkan teks kustom
  atau pemblokiran total untuk aksi ini).
- **Tarik-untuk-muat-ulang di HP** dicegah (`overscroll-behavior`).
- **Bila halaman tetap sampai dimuat ulang / tab ditutup lalu dibuka lagi di tab yang sama**: siswa langsung DIKEMBALIKAN ke halaman
  unggah (bukan beranda), foto yang sudah terkirim tampil kembali berstatus Terkirim, lalu setelah selesai nilai tampil.
  (Bila sampai login ulang dari awal dan belum ada foto, jalur pemulihan v25 dari server tetap berlaku.)
- **Sesi diblokir karena pelanggaran** (melebihi batas) kini juga melewati langkah unggah bukti bila fitur diaktifkan.
- **Screenshot BEBAS di halaman unggah, halaman nilai akhir, dan detail jawaban**: aplikasi tidak memblokir PrintScreen,
  Win+Shift+S, Alt+PrintScreen, Ctrl+P, klik kanan, maupun salin; anti-curang sudah nonaktif sejak ujian dikumpulkan, jadi berpindah
  jendela (mis. ke Snipping Tool) tidak menimbulkan pelanggaran/peringatan.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. `Code.gs` & `config.js` tidak berubah. Versi tampilan 31.

# v30 — Penampil gambar bukti orak-orik untuk guru: perbesar, perkecil, putar

Masalah: foto coretan siswa sering tampil menyamping (teks vertikal) dan berada di kotak yang harus digulir sehingga sulit dibaca.

- **Toolbar di atas gambar** (selalu terlihat): **Perkecil**, indikator zoom (%), **Perbesar**, **Putar Kiri**, **Putar Kanan**, **Pas Layar**.
  Putar memutar 90° per klik dan otomatis memas ulang gambar agar tampil utuh.
- **Klik gambar** = zoom cepat 250% di titik yang diklik; klik lagi = kembali pas layar.
- **Roda mouse** = zoom di titik kursor · **seret (drag)** = geser saat diperbesar · **cubit 2 jari** di HP/tablet = zoom.
- **Keyboard**: `+` perbesar, `-` perkecil, `0` pas layar, `R` putar kanan, `L` putar kiri, `←` `→` pindah foto, `Esc` tutup.
- Zoom 50%–800%; gambar tidak bisa terseret keluar dari kanvas.
- **Arah putar diingat per foto** (di browser guru): buka ulang foto yang sama langsung tampil benar. Foto yang belum pernah diputar
  mengikuti arah putar terakhir (satu HP biasanya satu orientasi). Pindah foto mereset zoom/geser.
- Gaya penampil disuntik dari `app.js` (aman dari cache `style.css`). Versi tampilan 30.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. `Code.gs` & `config.js` tidak berubah dari v29.

# v29 — Kamera web untuk laptop/PC pada unggah bukti orak-orik

Masalah: di laptop, tombol *Kamera* malah membuka pemilih file (sama seperti *Galeri*). Penyebab: atribut `capture` pada input file
hanya dipahami browser HP/tablet; di laptop/PC browser mengabaikannya.

- **Laptop/PC**: tombol *Kamera* (tombol besar, tile "+", maupun lembar pilihan "+") kini membuka **webcam langsung di browser**:
  pratinjau langsung, tombol jepret bulat, lalu *Ulangi* / *Simpan & Ambil Lagi* (untuk beberapa lembar coretan berturut-turut) /
  *Gunakan Foto*. Foto tidak dibalik (mirror) agar tulisan terbaca benar. Kamera dimatikan (lampu indikator padam) saat ditutup.
- Bila ada lebih dari satu kamera: tombol *Ganti Kamera*. Kamera belakang dipilih otomatis jika tersedia; resolusi ideal 1920×1080.
- Pesan jelas bila izin kamera ditolak (cara mengizinkan), kamera tidak ada, atau sedang dipakai aplikasi lain (Zoom/Meet), plus
  tombol *Coba Lagi* dan *Pilih dari Galeri*. Bila browser tidak mendukung kamera (mis. bukan HTTPS), otomatis membuka pemilih file.
- **HP/tablet (termasuk iPad)**: tetap memakai aplikasi kamera bawaan lewat `capture` seperti sebelumnya.
- Foto dari webcam melewati alur yang sama dengan foto lain: diproses, diunggah, diverifikasi server, dicoba ulang otomatis.
- Pertama kali dipakai, browser meminta izin kamera (klik *Izinkan*). Situs harus dibuka lewat HTTPS (GitHub Pages sudah HTTPS).
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. `Code.gs` & `config.js` tidak berubah. Versi tampilan 29.

# v28 — Tombol "+" tambah foto kini bisa diklik penuh (pilih Kamera / Galeri) + tombol lebih timbul

Masalah: di halaman unggah bukti orak-orik, tombol "+" besar hanya hiasan; yang bisa diklik hanya tombol kecil Kamera & Galeri.

- **Klik di mana pun pada tile "+ Tambah foto"** (lingkaran "+", tulisan, atau area tile) kini membuka **lembar pilihan**:
  *Ambil Foto* (kamera) atau *Pilih dari Galeri* (boleh banyak foto sekaligus), plus tombol Batal. Esc / klik latar menutupnya.
  Bisa juga dengan keyboard (Tab ke tile lalu Enter/Spasi).
- Kamera/galeri dipicu **langsung dari klik pilihan** (tanpa jeda), sehingga tetap diizinkan browser di iPhone/Safari.
- **Tombol Kamera & Galeri di bawah "+" tetap berfungsi langsung** (tanpa lembar pilihan) dan tampil **lebih timbul**: bayangan,
  efek terangkat saat disorot, Kamera berwarna solid & Galeri berbingkai, ukuran lebih besar dan lebar penuh.
- Lembar pilihan tidak bisa dibuka saat foto sedang diperiksa ke server atau saat kuota 10 foto sudah penuh.
- Gaya lembar pilihan disuntik dari `app.js` (seperti dialog), jadi tidak bergantung pada `style.css` di cache. Versi tampilan 28.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. `Code.gs` & `config.js` tidak berubah.

# v27 — Tata letak soal bergambar yang presisi (tanpa menggulir untuk melihat jawaban)

Masalah: gambar soal tampil sebesar ukuran aslinya sehingga siswa harus menggulir ke bawah dulu untuk melihat pilihan jawaban.

- **Gambar soal dibatasi tingginya** (±44% tinggi layar, maks. 420 px; di HP ±40%) dan tetap proporsional (tidak gepeng). Tetap
  menghormati tombol *Ukuran soal* (A− / A+). Klik gambar = perbesar penuh (lightbox, bisa zoom & geser) seperti sebelumnya.
- **Layar lebar (≥ 1100 px) + soal bergambar → DUA KOLOM**: teks soal & gambar di kiri, **pilihan jawaban di kanan** (menempel saat
  digulir), jadi soal, gambar, dan semua jawaban terlihat sekaligus. Di kolom ini gambar boleh lebih besar (±60% tinggi layar,
  maks. 560 px). Soal tanpa gambar tetap satu kolom lebar. Berlaku juga untuk uraian, menjodohkan, dan pilihan ganda kompleks.
- **Bar Sebelumnya / Ragu-ragu / Berikutnya menempel di bawah layar** sehingga selalu terlihat tanpa menggulir.
- Pratinjau soal guru & detail jawaban tidak berubah. Penanda versi tampilan dinaikkan ke 27 (`--versi-css`, `VERSI_APLIKASI`,
  `?v=27`) sehingga bilah "Muat Ulang Tampilan" muncul bila `style.css` di cache browser masih lama.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. `Code.gs` & `config.js` tidak berubah.

# v26 — Perbaikan dialog konfirmasi (tidak lagi menumpuk) + tombol "+" tambah foto

**Masalah yang diperbaiki**: dialog konfirmasi (mis. "Hapus Nilai Siswa?") tampil tanpa gaya — jatuh ke bagian bawah halaman, tidak
di tengah, tombol Hapus di belakangnya masih bisa diklik berkali-kali sehingga dialog menumpuk. Penyebab: `app.js` baru terpasang
tetapi `style.css` yang dipakai browser masih versi lama (cache browser / GitHub Pages).

- **Gaya dialog kini disuntik langsung dari `app.js`** (tidak lagi bergantung pada `style.css`), jadi dialog selalu tampil di
  tengah layar dengan latar buram yang menutupi seluruh halaman — meski `style.css` di cache masih lama.
- **Hanya satu dialog pada satu waktu**: menekan tombol Hapus berkali-kali tidak lagi memunculkan dialog bertumpuk (klik berikutnya
  diabaikan). Dialog informasi yang beruntun diantre, bukan dibuang.
- **Halaman di belakang dialog dikunci** (tidak bisa diklik maupun difokus dengan Tab) selama dialog terbuka.
- **Deteksi tampilan usang**: bila `style.css` yang dimuat bukan versi terbaru, muncul bilah peringatan oranye di atas layar dengan
  tombol **Muat Ulang Tampilan** (menyegarkan cache lalu memuat ulang). Penanda versi: `--versi-css` di `style.css` harus sama
  dengan `VERSI_APLIKASI` di `app.js`.
- `index.html` kini memuat `style.css?v=26` dan `app.js?v=26` (cache-busting): setiap update naikkan angka `v=` ini agar browser
  mengambil file baru.
- **Unggah bukti orak-orik**: setelah ada foto, muncul tile **"+ Tambah foto"** di samping foto-foto (tombol *Kamera* dan *Galeri*,
  menampilkan sisa kuota foto). Tile hilang saat sudah 10 foto dan muncul lagi bila ada foto dihapus.
- File berubah: `app.js`, `style.css`, `index.html`, `README.md`. `Code.gs` & `config.js` tidak berubah dari v25.

# v25 — Bukti Orak-Orik Jawaban (foto coretan siswa) — opsional per ujian

**Alur siswa**: klik *Selesai* → **nilai dikirim & tersimpan ke server lebih dulu** → halaman *Unggah Bukti Orak-Orik* →
(foto terverifikasi) → baru **nilai akhir (Lulus / Perlu Remedial)** tampil.

- **Opsional di akun guru**: di form Buat/Ubah Ujian ada pilihan *Bukti Orak-Orik Jawaban*:
  **Nonaktif** (cocok untuk latihan — alur lama, nilai langsung tampil) · **Aktif — wajib** (min. 1 foto, disarankan untuk
  ujian) · **Aktif — boleh dilewati**. Bisa diubah kapan saja per ujian.
- **Foto**: tombol *Ambil Foto* (kamera) & *Pilih dari Galeri* (boleh banyak sekaligus, maks. 10 per ujian). Mendukung
  JPG/PNG/WEBP/GIF/BMP/AVIF dan **HEIC/HEIF (iPhone) yang otomatis dikonversi ke JPEG**; foto resolusi tinggi otomatis
  dikecilkan (sisi terpanjang 2000 px, kualitas tinggi) & diperbaiki orientasinya sebelum dikirim.
- **Dijamin terkirim**: tiap foto otomatis dicoba ulang sampai 4x; server memverifikasi ukuran berkas di Drive harus sama
  dengan yang dikirim; kirim ulang tidak membuat duplikat; sebelum lanjut, daftar foto diperiksa ulang ke server. Foto yang
  gagal diberi tombol *Coba lagi*; tombol *Selesai & Lihat Nilai* terkunci selama ada foto yang belum terkirim.
- **Pemulihan**: bila bukti WAJIB tapi siswa menutup halaman / HP mati sebelum mengunggah, saat masuk lagi dengan token yang
  sama ia diarahkan langsung ke halaman unggah (nilainya sudah aman), bukan ke pesan "sudah selesai".
- **Akun guru**: Rekap Nilai punya kolom **Bukti Orak-Orik** tepat di sebelah **Nilai** — miniatur + jumlah foto (klik untuk
  galeri besar: panah/keyboard ←→, Esc menutup, tombol *Buka ukuran asli*) atau badge *Belum unggah* bila wajib tapi kosong.
  Ekspor Excel menambah kolom *Foto Bukti Orak-Orik* (jumlah foto).
- **Hapus nilai siswa** otomatis ikut menghapus foto buktinya (di sheet & Drive).

Catatan teknis:
- **Mode Server**: tempel ulang `Code.gs` lalu *Deploy > Manage deployments > New version*. Sheet baru **BuktiOrek** dan kolom
  `bukti_orek` di sheet Ujian dibuat otomatis. Foto disimpan di folder Drive **CBT_Bukti_Orek** (berbagi "siapa pun dengan
  link", sama seperti folder gambar soal) agar bisa tampil di Portal Guru. Aksi baru: `uploadBuktiOrek`, `getBuktiOrek`,
  `hapusBuktiOrek`. Pertama kali ada yang mengunggah, Apps Script bisa meminta otorisasi Drive.
- **Mode Lokal**: foto disimpan di perangkat ini (dikecilkan lebih agresif karena kuota browser terbatas).
- Pustaka konversi HEIC (`heic2any`) hanya diunduh saat siswa memilih foto HEIC (butuh internet, CDN cadangan otomatis).
- File berubah: `Code.gs`, `app.js`, `index.html`, `style.css`, `README.md`.

# v24 — Dialog konfirmasi profesional di seluruh Portal Guru

Semua pop-up bawaan browser (`confirm`, `prompt`, `alert` — 33 titik) diganti dengan dialog modern bergaya aplikasi CBT berbayar.

- **Tampilan**: kartu tengah layar dengan latar buram, ikon berwarna sesuai tingkat risiko (merah = berbahaya, kuning =
  peringatan, hijau = aman, biru = informasi), judul jelas, penjelasan dampak, tombol aksi berlabel spesifik
  (mis. "Ya, Buka Blokir", "Hapus Permanen") dan Batal. Mengikuti 33 gaya tema & mode gelap; di HP tombol utama tampil di atas.
- **Rincian**: dialog Buka Blokir menampilkan siswa, kelas, alasan blokir, dan sudah berapa lama diblokir. Dialog Hapus Siswa
  menampilkan username & kelas, dst.
- **Pengaman ekstra** untuk tindakan paling berbahaya (Hapus Kelas, Hapus Permanen Semua Arsip, Reset Total Sesi, Hapus Semua
  Nilai Ujian): tombol terkunci sampai guru mengetik kata konfirmasi (HAPUS / RESET). Pada dialog berisiko, fokus awal di
  tombol Batal supaya tidak terhapus karena salah tekan Enter.
- **Isian lebih nyaman** (pengganti `prompt`): Blokir Akun (alasan + pilihan cepat), Atur Waktu (angka + pilihan +5/+10/+15/+30/−5
  menit, ditolak bila bukan angka), Tambah Mapel (pilihan cepat), Sisipkan/Ubah Rumus (tombol cepat pecahan, pangkat, akar, π).
- **Peringatan impor** (pengganti `alert`) kini berupa daftar yang bisa digulir.
- Papan ketik: Esc = batal, Enter = lanjut, Tab terkunci di dalam dialog; klik latar gelap = batal.
- File berubah: `app.js`, `style.css`, `README.md`. `index.html`, `Code.gs`, `config.js`, ikon tidak berubah.
- Dialog siap dipakai fitur baru: `await Dialog.konfirmasi({...})`, `Dialog.input({...})`, `Dialog.info({...})`.

# v23 — Tampilan ruang ujian siswa lebih profesional + watermark nama guru

- **Watermark kecil** di pojok kanan-bawah layar ujian: *"Guru Pengajar · Komang Edi Suastrawan, S.Pd., M.Pd."*.
  Samar, tidak bisa diklik/diseleksi, tidak menutupi soal (ada ruang kosong di bawah konten), dan tidak ikut tercetak.
  Ganti nama / sembunyikan tanpa mengedit app.js: tambahkan di `config.js` baris
  `window.CBT_WATERMARK = 'Nama Guru, S.Pd.';` (isi `''` untuk menyembunyikan).
- **Top bar baru**: logo & nama aplikasi, judul ujian, identitas peserta (nama • kelas), tombol Simpan, dan timer berbentuk
  pil dengan ikon jam (merah & berdenyut saat sisa < 2 menit). Bar progres tipis di bawah top bar menunjukkan persen soal terjawab.
- **Panel Navigasi Soal**: kartu tersendiri berisi progres "terjawab / total", kotak nomor, jumlah Sudah dijawab / Ragu-ragu /
  Belum dijawab, dan tombol "Selesai & Kumpulkan". Panel tetap menempel saat soal digulir (desktop).
- **Kartu soal & opsi**: label "Soal n dari N" berbentuk chip, teks lebih lega, opsi berupa kartu dengan huruf kotak
  membulat; opsi terpilih diberi bingkai & cincin warna yang jelas. Tombol Sebelumnya/Ragu-ragu/Berikutnya dalam bar tersendiri.
- Warna memakai variabel tema, jadi tetap mengikuti 33 gaya & mode gelap. Hanya layar ujian siswa yang berubah
  (Pratinjau Guru & Detail Jawaban tidak).
- File berubah: `index.html`, `app.js`, `style.css`, `README.md`. `Code.gs` & `config.js` tidak berubah.

# v22 — Ikon ungu-pink + lambang sekolah (SMP Negeri 2 Seririt)

- Ikon aplikasi kini bergradien **ungu → pink** dengan simbol lembar ujian bercentang + pensil emas
  (senada dengan warna lambang sekolah), dan **lambang sekolah kecil** di lencana pojok kanan-atas.
- Ukuran 16/32 px (tab browser) memakai versi sederhana tanpa lambang agar tetap jelas.
- Nama file ikon tidak berubah; `theme_color` manifest menjadi ungu (#9a5cf5).
- `icons/icon-source.svg` = sumber vektor (lambang tertanam), bisa diedit/diekspor ulang.

# v21 — Ikon aplikasi baru (cerah & profesional)

- Ikon bawaan diganti: latar gradien biru-cyan cerah, simbol **lembar ujian bercentang + pensil** (tanpa tulisan
  "SMP 2"/"TEST"), gaya seperti ikon aplikasi profesional. Versi 16/32 px disederhanakan agar tetap jelas.
- Semua ukuran diperbarui dengan **nama file yang sama** (`icons/*.png`, `favicon.ico`), jadi tidak ada yang perlu
  diubah di `index.html`/`manifest.json` selain `theme_color` manifest (kini biru cerah).
- Ikon **maskable** (Android) & **apple-touch-icon** (iPhone) dibuat full-bleed dengan simbol di area aman.
- `icons/icon-source.svg` = sumber vektor ikon, bisa diedit/diekspor ulang bila ingin warna lain.
- Logo sekolah sendiri tetap bisa dipasang lewat Portal Guru → Pengaturan → Identitas Aplikasi (otomatis menggantikan ikon ini).

# v20 — Blokir Akun Siswa (hukuman untuk yang tidak serius mengerjakan kuis)

Portal Guru → **Data Siswa**: setiap baris kini punya tombol **🚫 Blokir** (dan **✅ Buka Blokir** bila sedang diblokir).

- Klik **Blokir** → isi alasan singkat (opsional) → akun siswa itu langsung diblokir.
- Selama diblokir, siswa tersebut **tidak bisa mengikuti ujian/kuis apa pun** (tidak bisa mencari token, tidak bisa
  memulai ataupun melanjutkan ujian). **Teman sekelasnya tetap bisa mengerjakan** — blokir berlaku per siswa.
- Siswa masih bisa login; portalnya menampilkan banner merah *“Akun Anda sedang diblokir”* beserta alasannya,
  dan kolom token terkunci. Banner muncul/hilang otomatis (mengikuti ping tiap ±menit) tanpa siswa perlu login ulang.
- Klik **Buka Blokir** → siswa langsung bisa mengerjakan kuis lagi.
- Di tab Data Siswa tampil badge **🚫 Diblokir**, alasannya, dan jumlah akun yang sedang diblokir.
- Mengubah data siswa (tombol *Ubah*) tidak menghapus status blokir.
- Berbeda dengan status sesi **“diblokir karena pelanggaran”** (anti-curang, per ujian): blokir akun ini berlaku
  untuk semua ujian sekaligus dan diatur manual oleh guru.

Catatan teknis:
- **Mode Server**: tempel ulang `Code.gs` lalu *Deploy > Manage deployments > New version*. Kolom baru `blokir`,
  `blokir_alasan`, `blokir_sejak` di sheet **Siswa** dibuat otomatis (skema otomatis). Tidak perlu `setupAwal` lagi.
  Aksi baru: `blokirSiswa`. Status dicache 10 menit (perubahan lewat aplikasi langsung berlaku; bila kolom `blokir`
  diedit manual di Sheets, isi `ya` untuk memblokir, kosongkan untuk membuka — efeknya paling lambat 10 menit).
- **Mode Lokal**: otomatis berlaku, hanya perlu mengganti `app.js` & `index.html`.
- Siswa yang sedang di tengah ujian saat diblokir tidak langsung dikeluarkan (jawaban tetap aman tersimpan);
  bila halaman ujiannya dimuat ulang, ia tidak bisa lanjut. Untuk menghentikan seketika, gunakan **Paksa Selesai**
  di tab Pemantauan Ujian.
- File yang berubah: `Code.gs`, `app.js`, `index.html`, `README.md`. `config.js` & `style.css` tidak berubah.

# v19 — Rumus tampil langsung di kotak editor (Ubah Soal)

- Di form Tambah/Ubah Soal, rumus di kotak **Pertanyaan, Opsi, dan Pembahasan** kini langsung tampil sebagai
  pecahan/rumus (bukan teks mentah `$\\frac{1}{100}$`). Saat disimpan tetap tersimpan sebagai `$...$`.
- **Klik 2x** pada rumus untuk mengubahnya; hapus dengan Backspace/Delete. Tombol **RUMUS Σ** juga langsung menampilkan hasilnya.
- Hanya `app.js` & `style.css` yang berubah.

# v18 — Import Word: rumus matematika & format Pembahasan tidak lagi hilang/berantakan

Masalah: saat template Word (.docx) diimpor, rumus yang dibuat lewat **Insert > Equation** (pecahan,
tanda coret angka nol, pangkat, akar, dst) **hilang**, dan kolom **Pembahasan** menyatu jadi satu baris
(`Diketahui:- Tinggi air ...`) tanpa huruf tebal.

Perbaikan (hanya `app.js` & `style.css`; `Code.gs`/`index.html` tidak berubah):
- Rumus Word (OMML) diubah otomatis menjadi `$LaTeX$` sebelum dibaca mammoth, lalu dirender KaTeX di
  Pertanyaan, Opsi, dan Pembahasan (layar siswa, pratinjau, detail jawaban). Didukung: pecahan, pangkat/indeks,
  akar, tanda kurung, sigma/integral, matriks, aksen, garis atas/bawah, dan **tanda coret** (`\cancel`).
- Kolom **Pertanyaan, Opsi A–H, Pembahasan** kini dibaca sebagai teks kaya: baris/paragraf tetap terpisah,
  **tebal/miring**, pangkat/indeks, daftar, dan gambar di dalam sel ikut terbawa. Kolom lain (Tipe, Kunci, Bobot, dst) tetap teks biasa.
- Memakai JSZip (cdnjs, dimuat otomatis saat import, seperti mammoth). Perlu internet saat import.
- Rumus yang diketik manual `$...$` tetap berfungsi seperti biasa.

# v10 — Tampilan HP baru (Portal Guru & Siswa)

Hanya aktif di layar kecil; tampilan desktop tidak berubah. Semua warna/radius memakai variabel tema, jadi 33 gaya & Studio Gaya tetap berlaku.

- **Login**: hero logo + nama sekolah, formulir tampil sebagai *bottom sheet* dengan tombol besar.
- **Top bar kaca buram** berisi logo dan judul halaman aktif.
- **Bottom navigation (guru)**: Beranda · Soal · Ujian · Nilai · Lainnya (membuka menu lengkap).
- **Dashboard**: kartu ringkasan 2 kolom, tombol hero ringkas.
- **Tabel otomatis jadi kartu** di HP (label kolom + tombol aksi). Tabel lebar (>8 kolom, mis. matriks jawaban) tetap bisa digeser.
- **Modal jadi bottom sheet** dengan tombol Batal/Simpan yang menempel di bawah.
- **Form**: input 48px, font 16px (tanpa auto-zoom iOS), tombol min. 46px.
- **Portal siswa**: kolom token besar & terpusat.
- **Ruang ujian**: top bar 2 baris (judul + timer), tombol Sebelumnya/Berikutnya menempel di bawah, nomor soal lebih besar. Area aman iPhone (notch) dihormati.
- Hanya `index.html`, `app.js`, `style.css` yang berubah; `Code.gs` tidak berubah.

# v9 — Pesan hasil per nilai (0–100) + Import dari Word

Di **Portal Guru → Ujian → Buat/Ubah Ujian → Pesan untuk Siswa Berdasarkan Nilai**:

- Pesan kini diatur **per nilai: 0, 1, 2, … 100** (sebelumnya per rentang 1–5, 6–10, dst.). Editor menampilkan 101 baris dalam kotak yang bisa digulir.
- **⬇ Unduh Template Word** — tabel 2 kolom (*Nilai | Pesan*) berisi 101 baris, sudah terisi pesan yang sedang ada di editor. Ubah teksnya di Word.
- **Import dari Word (.docx)** — sekali pilih file, semua nilai terisi pesannya. Hasil import muncul di editor (cek dulu), lalu klik **Simpan Ujian**. Sel *Pesan* yang kosong dilewati (memakai pesan yang ada/default). Kolom *Nilai* juga boleh berupa rentang, mis. `76-80`. Cadangan: paragraf biasa berformat `85: pesan` atau `76-80 = pesan`.
- **Isi cepat** — satu pesan yang sama untuk beberapa nilai berurutan tanpa Word.
- Ujian lama yang tersimpan per rentang otomatis dipecah ke tiap nilai; tidak ada data yang hilang.
- Penyimpanan ringkas: hanya pesan yang **berbeda dari default** yang disimpan, nilai berurutan dengan pesan sama digabung (batas sel Sheets 50.000 karakter dicek, error bila terlampaui).
- Hanya `index.html`, `app.js`, `style.css` yang berubah; **`Code.gs` tidak berubah** (format `pesan_nilai` tetap kompatibel).

# v8 — Gaya UI baru & perbaikan galeri gaya

- **+13 gaya baru** (total 33): *Portal Navy Magenta* (sidebar navy, menu aktif magenta, kartu putih bergaris — seperti tampilan Rekap Nilai), Senja Hangat, Hutan Tenang, Koran Klasik, Midnight Slate, Sakura Lembut, Mint Segar, Blueprint Teknik, Kuning Kontras, Lavender Kaca, Sporty Bold, Zen Putih, Royal Gold, Pantai Biru.
- Gaya bertanda **paket** ikut mengganti warna; saring lewat chip *Semua / Terang / Gelap / Paket + warna*.
- Opsi sidebar baru **Gelap navy** (mengikuti warna sekunder) di Studio Gaya.
- **Perbaikan**: kartu pilihan gaya tidak lagi memakai elemen `<button>` sehingga tidak tertimpa gaya tombol global (efek hover/tekan yang membuatnya menumpuk dengan tombol lain); jarak ke tombol Acak diperlebar.
- Hanya `index.html`, `app.js`, `style.css` yang berubah; `Code.gs` tidak berubah.

# Aplikasi CBT — Portal Guru & Portal Siswa

## ⭐ Baru: Tampilan & Tema (warna utama mengubah SEMUA warna + 20 gaya UI + Studio Gaya)

Portal Guru → **Pengaturan → 🎨 Tampilan & Tema**. Berlaku juga untuk portal siswa. Semua perubahan
langsung terlihat sebagai pratinjau; klik **💾 Simpan Tema** agar tersimpan (↩ Batalkan Perubahan untuk kembali).

**1. Warna**
- **Warna utama** — pilih satu warna, seluruh aplikasi ikut berubah (sidebar, latar, kartu, tombol, tabel,
  badge, hero dashboard, halaman login & hasil). Warna sekunder/aksen/latar/teks diturunkan otomatis memakai
  *harmoni* pilihan (Klasik, Analog, Komplementer, Triad, Split, Tetrad, Monokrom). Warna teks pada tombol
  otomatis hitam/putih mengikuti kontras.
- **Mode**: ☀️ Terang, 🌙 Gelap, atau 🖥️ Ikut Perangkat.
- 12 palet siap pakai, 🎲 Acak Palet, dan pengaturan warna satu per satu (lanjutan).

**2. Gaya Tampilan** — 20 gaya siap pakai: Soft Pastel (bawaan), **Claymorphism**, Glassmorphism, Neumorphism,
Neo-Brutalism, Flat Minimal, Material, Aurora, Cyber Neon (gelap), Buku Tulis, Retro Terminal, Candy Pop 3D,
Corporate, Ocean Glass (gelap), Doodle, Bento, Mono Ink, Glossy, Vaporwave (gelap), Pastel Dream.
Setiap kartu pratinjau memakai warna Anda saat ini.
- **🎲 Acak Gaya / ✨ Acak Gaya + Warna** — meracik kombinasi baru tiap klik (praktis tak terbatas).
- **🛠️ Studio Gaya** — atur sendiri: kelengkungan, kekuatan bayangan, tebal garis, efek kaca, gradien,
  kerapatan, jenis bayangan (9), pola latar (9), gaya sidebar (5), huruf (13), tombol bulat, sidebar melayang,
  garis tinta, neon, judul huruf besar.

**3. Ganti Otomatis** — *Kejutan harian*: gaya (atau gaya + warna) berganti sendiri tiap hari, sama untuk semua
pengguna pada hari itu (tidak berubah di tengah ujian).

**Kode Gaya** — salin/tempel kode untuk membagikan atau mencadangkan tampilan ke perangkat/sekolah lain.

Catatan teknis: tema disimpan di kolom `tema_json` yang sudah ada, **tidak ada perubahan `Code.gs`** (Mode
Lokal maupun Mode Server). Cukup ganti `index.html`, `app.js`, dan `style.css`. Tema juga di-cache di
perangkat sehingga tidak berkedip saat dibuka. Font gaya tertentu dimuat dari Google Fonts hanya saat dipakai;
bila offline otomatis memakai font sistem.


## ⭐ Baru: Cari Siswa, Filter Per Kelas & Unduh Nilai Per Kelas/Keseluruhan

Di tab **Rekap Nilai, Pemantauan Ujian, Log Pelanggaran, Analisis Soal (tabel jawaban siswa), Data Siswa**,
dan **Status Login** kini ada:

- **Kotak 🔍 Cari** — ketik sebagian nama (Data Siswa/Status Login juga bisa username) untuk menyaring baris.
- **Filter Kelas** — pilih satu kelas; daftar kelasnya otomatis diambil dari data ujian yang dipilih.
- Keterangan jumlah ("Menampilkan 12 dari 120 siswa", rata-rata nilai di Rekap, jumlah yang sedang mengerjakan di Pemantauan).
- Filter ikut bertahan saat tabel diperbarui otomatis (auto-refresh).

**Unduh nilai (Rekap Nilai):**

1. **⬇ Unduh (sesuai filter)** — nilai yang sedang tampil. Pilih satu kelas = nilai kelas itu saja.
2. **⬇ Semua Kelas** — seluruh siswa pada ujian terpilih: 1 sheet gabungan + 1 sheet per kelas.
3. **⬇ Semua Ujian** — nilai dari semua ujian sekaligus (mengikuti Filter Kelas), dengan kolom "Ujian";
   1 sheet gabungan + 1 sheet per kelas.

Catatan: **Hapus Semua Nilai** kini hanya menghapus baris yang sedang tampil bila filter/pencarian aktif.
Log Pelanggaran kini menampilkan nama & kelas siswa (bukan ID). Unduhan "Analisis Jawaban" mengikuti filter.
**Tidak ada perubahan `Code.gs`** — cukup ganti `index.html`, `app.js`, dan `style.css`.


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

## Pesan Hasil Berdasarkan Rentang Nilai (untuk siswa)

Di form **Buat/Ubah Ujian** ada bagian *Pesan untuk Siswa Berdasarkan Rentang Nilai*.

- Setiap rentang nilai (default: 0, 1–5, 6–10, 11–15, ... 91–95, 96–99, dan 100 tersendiri) punya pesan sendiri yang tampil di layar hasil siswa.
- Sudah terisi **pesan default**. Guru boleh mengubah teksnya, mengubah batas rentang, menambah/menghapus rentang, atau menekan **Kembalikan ke Default**.
- Pesan yang dikosongkan otomatis memakai pesan default untuk rentang tersebut. Jika guru tidak mengubah apa pun, semua memakai default.
- Rentang tidak boleh saling tumpang tindih. Nilai desimal dibulatkan dulu sebelum dicocokkan.
- Kolom *Instruksi Remedial Tambahan* tetap ada dan ditampilkan di bawah pesan, khusus siswa yang belum lulus.
- Data disimpan di kolom baru `pesan_nilai` pada sheet **Ujian** (dibuat otomatis oleh skema, tidak perlu menambah kolom manual).

## Detail Jawaban untuk Siswa (setelah nilai keluar)

Di layar hasil ada tombol **Lihat Detail Jawaban**. Siswa bisa melihat:

- daftar soal yang salah (tab *Yang Salah*) atau seluruh soal (tab *Semua Soal*);
- jawaban yang dipilih siswa, kunci jawaban, skor per soal, dan pembahasan (jika diisi guru);
- opsi ditampilkan dengan urutan acak yang sama seperti saat siswa mengerjakan, jadi mudah dicocokkan.

Tujuannya agar siswa dan guru bisa sama-sama memeriksa jika ada kunci jawaban yang keliru. Jika kunci belum diatur pada suatu soal, siswa akan melihat catatan untuk melapor ke guru.

- Hanya bisa dibuka setelah ujian selesai dan hanya untuk sesi milik siswa itu sendiri.
- Guru bisa mematikannya per ujian lewat kotak centang *Izinkan siswa melihat detail jawaban* di form ujian (default aktif).
- Data disimpan di kolom baru `tampil_detail` pada sheet **Ujian** (dibuat otomatis).
