import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  FolderUp,
  History,
  Image as ImageIcon,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { sipengujiApi } from '../../services/api';
import type {
  DocumentSlotSummary,
  DocumentType,
  DocumentVerificationStatus,
  SaumFreshnessInfo,
  SupervisorDocumentAssignmentItem,
} from '../../types';

interface DokumenPengawasanPageProps {
  initialAssignmentId?: string;
}

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
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Diterima
        </span>
      );
    case 'PENDING_REVIEW':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
          <Clock className="w-3.5 h-3.5" />
          Menunggu Verifikasi
        </span>
      );
    case 'REVISION_REQUIRED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
          <AlertCircle className="w-3.5 h-3.5" />
          Perlu Perbaikan
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
          <Upload className="w-3.5 h-3.5" />
          Belum Upload
        </span>
      );
  }
}

export function DokumenPengawasanPage({ initialAssignmentId }: DokumenPengawasanPageProps) {
  const [assignments, setAssignments] = useState<SupervisorDocumentAssignmentItem[]>([]);
  const [maxUploadMb, setMaxUploadMb] = useState(10);
  const [saumFreshness, setSaumFreshness] = useState<SaumFreshnessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Upload & local preview modal state
  const [uploadTarget, setUploadTarget] = useState<{
    assignment: SupervisorDocumentAssignmentItem;
    slot: DocumentSlotSummary;
    mode: 'INITIAL' | 'REVISION';
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Remote preview / version history modal state
  const [remotePreview, setRemotePreview] = useState<{
    documentId: string;
    versionId: string;
    filename: string;
    mimeType: string;
    title: string;
  } | null>(null);
  const [historySlot, setHistorySlot] = useState<{
    assignment: SupervisorDocumentAssignmentItem;
    slot: DocumentSlotSummary;
  } | null>(null);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await sipengujiApi.getSupervisorDocuments();
      setAssignments(res.assignments);
      setMaxUploadMb(res.maxUploadMb);
      setSaumFreshness(res.saumFreshness);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data dokumen pengawasan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  const openUploadModal = (
    assignment: SupervisorDocumentAssignmentItem,
    slot: DocumentSlotSummary,
    mode: 'INITIAL' | 'REVISION'
  ) => {
    setUploadTarget({ assignment, slot, mode });
    setSelectedFile(null);
    setUploadError(null);
  };

  const handleFileChange = (file: File | null) => {
    setUploadError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
      setSelectedFile(null);
      setUploadError('Format file tidak diizinkan. Gunakan JPG, JPEG, PNG, atau PDF.');
      return;
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      setSelectedFile(null);
      setUploadError(`Ukuran berkas melebihi batas maksimal ${maxUploadMb} MB.`);
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmitUpload = async () => {
    if (!uploadTarget || !selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setBannerSuccess(null);
    try {
      let msg = '';
      if (uploadTarget.mode === 'REVISION' && uploadTarget.slot.latestDocumentId) {
        const res = await sipengujiApi.uploadSupervisorDocumentRevision(
          uploadTarget.slot.latestDocumentId,
          selectedFile
        );
        msg = res.message;
      } else {
        const res = await sipengujiApi.uploadSupervisorDocument(
          uploadTarget.assignment.assignmentId,
          uploadTarget.slot.documentType,
          selectedFile
        );
        msg = res.message;
      }
      setBannerSuccess(msg);
      setUploadTarget(null);
      setSelectedFile(null);
      await loadDocuments();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal mengirim dokumen.');
    } finally {
      setUploading(false);
    }
  };

  const orderedAssignments = initialAssignmentId
    ? [
        ...assignments.filter((a) => a.assignmentId === initialAssignmentId),
        ...assignments.filter((a) => a.assignmentId !== initialAssignmentId),
      ]
    : assignments;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Dokumen Pengawasan</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Unggah Daftar Hadir Peserta dan Berita Acara Ujian (JPG, JPEG, PNG, atau PDF, maks.{' '}
            <span className="font-semibold text-slate-900">{maxUploadMb} MB</span>).
          </p>
        </div>
        <button
          type="button"
          onClick={loadDocuments}
          disabled={loading}
          className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 self-start cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      <SaumFreshnessBanner freshness={saumFreshness} />

      {bannerSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>{bannerSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          Memuat daftar penugasan dan status dokumen...
        </div>
      ) : orderedAssignments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-2">
          <FolderUp className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-800">
            Belum Ada Penugasan Dokumen
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Belum ada penugasan pengawasan yang tersedia untuk akun Anda. Silakan periksa kembali
            setelah Admin melakukan sinkronisasi data jadwal dari SAUM.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orderedAssignments.map((asg) => {
            const isHighlighted = initialAssignmentId === asg.assignmentId;
            return (
              <section
                key={asg.assignmentId}
                className={`bg-white rounded-2xl border p-4 sm:p-5 space-y-4 ${
                  isHighlighted
                    ? 'border-emerald-500 ring-2 ring-emerald-100'
                    : 'border-slate-200'
                }`}
              >
                {/* Header Info Penugasan */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold">
                        {asg.tanggal} ({asg.hari})
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-semibold">
                        {asg.sesi} · {asg.waktuMulai}–{asg.waktuSelesai} WIB
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {asg.namaMapel}
                      {asg.kodeMapel ? ` (${asg.kodeMapel})` : ''}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Ruang: <span className="font-semibold text-slate-800">{asg.namaRuang}</span>
                      {asg.lokasi ? ` · ${asg.lokasi}` : ''} · Peran Anda:{' '}
                      <span className="font-semibold text-slate-800">{asg.peranPengawas}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Rekan Pengawas:{' '}
                      <span className="font-semibold text-slate-800">
                        {asg.rekanPengawas ? asg.rekanPengawas.nama : 'Tidak ada rekan (Pengawas tunggal)'}
                      </span>
                    </p>
                  </div>

                  {/* PIC Indicator */}
                  <div
                    className={`rounded-xl px-3 py-2 text-xs flex items-start gap-2 max-w-xs ${
                      asg.isDocumentPic
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : 'bg-slate-100 border border-slate-200 text-slate-700'
                    }`}
                  >
                    {asg.isDocumentPic ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-bold">
                        {asg.isDocumentPic
                          ? 'Penanggung Jawab Dokumen (Anda)'
                          : 'Mode Pantau Rekan'}
                      </p>
                      <p className="text-[11px] mt-0.5">
                        {asg.isDocumentPic
                          ? 'Anda ditugaskan mengunggah Daftar Hadir & Berita Acara untuk ruang ini.'
                          : `Pengumpulan dokumen ditugaskan kepada ${asg.picNama}. Anda tetap dapat memantau status dokumen.`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2 Kartu Dokumen Wajib */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {(['ATTENDANCE_LIST', 'EXAM_REPORT'] as DocumentType[]).map((docType) => {
                    const slot = asg.documents[docType];
                    const canUploadInitial =
                      asg.isDocumentPic && slot.verificationStatus === 'NOT_UPLOADED';
                    const canUploadRevision =
                      asg.isDocumentPic && slot.verificationStatus === 'REVISION_REQUIRED';

                    return (
                      <div
                        key={docType}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-emerald-800 shrink-0" />
                              <p className="text-sm font-bold text-slate-900">
                                {slot.documentLabel}
                              </p>
                            </div>
                            {renderStatusBadge(slot.verificationStatus)}
                          </div>

                          {slot.version > 0 ? (
                            <div className="text-xs text-slate-600 space-y-1 bg-white rounded-lg p-2.5 border border-slate-200">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800 truncate">
                                  {slot.originalFilename}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] shrink-0">
                                  v{slot.version}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Diunggah: {formatWibDateTime(slot.uploadedAt)} ·{' '}
                                {formatBytes(slot.fileSize)}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Pengunggah: {slot.uploadedByName}
                              </p>
                              {slot.verificationStatus === 'PENDING_REVIEW' && (
                                <p className="text-[11px] text-amber-700 font-medium pt-0.5">
                                  Dokumen sedang diperiksa oleh Admin SIPENGUJI.
                                </p>
                              )}
                              {slot.verificationStatus === 'ACCEPTED' && (
                                <p className="text-[11px] text-emerald-700 font-medium pt-0.5">
                                  Dokumen sudah diterima ({formatWibDateTime(slot.verifiedAt)}).
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">
                              Belum ada file yang diunggah untuk dokumen ini.
                            </p>
                          )}

                          {slot.adminNote && (
                            <div
                              className={`p-2.5 rounded-lg text-xs border ${
                                slot.verificationStatus === 'REVISION_REQUIRED'
                                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              }`}
                            >
                              <p className="font-bold text-[11px] uppercase tracking-wide">
                                Catatan Admin
                              </p>
                              <p className="mt-0.5">{slot.adminNote}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {canUploadInitial && (
                            <button
                              type="button"
                              onClick={() => openUploadModal(asg, slot, 'INITIAL')}
                              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Upload className="w-4 h-4" />
                              <span>Unggah Dokumen</span>
                            </button>
                          )}

                          {canUploadRevision && (
                            <button
                              type="button"
                              onClick={() => openUploadModal(asg, slot, 'REVISION')}
                              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Upload className="w-4 h-4" />
                              <span>Upload Ulang</span>
                            </button>
                          )}

                          {slot.latestDocumentId && slot.mimeType && (
                            <button
                              type="button"
                              onClick={() =>
                                setRemotePreview({
                                  documentId: slot.latestDocumentId!,
                                  versionId: slot.latestDocumentId!,
                                  filename: slot.originalFilename || 'dokumen',
                                  mimeType: slot.mimeType!,
                                  title: `${slot.documentLabel} (v${slot.version})`,
                                })
                              }
                              className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Preview</span>
                            </button>
                          )}

                          {slot.versions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setHistorySlot({ assignment: asg, slot })}
                              className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <History className="w-4 h-4" />
                              <span>Riwayat ({slot.versions.length})</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal Upload & Pre-Submit Preview */}
      {uploadTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {uploadTarget.mode === 'REVISION' ? 'Upload Ulang Revisi' : 'Unggah Dokumen'}
                </h3>
                <p className="text-xs text-slate-600">
                  {uploadTarget.slot.documentLabel} · {uploadTarget.assignment.namaRuang}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadTarget(null)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {uploadTarget.mode === 'REVISION' && uploadTarget.slot.adminNote && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
                  <p className="font-bold">Catatan Perbaikan dari Admin:</p>
                  <p className="mt-1">{uploadTarget.slot.adminNote}</p>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">Ketentuan Berkas:</p>
                <p>• Format diperbolehkan: JPG, JPEG, PNG, atau PDF.</p>
                <p>• Ukuran maksimal: {maxUploadMb} MB.</p>
                <p>• Pastikan tanda tangan & tulisan pada dokumen terlihat jelas di preview.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="min-h-[48px] px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>Kamera</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      handleFileChange(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>

                <label className="min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>Galeri / PDF</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleFileChange(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {uploadError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {selectedFile && localPreviewUrl && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-700">
                    <span className="font-semibold truncate">{selectedFile.name}</span>
                    <span className="text-slate-500 shrink-0">
                      {formatBytes(selectedFile.size)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden p-2">
                    {selectedFile.type === 'application/pdf' ||
                    selectedFile.name.toLowerCase().endsWith('.pdf') ? (
                      <iframe
                        src={localPreviewUrl}
                        title="Preview PDF Sebelum Dikirim"
                        className="w-full h-64 rounded-lg bg-white"
                      />
                    ) : (
                      <img
                        src={localPreviewUrl}
                        alt="Preview Dokumen Sebelum Dikirim"
                        className="w-full max-h-72 object-contain rounded-lg bg-white"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setUploadTarget(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!selectedFile || uploading}
                onClick={handleSubmitUpload}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>{uploading ? 'Mengirim...' : 'Kirim Dokumen'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Dokumen Tersimpan */}
      {remotePreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{remotePreview.title}</p>
                <p className="text-xs text-slate-500 truncate">{remotePreview.filename}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={sipengujiApi.getSupervisorDocumentPreviewUrl(
                    remotePreview.documentId,
                    remotePreview.versionId,
                    true
                  )}
                  download={remotePreview.filename}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh</span>
                </a>
                <button
                  type="button"
                  onClick={() => setRemotePreview(null)}
                  className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 flex-1 overflow-auto flex flex-col items-center justify-center gap-2">
              {remotePreview.mimeType === 'application/pdf' ? (
                <>
                  <iframe
                    src={sipengujiApi.getSupervisorDocumentPreviewUrl(
                      remotePreview.documentId,
                      remotePreview.versionId
                    )}
                    title={remotePreview.filename}
                    className="w-full h-[68vh] rounded-xl bg-white border border-slate-200"
                  />
                  <p className="text-[11px] text-slate-500 text-center">
                    Jika pratinjau PDF tidak tampil pada browser perangkat ini, klik tombol Unduh di
                    atas.
                  </p>
                </>
              ) : (
                <img
                  src={sipengujiApi.getSupervisorDocumentPreviewUrl(
                    remotePreview.documentId,
                    remotePreview.versionId
                  )}
                  alt={remotePreview.filename}
                  className="max-h-[70vh] w-auto object-contain rounded-xl bg-white shadow-xs"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Riwayat Versi */}
      {historySlot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Riwayat Versi — {historySlot.slot.documentLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  {historySlot.assignment.namaMapel} · {historySlot.assignment.namaRuang}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistorySlot(null)}
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2.5">
              {historySlot.slot.versions.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-mono">
                        v{v.version}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {v.originalFilename}
                      </span>
                    </div>
                    {renderStatusBadge(v.verificationStatus)}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Diunggah: {formatWibDateTime(v.uploadedAt)} · {formatBytes(v.fileSize)} ·{' '}
                    {v.uploadedByName}
                  </p>
                  {v.adminNote && (
                    <p className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                      Catatan: {v.adminNote}
                    </p>
                  )}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setRemotePreview({
                          documentId: v.id,
                          versionId: v.id,
                          filename: v.originalFilename,
                          mimeType: v.mimeType,
                          title: `${historySlot.slot.documentLabel} (v${v.version})`,
                        })
                      }
                      className="text-xs font-semibold text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Versi Ini</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
