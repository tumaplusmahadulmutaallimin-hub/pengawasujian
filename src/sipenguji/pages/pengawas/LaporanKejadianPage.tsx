import { FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Image as ImageIcon,
  PlusCircle,
  RefreshCw,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { sipengujiApi } from '../../services/api';
import type {
  AuthContextResponse,
  IncidentCategoryOption,
  IncidentReportItem,
  IncidentStatus,
  SaumFreshnessInfo,
} from '../../types';

interface LaporanKejadianPageProps {
  auth: AuthContextResponse;
  initialAssignmentId?: string;
}

function getJakartaDateTimeInputs(): { date: string; time: string } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  let time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  if (time.startsWith('24:')) time = '00:' + time.slice(3);
  return { date, time };
}

function formatWibDateTime(iso: string): string {
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
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {label}
        </span>
      );
    case 'UNDER_REVIEW':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
          <Clock className="w-3.5 h-3.5" />
          {label}
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
          <XCircle className="w-3.5 h-3.5" />
          {label}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
          <Send className="w-3.5 h-3.5" />
          {label}
        </span>
      );
  }
}

export function LaporanKejadianPage({ auth, initialAssignmentId }: LaporanKejadianPageProps) {
  const [categories, setCategories] = useState<IncidentCategoryOption[]>([]);
  const [myAssignments, setMyAssignments] = useState<
    Array<{
      assignmentId: string;
      scheduleId: string;
      roomId: string;
      tanggal: string;
      sesi: string;
      namaMapel: string;
      namaRuang: string;
    }>
  >([]);
  const [incidents, setIncidents] = useState<IncidentReportItem[]>([]);
  const [maxUploadMb, setMaxUploadMb] = useState(10);
  const [saumFreshness, setSaumFreshness] = useState<SaumFreshnessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const defaults = getJakartaDateTimeInputs();
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId || '');
  const [incidentDate, setIncidentDate] = useState(defaults.date);
  const [incidentTime, setIncidentTime] = useState(defaults.time);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedIncident, setSelectedIncident] = useState<IncidentReportItem | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await sipengujiApi.getSupervisorIncidents();
      setCategories(res.categories);
      setMyAssignments(res.myAssignments);
      setIncidents(res.incidents);
      setMaxUploadMb(res.maxUploadMb);
      setSaumFreshness(res.saumFreshness);

      if (!category && res.categories.length > 0) {
        setCategory(res.categories[0].code);
      }
      if (!assignmentId && res.myAssignments.length > 0) {
        setAssignmentId(
          initialAssignmentId &&
            res.myAssignments.some((a) => a.assignmentId === initialAssignmentId)
            ? initialAssignmentId
            : res.myAssignments[0].assignmentId
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data laporan kejadian.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!attachment) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  const handleAttachmentChange = (file: File | null) => {
    setError(null);
    if (!file) {
      setAttachment(null);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
      setAttachment(null);
      setError('Lampiran harus berupa file JPG, JPEG, PNG, atau PDF.');
      return;
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      setAttachment(null);
      setError(`Ukuran lampiran melebihi batas maksimal ${maxUploadMb} MB.`);
      return;
    }
    setAttachment(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignmentId || !category || !description.trim()) {
      setError('Jadwal tugas, kategori kejadian, dan deskripsi wajib diisi.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await sipengujiApi.createSupervisorIncident({
        assignmentId,
        incidentDate,
        incidentTime,
        category,
        description: description.trim(),
        actionTaken: actionTaken.trim(),
        attachment,
      });
      setSuccessMsg(res.message);
      setDescription('');
      setActionTaken('');
      setAttachment(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim laporan kejadian.');
    } finally {
      setSubmitting(false);
    }
  };

  const reporterName = auth.profile?.nama_lengkap || auth.user.username;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Laporan Kejadian Ujian</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Laporkan kendala teknis, ketidakhadiran pengawas, atau kejadian peserta selama ujian (WIB).
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 self-start cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      <SaumFreshnessBanner freshness={saumFreshness} />

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Laporan Baru */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <PlusCircle className="w-5 h-5 text-emerald-800" />
          <h3 className="text-base font-bold text-slate-900">Buat Laporan Kejadian Baru</h3>
        </div>

        {myAssignments.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Anda belum memiliki penugasan ruang ujian dari SAUM sehingga belum dapat mengirim laporan
            kejadian.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Jadwal & Ruang Penugasan *
                </label>
                <select
                  value={assignmentId}
                  onChange={(e) => setAssignmentId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-900"
                  required
                >
                  {myAssignments.map((a) => (
                    <option key={a.assignmentId} value={a.assignmentId}>
                      {a.tanggal} · {a.sesi} · {a.namaRuang} — {a.namaMapel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tanggal Kejadian *
                </label>
                <input
                  type="date"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Waktu Kejadian (WIB) *
                </label>
                <input
                  type="time"
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Kategori Kejadian *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Pelapor (Dari Akun Login)
                </label>
                <input
                  type="text"
                  value={reporterName}
                  readOnly
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-xs sm:text-sm text-slate-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Deskripsi Kejadian *
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan kronologi kejadian secara ringkas dan jelas..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tindakan yang Sudah Dilakukan (Opsional)
              </label>
              <textarea
                rows={2}
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="Langkah penanganan awal di ruang ujian jika ada..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Lampiran Foto / Dokumen Pendukung (Opsional · JPG, PNG, PDF · Maks. {maxUploadMb} MB)
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="min-h-[42px] px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold flex items-center gap-2 cursor-pointer">
                  <Camera className="w-4 h-4" />
                  <span>Ambil Foto</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleAttachmentChange(e.target.files?.[0] ?? null)}
                  />
                </label>

                <label className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer">
                  <ImageIcon className="w-4 h-4" />
                  <span>Pilih File</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(e) => handleAttachmentChange(e.target.files?.[0] ?? null)}
                  />
                </label>

                {attachment && (
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                  >
                    Hapus Lampiran ({attachment.name})
                  </button>
                )}
              </div>

              {attachment && localPreviewUrl && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {attachment.type === 'application/pdf' ||
                  attachment.name.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      src={localPreviewUrl}
                      title="Preview Lampiran PDF"
                      className="w-full h-56 rounded-lg bg-white"
                    />
                  ) : (
                    <img
                      src={localPreviewUrl}
                      alt="Preview Lampiran"
                      className="max-h-60 w-auto object-contain rounded-lg mx-auto"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Mengirim Laporan...' : 'Kirim Laporan'}</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Riwayat Laporan Pengawas */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Laporan Saya ({incidents.length})
            </h3>
          </div>
        </div>

        {incidents.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Anda belum pernah mengirimkan laporan kejadian ujian.
          </p>
        ) : (
          <div className="space-y-3">
            {incidents.map((inc) => (
              <article
                key={inc.id}
                className="rounded-xl border border-slate-200 p-4 bg-slate-50/70 space-y-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{inc.categoryLabel}</p>
                    <p className="text-xs text-slate-600">
                      {inc.incidentDate} · {inc.incidentTime} WIB · {inc.namaRuang} ({inc.namaMapel} ·{' '}
                      {inc.sesi})
                    </p>
                  </div>
                  {renderStatusBadge(inc.status, inc.statusLabel)}
                </div>

                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-line">
                  {inc.description}
                </p>

                {inc.actionTaken && (
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Tindakan Awal:</span>{' '}
                    {inc.actionTaken}
                  </p>
                )}

                {inc.adminNote && (
                  <div
                    className={`p-2.5 rounded-lg text-xs border ${
                      inc.status === 'REJECTED'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <p className="font-bold text-[11px] uppercase">Catatan / Tindak Lanjut Admin</p>
                    <p className="mt-0.5">{inc.adminNote}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                  <span>Dikirim: {formatWibDateTime(inc.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIncident(inc)}
                    className="text-xs font-semibold text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Detail & Lampiran</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Modal Detail Laporan Pengawas */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Detail Laporan Kejadian
                </h3>
                <p className="text-xs text-slate-500">{selectedIncident.categoryLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renderStatusBadge(selectedIncident.status, selectedIncident.statusLabel)}
                <span className="text-xs text-slate-500">
                  {selectedIncident.incidentDate} · {selectedIncident.incidentTime} WIB
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <p className="text-slate-500">Ruang Ujian</p>
                  <p className="font-semibold text-slate-900">{selectedIncident.namaRuang}</p>
                </div>
                <div>
                  <p className="text-slate-500">Mata Pelajaran / Sesi</p>
                  <p className="font-semibold text-slate-900">
                    {selectedIncident.namaMapel} ({selectedIncident.sesi})
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Deskripsi Kejadian</p>
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-line bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {selectedIncident.description}
                </p>
              </div>

              {selectedIncident.actionTaken && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Tindakan Awal</p>
                  <p className="text-xs text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {selectedIncident.actionTaken}
                  </p>
                </div>
              )}

              {selectedIncident.adminNote && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <p className="font-bold">Catatan Admin:</p>
                  <p className="mt-0.5">{selectedIncident.adminNote}</p>
                </div>
              )}

              {selectedIncident.hasAttachment && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">
                      Lampiran: {selectedIncident.attachmentOriginalName}
                    </p>
                    <a
                      href={sipengujiApi.getSupervisorIncidentAttachmentUrl(
                        selectedIncident.id,
                        true
                      )}
                      download={selectedIncident.attachmentOriginalName || 'lampiran'}
                      className="text-xs font-semibold text-emerald-800 hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh</span>
                    </a>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100 p-2">
                    {selectedIncident.attachmentMimeType === 'application/pdf' ? (
                      <iframe
                        src={sipengujiApi.getSupervisorIncidentAttachmentUrl(selectedIncident.id)}
                        title="Lampiran PDF"
                        className="w-full h-64 rounded-lg bg-white"
                      />
                    ) : (
                      <img
                        src={sipengujiApi.getSupervisorIncidentAttachmentUrl(selectedIncident.id)}
                        alt="Lampiran Kejadian"
                        className="max-h-72 w-auto object-contain rounded-lg mx-auto"
                      />
                    )}
                  </div>
                </div>
              )}

              {selectedIncident.history.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Riwayat Status</p>
                  <div className="space-y-1.5">
                    {selectedIncident.history.map((h) => (
                      <div
                        key={h.id}
                        className="text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-2"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">
                            {h.toStatus} · {h.changedByName}
                          </p>
                          {h.note && <p className="text-slate-600 mt-0.5">{h.note}</p>}
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatWibDateTime(h.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
