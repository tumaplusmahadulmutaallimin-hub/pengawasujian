import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  Filter,
  History,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  UserCog,
  X,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { sipengujiApi } from '../../services/api';
import type {
  AdminDocumentListItem,
  DocumentVerificationStatus,
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

function formatBytes(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderStatusBadge(status: DocumentVerificationStatus) {
  switch (status) {
    case 'ACCEPTED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Diterima
        </span>
      );
    case 'PENDING_REVIEW':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
          <Clock className="w-3.5 h-3.5" />
          Menunggu Verifikasi
        </span>
      );
    case 'REVISION_REQUIRED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
          <AlertCircle className="w-3.5 h-3.5" />
          Perlu Perbaikan
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
          Belum Diunggah
        </span>
      );
  }
}

export function AdminVerifikasiDokumenPage() {
  const [stats, setStats] = useState({
    total: 0,
    notUploaded: 0,
    pendingReview: 0,
    accepted: 0,
    revisionRequired: 0,
  });
  const [documents, setDocuments] = useState<AdminDocumentListItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<{
    dates: string[];
    supervisors: Array<{ saum_id: string; nama: string }>;
    rooms: Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
    subjects: Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;
    sessions: string[];
  }>({ dates: [], supervisors: [], rooms: [], subjects: [], sessions: [] });
  const [saumFreshness, setSaumFreshness] = useState<SaumFreshnessInfo | null>(null);
  const [maxUploadMb, setMaxUploadMb] = useState(10);
  const [limitInput, setLimitInput] = useState('10');
  const [savingLimit, setSavingLimit] = useState(false);

  // Filters
  const [dateFilter, setDateFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inspect / Verification modal
  const [activeSlot, setActiveSlot] = useState<AdminDocumentListItem | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [confirmAcceptMode, setConfirmAcceptMode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // PIC Reassignment modal
  const [picTarget, setPicTarget] = useState<AdminDocumentListItem | null>(null);
  const [selectedPicSupId, setSelectedPicSupId] = useState('');
  const [picReason, setPicReason] = useState('');
  const [savingPic, setSavingPic] = useState(false);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await sipengujiApi.getAdminDocuments({
        date: dateFilter || undefined,
        supervisorId: supervisorFilter || undefined,
        roomId: roomFilter || undefined,
        subjectId: subjectFilter || undefined,
        session: sessionFilter || undefined,
        documentType: docTypeFilter !== 'ALL' ? docTypeFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: search || undefined,
      });
      setStats(res.stats);
      setDocuments(res.documents);
      setFilterOptions(res.filterOptions);
      setSaumFreshness(res.saumFreshness);
      setMaxUploadMb(res.maxUploadMb);
      setLimitInput(String(res.maxUploadMb));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar dokumen pengawas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [
    dateFilter,
    supervisorFilter,
    roomFilter,
    subjectFilter,
    sessionFilter,
    docTypeFilter,
    statusFilter,
  ]);

  const handleSaveUploadLimit = async () => {
    const val = Number(limitInput);
    if (!Number.isFinite(val) || val < 1 || val > 25) {
      setError('Batas ukuran upload harus antara 1 MB sampai 25 MB.');
      return;
    }
    setSavingLimit(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await sipengujiApi.updateUploadLimit(val);
      setMaxUploadMb(res.maxUploadMb);
      setLimitInput(String(res.maxUploadMb));
      setSuccessMsg(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui batas ukuran upload.');
    } finally {
      setSavingLimit(false);
    }
  };

  const openVerifyModal = (item: AdminDocumentListItem) => {
    setActiveSlot(item);
    setActiveVersionId(item.documentId);
    setAdminNoteInput(item.adminNote || '');
    setConfirmAcceptMode(false);
    setModalError(null);
  };

  const handleAccept = async () => {
    if (!activeSlot?.documentId) return;
    setVerifying(true);
    setModalError(null);
    try {
      const res = await sipengujiApi.acceptAdminDocument(
        activeSlot.documentId,
        adminNoteInput.trim() || undefined
      );
      setSuccessMsg(res.message);
      setActiveSlot(null);
      await loadDocuments();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal menerima dokumen.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!activeSlot?.documentId) return;
    if (!adminNoteInput.trim()) {
      setModalError('Alasan atau catatan perbaikan wajib diisi.');
      return;
    }
    setVerifying(true);
    setModalError(null);
    try {
      const res = await sipengujiApi.requestRevisionAdminDocument(
        activeSlot.documentId,
        adminNoteInput.trim()
      );
      setSuccessMsg(res.message);
      setActiveSlot(null);
      await loadDocuments();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal mengirim permintaan perbaikan.');
    } finally {
      setVerifying(false);
    }
  };

  const openPicModal = (item: AdminDocumentListItem) => {
    setPicTarget(item);
    setSelectedPicSupId(item.picSaumSupervisorId || item.pengawas1Id || item.pengawas2Id || '');
    setPicReason(item.picNote || '');
    setError(null);
  };

  const handleSavePic = async () => {
    if (!picTarget || !selectedPicSupId) return;
    setSavingPic(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await sipengujiApi.assignDocumentPic(
        picTarget.saumAssignmentId,
        selectedPicSupId,
        picReason.trim() || undefined
      );
      setSuccessMsg(res.message);
      setPicTarget(null);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengalihkan penanggung jawab dokumen.');
    } finally {
      setSavingPic(false);
    }
  };

  const inspectedVersion =
    activeSlot?.versions.find((v) => v.id === activeVersionId) ?? activeSlot?.versions[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Verifikasi Dokumen Pengawas</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Periksa kelengkapan Daftar Hadir & Berita Acara, kelola penanggung jawab ruang, dan
            verifikasi unggahan pengawas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
            <Settings2 className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600">Maks. Upload:</span>
            <input
              type="number"
              min={1}
              max={25}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-14 px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg text-center"
            />
            <span className="text-xs text-slate-500">MB</span>
            <button
              type="button"
              onClick={handleSaveUploadLimit}
              disabled={savingLimit}
              className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer"
            >
              {savingLimit ? '...' : 'Simpan'}
            </button>
          </div>

          <button
            type="button"
            onClick={loadDocuments}
            disabled={loading}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
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
          <p className="text-xs font-medium text-slate-500">Total Dokumen</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Belum Diunggah</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{stats.notUploaded}</p>
        </div>
        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4">
          <p className="text-xs font-medium text-amber-800">Menunggu Verifikasi</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{stats.pendingReview}</p>
        </div>
        <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-4">
          <p className="text-xs font-medium text-emerald-800">Diterima</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{stats.accepted}</p>
        </div>
        <div className="bg-rose-50/70 rounded-2xl border border-rose-200 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-rose-800">Perlu Perbaikan</p>
          <p className="text-2xl font-bold text-rose-900 mt-1">{stats.revisionRequired}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter Dokumen Pengawasan (Maks. {maxUploadMb} MB/file)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadDocuments()}
              placeholder="Cari pengawas, ruang, file..."
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Tanggal Ujian</option>
            {filterOptions.dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Pengawas</option>
            {filterOptions.supervisors.map((s) => (
              <option key={s.saum_id} value={s.saum_id}>
                {s.nama}
              </option>
            ))}
          </select>

          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Ruang</option>
            {filterOptions.rooms.map((r) => (
              <option key={r.saum_id} value={r.saum_id}>
                {r.nama_ruang}
              </option>
            ))}
          </select>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Mata Pelajaran</option>
            {filterOptions.subjects.map((sub) => (
              <option key={sub.saum_id} value={sub.saum_id}>
                {sub.nama_mapel}
              </option>
            ))}
          </select>

          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Sesi</option>
            {filterOptions.sessions.map((ses) => (
              <option key={ses} value={ses}>
                {ses}
              </option>
            ))}
          </select>

          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="ALL">Semua Jenis Dokumen</option>
            <option value="ATTENDANCE_LIST">Daftar Hadir Peserta</option>
            <option value="EXAM_REPORT">Berita Acara Ujian</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="ALL">Semua Status Verifikasi</option>
            <option value="PENDING_REVIEW">Menunggu Verifikasi</option>
            <option value="NOT_UPLOADED">Belum Diunggah</option>
            <option value="ACCEPTED">Diterima</option>
            <option value="REVISION_REQUIRED">Perlu Perbaikan</option>
          </select>
        </div>
      </div>

      {/* Tabel Dokumen */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th className="py-3 px-3.5">No</th>
                <th className="py-3 px-3.5">Tanggal Ujian</th>
                <th className="py-3 px-3.5">Pengawas (PIC)</th>
                <th className="py-3 px-3.5">Mata Pelajaran</th>
                <th className="py-3 px-3.5">Sesi / Ruang</th>
                <th className="py-3 px-3.5">Jenis Dokumen</th>
                <th className="py-3 px-3.5">Versi</th>
                <th className="py-3 px-3.5">Waktu Upload</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    Memuat dokumen pengawas...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    Tidak ada data dokumen yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                documents.map((item, idx) => (
                  <tr key={item.slotKey} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3.5 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <p className="font-semibold text-slate-900">{item.tanggal}</p>
                      <p className="text-[11px] text-slate-500">{item.hari}</p>
                    </td>
                    <td className="py-3 px-3.5">
                      <p className="font-semibold text-slate-900">{item.picNama}</p>
                      <p className="text-[11px] text-slate-500">
                        PIC{item.isPicOverridden ? ' (Dialihkan Admin)' : ''}
                        {item.pengawas1Nama && item.pengawas2Nama
                          ? ` · Rekan: ${
                              item.picSaumSupervisorId === item.pengawas1Id
                                ? item.pengawas2Nama
                                : item.pengawas1Nama
                            }`
                          : ''}
                      </p>
                    </td>
                    <td className="py-3 px-3.5">
                      <p className="font-semibold text-slate-800">{item.namaMapel}</p>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <p className="font-semibold text-slate-800">{item.namaRuang}</p>
                      <p className="text-[11px] text-slate-500">{item.sesi}</p>
                    </td>
                    <td className="py-3 px-3.5 font-medium text-slate-800">
                      {item.documentLabel}
                    </td>
                    <td className="py-3 px-3.5 font-mono text-slate-700">
                      {item.version > 0 ? `v${item.version}` : '-'}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap text-[11px] text-slate-600">
                      {formatWibDateTime(item.uploadedAt)}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {renderStatusBadge(item.verificationStatus)}
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {item.pengawas1Id && item.pengawas2Id && (
                          <button
                            type="button"
                            onClick={() => openPicModal(item)}
                            title="Alihkan Penanggung Jawab Dokumen"
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <UserCog className="w-3.5 h-3.5" />
                            <span>PIC</span>
                          </button>
                        )}
                        {item.documentId ? (
                          <button
                            type="button"
                            onClick={() => openVerifyModal(item)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Periksa</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 px-2">Belum ada file</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Preview & Verifikasi Admin */}
      {activeSlot && inspectedVersion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl rounded-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {activeSlot.documentLabel} — {activeSlot.namaRuang}
                  </h2>
                  {renderStatusBadge(activeSlot.verificationStatus)}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {activeSlot.namaMapel} · {activeSlot.tanggal} · {activeSlot.sesi} · PIC:{' '}
                  {activeSlot.picNama}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSlot(null)}
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
              {/* Preview Area */}
              <div className="lg:col-span-7 p-4 bg-slate-100 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2 border border-slate-200">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {inspectedVersion.originalFilename} (v{inspectedVersion.version})
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {inspectedVersion.mimeType} · {formatBytes(inspectedVersion.fileSize)}
                    </p>
                  </div>
                  <a
                    href={sipengujiApi.getAdminDocumentPreviewUrl(
                      activeSlot.documentId!,
                      inspectedVersion.id,
                      true
                    )}
                    download={inspectedVersion.originalFilename}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh</span>
                  </a>
                </div>

                <div className="flex-1 min-h-[340px] flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 p-2 overflow-hidden gap-2">
                  {inspectedVersion.mimeType === 'application/pdf' ? (
                    <>
                      <iframe
                        src={sipengujiApi.getAdminDocumentPreviewUrl(
                          activeSlot.documentId!,
                          inspectedVersion.id
                        )}
                        title={inspectedVersion.originalFilename}
                        className="w-full h-[55vh] rounded-lg"
                      />
                      <p className="text-[11px] text-slate-500 text-center">
                        Jika pratinjau PDF tidak tampil pada browser perangkat ini, klik tombol Unduh
                        di atas.
                      </p>
                    </>
                  ) : (
                    <img
                      src={sipengujiApi.getAdminDocumentPreviewUrl(
                        activeSlot.documentId!,
                        inspectedVersion.id
                      )}
                      alt={inspectedVersion.originalFilename}
                      className="max-h-[58vh] w-auto object-contain rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* Detail, Riwayat Versi & Tindakan Verifikasi */}
              <div className="lg:col-span-5 p-5 space-y-4 overflow-y-auto">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <p className="font-bold text-slate-800">Informasi File & Verifikasi</p>
                  <p className="text-slate-600">
                    Diunggah oleh:{' '}
                    <span className="font-semibold text-slate-900">
                      {inspectedVersion.uploadedByName}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Waktu upload: {formatWibDateTime(inspectedVersion.uploadedAt)}
                  </p>
                  <p className="text-slate-600">
                    Diverifikasi oleh:{' '}
                    <span className="font-semibold text-slate-900">
                      {inspectedVersion.verifiedByName || '-'}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Waktu verifikasi: {formatWibDateTime(inspectedVersion.verifiedAt)}
                  </p>
                </div>

                {/* Riwayat Versi */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <History className="w-4 h-4 text-slate-500" />
                    <span>Riwayat Versi ({activeSlot.versions.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {activeSlot.versions.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setActiveVersionId(v.id)}
                        className={`w-full text-left p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                          inspectedVersion.id === v.id
                            ? 'border-emerald-500 bg-emerald-50/70'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            v{v.version} {v.isLatest ? '(Terbaru)' : '(Arsip Lama)'}
                          </span>
                          {renderStatusBadge(v.verificationStatus)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {v.originalFilename} · {formatWibDateTime(v.uploadedAt)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {modalError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Catatan & Tombol Aksi (hanya untuk versi terbaru yang belum ACCEPTED) */}
                {!inspectedVersion.isLatest ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                    <p className="font-bold">Meninjau Arsip Versi Lama (v{inspectedVersion.version})</p>
                    <p>
                      Keputusan verifikasi hanya dapat diterapkan pada versi terbaru (v
                      {activeSlot.version}).
                    </p>
                    {activeSlot.documentId && (
                      <button
                        type="button"
                        onClick={() => setActiveVersionId(activeSlot.documentId)}
                        className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-semibold cursor-pointer"
                      >
                        Lihat Versi Terbaru (v{activeSlot.version})
                      </button>
                    )}
                  </div>
                ) : activeSlot.verificationStatus === 'ACCEPTED' ? (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                    <p className="font-bold">Dokumen Sudah Diterima (ACCEPTED)</p>
                    <p>
                      Dokumen versi v{activeSlot.version} telah disetujui dan terkunci dari
                      perubahan oleh Pengawas.
                    </p>
                    {activeSlot.adminNote && (
                      <p className="pt-1 text-emerald-800">
                        Catatan Admin: <span className="font-semibold">{activeSlot.adminNote}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Catatan Admin (Wajib diisi jika Perlu Perbaikan)
                      </label>
                      <textarea
                        rows={3}
                        value={adminNoteInput}
                        onChange={(e) => setAdminNoteInput(e.target.value)}
                        placeholder="Tuliskan catatan pemeriksaan atau alasan perbaikan dokumen..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                      />
                    </div>

                    {confirmAcceptMode ? (
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                        <p className="text-xs font-bold text-emerald-900">
                          Konfirmasi Penerimaan Dokumen
                        </p>
                        <p className="text-xs text-emerald-800">
                          Dokumen yang diterima tidak akan dapat diubah atau dihapus oleh Pengawas.
                          Lanjutkan menerima versi v{activeSlot.version}?
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={verifying}
                            onClick={handleAccept}
                            className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold cursor-pointer"
                          >
                            {verifying ? 'Menyimpan...' : 'Ya, Terima Dokumen'}
                          </button>
                          <button
                            type="button"
                            disabled={verifying}
                            onClick={() => setConfirmAcceptMode(false)}
                            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          disabled={verifying}
                          onClick={handleRequestRevision}
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ShieldAlert className="w-4 h-4" />
                          <span>Perlu Perbaikan</span>
                        </button>
                        <button
                          type="button"
                          disabled={verifying}
                          onClick={() => setConfirmAcceptMode(true)}
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <FileCheck2 className="w-4 h-4" />
                          <span>Terima Dokumen</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alihkan Penanggung Jawab Dokumen */}
      {picTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Penanggung Jawab Dokumen Ruang
                </h3>
                <p className="text-xs text-slate-500">
                  {picTarget.namaRuang} · {picTarget.namaMapel} ({picTarget.sesi})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPicTarget(null)}
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Pengaturan ini hanya menentukan pengawas yang bertanggung jawab mengunggah dokumen di
                SIPENGUJI dan tidak mengubah data pembagian pengawas di SAUM.
              </p>

              <div className="space-y-2">
                {picTarget.pengawas1Id && (
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="picSup"
                      checked={selectedPicSupId === picTarget.pengawas1Id}
                      onChange={() => setSelectedPicSupId(picTarget.pengawas1Id!)}
                    />
                    <div className="text-xs">
                      <p className="font-bold text-slate-900">{picTarget.pengawas1Nama}</p>
                      <p className="text-slate-500">Pengawas 1 (SAUM)</p>
                    </div>
                  </label>
                )}

                {picTarget.pengawas2Id && (
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="picSup"
                      checked={selectedPicSupId === picTarget.pengawas2Id}
                      onChange={() => setSelectedPicSupId(picTarget.pengawas2Id!)}
                    />
                    <div className="text-xs">
                      <p className="font-bold text-slate-900">{picTarget.pengawas2Nama}</p>
                      <p className="text-slate-500">Pengawas 2 (SAUM)</p>
                    </div>
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Pengalihan (Opsional)
                </label>
                <input
                  type="text"
                  value={picReason}
                  onChange={(e) => setPicReason(e.target.value)}
                  placeholder="Misal: Pengawas 1 berhalangan..."
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPicTarget(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={savingPic || !selectedPicSupId}
                onClick={handleSavePic}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold cursor-pointer"
              >
                {savingPic ? 'Menyimpan...' : 'Tetapkan PIC'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
