import { useEffect } from 'react';
import { BookOpen, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import type { UserRole } from '../types';

interface PanduanModalProps {
  open: boolean;
  role: UserRole;
  onClose: () => void;
}

export function PanduanModal({ open, role, onClose }: PanduanModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const isAdmin = role === 'ADMIN';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="panduan-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-emerald-800 shrink-0" />
            <div>
              <h2 id="panduan-modal-title" className="text-base font-bold text-slate-900">
                {isAdmin
                  ? 'Panduan Penggunaan Konsol Admin SIPENGUJI'
                  : 'Panduan Penggunaan Portal Pengawas SIPENGUJI'}
              </h2>
              <p className="text-xs text-slate-500">
                Alur kerja operasional madrasah & pemisahan aman dengan SAUM (Read-Only)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panduan"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm text-slate-700 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
            <span>
              <strong>Integrasi SAUM Bersifat READ-ONLY:</strong> Data jadwal, ruang, mata pelajaran,
              peserta, dan penugasan diambil dari SAUM tanpa pernah mengubah database SAUM. Seluruh
              dokumen, foto, laporan kejadian, notifikasi, dan audit tersimpan terpisah di
              SIPENGUJI.
            </span>
          </div>

          {isAdmin ? (
            <div className="space-y-4">
              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">1. Sinkronisasi & Integrasi SAUM</h3>
                <p className="text-xs text-slate-600">
                  Buka menu <strong>Integrasi SAUM</strong>, masukkan URL endpoint atau path berkas
                  read-only SAUM, klik <strong>Uji Koneksi</strong> untuk memastikan izin baca-saja,
                  lalu jalankan <strong>Sinkronkan Sekarang</strong>.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">2. Manajemen & Verifikasi Akun</h3>
                <p className="text-xs text-slate-600">
                  Pada <strong>Manajemen Akun</strong>, setujui pengawas pendaftar mandiri berstatus
                  <code className="font-mono mx-1 px-1 bg-slate-100 rounded">PENDING_VERIFICATION</code>
                  atau buat akun baru. Penonaktifan atau penangguhan akun akan langsung memutus sesi
                  aktif pengawas tersebut.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">
                  3. Monitoring Jadwal, Ruang & Verifikasi Dokumen
                </h3>
                <p className="text-xs text-slate-600">
                  Pantau distribusi ruang dan peserta pada menu terkait. Di{' '}
                  <strong>Verifikasi Dokumen</strong>, periksa berkas Daftar Hadir dan Berita Acara
                  (preview JPG/PNG/PDF, riwayat versi), tentukan PIC jika ruang diawasi 2 pengawas,
                  lalu pilih <strong>Terima</strong> atau <strong>Minta Revisi</strong> dengan catatan.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">
                  4. Tindak Lanjut Laporan Kejadian & Backup
                </h3>
                <p className="text-xs text-slate-600">
                  Tinjau laporan kejadian dari pengawas di menu <strong>Laporan Kejadian</strong>.
                  Untuk pencadangan rutin, gunakan bagian <strong>Backup &amp; Pemulihan Data</strong>{' '}
                  pada halaman Integrasi SAUM guna mengunduh arsip{' '}
                  <code className="font-mono px-1 bg-slate-100 rounded">.json.gz</code> terverifikasi
                  checksum.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">1. Lengkapi Profil &amp; Foto</h3>
                <p className="text-xs text-slate-600">
                  Pastikan seluruh biodata wajib terisi dan foto profil telah diunggah pada menu{' '}
                  <strong>Profil Saya</strong> agar status profil berubah menjadi{' '}
                  <code className="font-mono px-1 bg-slate-100 rounded">COMPLETE</code>.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">
                  2. Cek Jadwal Tugas &amp; Peserta Ruang
                </h3>
                <p className="text-xs text-slate-600">
                  Akses <strong>Jadwal Saya</strong> untuk melihat mata pelajaran, waktu (WIB),
                  ruang ujian, rekan pengawas seruang, serta daftar peserta yang hanya tercakup pada
                  ruang dan sesi tugas Anda.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">
                  3. Unggah Daftar Hadir &amp; Berita Acara
                </h3>
                <p className="text-xs text-slate-600">
                  Unggah berkas format JPG, JPEG, PNG, atau PDF melalui menu{' '}
                  <strong>Dokumen Pengawasan</strong>. Jika ruang memiliki dua pengawas, hanya
                  Pengawas Penanggung Jawab (PIC) yang melakukan upload. Apabila Admin meminta
                  revisi, unggah perbaikan versi baru (v2, v3, dst.) tanpa menghapus riwayat lama.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">
                  4. Kirim Laporan Kejadian &amp; Pantau Notifikasi
                </h3>
                <p className="text-xs text-slate-600">
                  Jika terjadi kendala teknis atau insiden ruang, laporkan melalui{' '}
                  <strong>Laporan Kejadian</strong> beserta lampiran foto/PDF bila ada. Pantau
                  lonceng notifikasi di pojok kanan atas untuk menerima pembaruan verifikasi secara
                  langsung.
                </p>
              </section>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 text-emerald-800 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Panduan lengkap tersedia di docs/PANDUAN_PENGGUNAAN.md
            </span>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 cursor-pointer"
            >
              Tutup Panduan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
