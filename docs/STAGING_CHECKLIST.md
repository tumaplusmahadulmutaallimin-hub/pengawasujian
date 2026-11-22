# Checklist Pengujian Manual Staging SIPENGUJI (PHASE 01–05 + Verifikasi Keamanan)

> **Catatan Isolasi**: Pengujian di bawah dilakukan sepenuhnya pada **Lingkungan Staging** (`SIPENGUJI_ENV=staging`) dengan database staging, penyimpanan privat staging, dan sumber data uji SAUM read-only. Tidak ada operasi tulis atau koneksi ke database produksi maupun SAUM produksi.

---

## A. Skenario Pengujian Admin (`admin_stg`)

### 1. Autentikasi, Indikator Staging & Dashboard (PHASE 01 & 04)
- [ ] Buka halaman Login di browser dan pastikan lencana **STAGING** serta banner *Lingkungan Uji Staging Terisolasi* tampil.
- [ ] Uji login dengan password salah → muncul pesan kesalahan dan tercatat di **Audit Log** (`LOGIN_FAILED`).
- [ ] Login sebagai `admin_stg` → masuk ke **Dashboard Admin**, lencana **STAGING** dan `@admin_stg` terlihat di header.
- [ ] Periksa **Grafik Kesiapan Pengawas**, **Grafik Verifikasi Dokumen**, dan **Grafik Jadwal & Kejadian** menampilkan angka riil (bukan data fiktif).

### 2. Integrasi SAUM Read-Only (PHASE 03)
- [ ] Buka menu **Integrasi SAUM** → pastikan path sumber mengarah ke berkas uji `saum-staging-sample.readonly.json` (bukan SAUM produksi) dan tidak ada secret yang tampil di layar.
- [ ] Klik **Uji Koneksi Read-Only** → status `CONNECTED_READ_ONLY` dengan keterangan izin OS read-only.
- [ ] Klik **Sinkronkan Sekarang** → jumlah pengawas (`4`), jadwal (`3`), ruang (`3`), mapel (`3`), penugasan (`4`), dan peserta (`18`) muncul di **Riwayat Sinkronisasi**.

### 3. Manajemen Akun Pengawas & Konfirmasi Status (PHASE 02 & 06)
- [ ] Buka menu **Manajemen Akun** → periksa akun `pengawas_stg_pending` berstatus `PENDING_VERIFICATION`.
- [ ] Klik **Detail** → pastikan foto profil tidak error dan status operasional terbaca jelas.
- [ ] Ubah status `pengawas_stg_pending` menjadi `ACTIVE` → notifikasi `ACCOUNT_STATUS_CHANGED` terkirim ke akun tersebut.
- [ ] Uji ubah status akun menjadi `INACTIVE` atau `SUSPENDED` → pastikan **modal konfirmasi** muncul sebelum perubahan diterapkan, lalu kembalikan ke `ACTIVE` bila diperlukan.
- [ ] Uji buat akun pengawas baru dari Admin → akun muncul di daftar dan tercatat di Audit Log (`ACCOUNT_CREATED`).

### 4. Jadwal, Monitoring Ruang & Monitoring Peserta (PHASE 04)
- [ ] Buka **Jadwal Ujian** → uji filter `Hari Ini`, `Besok`, dan `Semua` (jadwal staging tersedia untuk kemarin/selesai, hari ini, dan besok).
- [ ] Buka **Monitoring Ruang** → periksa `Ruang 01` menampilkan 2 pengawas (`Ahmad Fauzi, S.Pd.` dan `Siti Aminah, M.Pd.`), dan jumlah peserta per ruang tampil benar.
- [ ] Buka **Monitoring Peserta** → uji pencarian berdasarkan nama/nomor peserta dan filter ruang/sesi.

