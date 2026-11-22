import { useEffect, useState } from 'react';
import { AlertCircle, Calendar as CalendarIcon, List, Search } from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import {
  ScheduleCalendarView,
  type CalendarScheduleItem,
} from '../../components/ScheduleCalendarView';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type {
  AdminScheduleItem,
  SaumFreshnessInfo,
  ScheduleDateRange,
  ScheduleLifecycleStatus,
} from '../../types';

function statusTone(st: ScheduleLifecycleStatus): 'success' | 'warning' | 'neutral' {
  if (st === 'BERLANGSUNG') return 'success';
  if (st === 'AKAN_DATANG') return 'warning';
  return 'neutral';
}

export function AdminJadwalUjianPage() {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [range, setRange] = useState<ScheduleDateRange>('all');
  const [subjectId, setSubjectId] = useState('');
  const [session, setSession] = useState('');
  const [roomId, setRoomId] = useState('');
  const [search, setSearch] = useState('');

  const [schedules, setSchedules] = useState<AdminScheduleItem[]>([]);
  const [jakartaToday, setJakartaToday] = useState('');
  const [freshness, setFreshness] = useState<SaumFreshnessInfo | null>(null);
  const [options, setOptions] = useState<{
    subjects: Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;
    rooms: Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
    sessions: string[];
  }>({ subjects: [], rooms: [], sessions: [] });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    sipengujiApi
      .getAdminSchedules({
        range,
        subjectId: subjectId || undefined,
        session: session || undefined,
        roomId: roomId || undefined,
        search: search.trim() || undefined,
      })
      .then((res) => {
        if (!active) return;
        setSchedules(res.schedules);
        setJakartaToday(res.jakartaToday);
        setFreshness(res.saumFreshness);
        setOptions(res.filterOptions);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Gagal memuat jadwal ujian.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, subjectId, session, roomId, search]);

  const calendarItems: CalendarScheduleItem[] = schedules.map((sch) => ({
    id: sch.scheduleId,
    tanggal: sch.tanggal,
    hari: sch.hari,
    namaMapel: sch.namaMapel,
    sesi: sch.sesi,
    waktuMulai: sch.waktuMulai,
    waktuSelesai: sch.waktuSelesai,
    subtitle: `${sch.roomCount} ruang · ${sch.supervisorCount} pengawas`,
    meta: `${sch.studentCount} peserta`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Jadwal Ujian (Admin)</h1>
          <p className="text-sm text-slate-600 mt-1">
            Seluruh jadwal ujian, pembagian ruang, pengawas, dan jumlah peserta hasil sinkronisasi SAUM.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Daftar</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Kalender</span>
          </button>
        </div>
      </div>

      <SaumFreshnessBanner freshness={freshness} />

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'Semua Jadwal' },
              { id: 'today', label: 'Hari Ini' },
              { id: 'tomorrow', label: 'Besok' },
              { id: 'week', label: 'Minggu Ini' },
              { id: 'month', label: 'Bulan Ini' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRange(tab.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                range === tab.id
                  ? 'bg-emerald-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari mapel, ruang, pengawas..."
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>

          <select
            aria-label="Filter Mata Pelajaran"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          >
            <option value="">Semua Mata Pelajaran</option>
            {options.subjects.map((sub) => (
              <option key={sub.saum_id} value={sub.saum_id}>
                {sub.kode_mapel ? `${sub.kode_mapel} · ` : ''}
                {sub.nama_mapel}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter Sesi"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          >
            <option value="">Semua Sesi</option>
            {options.sessions.map((s) => (
              <option key={s} value={s}>
                Sesi {s}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter Ruang"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          >
            <option value="">Semua Ruang</option>
            {options.rooms.map((rm) => (
              <option key={rm.saum_id} value={rm.saum_id}>
                {rm.kode_ruang ? `${rm.kode_ruang} · ` : ''}
                {rm.nama_ruang}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Memuat jadwal ujian dari database SIPENGUJI...
        </div>
      ) : viewMode === 'calendar' ? (
        <ScheduleCalendarView jakartaToday={jakartaToday} items={calendarItems} />
      ) : schedules.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Tidak ada jadwal ujian yang sesuai dengan filter atau belum ada data jadwal dari SAUM.
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((sch) => (
            <article
              key={sch.scheduleId}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-emerald-800">
                      Sesi {sch.sesi}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      {sch.hari}, {sch.tanggal}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {sch.waktuMulai} – {sch.waktuSelesai}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mt-1">
                    {sch.kodeMapel ? `${sch.kodeMapel} — ` : ''}
                    {sch.namaMapel}
                  </h2>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono text-slate-600 tabular-nums">
                    {sch.roomCount} ruang · {sch.studentCount} peserta
                  </span>
                  <StatusText
                    tone={statusTone(sch.scheduleStatus)}
                    label={sch.scheduleStatus.replace('_', ' ')}
                  />
                </div>
              </div>

              {sch.hasIncompleteData && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Data belum lengkap dari SAUM: {sch.missingFields.join(', ')}.
                  </span>
                </div>
              )}

              {sch.rooms.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  Data ruang dan pengawas untuk jadwal ini belum tersedia dari SAUM.
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                        <th className="py-2 px-3">Ruang</th>
                        <th className="py-2 px-3">Pengawas Pertama</th>
                        <th className="py-2 px-3">Pengawas Kedua</th>
                        <th className="py-2 px-3 text-right">Peserta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sch.rooms.map((rm) => (
                        <tr key={rm.roomId}>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {rm.kodeRuang ? `${rm.kodeRuang} · ` : ''}
                            {rm.namaRuang}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {rm.pengawas1Nama || (
                              <span className="text-amber-700">Belum tersedia dari SAUM</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {rm.pengawas2Nama || (
                              <span className="text-slate-400">Belum tersedia / tunggal</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-900">
                            {rm.studentCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
