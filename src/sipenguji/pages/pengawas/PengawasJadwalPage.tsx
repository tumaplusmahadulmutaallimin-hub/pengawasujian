import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Clock,
  Info,
  List,
  MapPin,
  Users,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import {
  ScheduleCalendarView,
  type CalendarScheduleItem,
} from '../../components/ScheduleCalendarView';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type {
  PengawasAssignmentDetail,
  SaumFreshnessInfo,
  ScheduleDateRange,
  ScheduleLifecycleStatus,
} from '../../types';

interface PengawasJadwalPageProps {
  onOpenAssignmentDetail: (assignmentId: string) => void;
  onOpenStudentsForRoom: (roomId: string, scheduleId: string) => void;
}

function statusBadge(st: ScheduleLifecycleStatus): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  if (st === 'BERLANGSUNG') return { label: 'Berlangsung', tone: 'success' };
  if (st === 'AKAN_DATANG') return { label: 'Akan datang', tone: 'warning' };
  if (st === 'SELESAI') return { label: 'Selesai', tone: 'neutral' };
  return { label: 'Belum terjadwal', tone: 'neutral' };
}

export function PengawasJadwalPage({
  onOpenAssignmentDetail,
  onOpenStudentsForRoom,
}: PengawasJadwalPageProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [range, setRange] = useState<ScheduleDateRange>('all');
  const [subjectId, setSubjectId] = useState('');
  const [session, setSession] = useState('');
  const [roomId, setRoomId] = useState('');

  const [assignments, setAssignments] = useState<PengawasAssignmentDetail[]>([]);
  const [allCount, setAllCount] = useState(0);
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
      .getPengawasSchedules({
        range,
        subjectId: subjectId || undefined,
        session: session || undefined,
        roomId: roomId || undefined,
      })
      .then((res) => {
        if (!active) return;
        setAssignments(res.assignments);
        setAllCount(res.allAssignmentsCount);
        setJakartaToday(res.jakartaToday);
        setFreshness(res.saumFreshness);
        setOptions(res.filterOptions);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Gagal memuat jadwal Anda.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, subjectId, session, roomId]);

  const calendarItems: CalendarScheduleItem[] = assignments.map((a) => ({
    id: a.assignmentId,
    tanggal: a.tanggal,
    hari: a.hari,
    namaMapel: a.namaMapel,
    sesi: a.sesi,
    waktuMulai: a.waktuMulai,
    waktuSelesai: a.waktuSelesai,
    subtitle: `${a.kodeRuang ? `${a.kodeRuang} · ` : ''}${a.namaRuang}`,
    meta: `${a.studentCount} peserta · ${a.peranPengawas}`,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Jadwal Pengawasan Saya</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Jadwal ujian, ruang tugas, rekan pengawas, dan jumlah peserta khusus penugasan Anda.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Daftar</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
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
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'Semua' },
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
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                range === tab.id
                  ? 'bg-emerald-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <select
            aria-label="Filter Mata Pelajaran"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
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
            className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
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
            className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
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
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs sm:text-sm text-slate-500">
          Memuat jadwal pengawasan...
        </div>
      ) : allCount === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-3">
          <Info className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            Belum ada penugasan pengawasan yang tersedia untuk akun Anda. Silakan periksa kembali
            setelah Admin melakukan sinkronisasi data jadwal dari SAUM.
          </p>
        </div>
      ) : viewMode === 'calendar' ? (
        <ScheduleCalendarView
          jakartaToday={jakartaToday}
          items={calendarItems}
          actionLabel="DETAIL TUGAS"
          onSelectItem={(item) => onOpenAssignmentDetail(item.id)}
        />
      ) : assignments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs sm:text-sm text-slate-500">
          Tidak ada jadwal pengawasan Anda yang sesuai dengan filter waktu/ruang/mapel terpilih.
        </div>
      ) : (
        <div className="space-y-3.5">
          {assignments.map((item) => {
            const badge = statusBadge(item.scheduleStatus);
            return (
              <article
                key={item.assignmentId}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono font-semibold text-emerald-800">
                      Sesi {item.sesi} · {item.peranPengawas}
                      {item.kodeMapel ? ` · ${item.kodeMapel}` : ''}
                    </p>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">{item.namaMapel}</h3>
                  </div>
                  <StatusText tone={badge.tone} label={badge.label} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      {item.hari}, <strong className="font-mono">{item.tanggal}</strong> ·{' '}
                      <span className="font-mono">
                        {item.waktuMulai} – {item.waktuSelesai}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      {item.kodeRuang ? `${item.kodeRuang} — ` : ''}
                      <strong>{item.namaRuang}</strong> ({item.studentCount} peserta)
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-slate-100">
                  <p>
                    Pengawas 1:{' '}
                    <strong className="text-slate-900">
                      {item.pengawas1Nama || 'Belum tersedia'}
                    </strong>
                  </p>
                  <p>
                    Pengawas 2:{' '}
                    <strong className="text-slate-900">
                      {item.pengawas2Nama || 'Belum tersedia / tunggal'}
                    </strong>
                  </p>
                </div>

                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenAssignmentDetail(item.assignmentId)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>DETAIL TUGAS</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenStudentsForRoom(item.roomId, item.scheduleId)}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Peserta Ruang ({item.studentCount})</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
