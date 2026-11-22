import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Clock,
  FileCheck2,
  History,
  Info,
  MapPin,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type {
  AuthContextResponse,
  PengawasDashboardResponse,
  PengawasRoute,
  ScheduleLifecycleStatus,
} from '../../types';

interface PengawasDashboardPageProps {
  auth: AuthContextResponse;
  onNavigate: (route: PengawasRoute) => void;
  onOpenAssignmentDetail: (assignmentId: string) => void;
}

function formatScheduleStatus(st: ScheduleLifecycleStatus): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  if (st === 'BERLANGSUNG') return { label: 'Berlangsung', tone: 'success' };
  if (st === 'AKAN_DATANG') return { label: 'Akan datang', tone: 'warning' };
  if (st === 'SELESAI') return { label: 'Selesai', tone: 'neutral' };
  return { label: 'Belum terjadwal', tone: 'neutral' };
}

export function PengawasDashboardPage({
  auth,
  onNavigate,
  onOpenAssignmentDetail,
}: PengawasDashboardPageProps) {
  const { user, profile } = auth;
  const displayName = profile?.nama_lengkap || user.username;
  const hasPhoto = Boolean(profile?.foto_profil);

  const [dashboard, setDashboard] = useState<PengawasDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    sipengujiApi
      .getPengawasDashboard()
      .then((res) => {
        if (active) setDashboard(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'Gagal memuat ringkasan tugas.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.assignmentStatus, user.profileStatus]);

  const summary = dashboard?.summary ?? {
    total: 0,
    today: 0,
    upcoming: 0,
    ongoing: 0,
    completed: 0,
  };
  const nearest = dashboard?.nearestAssignment ?? null;
  const nearestBadge = nearest ? formatScheduleStatus(nearest.scheduleStatus) : null;
  const docSummary = dashboard?.documentSummary;
  const incidentsCount = dashboard?.incidentsCount ?? 0;

  return (
    <div className="space-y-5">
      {/* 1. Bagian Profil (Mobile-First) */}
      <section className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
            {hasPhoto ? (
              <img
                src={sipengujiApi.getProfilePhotoUrl(user.id, profile?.updated_at)}
                alt={`Foto ${displayName}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserCheck className="w-7 h-7 text-emerald-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-amber-400">Portal Pengawas SIPENGUJI</p>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate mt-0.5">{displayName}</h2>
            <p className="text-xs font-mono text-slate-300 mt-0.5 truncate">
              {profile?.nip ? `NIP ${profile.nip}` : `@${user.username}`}
            </p>
            <p className="text-xs text-slate-300 truncate mt-0.5">
              {profile?.asal_madrasah || 'Asal madrasah belum diisi'}
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400">Status Akun</p>
            <p className="font-mono font-semibold text-emerald-300 mt-0.5">{user.accountStatus}</p>
          </div>
          <div>
            <p className="text-slate-400">Kelengkapan Profil</p>
            <p
              className={`font-mono font-semibold mt-0.5 ${
                user.profileCompleted ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {user.profileStatus}
            </p>
          </div>
        </div>
      </section>

      <SaumFreshnessBanner freshness={dashboard?.saumFreshness} />

      {/* Alert jika profil belum lengkap */}
      {!user.profileCompleted && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-950">Profil Belum Lengkap</h3>
              <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
                Lengkapi biodata wajib dan unggah foto profil agar status kelengkapan menjadi
                COMPLETE.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('lengkapi-profil')}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Lengkapi Profil
          </button>
        </section>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* 2. Ringkasan Tugas (4 Kartu Mobile-First) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Ringkasan Tugas Pengawasan</h3>
          {dashboard?.jakartaToday && (
            <span className="text-[11px] font-mono text-slate-500">
              WIB {dashboard.jakartaToday}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Penugasan', value: summary.total, tone: 'text-slate-900' },
            { label: 'Tugas Hari Ini', value: summary.today, tone: 'text-emerald-800' },
            { label: 'Tugas Mendatang', value: summary.upcoming, tone: 'text-amber-700' },
            { label: 'Tugas Selesai', value: summary.completed, tone: 'text-slate-600' },
          ].map((card) => (
            <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">{card.label}</p>
              <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${card.tone}`}>
                {loading ? '—' : card.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Jadwal Terdekat / Kondisi Belum Memiliki Tugas */}
      <section className="space-y-2.5">
        <h3 className="text-sm font-bold text-slate-900">Jadwal Pengawasan Terdekat</h3>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 text-xs text-slate-500">
            Memuat jadwal pengawasan...
          </div>
        ) : nearest ? (
          <article className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono font-semibold text-emerald-800">
                  Sesi {nearest.sesi} · {nearest.peranPengawas}
                </p>
                <h4 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                  {nearest.namaMapel}
                </h4>
              </div>
              {nearestBadge && (
                <StatusText tone={nearestBadge.tone} label={nearestBadge.label} />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {nearest.hari}, <strong className="font-mono">{nearest.tanggal}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-mono tabular-nums">
                  {nearest.waktuMulai} – {nearest.waktuSelesai} WIB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {nearest.kodeRuang ? `${nearest.kodeRuang} — ` : ''}
                  <strong>{nearest.namaRuang}</strong> ({nearest.studentCount} peserta)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  Rekan:{' '}
                  <strong>
                    {nearest.rekanPengawas ? nearest.rekanPengawas.nama : 'Tidak ada rekan seruang'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => onOpenAssignmentDetail(nearest.assignmentId)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <span>DETAIL TUGAS</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('jadwal-saya')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
              >
                Lihat Semua Jadwal
              </button>
            </div>
          </article>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-3">
            <Info className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-900">Belum Ada Penugasan</p>
              <p className="text-xs text-slate-700 leading-relaxed">
                Belum ada penugasan pengawasan yang tersedia untuk akun Anda. Silakan periksa
                kembali setelah Admin melakukan sinkronisasi data jadwal dari SAUM.
              </p>
              <p className="text-[11px] text-slate-500">
                Akun Anda tetap ACTIVE dan dapat digunakan untuk melengkapi profil.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Ringkasan Dokumen & Kejadian (Phase 05) */}
      {docSummary && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">Dokumen Pengawasan</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {docSummary.accepted} diterima · {docSummary.pendingReview} menunggu ·{' '}
                  {docSummary.revisionRequired} revisi · {docSummary.notUploaded} belum unggah
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dokumen-pengawasan')}
              className="px-3 py-2 rounded-xl bg-emerald-800 text-white text-xs font-semibold hover:bg-emerald-900 shrink-0 cursor-pointer"
            >
              Buka
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">Laporan Kejadian Ujian</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {incidentsCount} laporan kejadian telah dikirimkan oleh Anda.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('laporan-kejadian')}
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50 shrink-0 cursor-pointer"
            >
              Laporkan
            </button>
          </div>
        </section>
      )}

      {/* Shortcut Menu (Mobile Friendly) */}
      <section className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
        <button
          type="button"
          onClick={() => onNavigate('dokumen-pengawasan')}
          className="w-full min-h-[58px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left cursor-pointer"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Upload Daftar Hadir & Berita Acara</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Unggah foto atau scan PDF dokumen pengawasan sesuai penanggung jawab ruang.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('laporan-kejadian')}
          className="w-full min-h-[58px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left cursor-pointer"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Laporan Kejadian Ujian</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Catat kendala teknis, keterlambatan, atau kejadian khusus selama ujian.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('jadwal-saya')}
          className="w-full min-h-[58px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left cursor-pointer"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Jadwal Pengawasan Saya</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Lihat daftar & kalender jadwal tugas ujian Anda.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('monitoring-peserta')}
          className="w-full min-h-[58px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left cursor-pointer"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Monitoring Peserta Ruang Tugas</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Cari dan periksa daftar peserta di ruang dan sesi tugas Anda.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('status-penugasan')}
          className="w-full min-h-[58px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left cursor-pointer"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Status Akun & Penugasan</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Periksa status keterkaitan SAUM dan kesiapan operasional.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </section>

      {/* Riwayat Aktivitas Pribadi Pengawas (Phase 06) */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-800 shrink-0" />
          <h3 className="text-sm font-bold text-slate-900">Riwayat Aktivitas Saya</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {!dashboard?.recentActivities || dashboard.recentActivities.length === 0 ? (
            <div className="p-5 text-xs text-slate-500 text-center">
              Belum ada catatan aktivitas akun Anda.
            </div>
          ) : (
            dashboard.recentActivities.map((act) => (
              <div
                key={act.id}
                className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-mono font-semibold text-emerald-800">
                    {act.activity}
                  </p>
                  <p className="text-xs text-slate-700 mt-0.5">{act.description}</p>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                  {new Date(act.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

