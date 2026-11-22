# Panduan Penggunaan SIPENGUJI

**SIPENGUJI (Sistem Informasi Pengawasan Ujian Madrasah)** adalah aplikasi operasional mandiri untuk manajemen pengawas, penugasan ruang ujian, monitoring peserta, pengumpulan dokumen pengawasan, serta pelaporan kejadian ujian.

## Prinsip Pemisahan dengan SAUM (READ-ONLY)

- **SAUM adalah sistem administrasi ujian utama.** SIPENGUJI hanya membaca data referensi jadwal, mata pelajaran, ruang, pengawas, penugasan, dan daftar peserta secara **READ-ONLY**.
- SIPENGUJI **tidak pernah** menulis, mengubah, atau menghapus data ke dalam database SAUM.
- Seluruh akun SIPENGUJI, foto profil, dokumen daftar hadir, berita acara, laporan kejadian, notifikasi, audit log, dan arsip backup disimpan di database serta penyimpanan privat SIPENGUJI sendiri.

---

## A. Panduan Konsol Admin SIPENGUJI

### 1. Masuk ke Konsol Admin
1. Buka halaman login SIPENGUJI dan masukkan username serta password akun `ADMIN`.
2. Pastikan Anda melihat badge **Konsol Admin** di sidebar kiri dan nama akun di pojok kanan atas.

### 2. Konfigurasi & Sinkronisasi Integrasi SAUM (READ-ONLY)
1. Buka menu **Integrasi SAUM**.
2. Isi salah satu sumber baca-saja SAUM:
   - **Endpoint API Read-Only SAUM** (jika berbeda server), atau
   - **Path Berkas SAUM Read-Only** (jika satu server, write-only — tidak ditampilkan kembali setelah disimpan).
3. Klik **Uji Koneksi** untuk memverifikasi mode READ-ONLY dan melihat pratinjau jumlah entitas.
4. Klik **Sinkronkan Sekarang** untuk memperbarui data jadwal, ruang, mata pelajaran, pengawas, penugasan, dan peserta ke tabel referensi SIPENGUJI.
5. Opsional: aktifkan sinkronisasi berkala otomatis (minimal 5 menit; otomatis berhenti jika gagal 3 kali berturut-turut).

### 3. Manajemen Akun Pengawas & Persetujuan Pendaftaran
1. Buka menu **Manajemen Akun**.
2. Pengawas yang mendaftar mandiri tanpa kode panitia memiliki status `PENDING_VERIFICATION`.
3. Klik **Setujui** untuk mengaktifkan akun menjadi `ACTIVE`, atau klik **Detail** untuk memeriksa biodata dan foto profilnya.
4. Untuk menonaktifkan (`INACTIVE`) atau menangguhkan (`SUSPENDED`) akun, pilih status baru lalu konfirmasi pada dialog konfirmasi. Sesi login aktif pengawas tersebut akan langsung diputus.
5. Admin juga dapat membuat akun pengawas baru secara langsung melalui tombol **Buat Akun Pengawas**.

### 4. Monitoring Jadwal, Ruang, & Peserta
- **Dashboard Admin**: Memantau 9 indikator utama, status pelaksanaan ujian waktu `Asia/Jakarta` (WIB), grafik kesiapan pengawas, grafik verifikasi dokumen, grafik jadwal & kejadian, serta log aktivitas terbaru.
- **Jadwal Ujian**: Filter jadwal berdasarkan rentang tanggal (Hari Ini, Besok, Minggu Ini, Bulan Ini), mata pelajaran, sesi, ruang, atau status pelaksanaan.
- **Monitoring Ruang**: Memeriksa distribusi pengawas tiap ruang, ruang yang belum memiliki pengawas, dan jumlah peserta per ruang/sesi.
- **Monitoring Peserta**: Pencarian peserta berdasarkan nama, nomor peserta, NIS, NISN, kelas, ruang, sesi, atau mata pelajaran.

### 5. Verifikasi Dokumen Pengawasan & Pengaturan PIC
1. Buka menu **Verifikasi Dokumen** untuk melihat seluruh slot **Daftar Hadir** dan **Berita Acara** dari setiap penugasan.
2. Klik pratinjau untuk melihat berkas gambar (`JPG`/`JPEG`/`PNG`) atau `PDF` secara aman beserta riwayat versinya (`v1`, `v2`, dst.).
3. Jika sebuah ruang diawasi 2 pengawas dan perlu pengalihan penanggung jawab unggah, gunakan tombol **Atur PIC Dokumen**.
4. Pilih **Terima (`ACCEPTED`)** jika dokumen sudah sah, atau **Minta Revisi (`REVISION_REQUIRED`)** disertai catatan perbaikan wajib bagi pengawas.
5. Batas maksimal ukuran upload (1–25 MB) dapat diatur langsung dari halaman Verifikasi Dokumen atau menu pengaturan batas upload.

### 6. Tindak Lanjut Laporan Kejadian
1. Buka menu **Laporan Kejadian** untuk meninjau insiden dari ruang ujian.
2. Periksa kronologi, tindakan awal pengawas, serta lampiran foto/PDF jika tersedia.
3. Ubah status menjadi `UNDER_REVIEW`, `RESOLVED`, atau `REJECTED` disertai catatan Admin. Setiap perubahan tercatat di riwayat status dan mengirim notifikasi ke pengawas pelapor.

