import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Clock,
  FileCheck2,
  Info,
  MapPin,
  Users,
} from 'lucide-react';
import { SaumFreshnessBanner } from '../../components/SaumFreshnessBanner';
import { StatusText } from '../../components/StatusText';
import { StudentMonitoringView } from '../../components/StudentMonitoringView';
import { ApiError, sipengujiApi } from '../../services/api';
import type {
  PengawasAssignmentDetail,
  SaumFreshnessInfo,
  ScheduleLifecycleStatus,
} from '../../types';

interface DetailPenugasanPageProps {
  assignmentId: string;
  onBack: () => void;
  onOpenDocuments?: (assignmentId: string) => void;
  onOpenIncidents?: (assignmentId: string) => void;
}

function statusMeta(st: ScheduleLifecycleStatus): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  if (st === 'BERLANGSUNG') return { label: 'Berlangsung', tone: 'success' };
  if (st === 'AKAN_DATANG') return { label: 'Akan datang', tone: 'warning' };
  if (st === 'SELESAI') return { label: 'Selesai', tone: 'neutral' };
  return { label: 'Belum terjadwal', tone: 'neutral' };
}

export function DetailPenugasanPage({
  assignmentId,
  onBack,
  onOpenDocuments,
  onOpenIncidents,
}: DetailPenugasanPageProps) {
  const [assignment, setAssignment] = useState<PengawasAssignmentDetail | null>(null);
  const [freshness, setFreshness] = useState<SaumFreshnessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    sipengujiApi
      .getPengawasAssignmentDetail(assignmentId)
      .then((res) => {
        if (!active) return;
        setAssignment(res.assignment);
        setFreshness(res.saumFreshness);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : 'Gagal memuat detail penugasan pengawasan.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-xs text-slate-500">
          Memuat detail penugasan...
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800">
          {error || 'Detail penugasan tidak ditemukan.'}
        </div>
      </div>
    );
  }

  const badge = statusMeta(assignment.scheduleStatus);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>

        <StatusText tone={badge.tone} label={`Status Tugas: ${badge.label}`} />
      </div>

      <SaumFreshnessBanner freshness={freshness} />

      {/* 1. Informasi Ujian & 4. Status Tugas */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <p className="text-xs font-mono font-semibold text-emerald-800">
            {assignment.peranPengawas} · Sesi {assignment.sesi}
            {assignment.kodeMapel ? ` · ${assignment.kodeMapel}` : ''}
          </p>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
            {assignment.namaMapel}
          </h2>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm">
          <div className="flex items-start gap-2.5">
            <CalendarClock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-slate-500">Tanggal & Hari Ujian</dt>
              <dd className="font-semibold text-slate-900 mt-0.5">
                {assignment.hari}, <span className="font-mono">{assignment.tanggal}</span>
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-slate-500">Waktu Pelaksanaan</dt>
              <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                {assignment.waktuMulai} – {assignment.waktuSelesai} WIB
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-slate-500">Ruang Ujian</dt>
              <dd className="font-semibold text-slate-900 mt-0.5">
                {assignment.kodeRuang ? `${assignment.kodeRuang} — ` : ''}
                {assignment.namaRuang}
                {assignment.kapasitas ? ` (Kap. ${assignment.kapasitas})` : ''}
              </dd>
              {assignment.lokasi && (
                <p className="text-[11px] text-slate-500">{assignment.lokasi}</p>
              )}
            </div>
          </div>
        </dl>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
          <span>
            Status tugas (<strong>{badge.label}</strong>) dihitung berdasarkan tanggal dan jam
            jadwal ujian (WIB), bukan bukti kehadiran fisik pengawas.
          </span>
        </div>

        {(onOpenDocuments || onOpenIncidents) && (
          <div className="pt-2 flex flex-wrap gap-2.5">
            {onOpenDocuments && (
              <button
                type="button"
                onClick={() => onOpenDocuments(assignment.assignmentId)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Dokumen Pengawasan</span>
              </button>
            )}
            {onOpenIncidents && (
              <button
                type="button"
                onClick={() => onOpenIncidents(assignment.assignmentId)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Laporkan Kejadian</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* 2. Informasi Ruang & Pengawas + 3. Rekan Pengawas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Susunan Pengawas Ruang</h3>
          <dl className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Pengawas Pertama</dt>
              <dd className="font-semibold text-slate-900 text-right">
                {assignment.pengawas1Nama || 'Belum tersedia dari SAUM'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Pengawas Kedua</dt>
              <dd className="font-semibold text-slate-900 text-right">
                {assignment.pengawas2Nama || 'Belum tersedia / tunggal'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Jumlah Peserta Ruang</dt>
              <dd className="font-mono font-bold text-slate-900">{assignment.studentCount} siswa</dd>
            </div>
          </dl>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-800" />
            <h3 className="text-sm font-bold text-slate-900">Rekan Pengawas Seruang</h3>
          </div>
          {assignment.rekanPengawas ? (
            <div className="space-y-1 text-xs sm:text-sm">
              <p className="font-bold text-slate-900">{assignment.rekanPengawas.nama}</p>
              <p className="text-slate-600">
                Asal Madrasah: {assignment.rekanPengawas.asalMadrasah || 'Belum tersedia'}
              </p>
              <p className="text-[11px] text-slate-500 pt-1">
                Ditampilkan hanya identitas pengawasan ruang & sesi yang sama.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              Tidak terdapat rekan pengawas kedua pada ruang dan sesi ini.
            </p>
          )}
        </section>
      </div>

      {/* Daftar Peserta di Ruang & Sesi Tugas Ini */}
      <section className="space-y-3">
        <h3 className="text-sm sm:text-base font-bold text-slate-900">
          Daftar Peserta pada {assignment.namaRuang} (Sesi {assignment.sesi})
        </h3>
        <StudentMonitoringView
          mode="PENGAWAS"
          assignmentId={assignment.assignmentId}
          compactHeader
        />
      </section>
    </div>
  );
}
