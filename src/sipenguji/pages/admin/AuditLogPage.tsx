import { FormEvent, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { ApiError, sipengujiApi } from '../../services/api';
import type { AuditLogItem } from '../../types';

const ACTIVITY_OPTIONS = [
  'ALL',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'REGISTER_SUCCESS',
  'REGISTER_FAILED',
  'ACCOUNT_CREATED',
  'PROFILE_UPDATED',
  'PHOTO_UPLOADED',
  'ACCOUNT_STATUS_CHANGED',
  'INTEGRATION_SETTINGS_UPDATED',
  'INTEGRATION_TEST',
  'INTEGRATION_CHECK',
  'SAUM_SYNC_SUCCESS',
  'SAUM_SYNC_FAILED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_REVISION_UPLOADED',
  'DOCUMENT_ACCEPTED',
  'DOCUMENT_REVISION_REQUIRED',
  'DOCUMENT_PIC_ASSIGNED',
  'UPLOAD_LIMIT_UPDATED',
  'INCIDENT_CREATED',
  'INCIDENT_STATUS_CHANGED',
  'BACKUP_CREATED',
  'BACKUP_RESTORED',
  'ACCESS_DENIED',
];

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [activity, setActivity] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sipengujiApi.getAuditLogs({
        activity,
        search: search.trim() || undefined,
      });
      setLogs(res.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat audit log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [activity]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Log Keamanan</h1>
        <p className="text-sm text-slate-600 mt-1">
          Catatan aktivitas autentikasi, pendaftaran, perubahan profil, status akun, dan proteksi akses.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari username atau deskripsi aktivitas..."
              className="w-full min-h-[40px] pl-10 pr-3.5 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
          >
            Cari
          </button>
        </form>

        <select
          aria-label="Filter jenis aktivitas"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          className="min-h-[40px] px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-800"
        >
          {ACTIVITY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-5">Waktu</th>
                <th className="py-3 px-4">Aktivitas</th>
                <th className="py-3 px-4">Pengguna</th>
                <th className="py-3 px-4">Deskripsi</th>
                <th className="py-3 px-5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 px-5 text-center text-slate-500">
                    Memuat audit log...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-5 text-center text-slate-500">
                    Tidak ada catatan audit yang cocok.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-5 font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {log.activity}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {log.username_snapshot || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{log.description}</td>
                    <td className="py-3 px-5 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
