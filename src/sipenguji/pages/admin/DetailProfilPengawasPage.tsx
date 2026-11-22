import { useEffect, useState } from 'react';
import { ArrowLeft, UserCircle2 } from 'lucide-react';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type { AccountStatus, SupervisorListItem } from '../../types';

interface DetailProfilPengawasPageProps {
  userId: string;
  onBack: () => void;
}

export function DetailProfilPengawasPage({ userId, onBack }: DetailProfilPengawasPageProps) {
  const [detail, setDetail] = useState<SupervisorListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await sipengujiApi.getSupervisorDetail(userId);
      setDetail(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat detail pengawas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [userId]);

  const handleChangeStatus = async (status: AccountStatus) => {
    try {
      await sipengujiApi.updateSupervisorStatus(userId, status);
      await loadDetail();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui status akun.');
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat detail profil pengawas...</p>;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Manajemen Akun</span>
        </button>
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error || 'Profil pengawas tidak ditemukan.'}
        </div>
      </div>
    );
  }

  const p = detail.profile;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-2 self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Manajemen Akun</span>
        </button>

        <div className="flex flex-wrap gap-2">
          {(['ACTIVE', 'PENDING_VERIFICATION', 'INACTIVE', 'SUSPENDED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleChangeStatus(st)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                detail.accountStatus === st
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Set {st}
            </button>
          ))}
        </div>
      </div>

      {/* Header & Private Photo */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="w-24 h-24 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
          {p?.foto_profil ? (
            <img
              src={sipengujiApi.getProfilePhotoUrl(detail.id, p.updated_at)}
              alt={`Foto ${p.nama_lengkap}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <UserCircle2 className="w-12 h-12 text-slate-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{p?.nama_lengkap || detail.username}</h1>
          <p className="text-xs font-mono text-slate-500 mt-1">
            @{detail.username} · {p?.jabatan || 'Pengawas Ruang'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <StatusText
              tone={
                detail.accountStatus === 'ACTIVE'
                  ? 'success'
                  : detail.accountStatus === 'PENDING_VERIFICATION' || detail.accountStatus === 'INACTIVE'
                    ? 'warning'
                    : 'danger'
              }
              label={`Akun: ${detail.accountStatus}`}
            />
            <StatusText
              tone={detail.profileCompleted ? 'success' : 'warning'}
              label={`Profil: ${detail.profileStatus}`}
            />
            <StatusText
              tone={detail.assignmentStatus === 'ASSIGNED' ? 'success' : 'neutral'}
              label={`Penugasan: ${detail.assignmentStatus}`}
            />
            <StatusText
              tone={detail.operationalAccessStatus === 'AVAILABLE' ? 'success' : 'danger'}
              label={`Operasional: ${detail.operationalAccessStatus}`}
            />
          </div>
        </div>
      </section>

      {/* Full Identity Attributes */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
          Biodata & Referensi Identitas
        </h2>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3.5 text-sm">
          <div>
            <dt className="text-xs text-slate-500">ID Referensi SAUM</dt>
            <dd className="font-mono text-slate-900 mt-0.5">
              {p?.saum_supervisor_id || 'Belum tertaut'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">NIP / NIK</dt>
            <dd className="font-mono text-slate-900 mt-0.5">
              {p?.nip || '-'} / {p?.nik || '-'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Jenis Kelamin</dt>
            <dd className="text-slate-900 mt-0.5">{p?.jenis_kelamin || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Tempat & Tanggal Lahir</dt>
            <dd className="text-slate-900 mt-0.5">
              {p?.tempat_lahir || '-'}, {p?.tanggal_lahir || '-'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Nomor WhatsApp</dt>
            <dd className="font-mono text-slate-900 mt-0.5">{p?.no_whatsapp || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="text-slate-900 mt-0.5">{p?.email || detail.email || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Asal Madrasah</dt>
            <dd className="text-slate-900 mt-0.5">{p?.asal_madrasah || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Mata Pelajaran</dt>
            <dd className="text-slate-900 mt-0.5">{p?.mata_pelajaran || '-'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Alamat Lengkap</dt>
            <dd className="text-slate-900 mt-0.5">{p?.alamat || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Login Terakhir</dt>
            <dd className="font-mono text-xs text-slate-700 mt-0.5">
              {detail.lastLogin ? new Date(detail.lastLogin).toLocaleString('id-ID') : 'Belum pernah login'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
