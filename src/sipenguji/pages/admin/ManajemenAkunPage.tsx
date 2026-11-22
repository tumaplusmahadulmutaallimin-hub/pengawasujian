import { FormEvent, useEffect, useState } from 'react';
import { Eye, Plus, Search, X } from 'lucide-react';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type { AccountStatus, SupervisorListItem } from '../../types';

interface ManajemenAkunPageProps {
  onSelectSupervisor: (userId: string) => void;
}

export function ManajemenAkunPage({ onSelectSupervisor }: ManajemenAkunPageProps) {
  const [supervisors, setSupervisors] = useState<SupervisorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AccountStatus>('ALL');
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [namaLengkap, setNamaLengkap] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [asalMadrasah, setAsalMadrasah] = useState('MAN 1 Model Nusantara');
  const [mataPelajaran, setMataPelajaran] = useState('');
  const [accountStatus, setAccountStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingStatusAction, setPendingStatusAction] = useState<{
    userId: string;
    username: string;
    nextStatus: AccountStatus;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sipengujiApi.listSupervisors({
        search: search.trim() || undefined,
        status: statusFilter,
      });
      setSupervisors(res.supervisors);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat daftar akun pengawas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [statusFilter]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchList();
  };

  const executeStatusChange = async (userId: string, nextStatus: AccountStatus, usernameLabel?: string) => {
    setUpdatingStatus(true);
    setError(null);
    setNotice(null);
    try {
      await sipengujiApi.updateSupervisorStatus(userId, nextStatus);
      setNotice(
        `Status akun${usernameLabel ? ` @${usernameLabel}` : ''} diperbarui menjadi ${nextStatus}.`
      );
      setPendingStatusAction(null);
      await fetchList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status akun.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleStatusChange = async (
    item: SupervisorListItem,
    nextStatus: AccountStatus
  ) => {
    if (nextStatus === item.accountStatus) return;
    if (nextStatus === 'INACTIVE' || nextStatus === 'SUSPENDED') {
      setPendingStatusAction({
        userId: item.id,
        username: item.username,
        nextStatus,
      });
      return;
    }
    await executeStatusChange(item.id, nextStatus, item.username);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await sipengujiApi.createSupervisorAccount({
        namaLengkap: namaLengkap.trim(),
        username: username.trim().toLowerCase(),
        password,
        nip: nip.trim() || undefined,
        email: email.trim() || undefined,
        asalMadrasah: asalMadrasah.trim() || undefined,
        mataPelajaran: mataPelajaran.trim() || undefined,
        accountStatus,
      });
      setNamaLengkap('');
      setUsername('');
      setPassword('');
      setNip('');
      setEmail('');
      setMataPelajaran('');
      setModalOpen(false);
      await fetchList();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal membuat akun pengawas.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Manajemen Akun Pengawas</h1>
          <p className="text-sm text-slate-600 mt-1">
            Kelola akun pengawas, aktivasi pendaftaran mandiri, status kelengkapan profil, dan penugasan.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="min-h-[42px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Akun Pengawas</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, username, NIP, atau madrasah..."
              className="w-full min-h-[40px] pl-10 pr-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-800"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
          >
            Cari
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
          {(['ALL', 'PENDING_VERIFICATION', 'ACTIVE', 'INACTIVE', 'SUSPENDED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Supervisors Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-5">Pengawas</th>
                <th className="py-3 px-4">Username & NIP</th>
                <th className="py-3 px-4">Status Akun</th>
                <th className="py-3 px-4">Status Profil</th>
                <th className="py-3 px-4">Penugasan</th>
                <th className="py-3 px-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 px-5 text-center text-sm text-slate-500">
                    Memuat data akun pengawas...
                  </td>
                </tr>
              ) : supervisors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-5 text-center text-sm text-slate-500">
                    Belum ada akun pengawas yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                supervisors.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-slate-900">
                        {item.profile?.nama_lengkap || item.username}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.profile?.asal_madrasah || '-'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-mono text-xs text-slate-800">@{item.username}</p>
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                        {item.profile?.nip ? `NIP ${item.profile.nip}` : 'NIP belum diisi'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText
                        tone={
                          item.accountStatus === 'ACTIVE'
                            ? 'success'
                            : item.accountStatus === 'INACTIVE' ||
                                item.accountStatus === 'PENDING_VERIFICATION'
                              ? 'warning'
                              : 'danger'
                        }
                        label={item.accountStatus}
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText
                        tone={item.profileCompleted ? 'success' : 'warning'}
                        label={item.profileStatus}
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText
                        tone={item.assignmentStatus === 'ASSIGNED' ? 'success' : 'neutral'}
                        label={item.assignmentStatus}
                      />
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {item.accountStatus === 'PENDING_VERIFICATION' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(item, 'ACTIVE')}
                            className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
                          >
                            Setujui
                          </button>
                        )}
                        <select
                          aria-label={`Ubah status ${item.username}`}
                          value={item.accountStatus}
                          onChange={(e) =>
                            handleStatusChange(item, e.target.value as AccountStatus)
                          }
                          className="min-h-[34px] px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 cursor-pointer"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                          <option value="INACTIVE">INACTIVE</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => onSelectSupervisor(item.id)}
                          className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Detail</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah Akun Pengawas */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Buat Akun Pengawas Baru</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
              {formError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  value={namaLengkap}
                  onChange={(e) => setNamaLengkap(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="4–32 karakter"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Password Awal (min 8) *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">NIP (opsional)</label>
                  <input
                    type="text"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email (opsional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Asal Madrasah</label>
                  <input
                    type="text"
                    value={asalMadrasah}
                    onChange={(e) => setAsalMadrasah(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status Awal</label>
                  <select
                    value={accountStatus}
                    onChange={(e) => setAccountStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mata Pelajaran (opsional)</label>
                <input
                  type="text"
                  value={mataPelajaran}
                  onChange={(e) => setMataPelajaran(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
                >
                  {creating ? 'Menyimpan...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Nonaktif / Suspend Akun */}
      {pendingStatusAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Konfirmasi Perubahan Status Akun
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Anda akan mengubah status akun{' '}
              <strong className="font-mono text-slate-900">@{pendingStatusAction.username}</strong>{' '}
              menjadi <strong className="font-mono text-rose-700">{pendingStatusAction.nextStatus}</strong>.
              Sesi login aktif pengguna ini akan langsung dihentikan hingga diaktifkan kembali.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => setPendingStatusAction(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() =>
                  executeStatusChange(
                    pendingStatusAction.userId,
                    pendingStatusAction.nextStatus,
                    pendingStatusAction.username
                  )
                }
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {updatingStatus ? 'Memproses...' : `Ya, Ubah ke ${pendingStatusAction.nextStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