### 7. Audit Log & Backup / Pemulihan Data SIPENGUJI
- **Audit Log**: Memantau rekaman login, pendaftaran, akses ditolak, sinkronisasi SAUM, verifikasi dokumen, tindak lanjut insiden, dan aktivitas backup/restore.
- **Backup & Pemulihan (di halaman Integrasi SAUM)**:
  - Klik **Unduh Backup Lengkap (.json.gz)** untuk menyimpan seluruh tabel database SIPENGUJI dan semua berkas privat (`profiles`, `documents`, `incidents`) dengan checksum SHA-256.
  - Untuk memulihkan data, unggah berkas `.json.gz`/`.json`, centang konfirmasi pemulihan, lalu klik **Pulihkan Backup**. Sistem otomatis membuat snapshot keselamatan (`data/pre-restore-safety.db`) sebelum menimpa database. Data SAUM tidak pernah tersentuh.

---

## B. Panduan Portal Pengawas SIPENGUJI

### 1. Pendaftaran & Masuk Akun
1. Jika belum memiliki akun, klik **Daftar sebagai Pengawas** di halaman login.
2. Anda dapat mencari nama Anda dari data referensi SAUM yang telah disinkronkan atau mengisi data manual dengan NIP/NIK unik.
3. Masukkan kode verifikasi panitia agar akun langsung berstatus `ACTIVE`, atau kosongkan untuk mendaftar dengan status `PENDING_VERIFICATION` hingga disetujui Admin.

### 2. Lengkapi Profil & Foto (Wajib)
1. Setelah masuk, buka menu **Profil Saya**.
2. Lengkapi seluruh biodata wajib (Nama Lengkap, Jenis Kelamin, Tempat & Tanggal Lahir, Alamat, No. WhatsApp, Asal Madrasah, Jabatan) dan unggah foto profil (`JPG`/`PNG`).
3. Akses fitur operasional penuh akan terbuka jika akun `ACTIVE`, profil `COMPLETE`, dan akun sudah tertaut dengan penugasan sah dari SAUM (`ASSIGNED`).

### 3. Jadwal Tugas, Detail Penugasan, & Peserta Ruang
1. Buka **Jadwal Saya** untuk melihat daftar jadwal ujian yang menjadi tanggung jawab Anda (termasuk status `AKAN DATANG`, `BERLANGSUNG`, `SELESAI` dalam zona WIB).
2. Klik **DETAIL TUGAS** untuk melihat detail ruang, rekan pengawas seruang, serta daftar peserta khusus untuk ruang dan sesi tugas Anda.
3. Anda tidak diperkenankan mengakses daftar peserta maupun dokumen milik ruang/pengawas lain di luar penugasan Anda.

### 4. Mengunggah Daftar Hadir & Berita Acara
1. Buka **Dokumen Pengawasan**.
2. Jika ruang Anda memiliki dua pengawas, periksa label **PIC (Penanggung Jawab Dokumen)**. Hanya pengawas PIC yang aktif mengunggah berkas; rekan non-PIC tetap dapat memantau status dan pratinjau dokumen.
3. Pilih berkas asli berformat `JPG`, `JPEG`, `PNG`, atau `PDF` dan unggah.
4. Apabila Admin meminta perbaikan (`REVISION_REQUIRED`), baca catatan Admin lalu unggah **Versi Revisi** (`v2`, `v3`, ...). Versi lama tetap tersimpan sebagai arsip riwayat.

### 5. Mengirim Laporan Kejadian & Memantau Aktivitas
1. Buka **Laporan Kejadian**, pilih jadwal/ruang tugas Anda, kategori kejadian, waktu kejadian, uraian kronologi, tindakan awal, dan lampiran pendukung opsional (`JPG`/`PNG`/`PDF`).
2. Pantau **Lonceng Notifikasi** di header atas untuk pembaruan persetujuan akun, status dokumen, pengalihan PIC, maupun tindak lanjut laporan kejadian.
3. Pada **Dashboard Pengawas**, bagian **Riwayat Aktivitas Saya** menampilkan catatan aktivitas terbaru akun Anda sendiri.

---

## C. Daftar Environment Variables Produksi

Konfigurasikan variabel berikut pada environment server sebelum menjalankan SIPENGUJI di produksi (lihat `.env.example`):

| Variabel | Fungsi | Contoh / Format |
| --- | --- | --- |
| `NODE_ENV` | Mode eksekusi aplikasi | `production` |
| `PORT` | Port HTTP server SIPENGUJI | `3000` |
| `SIPENGUJI_DB_PATH` | Path file database SQLite SIPENGUJI | `data/sipenguji.db` |
| `SIPENGUJI_PRIVATE_STORAGE` | Direktori penyimpanan berkas privat | `storage/private` |
| `SIPENGUJI_SESSION_SECRET` | Kunci rahasia HMAC token sesi & enkripsi | String acak min. 32 karakter hex/base64 |
| `SIPENGUJI_ADMIN_DEFAULT_PASSWORD` | Password awal admin saat inisialisasi DB baru | Password kuat min. 12 karakter |
| `SIPENGUJI_REG_CODE` | Kode verifikasi panitia awal untuk registrasi | String kode panitia unik |
| `SIPENGUJI_MAX_UPLOAD_MB` | Batas awal upload berkas (1–25 MB) | `10` |
