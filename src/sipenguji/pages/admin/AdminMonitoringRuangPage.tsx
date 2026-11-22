import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpDown, Search } from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type { AdminRoomsDistributionResponse } from '../../types';

export function AdminMonitoringRuangPage() {
  const [data, setData] = useState<AdminRoomsDistributionResponse | null>(null);
  const [search, setSearch] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'namaRuang' | 'studentCount' | 'assignmentCount'>('namaRuang');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    sipengujiApi
      .getAdminRooms({
        search: search.trim() || undefined,
        unassignedOnly,
        sortBy,
        sortDir,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'Gagal memuat distribusi ruang ujian.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, unassignedOnly, sortBy, sortDir]);

  const toggleSort = (field: 'namaRuang' | 'studentCount' | 'assignmentCount') => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Monitoring Ruang & Distribusi Pengawas
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Sebaran ruang ujian, jumlah peserta per ruang, penugasan pengawas, pengawas belum bertugas,
          dan kelengkapan data jadwal SAUM.
        </p>
      </div>

      <SaumFreshnessBanner freshness={data?.saumFreshness} />

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filter & Sort Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari ruang, mapel, atau nama pengawas..."
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer px-2.5 py-1.5 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Hanya ruang belum ber-pengawas</span>
          </label>

          <button
            type="button"
            onClick={() => toggleSort('namaRuang')}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Nama Ruang</span>
          </button>
          <button
            type="button"
            onClick={() => toggleSort('studentCount')}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Jumlah Peserta</span>
          </button>
          <button
            type="button"
            onClick={() => toggleSort('assignmentCount')}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Jumlah Sesi</span>
          </button>
        </div>
      </div>

      {/* Rooms Distribution Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Daftar Ruang Ujian ({data?.rooms.length ?? 0} dari {data?.totalRooms ?? 0})
          </h2>
          {data && data.roomsWithoutSupervisorCount > 0 && (
            <StatusText
              tone="warning"
              label={`${data.roomsWithoutSupervisorCount} ruang belum lengkap pengawas`}
            />
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Ruang</th>
                <th className="py-3 px-4 text-right">Kapasitas</th>
                <th className="py-3 px-4 text-right">Peserta Terdaftar</th>
                <th className="py-3 px-4">Jadwal, Mata Pelajaran, Sesi & Pengawas</th>
                <th className="py-3 px-4">Status Pengawasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                    Memuat data ruang ujian...
                  </td>
                </tr>
              ) : !data || data.rooms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                    Belum ada data ruang ujian yang cocok atau tersinkron dari SAUM.
                  </td>
                </tr>
              ) : (
                data.rooms.map((rm) => (
                  <tr key={rm.roomId} className="hover:bg-slate-50/80 align-top">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">
                        {rm.kodeRuang ? `${rm.kodeRuang} · ` : ''}
                        {rm.namaRuang}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{rm.lokasi || 'Lokasi -'}</p>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-right text-slate-700">
                      {rm.kapasitas ?? '-'}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-right font-semibold text-slate-900">
                      {rm.studentCount}
                    </td>
                    <td className="py-3.5 px-4">
                      {rm.assignments.length === 0 ? (
                        <span className="text-xs text-slate-500">
                          Belum ada penugasan pengawas untuk ruang ini di SAUM.
                        </span>
                      ) : (
                        <div className="space-y-2">
                          {rm.assignments.map((asg) => (
                            <div
                              key={asg.assignmentId}
                              className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-0.5"
                            >
                              <p className="font-semibold text-slate-900">
                                {asg.namaMapel} · Sesi {asg.sesi}
                              </p>
                              <p className="font-mono text-[11px] text-slate-500">
                                {asg.tanggal} ({asg.waktuMulai} – {asg.waktuSelesai})
                              </p>
                              <p className="text-slate-700">
                                P1: <strong>{asg.pengawas1Nama || 'Belum ada'}</strong> · P2:{' '}
                                <strong>{asg.pengawas2Nama || '-'}</strong>
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusText
                        tone={rm.hasNoSupervisor ? 'warning' : 'success'}
                        label={rm.hasNoSupervisor ? 'BELUM ADA PENGAWAS' : 'TERISI'}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Unassigned Supervisors & Incomplete Schedules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Pengawas SAUM Belum Memiliki Tugas ({data?.unassignedSaumSupervisors.length ?? 0})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar pengawas dari SAUM yang belum tercatat pada penugasan aktif.
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {!data || data.unassignedSaumSupervisors.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                Seluruh pengawas SAUM tersinkronisasi sudah memiliki penugasan.
              </p>
            ) : (
              data.unassignedSaumSupervisors.map((s) => (
                <div key={s.saumId} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{s.nama}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {s.asalMadrasah || '-'} {s.nip ? `· NIP ${s.nip}` : ''}
                    </p>
                  </div>
                  <StatusText tone="neutral" label="BELUM TUGAS" />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Jadwal dengan Data Belum Lengkap ({data?.incompleteSchedules.length ?? 0})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jadwal SAUM yang masih kekurangan mapel, jam, ruang, atau pengawas.
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {!data || data.incompleteSchedules.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                Tidak ditemukan jadwal dengan atribut wajib yang kosong.
              </p>
            ) : (
              data.incompleteSchedules.map((sch) => (
                <div key={sch.scheduleId} className="px-5 py-3 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {sch.namaMapel} · Sesi {sch.sesi}
                  </p>
                  <p className="text-xs font-mono text-slate-500">{sch.tanggal}</p>
                  <p className="text-xs text-amber-800 inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Belum lengkap: {sch.missingFields.join(', ')}</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
