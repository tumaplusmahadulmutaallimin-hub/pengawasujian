import { FormEvent, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Search, Users } from 'lucide-react';
import { ApiError, sipengujiApi } from '../services/api';
import type { ExamStudentItem, SaumFreshnessInfo, StudentFilterOptions } from '../types';
import { SaumFreshnessBanner } from './SaumFreshnessBanner';
import { StatusText } from './StatusText';

interface StudentMonitoringViewProps {
  mode: 'ADMIN' | 'PENGAWAS';
  initialRoomId?: string;
  initialScheduleId?: string;
  assignmentId?: string;
  compactHeader?: boolean;
}

export function StudentMonitoringView({
  mode,
  initialRoomId = '',
  initialScheduleId = '',
  assignmentId,
  compactHeader = false,
}: StudentMonitoringViewProps) {
  const [students, setStudents] = useState<ExamStudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [limit] = useState(20);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [kelas, setKelas] = useState('');
  const [roomId, setRoomId] = useState(initialRoomId);
  const [sesi, setSesi] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [scheduleId, setScheduleId] = useState(initialScheduleId);

  const [options, setOptions] = useState<StudentFilterOptions>({
    classes: [],
    rooms: [],
    sessions: [],
    subjects: [],
    schedules: [],
  });
  const [freshness, setFreshness] = useState<SaumFreshnessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = assignmentId
        ? await sipengujiApi.getPengawasAssignmentStudents(assignmentId, {
            page,
            limit,
            search: search || undefined,
            kelas: kelas || undefined,
          })
        : mode === 'ADMIN'
          ? await sipengujiApi.getAdminStudents({
              page,
              limit,
              search: search || undefined,
              kelas: kelas || undefined,
              roomId: roomId || undefined,
              sesi: sesi || undefined,
              subjectId: subjectId || undefined,
              scheduleId: scheduleId || undefined,
            })
          : await sipengujiApi.getPengawasStudents({
              page,
              limit,
              search: search || undefined,
              kelas: kelas || undefined,
              roomId: roomId || undefined,
              sesi: sesi || undefined,
              subjectId: subjectId || undefined,
              scheduleId: scheduleId || undefined,
            });

      setStudents(res.students);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setOptions(res.filterOptions);
      setFreshness(res.saumFreshness);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal memuat daftar peserta ujian dari SIPENGUJI.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [mode, assignmentId, page, search, kelas, roomId, sesi, subjectId, scheduleId]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setKelas('');
    setRoomId(initialRoomId);
    setSesi('');
    setSubjectId('');
    setScheduleId(initialScheduleId);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {!compactHeader && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Monitoring Peserta Ujian
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {mode === 'ADMIN'
              ? 'Daftar seluruh peserta ujian berdasarkan hasil sinkronisasi READ-ONLY SAUM.'
              : 'Daftar peserta ujian yang terdaftar di ruang dan sesi penugasan Anda.'}
          </p>
        </div>
      )}

      {!compactHeader && <SaumFreshnessBanner freshness={freshness} />}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 flex items-start gap-2.5 leading-relaxed">
        <Info className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
        <span>
          Daftar ini menampilkan peserta dengan status <strong>TERDAFTAR</strong> atau{' '}
          <strong>DIJADWALKAN</strong> berdasarkan data SAUM. Status daftar ini bukan bukti
          kehadiran fisik maupun aktivitas pengerjaan ujian CBT secara real-time.
        </span>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama peserta, nomor peserta, NISN, atau NIS..."
              className="w-full min-h-[42px] pl-10 pr-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold cursor-pointer"
            >
              Cari
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <select
            aria-label="Filter Kelas"
            value={kelas}
            onChange={(e) => {
              setKelas(e.target.value);
              setPage(1);
            }}
            className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="">Semua Kelas</option>
            {options.classes.map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>

          {!assignmentId && (
            <>
              <select
                aria-label="Filter Ruang"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  setPage(1);
                }}
                className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800"
              >
                <option value="">Semua Ruang</option>
                {options.rooms.map((r) => (
                  <option key={r.saum_id} value={r.saum_id}>
                    {r.kode_ruang ? `${r.kode_ruang} · ` : ''}
                    {r.nama_ruang}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter Sesi"
                value={sesi}
                onChange={(e) => {
                  setSesi(e.target.value);
                  setPage(1);
                }}
                className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800"
              >
                <option value="">Semua Sesi</option>
                {options.sessions.map((s) => (
                  <option key={s} value={s}>
                    Sesi {s}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter Mata Pelajaran"
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setPage(1);
                }}
                className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800"
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
                aria-label="Filter Jadwal Ujian"
                value={scheduleId}
                onChange={(e) => {
                  setScheduleId(e.target.value);
                  setPage(1);
                }}
                className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800"
              >
                <option value="">Semua Jadwal Ujian</option>
                {options.schedules.map((sch) => (
                  <option key={sch.saum_id} value={sch.saum_id}>
                    {sch.tanggal} · Sesi {sch.sesi} · {sch.nama_mapel}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-600 px-1">
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Total peserta cocok: <strong className="font-mono text-slate-900">{total}</strong>
          </span>
        </span>
        {totalPages > 0 && (
          <span className="font-mono tabular-nums">
            Halaman {page} / {totalPages}
          </span>
        )}
      </div>

      {/* Data Presentation: Mobile Cards + Desktop Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs sm:text-sm text-slate-500">
            Memuat data peserta ujian...
          </div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-xs sm:text-sm text-slate-500">
            {mode === 'PENGAWAS'
              ? 'Belum ada data peserta pada ruang dan sesi penugasan Anda yang sesuai dengan filter.'
              : 'Belum ada data peserta ujian yang cocok dengan filter atau belum ada data tersinkronisasi dari SAUM.'}
          </div>
        ) : (
          <>
            {/* Mobile List */}
            <div className="divide-y divide-slate-100 md:hidden">
              {students.map((st, idx) => (
                <div key={st.saumId} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-slate-500">
                        #{(page - 1) * limit + idx + 1} · {st.nomorPeserta || 'No. Peserta -'}
                      </p>
                      <p className="text-sm font-bold text-slate-900 truncate">{st.nama}</p>
                    </div>
                    <StatusText
                      tone={st.participantStatus === 'DIJADWALKAN' ? 'success' : 'neutral'}
                      label={st.participantStatus}
                    />
                  </div>
                  <p className="text-xs text-slate-600">
                    Kelas: <strong>{st.kelas || '-'}</strong> · Sesi:{' '}
                    <strong className="font-mono">{st.sesi || '-'}</strong> · Ruang:{' '}
                    <strong>{st.namaRuang || st.roomId || 'Belum tersedia'}</strong>
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">
                    NIS: {st.nis || '-'} · NISN: {st.nisn || '-'}
                  </p>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4 w-12">No</th>
                    <th className="py-3 px-4">No. Peserta</th>
                    <th className="py-3 px-4">Nama Peserta</th>
                    <th className="py-3 px-4">NIS</th>
                    <th className="py-3 px-4">NISN</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4">Sesi</th>
                    <th className="py-3 px-4">Ruang</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {students.map((st, idx) => (
                    <tr key={st.saumId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                        {(page - 1) * limit + idx + 1}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-800 whitespace-nowrap">
                        {st.nomorPeserta || '-'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{st.nama}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{st.nis || '-'}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{st.nisn || '-'}</td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {st.kelas || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {st.sesi || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {st.kodeRuang ? `${st.kodeRuang} · ` : ''}
                        {st.namaRuang || st.roomId || 'Belum tersedia'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusText
                          tone={st.participantStatus === 'DIJADWALKAN' ? 'success' : 'neutral'}
                          label={st.participantStatus}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Sebelumnya</span>
          </button>

          <span className="text-xs font-mono text-slate-600 tabular-nums">
            Halaman {page} dari {totalPages}
          </span>

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>Berikutnya</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
