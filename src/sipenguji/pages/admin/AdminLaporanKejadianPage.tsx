import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Filter,
  History,
  RefreshCw,
  Search,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { sipengujiApi } from '../../services/api';
import type {
  IncidentCategoryOption,
  IncidentReportItem,
  IncidentStatus,
  SaumFreshnessInfo,
} from '../../types';

function formatWibDateTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return (
      new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso)) + ' WIB'
    );
  } catch {
    return iso;
  }
}

function renderStatusBadge(status: IncidentStatus, label: string) {
  switch (status) {
    case 'RESOLVED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {label}
        </span>
      );
    case 'UNDER_REVIEW':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
          <Clock className="w-3.5 h-3.5" />
          {label}
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
          <XCircle className="w-3.5 h-3.5" />
          {label}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800">
          <Send className="w-3.5 h-3.5" />
          {label}
        </span>
      );
  }
}

export function AdminLaporanKejadianPage() {
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    underReview: 0,
    resolved: 0,
    rejected: 0,
  });
  const [categories, setCategories] = useState<IncidentCategoryOption[]>([]);
  const [rooms, setRooms] = useState<
    Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>
  >([]);
  const [incidents, setIncidents] = useState<IncidentReportItem[]>([]);
  const [saumFreshness, setSaumFreshness] = useState<SaumFreshnessInfo | null>(null);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [roomFilter, setRoomFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Detail & Review modal
  const [activeIncident, setActiveIncident] = useState<IncidentReportItem | null>(null);
  const [nextStatus, setNextStatus] = useState<Exclude<IncidentStatus, 'SUBMITTED'>>('UNDER_REVIEW');
  const [adminNote, setAdminNote] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadIncidents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await sipengujiApi.getAdminIncidents({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        roomId: roomFilter || undefined,
        date: dateFilter || undefined,
        search: search || undefined,
      });
      setStats(res.stats);
      setCategories(res.categories);
      setRooms(res.filterOptions.rooms);
      setIncidents(res.incidents);
      setSaumFreshness(res.saumFreshness);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar laporan kejadian.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, [statusFilter, categoryFilter, roomFilter, dateFilter]);

  const openDetailModal = (item: IncidentReportItem) => {
    setActiveIncident(item);
    setNextStatus(
      item.status === 'SUBMITTED'
        ? 'UNDER_REVIEW'
        : (item.status as Exclude<IncidentStatus, 'SUBMITTED'>)
    );
    setAdminNote(item.adminNote || '');
    setModalError(null);
  };

  const handleSaveReview = async () => {
    if (!activeIncident) return;
    if (nextStatus === 'REJECTED' && !adminNote.trim()) {
      setModalError('Alasan penolakan wajib diisi saat menolak laporan kejadian.');
      return;
    }

    setSavingReview(true);
    setModalError(null);
    setSuccessMsg(null);
    try {
      const res = await sipengujiApi.reviewAdminIncident(
        activeIncident.id,
        nextStatus,
        adminNote.trim() || undefined
      );
      setSuccessMsg(res.message);
      setActiveIncident(res.incident);
      await loadIncidents();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal memperbarui status laporan.');
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Monitoring Laporan Kejadian</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Tinjau laporan kendala dan kejadian ujian dari pengawas ruang beserta riwayat tindak lanjutnya.
          </p>
        </div>
        <button
          type="button"
          onClick={loadIncidents}
          disabled={loading}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 self-start cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan</span>
        </button>
      </div>

      <SaumFreshnessBanner freshness={saumFreshness} />

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 5 Statistik KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Total Laporan</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-sky-50/70 rounded-2xl border border-sky-200 p-4">
          <p className="text-xs font-medium text-sky-800">Laporan Baru</p>
          <p className="text-2xl font-bold text-sky-900 mt-1">{stats.submitted}</p>
        </div>
        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4">
          <p className="text-xs font-medium text-amber-800">Sedang Diperiksa</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{stats.underReview}</p>
        </div>
        <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-4">
          <p className="text-xs font-medium text-emerald-800">Selesai</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{stats.resolved}</p>
        </div>
        <div className="bg-rose-50/70 rounded-2xl border border-rose-200 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-rose-800">Ditolak</p>
          <p className="text-2xl font-bold text-rose-900 mt-1">{stats.rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter Laporan Kejadian</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadIncidents()}
              placeholder="Cari pelapor / deskripsi..."
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="ALL">Semua Status</option>
            <option value="SUBMITTED">Terkirim (Baru)</option>
            <option value="UNDER_REVIEW">Sedang Diperiksa</option>
            <option value="RESOLVED">Selesai Ditindaklanjuti</option>
            <option value="REJECTED">Ditolak</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="ALL">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Ruang</option>
            {rooms.map((r) => (
              <option key={r.saum_id} value={r.saum_id}>
                {r.nama_ruang}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs"
          />
        </div>
      </div>

      {/* Tabel Laporan Kejadian */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th className="py-3 px-3.5">Tanggal / Waktu</th>
                <th className="py-3 px-3.5">Pelapor</th>
                <th className="py-3 px-3.5">Kategori</th>
                <th className="py-3 px-3.5">Mapel / Sesi / Ruang</th>
                <th className="py-3 px-3.5">Deskripsi Singkat</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Memuat laporan kejadian...
                  </td>
                </tr>
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Tidak ada laporan kejadian yang ditemukan.
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <p className="font-semibold text-slate-900">{inc.incidentDate}</p>
                      <p className="text-[11px] text-slate-500">{inc.incidentTime} WIB</p>
                    </td>
                    <td className="py-3 px-3.5 font-semibold text-slate-900">
                      {inc.reporterName}
                    </td>
                    <td className="py-3 px-3.5 font-medium text-slate-800">
                      {inc.categoryLabel}
                    </td>
                    <td className="py-3 px-3.5">
                      <p className="font-semibold text-slate-800">{inc.namaMapel}</p>
                      <p className="text-[11px] text-slate-500">
                        {inc.sesi} · {inc.namaRuang}
                      </p>
                    </td>
                    <td className="py-3 px-3.5 max-w-xs">
                      <p className="text-slate-700 line-clamp-2">{inc.description}</p>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {renderStatusBadge(inc.status, inc.statusLabel)}
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openDetailModal(inc)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
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
      </div>

      {/* Modal Detail & Tindak Lanjut Admin */}
      {activeIncident && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Detail Laporan Kejadian
                  </h2>
                  {renderStatusBadge(activeIncident.status, activeIncident.statusLabel)}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pelapor: {activeIncident.reporterName} · {activeIncident.incidentDate}{' '}
                  {activeIncident.incidentTime} WIB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveIncident(null)}
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-7 p-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200">
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-slate-500">Kategori</p>
                    <p className="font-bold text-slate-900">{activeIncident.categoryLabel}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Ruang / Sesi</p>
                    <p className="font-bold text-slate-900">
                      {activeIncident.namaRuang} ({activeIncident.sesi})
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Mata Pelajaran</p>
                    <p className="font-semibold text-slate-800">{activeIncident.namaMapel}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Waktu Laporan Masuk</p>
                    <p className="font-semibold text-slate-800">
                      {formatWibDateTime(activeIncident.createdAt)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-700 mb-1">Deskripsi Kejadian</p>
                  <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-line bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    {activeIncident.description}
                  </p>
                </div>

                {activeIncident.actionTaken && (
                  <div>
                    <p className="text-xs font-bold text-slate-700 mb-1">
                      Tindakan Awal di Ruang
                    </p>
                    <p className="text-xs text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      {activeIncident.actionTaken}
                    </p>
                  </div>
                )}

                {activeIncident.hasAttachment && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-700">
                        Lampiran ({activeIncident.attachmentOriginalName})
                      </p>
                      <a
                        href={sipengujiApi.getAdminIncidentAttachmentUrl(activeIncident.id, true)}
                        download={activeIncident.attachmentOriginalName || 'lampiran'}
                        className="text-xs font-semibold text-emerald-800 hover:underline flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh</span>
                      </a>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-100 p-2">
                      {activeIncident.attachmentMimeType === 'application/pdf' ? (
                        <iframe
                          src={sipengujiApi.getAdminIncidentAttachmentUrl(activeIncident.id)}
                          title="Lampiran PDF"
                          className="w-full h-64 rounded-lg bg-white"
                        />
                      ) : (
                        <img
                          src={sipengujiApi.getAdminIncidentAttachmentUrl(activeIncident.id)}
                          alt="Lampiran Kejadian"
                          className="max-h-72 w-auto object-contain rounded-lg mx-auto"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 p-5 space-y-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Tindak Lanjut Admin
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Ubah Status Laporan
                    </label>
                    <select
                      value={nextStatus}
                      onChange={(e) =>
                        setNextStatus(e.target.value as Exclude<IncidentStatus, 'SUBMITTED'>)
                      }
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white font-semibold"
                    >
                      <option value="UNDER_REVIEW">Sedang Diperiksa</option>
                      <option value="RESOLVED">Selesai Ditindaklanjuti</option>
                      <option value="REJECTED">Ditolak (Wajib Catatan)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Catatan Tindak Lanjut / Alasan{' '}
                      {nextStatus === 'REJECTED' ? '(Wajib diisi)' : '(Opsional)'}
                    </label>
                    <textarea
                      rows={3}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Tuliskan hasil pemeriksaan atau arahan tindak lanjut..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>

                  {modalError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{modalError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={handleSaveReview}
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    {savingReview ? 'Menyimpan...' : 'Simpan Tindak Lanjut'}
                  </button>
                </div>

                {/* Riwayat Perubahan */}
                <div className="space-y-2 pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <History className="w-4 h-4 text-slate-500" />
                    <span>Riwayat Perubahan ({activeIncident.history.length})</span>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {activeIncident.history.map((h) => (
                      <div
                        key={h.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">{h.toStatus}</span>
                          <span className="text-[10px] text-slate-400">
                            {formatWibDateTime(h.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">Oleh: {h.changedByName}</p>
                        {h.note && <p className="text-xs text-slate-800 pt-0.5">{h.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