### 5. Verifikasi Dokumen, Pengalihan PIC & Laporan Kejadian (PHASE 05)
- [ ] Buka **Verifikasi Dokumen** → uji aksi **Minta Perbaikan** tanpa mengisi catatan (harus ditolak), lalu isi catatan alasan perbaikan dan kirim → status menjadi `REVISION_REQUIRED`.
- [ ] Setelah Pengawas mengunggah revisi (`v2`), buka preview berkas (JPG/PNG/PDF), periksa riwayat versi (`v1` & `v2`), lalu klik **Terima Dokumen** → status menjadi `ACCEPTED` (terkunci permanen).
- [ ] Uji **Ubah Penanggung Jawab (PIC)** pada penugasan 2 pengawas (`Ruang 01` hari ini) dari `Ahmad Fauzi, S.Pd.` ke `Siti Aminah, M.Pd.`.
- [ ] Buka **Laporan Kejadian** → periksa laporan & lampiran dari pengawas, lalu ubah status dari `SUBMITTED` → `UNDER_REVIEW` → `RESOLVED` disertai catatan.

### 6. Audit Log, Panduan & Backup/Restore (PHASE 06)
- [ ] Buka **Audit Log** → uji filter aktivitas (`LOGIN_SUCCESS`, `DOCUMENT_UPLOADED`, `INCIDENT_REPORTED`, `ACCESS_DENIED`).
- [ ] Klik tombol **Panduan** di header → pastikan modal panduan Admin terbuka dan dapat ditutup dengan tombol `Esc`.
- [ ] Di **Integrasi SAUM** bagian **Backup & Pemulihan Data SIPENGUJI**, unduh arsip `.json.gz`, dan uji validasi restore jika diperlukan (jangan menimpa data uji sampai pengujian selesai).

---

## B. Skenario Pengujian Pengawas

### 1. Pendaftaran Mandiri & Akun Terkunci (PHASE 02)
- [ ] Dari halaman Login, klik **Daftar Pengawas**, cari nama pengawas SAUM yang belum terdaftar (`Nurul Hidayah, S.Si.`), lalu daftarkan **tanpa kode panitia** → akun masuk status `PENDING_VERIFICATION` dan tidak bisa login sebelum disetujui Admin.
- [ ] Coba login dengan `pengawas_stg_incomplete` → masuk ke halaman **Profil Saya**, status operasional masih `LOCKED` karena profil belum lengkap dan belum ada penugasan SAUM.

### 2. Dashboard, Jadwal Saya & Isolasi Peserta (PHASE 04)
- [ ] Login dengan `pengawas_stg1` (`AVAILABLE`) → periksa **Dashboard** menampilkan jadwal terdekat, ringkasan dokumen, notifikasi lonceng, dan **Riwayat Aktivitas Saya**.
- [ ] Buka **Jadwal Saya** → klik salah satu penugasan untuk membuka **Detail Penugasan**, lalu buka **Monitoring Peserta** → hanya peserta di ruang & sesi `pengawas_stg1` (`R01`, `R02`) yang terlihat (peserta `R03` milik `pengawas_stg3` tidak muncul).

### 3. Upload Daftar Hadir, Berita Acara, Revisi & PIC 2 Pengawas (PHASE 05)
- [ ] Login dengan `pengawas_stg2` (Pengawas 2 di `Ruang 01`) sebelum PIC dialihkan → pastikan tombol unggah utama terkunci/dibatasi karena PIC default adalah Pengawas 1 (`pengawas_stg1`).
- [ ] Login kembali sebagai `pengawas_stg1`:
  - [ ] Coba unggah file bukan gambar/PDF asli (misalnya file teks diganti `.png`) → ditolak oleh validasi server.
  - [ ] Unggah **Daftar Hadir** (`.png`/`.jpg`) dan **Berita Acara** (`.pdf`) yang valid → status `PENDING_REVIEW` dan muncul pratinjau file.
  - [ ] Setelah Admin meminta revisi, unggah versi perbaikan (`v2`) → pastikan `v1` tetap tersimpan di riwayat versi dan status berubah menjadi `PENDING_REVIEW` lalu `ACCEPTED` setelah disetujui Admin.

### 4. Laporan Kejadian & Panduan (PHASE 05 & 06)
- [ ] Buka **Laporan Kejadian** → pilih penugasan `Ruang 01`, isi kategori, kronologi, tindakan, serta lampiran foto/PDF → kirim dan pantau perubahan status oleh Admin pada riwayat laporan dan notifikasi lonceng.
- [ ] Klik tombol **Panduan** di header Pengawas → periksa panduan alur operasional Pengawas.
