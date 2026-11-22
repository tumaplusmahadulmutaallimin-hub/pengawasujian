import { useState } from 'react';
import { Lock, ShieldCheck, ShieldX } from 'lucide-react';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type { AuthContextResponse, PengawasRoute } from '../../types';

interface AksesOperasionalPageProps {
  auth: AuthContextResponse;
  onNavigate: (route: PengawasRoute) => void;
}

export function AksesOperasionalPage({ auth, onNavigate }: AksesOperasionalPageProps) {
  const [checking, setChecking] = useState(false);
  const [serverResult, setServerResult] = useState<{ allowed: boolean; message: string } | null>(
    null
  );

  const handleBackendGuardTest = async () => {
    setChecking(true);
    try {
      const res = await sipengujiApi.checkOperationalAccess();
      setServerResult({ allowed: true, message: res.message });
    } catch (err) {
      setServerResult({
        allowed: false,
        message:
          err instanceof ApiError
            ? `Ditolak oleh backend (${err.status}): ${err.message}`
            : 'Gagal memeriksa otorisasi operasional ke server.',
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Akses Fitur Operasional</h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Akses fitur operasional (monitoring peserta, daftar hadir, berita acara, laporan kejadian)
          dikendalikan penuh oleh backend SIPENGUJI.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Status Akses Saat Ini</p>
              <p className="text-base font-bold text-slate-900">
                {auth.user.operationalAccessStatus}
              </p>
            </div>
          </div>
          <StatusText
            tone={auth.user.operationalAccessStatus === 'AVAILABLE' ? 'success' : 'danger'}
            label={auth.user.operationalAccessStatus}
          />
        </div>

        <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
          <li className="flex items-center justify-between py-1">
            <span>1. Status Akun ACTIVE</span>
            <StatusText
              tone={auth.user.accountStatus === 'ACTIVE' ? 'success' : 'danger'}
              label={auth.user.accountStatus}
            />
          </li>
          <li className="flex items-center justify-between py-1">
            <span>2. Kelengkapan Profil COMPLETE</span>
            <StatusText
              tone={auth.user.profileCompleted ? 'success' : 'warning'}
              label={auth.user.profileStatus}
            />
          </li>
          <li className="flex items-center justify-between py-1">
            <span>3. Penugasan Sah dari SAUM (ASSIGNED)</span>
            <StatusText
              tone={auth.user.assignmentStatus === 'ASSIGNED' ? 'success' : 'warning'}
              label={auth.user.assignmentStatus}
            />
          </li>
        </ul>

        <div className="pt-2 flex flex-wrap gap-2.5">
          {!auth.user.profileCompleted && (
            <button
              type="button"
              onClick={() => onNavigate('lengkapi-profil')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold cursor-pointer"
            >
              Lengkapi Profil Terlebih Dahulu
            </button>
          )}
          <button
            type="button"
            onClick={handleBackendGuardTest}
            disabled={checking}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer"
          >
            {checking ? 'Memeriksa ke Backend...' : 'Uji Validasi Guard Backend'}
          </button>
        </div>

        {serverResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 leading-relaxed ${
              serverResult.allowed
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {serverResult.allowed ? (
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldX className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{serverResult.message}</span>
          </div>
        )}
      </section>
    </div>
  );
}
