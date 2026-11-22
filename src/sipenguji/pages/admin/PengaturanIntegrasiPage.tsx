import { FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  HardDrive,
  History,
  Info,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type {
  BackupSummaryResponse,
  IntegrationSettingsSafe,
  SaumConnectionTestResult,
  SaumEntityCounts,
  SaumSyncLogItem,
} from '../../types';

export function PengaturanIntegrasiPage() {
  const [settings, setSettings] = useState<IntegrationSettingsSafe | null>(null);
  const [counts, setCounts] = useState<SaumEntityCounts | null>(null);
  const [syncLogs, setSyncLogs] = useState<SaumSyncLogItem[]>([]);
  const [showSyncLogs, setShowSyncLogs] = useState(false);

  const [saumBaseUrl, setSaumBaseUrl] = useState('');
  const [saumDataPath, setSaumDataPath] = useState('');
  const [saumSecret, setSaumSecret] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(15);

  const [testResult, setTestResult] = useState<SaumConnectionTestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Phase 06: SIPENGUJI Backup & Restore
  const [backupSummary, setBackupSummary] = useState<BackupSummaryResponse | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmRestoreChecked, setConfirmRestoreChecked] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);

  const loadIntegration = async () => {
    try {
      const [res, bkp] = await Promise.all([
        sipengujiApi.getIntegrationSettings(),
        sipengujiApi.getBackupSummary().catch(() => null),
      ]);
      setSettings(res.settings);
      setCounts(res.counts);
      setSyncLogs(res.syncLogs);
      setSaumBaseUrl(res.settings.saum_base_url_display || '');
      setAutoSyncEnabled(res.settings.auto_sync_enabled);
      setSyncIntervalMinutes(res.settings.sync_interval_minutes || 15);
      if (bkp) setBackupSummary(bkp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat pengaturan integrasi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadIntegration();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: {
        saumBaseUrl?: string;
        saumDataPath?: string;
        saumSecret?: string;
        registrationCode?: string;
        autoSyncEnabled: boolean;
        syncIntervalMinutes: number;
      } = {
        autoSyncEnabled,
        syncIntervalMinutes,
      };
      if (saumBaseUrl.trim()) payload.saumBaseUrl = saumBaseUrl.trim();
      else payload.saumBaseUrl = '';
      if (saumDataPath.trim()) payload.saumDataPath = saumDataPath.trim();
      if (saumSecret.trim()) payload.saumSecret = saumSecret.trim();
      if (registrationCode.trim()) payload.registrationCode = registrationCode.trim();

      const res = await sipengujiApi.updateIntegrationSettings(payload);
      setSettings(res.settings);
      setCounts(res.counts);
      setSaumDataPath('');
      setSaumSecret('');
      setRegistrationCode('');
      setNotice(
        'Konfigurasi integrasi READ-ONLY tersimpan aman. Kredensial dan lokasi file rahasia tidak ditampilkan kembali.'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan pengaturan integrasi.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await sipengujiApi.testIntegrationConnection();
      setTestResult(res.testResult);
      setSettings(res.settings);
      setCounts(res.counts);
      if (!res.testResult.connected) {
        setError(res.testResult.message);
      } else {
        setNotice(res.testResult.message);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menguji koneksi SAUM.');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await sipengujiApi.syncSaumNow();
      setSettings(res.settings);
      setCounts(res.counts);
      setSyncLogs(res.syncLogs);
      setShowSyncLogs(true);
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sinkronisasi SAUM gagal.');
      await loadIntegration();
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenSyncLogs = async () => {
    try {
      const res = await sipengujiApi.getSyncLogs();
      setSyncLogs(res.syncLogs);
      setCounts(res.counts);
      setShowSyncLogs((prev) => !prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat riwayat sinkronisasi.');
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    setError(null);
    setNotice(null);
    try {
      const { blob, filename } = await sipengujiApi.downloadBackupArchive();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(
        `Arsip backup SIPENGUJI (${filename}) berhasil diunduh. Database SAUM tetap terpisah dan tidak tersentuh.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengunduh arsip backup SIPENGUJI.');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleRestoreBackup = async (e: FormEvent) => {
    e.preventDefault();
    if (!restoreFile) {
      setError('Pilih berkas arsip backup (.json.gz atau .json) terlebih dahulu.');
      return;
    }
    if (!confirmRestoreChecked) {
      setError('Centang persetujuan konfirmasi pemulihan sebelum menimpa data SIPENGUJI.');
      return;
    }
    setRestoringBackup(true);
    setError(null);
    setNotice(null);
    try {
      const res = await sipengujiApi.restoreBackupArchive(restoreFile, true);
      setRestoreFile(null);
      setConfirmRestoreChecked(false);
      await loadIntegration();
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memulihkan arsip backup SIPENGUJI.');
    } finally {
      setRestoringBackup(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat status integrasi READ-ONLY SAUM...</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Integrasi SAUM (READ-ONLY)</h1>
          <p className="text-sm text-slate-600 mt-1">
            Konektor baca-saja untuk mengambil data pengawas, jadwal, ruang, mata pelajaran,
            penugasan, dan peserta ujian tanpa pernah mengubah database SAUM.
          </p>
        </div>

        {/* 3 Required Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || syncing}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-800" />
            <span>{testing ? 'Menguji...' : 'Uji Koneksi'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing || testing}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenSyncLogs}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-2 cursor-pointer"
          >
            <History className="w-4 h-4 text-slate-600" />
            <span>{showSyncLogs ? 'Tutup Riwayat' : 'Lihat Riwayat Sinkronisasi'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* Connection & Sync Status Overview */}
      {settings && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Status Koneksi</p>
              <div className="mt-1">
                <StatusText
                  tone={
                    settings.connection_status === 'CONNECTED_READ_ONLY'
                      ? 'success'
                      : settings.connection_status === 'ERROR'
                        ? 'danger'
                        : 'warning'
                  }
                  label={settings.connection_status}
                />
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500">Status Izin Baca-Saja</p>
              <p className="text-xs font-semibold text-slate-900 mt-1">
                {testResult
                  ? testResult.readOnlyVerified
                    ? 'READ-ONLY Terverifikasi'
                    : 'Belum Terverifikasi'
                  : settings.connection_status === 'CONNECTED_READ_ONLY'
                    ? 'Mode READ-ONLY Aktif'
                    : 'Belum Diuji'}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Status Sinkronisasi Terakhir</p>
              <div className="mt-1">
                <StatusText
                  tone={
                    settings.sync_status === 'SUCCESS'
                      ? 'success'
                      : settings.sync_status === 'FAILED'
                        ? 'danger'
                        : 'neutral'
                  }
                  label={settings.sync_status}
                />
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500">Waktu Sinkronisasi Terakhir</p>
              <p className="text-xs font-mono tabular-nums text-slate-900 mt-1">
                {settings.last_sync_at
                  ? new Date(settings.last_sync_at).toLocaleString('id-ID')
                  : 'Belum pernah'}
              </p>
            </div>
          </div>

          {testResult?.osPermissionSummary && (
            <p className="text-xs text-slate-600">{testResult.osPermissionSummary}</p>
          )}

          {settings.last_error_message && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              Pesan Kesalahan Terakhir: {settings.last_error_message}
            </div>
          )}

          {/* 6 Synced Entity Counters */}
          {counts && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              {[
                { label: 'Pengawas', value: counts.supervisors },
                { label: 'Jadwal', value: counts.schedules },
                { label: 'Ruang', value: counts.rooms },
                { label: 'Mata Pelajaran', value: counts.subjects },
                { label: 'Pembagian Tugas', value: counts.assignments },
                { label: 'Peserta Ujian', value: counts.students },
              ].map((stat) => (
                <div key={stat.label} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500">{stat.label}</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Sync History Drawer / Table */}
      {showSyncLogs && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Riwayat Sinkronisasi SAUM</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Catatan setiap proses sinkronisasi manual maupun terjadwal beserta jumlah entitas
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-3">Pemicu</th>
                  <th className="py-3 px-3">Mode</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Pengawas</th>
                  <th className="py-3 px-3 text-right">Jadwal</th>
                  <th className="py-3 px-3 text-right">Tugas</th>
                  <th className="py-3 px-4 text-right">Peserta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {syncLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 px-4 text-center text-slate-500">
                      Belum ada riwayat sinkronisasi SAUM.
                    </td>
                  </tr>
                ) : (
                  syncLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-800">{log.trigger_type}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">{log.source_mode}</td>
                      <td className="py-3 px-3">
                        <StatusText
                          tone={log.status === 'SUCCESS' ? 'success' : 'danger'}
                          label={log.status}
                        />
                        {log.error_message && (
                          <p className="text-[11px] text-red-700 mt-0.5">{log.error_message}</p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{log.supervisors_count}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{log.schedules_count}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{log.assignments_count}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{log.students_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Configuration Form (Never reveals secrets or full filesystem paths) */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="pb-2 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Konfigurasi Sumber Data SAUM (Read-Only)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {settings?.hasDataPathConfigured
              ? `Sumber berkas terkonfigurasi (${settings.data_source_label})`
              : settings?.hasBaseUrlConfigured
                ? `Endpoint terkonfigurasi (${settings.saum_base_url_display})`
                : 'Belum ada sumber data SAUM yang diisi.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Endpoint API Read-Only SAUM (jika beda server)
            </label>
            <input
              type="url"
              value={saumBaseUrl}
              onChange={(e) => setSaumBaseUrl(e.target.value)}
              placeholder="https://saum.madrasah.internal/api/sipenguji-readonly"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Perbarui Path Berkas SAUM Read-Only (write-only, jika satu server)
            </label>
            <input
              type="password"
              value={saumDataPath}
              onChange={(e) => setSaumDataPath(e.target.value)}
              placeholder={
                settings?.hasDataPathConfigured
                  ? 'Sudah tersimpan (isi hanya jika ingin mengubah)'
                  : 'Contoh: /srv/saum/data/saum-db.json'
              }
              autoComplete="off"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Token Read-Only SAUM (write-only)
            </label>
            <input
              type="password"
              value={saumSecret}
              onChange={(e) => setSaumSecret(e.target.value)}
              placeholder={
                settings?.hasSecretConfigured
                  ? 'Tersimpan terenkripsi (isi untuk mengganti)'
                  : 'Masukkan token read-only jika menggunakan HTTP'
              }
              autoComplete="new-password"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Rotasi Kode Verifikasi Pendaftaran Pengawas (write-only)
            </label>
            <input
              type="password"
              value={registrationCode}
              onChange={(e) => setRegistrationCode(e.target.value)}
              placeholder="Kosongkan jika tidak mengubah kode pendaftaran"
              autoComplete="new-password"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
        </div>

        {/* Periodic Sync Controls */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              className="w-4 h-4 accent-emerald-800"
            />
            <span className="text-xs font-medium text-slate-800">
              Aktifkan sinkronisasi berkala otomatis (berhenti otomatis jika gagal 3x berturut-turut)
            </span>
          </label>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 whitespace-nowrap">Interval (menit):</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={syncIntervalMinutes}
              onChange={(e) => setSyncIntervalMinutes(Math.max(5, Number(e.target.value) || 15))}
              className="w-20 min-h-[38px] px-2.5 py-1 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
          <span>
            Konektor SAUM dilarang memanggil /api/auth/login, /api/state, /api/backup, maupun
            membuka saum-sessions.json. Semua pembacaan bersifat murni READ-ONLY.
          </span>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>

      {/* Backup & Pemulihan Data Mandiri SIPENGUJI (Phase 06) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-2.5">
            <HardDrive className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Backup &amp; Pemulihan Data SIPENGUJI
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mencadangkan dan memulihkan database SQLite SIPENGUJI serta seluruh berkas privat
                (foto profil, daftar hadir, berita acara, lampiran kejadian) secara mandiri tanpa
                menyentuh SAUM.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={downloadingBackup || restoringBackup}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>
              {downloadingBackup ? 'Menyiapkan Arsip...' : 'Unduh Backup Lengkap (.json.gz)'}
            </span>
          </button>
        </div>

        {backupSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] text-slate-500">Akun &amp; Profil</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {backupSummary.tables.users} / {backupSummary.tables.supervisorProfiles}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] text-slate-500">Dokumen &amp; Kejadian</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {backupSummary.tables.supervisorDocuments} / {backupSummary.tables.incidentReports}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] text-slate-500">Notifikasi &amp; Audit</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {backupSummary.tables.notifications} / {backupSummary.tables.auditLogs}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] text-slate-500">Berkas Privat Terenkapsulasi</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {backupSummary.storage.privateFileCount} file (
                {(backupSummary.storage.totalBytes / 1024).toFixed(1)} KB)
              </p>
            </div>
          </div>
        )}

        <form
          onSubmit={handleRestoreBackup}
          className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
        >
          <div>
            <h3 className="text-xs font-bold text-slate-900">
              Pulihkan Data dari Arsip Backup SIPENGUJI
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Sistem memeriksa checksum SHA-256 manifest serta setiap berkas sebelum melakukan
              pemulihan atomik dan membuat snapshot keamanan sebelum menimpa database.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="file"
              accept=".gz,.json,application/gzip,application/json"
              onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-white file:text-slate-800 hover:file:bg-slate-100 cursor-pointer"
            />
            <button
              type="submit"
              disabled={!restoreFile || !confirmRestoreChecked || restoringBackup}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{restoringBackup ? 'Memulihkan...' : 'Pulihkan Backup'}</span>
            </button>
          </div>

          <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
            <input
              type="checkbox"
              checked={confirmRestoreChecked}
              onChange={(e) => setConfirmRestoreChecked(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-rose-700"
            />
            <span>
              Saya memahami bahwa pemulihan ini akan menimpa seluruh data database &amp; berkas
              privat SIPENGUJI dengan isi arsip backup yang dipilih (data SAUM tidak akan berubah).
            </span>
          </label>
        </form>
      </section>
    </div>
  );
}

