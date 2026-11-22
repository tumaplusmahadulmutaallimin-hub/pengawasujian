import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  DoorOpen,
  Eye,
  FileCheck2,
  GraduationCap,
  Link2,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type {
  AdminDashboardResponse,
  AdminRoute,
  ScheduleLifecycleStatus,
  SupervisorListItem,
} from '../../types';

interface AdminDashboardPageProps {
  onNavigate: (route: AdminRoute) => void;
  onSelectSupervisor: (userId: string) => void;
}

function scheduleStatusTone(st: ScheduleLifecycleStatus): 'success' | 'warning' | 'neutral' {
  if (st === 'BERLANGSUNG') return 'success';
  if (st === 'AKAN_DATANG') return 'warning';
  return 'neutral';
}

function scheduleStatusLabel(st: ScheduleLifecycleStatus): string {
  if (st === 'AKAN_DATANG') return 'AKAN DATANG';
  if (st === 'BERLANGSUNG') return 'BERLANGSUNG';
  if (st === 'SELESAI') return 'SELESAI';
  return 'BELUM TERJADWAL';
}

export function AdminDashboardPage({
  onNavigate,
  onSelectSupervisor,
}: AdminDashboardPageProps) {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Supervisor monitoring table filters
  const [supervisors, setSupervisors] = useState<SupervisorListItem[]>([]);
  const [madrasahOptions, setMadrasahOptions] = useState<string[]>([]);
  const [supSearchInput, setSupSearchInput] = useState('');
  const [supSearch, setSupSearch] = useState('');
  const [supMadrasah, setSupMadrasah] = useState('');
  const [supAccountStatus, setSupAccountStatus] = useState('ALL');
  const [supProfileStatus, setSupProfileStatus] = useState('ALL');
  const [supAssignmentStatus, setSupAssignmentStatus] = useState('ALL');
  const [supLoading, setSupLoading] = useState(true);

  useEffect(() => {
    let active = true;
    sipengujiApi
      .getAdminDashboard()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Gagal memuat dashboard admin.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSupLoading(true);
    sipengujiApi
      .listSupervisors({
        search: supSearch || undefined,
        madrasah: supMadrasah || undefined,
        status: supAccountStatus !== 'ALL' ? supAccountStatus : undefined,
        profileStatus: supProfileStatus !== 'ALL' ? supProfileStatus : undefined,
        assignmentStatus: supAssignmentStatus !== 'ALL' ? supAssignmentStatus : undefined,
      })
      .then((res) => {
        if (!active) return;
        setSupervisors(res.supervisors);
        setMadrasahOptions(res.madrasahOptions);
      })
      .catch(() => {
        // Keep silent if dashboard handles main error
      })
      .finally(() => {
        if (active) setSupLoading(false);
      });
    return () => {
      active = false;
    };
  }, [supSearch, supMadrasah, supAccountStatus, supProfileStatus, supAssignmentStatus]);

  const handleSupSearch = (e: FormEvent) => {
    e.preventDefault();
    setSupSearch(supSearchInput.trim());
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
        {error || 'Data dashboard tidak tersedia.'}
      </div>
    );
  }

  const {
    stats,
    examSummary,
    documentStats,
    incidentStats,
    jakartaToday,
    saumFreshness,
    schedules,
    integration,
    recentLogs,
  } = data;

  const statCards = [
    {
      label: 'Total Pengawas Terdaftar',
      value: stats.totalPengawas,
      note: `${stats.activePengawas} ACTIVE · ${stats.pendingPengawas} PENDING`,
      icon: Users,
    },
    {
      label: 'Profil Lengkap',
      value: stats.completedProfiles,
      note: 'Siap verifikasi biodata & foto',
      icon: UserCheck,
    },
    {
      label: 'Profil Belum Lengkap',
      value: stats.incompleteProfiles,
      note: 'Belum melengkapi biodata/foto',
      icon: UserX,
    },
    {
      label: 'Sudah Memiliki Penugasan',
      value: stats.assignedPengawas,
      note: 'Tertaut jadwal pengawasan SAUM',
      icon: ShieldCheck,
    },
    {
      label: 'Belum Memiliki Penugasan',
      value: stats.unassignedPengawas,
      note: 'Akun tetap aktif (NOT_ASSIGNED)',
      icon: Users,
    },
    {
      label: 'Total Jadwal Ujian',
      value: stats.totalSchedules,
      note: `${stats.totalAssignments} slot penugasan ruang`,
      icon: CalendarClock,
    },
    {
      label: 'Total Mata Pelajaran',
      value: stats.totalSubjects,
      note: 'Referensi mapel dari SAUM',
      icon: BookOpen,
    },
    {
      label: 'Total Ruang Ujian',
      value: stats.totalRooms,
      note: `${examSummary.roomsUsedCount} ruang terjadwal`,
      icon: DoorOpen,
    },
    {
      label: 'Total Peserta Ujian',
      value: stats.totalStudents,
      note: `${examSummary.studentsInSchedulesCount} terpetakan ke jadwal`,
      icon: GraduationCap,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800 mb-1">
            Ringkasan Operasional & Referensi SAUM · Zona Waktu Asia/Jakarta ({jakartaToday})
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard Admin</h1>
          <p className="text-sm text-slate-600 mt-1">
            Statistik pengawas, pelaksanaan jadwal ujian, distribusi ruang, dan monitoring peserta.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('jadwal-ujian')}
            className="min-h-[42px] px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 text-sm font-medium rounded-xl inline-flex items-center gap-2 cursor-pointer"
          >
            <CalendarClock className="w-4 h-4" />
            <span>Jadwal Ujian</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('integrasi-saum')}
            className="min-h-[42px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium rounded-xl inline-flex items-center gap-2 cursor-pointer"
          >
            <Link2 className="w-4 h-4" />
            <span>Integrasi SAUM ({integration.connection_status})</span>
          </button>
        </div>
      </div>

      <SaumFreshnessBanner freshness={saumFreshness} />

      {/* 9 KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{card.label}</span>
                <Icon className="w-4 h-4 text-slate-400" />
              </div>
              <p className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-slate-900">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">{card.note}</p>
            </div>
          );
        })}
      </section>

      {/* Ringkasan Pelaksanaan Ujian (Asia/Jakarta) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Ringkasan Pelaksanaan Ujian (Asia/Jakarta)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Status dihitung otomatis berdasarkan tanggal & waktu WIB dari jadwal SAUM.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('monitoring-ruang')}
            className="text-xs font-medium text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            <span>Lihat Distribusi Ruang</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Jadwal Hari Ini', value: examSummary.todayCount },
            { label: 'Jadwal Mendatang', value: examSummary.upcomingCount },
            { label: 'Jadwal Selesai', value: examSummary.completedCount },
            { label: 'Ruang Digunakan', value: examSummary.roomsUsedCount },
            { label: 'Pengawas Bertugas', value: examSummary.assignedSupervisorsActiveCount },
            { label: 'Peserta Terjadwal', value: examSummary.studentsInSchedulesCount },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg bg-slate-50 border border-slate-100 px-3.5 py-3"
            >
              <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Ringkasan Dokumen Pengawasan & Laporan Kejadian (Phase 05) */}
      {(documentStats || incidentStats) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {documentStats && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-800" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Dokumen Pengawasan
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('verifikasi-dokumen')}
                  className="text-xs font-medium text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Verifikasi Dokumen</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Menunggu</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                    {documentStats.pendingReview}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Diterima</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {documentStats.accepted}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Revisi</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-rose-700 mt-1">
                    {documentStats.revisionRequired}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Belum Unggah</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-700 mt-1">
                    {documentStats.notUploaded}
                  </p>
                </div>
              </div>
            </div>
          )}

          {incidentStats && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <h2 className="text-base font-semibold text-slate-900">Laporan Kejadian Ujian</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('laporan-kejadian')}
                  className="text-xs font-medium text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Kelola Laporan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Dikirim</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                    {incidentStats.submitted}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Ditinjau</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                    {incidentStats.underReview}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Selesai</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {incidentStats.resolved}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-500">Ditolak</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-rose-700 mt-1">
                    {incidentStats.rejected}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Visualisasi Grafik Operasional Berbasis Data Riil (Phase 06) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Kesiapan Akun & Profil Pengawas */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="pb-2.5 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Grafik Kesiapan Pengawas</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Proporsi status akun, profil, dan penugasan ({stats.totalPengawas} total)
            </p>
          </div>
          {(() => {
            const total = Math.max(1, stats.totalPengawas);
            const bars = [
              { label: 'Akun ACTIVE', count: stats.activePengawas, color: 'bg-emerald-700' },
              { label: 'Menunggu Verifikasi', count: stats.pendingPengawas, color: 'bg-amber-500' },
              { label: 'Profil Lengkap', count: stats.completedProfiles, color: 'bg-slate-800' },
              { label: 'Sudah Ditugaskan', count: stats.assignedPengawas, color: 'bg-emerald-500' },
            ];
            return (
              <div className="space-y-3">
                {bars.map((item) => {
                  const pct = stats.totalPengawas === 0 ? 0 : Math.round((item.count / total) * 100);
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{item.label}</span>
                        <span className="font-mono tabular-nums text-slate-900 font-semibold">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.color} transition-all duration-300`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Chart 2: Distribusi Verifikasi Dokumen */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="pb-2.5 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Grafik Verifikasi Dokumen</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Total {documentStats?.total ?? 0} slot Daftar Hadir &amp; Berita Acara
            </p>
          </div>
          {(() => {
            const totalSlots = Math.max(1, documentStats?.total ?? 0);
            const docBars = [
              { label: 'Diterima', count: documentStats?.accepted ?? 0, color: 'bg-emerald-700' },
              {
                label: 'Menunggu Review',
                count: documentStats?.pendingReview ?? 0,
                color: 'bg-amber-500',
              },
              {
                label: 'Perlu Revisi',
                count: documentStats?.revisionRequired ?? 0,
                color: 'bg-rose-600',
              },
              {
                label: 'Belum Diunggah',
                count: documentStats?.notUploaded ?? 0,
                color: 'bg-slate-400',
              },
            ];
            return (
              <div className="space-y-3">
                {docBars.map((item) => {
                  const pct =
                    (documentStats?.total ?? 0) === 0
                      ? 0
                      : Math.round((item.count / totalSlots) * 100);
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{item.label}</span>
                        <span className="font-mono tabular-nums text-slate-900 font-semibold">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.color} transition-all duration-300`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Chart 3: Pelaksanaan Jadwal & Insiden */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="pb-2.5 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Grafik Jadwal &amp; Kejadian</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Status pelaksanaan {stats.totalSchedules} jadwal &amp; {incidentStats?.total ?? 0}{' '}
              kejadian
            </p>
          </div>
          {(() => {
            const totalSch = Math.max(1, stats.totalSchedules);
            const totalInc = Math.max(1, incidentStats?.total ?? 0);
            const rows = [
              {
                label: 'Jadwal Berlangsung',
                count: examSummary.ongoingCount,
                pct:
                  stats.totalSchedules === 0
                    ? 0
                    : Math.round((examSummary.ongoingCount / totalSch) * 100),
                color: 'bg-emerald-700',
              },
              {
                label: 'Jadwal Akan Datang',
                count: examSummary.upcomingCount,
                pct:
                  stats.totalSchedules === 0
                    ? 0
                    : Math.round((examSummary.upcomingCount / totalSch) * 100),
                color: 'bg-amber-500',
              },
              {
                label: 'Jadwal Selesai',
                count: examSummary.completedCount,
                pct:
                  stats.totalSchedules === 0
                    ? 0
                    : Math.round((examSummary.completedCount / totalSch) * 100),
                color: 'bg-slate-700',
              },
              {
                label: 'Kejadian Selesai Ditangani',
                count: incidentStats?.resolved ?? 0,
                pct:
                  (incidentStats?.total ?? 0) === 0
                    ? 0
                    : Math.round(((incidentStats?.resolved ?? 0) / totalInc) * 100),
                color: 'bg-blue-700',
              },
            ];
            return (
              <div className="space-y-3">
                {rows.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 font-medium">{item.label}</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        {item.count} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-300`}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </section>

      {/* Monitoring Jadwal Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Monitoring Jadwal Ujian</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Status berdasarkan waktu WIB: AKAN DATANG, BERLANGSUNG, SELESAI (read-only SAUM).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('jadwal-ujian')}
            className="text-xs font-medium text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Buka Halaman Jadwal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Hari</th>
                <th className="py-3 px-4">Mata Pelajaran</th>
                <th className="py-3 px-4">Sesi</th>
                <th className="py-3 px-4">Jam</th>
                <th className="py-3 px-4 text-right">Ruang</th>
                <th className="py-3 px-4 text-right">Peserta</th>
                <th className="py-3 px-4 text-right">Pengawas</th>
                <th className="py-3 px-4">Status Jadwal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 px-5 text-center text-slate-500">
                    Belum ada jadwal ujian tersinkronisasi dari SAUM.
                  </td>
                </tr>
              ) : (
                schedules.slice(0, 12).map((sch) => (
                  <tr key={sch.scheduleId} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-xs text-slate-800 whitespace-nowrap">
                      {sch.tanggal}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{sch.hari}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{sch.namaMapel}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">Sesi {sch.sesi}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {sch.waktuMulai} – {sch.waktuSelesai}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-800">
                      {sch.roomCount}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-800">
                      {sch.studentCount}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-800">
                      {sch.supervisorCount}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusText
                        tone={scheduleStatusTone(sch.scheduleStatus)}
                        label={scheduleStatusLabel(sch.scheduleStatus)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Monitoring Pengawas Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Monitoring Pengawas</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pencarian nama, filter asal madrasah, status akun, profil, dan penugasan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('manajemen-akun')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              <span>Kelola Akun Lengkap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <form onSubmit={handleSupSearch} className="lg:col-span-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={supSearchInput}
                  onChange={(e) => setSupSearchInput(e.target.value)}
                  placeholder="Cari nama atau NIP pengawas..."
                  className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
              >
                Cari
              </button>
            </form>

            <select
              aria-label="Filter Asal Madrasah"
              value={supMadrasah}
              onChange={(e) => setSupMadrasah(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="">Semua Madrasah</option>
              {madrasahOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter Status Akun"
              value={supAccountStatus}
              onChange={(e) => setSupAccountStatus(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="ALL">Semua Status Akun</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>

            <select
              aria-label="Filter Status Profil"
              value={supProfileStatus}
              onChange={(e) => setSupProfileStatus(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="ALL">Semua Status Profil</option>
              <option value="COMPLETE">COMPLETE</option>
              <option value="INCOMPLETE">INCOMPLETE</option>
            </select>

            <select
              aria-label="Filter Status Penugasan"
              value={supAssignmentStatus}
              onChange={(e) => setSupAssignmentStatus(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="ALL">Semua Penugasan</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="NOT_ASSIGNED">NOT_ASSIGNED</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4 w-10">No</th>
                <th className="py-3 px-4">Nama Pengawas</th>
                <th className="py-3 px-4">NIP</th>
                <th className="py-3 px-4">Asal Madrasah</th>
                <th className="py-3 px-4">No. WhatsApp</th>
                <th className="py-3 px-4">Akun</th>
                <th className="py-3 px-4">Profil</th>
                <th className="py-3 px-4">Penugasan</th>
                <th className="py-3 px-4 text-right">Jml Tugas</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {supLoading ? (
                <tr>
                  <td colSpan={10} className="py-8 px-4 text-center text-slate-500">
                    Memuat data pengawas...
                  </td>
                </tr>
              ) : supervisors.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 px-4 text-center text-slate-500">
                    Tidak ada pengawas yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                supervisors.map((sup, idx) => (
                  <tr key={sup.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {sup.profile?.nama_lengkap || sup.username}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {sup.profile?.nip || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {sup.profile?.asal_madrasah || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {sup.profile?.no_whatsapp || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        tone={
                          sup.accountStatus === 'ACTIVE'
                            ? 'success'
                            : sup.accountStatus === 'PENDING_VERIFICATION' ||
                                sup.accountStatus === 'INACTIVE'
                              ? 'warning'
                              : 'danger'
                        }
                        label={sup.accountStatus}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        tone={sup.profileCompleted ? 'success' : 'warning'}
                        label={sup.profileStatus}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        tone={sup.assignmentStatus === 'ASSIGNED' ? 'success' : 'neutral'}
                        label={sup.assignmentStatus}
                      />
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-900">
                      {sup.assignmentCount ?? 0}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectSupervisor(sup.id)}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Audit Logs */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Aktivitas Audit Log Terbaru</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rekaman autentikasi, sinkronisasi SAUM, dan kontrol akses.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('audit-log')}
            className="text-xs font-medium text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Lihat Semua</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {recentLogs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">Belum ada aktivitas.</div>
          ) : (
            recentLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-800">{log.activity}</span>
                    {log.username_snapshot && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{log.username_snapshot}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-800 mt-0.5">{log.description}</p>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                  {new Date(log.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
