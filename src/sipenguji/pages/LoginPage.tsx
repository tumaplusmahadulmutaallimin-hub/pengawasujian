import { FormEvent, useState } from 'react';
import { AlertCircle, Eye, EyeOff, LogIn, ShieldCheck, Smartphone, UserPlus } from 'lucide-react';
import { MadrasahLogo } from '../components/MadrasahLogo';
import { MADRASAH_INFO } from '../config/madrasah';
import { ApiError, sipengujiApi } from '../services/api';
import type { AuthContextResponse } from '../types';

interface LoginPageProps {
  onLoginSuccess: (auth: AuthContextResponse) => void;
  onGoRegister: () => void;
  infoNotice?: string | null;
  isStaging?: boolean;
  needsAdminSetup?: boolean;
}

export function LoginPage({
  onLoginSuccess,
  onGoRegister,
  infoNotice,
  isStaging,
  needsAdminSetup = false,
}: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim();

    if (needsAdminSetup) {
      const normalizedUser = trimmedUser.toLowerCase();
      if (!/^[a-z0-9._-]{4,32}$/.test(normalizedUser)) {
        setErrorMessage(
          'Username Admin harus 4–32 karakter (huruf kecil, angka, titik, garis bawah, atau tanda hubung).'
        );
        return;
      }
      if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        setErrorMessage(
          'Password Admin minimal 10 karakter dengan kombinasi huruf besar, huruf kecil, dan angka atau simbol.'
        );
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Konfirmasi password Admin tidak cocok.');
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await sipengujiApi.setupInitialAdmin({
          username: normalizedUser,
          password,
          email: email.trim() || undefined,
        });
        onLoginSuccess(res.auth);
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Tidak dapat terhubung ke server konfigurasi Admin awal SIPENGUJI.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmedUser || !password) {
      setErrorMessage('Username dan password wajib diisi sebelum masuk.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const auth = await sipengujiApi.login(trimmedUser, password);
      onLoginSuccess(auth);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Tidak dapat terhubung ke server autentikasi SIPENGUJI.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Institutional Panel (Emerald & Navy with subtle Gold detail) */}
      <aside className="lg:w-[46%] xl:w-[48%] bg-slate-900 text-white px-6 py-8 sm:px-10 lg:px-14 lg:py-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div className="flex items-center gap-3.5">
          <MadrasahLogo size={46} />
          <div>
            <p className="text-base font-bold tracking-tight text-white">SIPENGUJI</p>
            <p className="text-xs text-slate-300">{MADRASAH_INFO.namaMadrasah}</p>
          </div>
        </div>

        <div className="my-8 lg:my-0 max-w-lg">
          <p className="text-xs font-medium text-amber-400 tracking-wide mb-3">
            Sistem Informasi Pengawasan Ujian
          </p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
            Autentikasi mandiri dan tata kelola akun pengawas ujian madrasah.
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed">
            Aplikasi pendamping yang terisolasi dari sistem administrasi SAUM, menjamin keamanan
            kredensial, kelengkapan profil pengawas, serta kontrol akses berbasis penugasan.
          </p>

          <div className="mt-8 pt-6 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-white">Konsol Admin</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Kelola status akun, verifikasi profil, audit log, dan konfigurasi integrasi SAUM.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-white">Portal Pengawas</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Pendaftaran mandiri, kelengkapan biodata & foto privat, serta pantauan status tugas.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{MADRASAH_INFO.namaUjian}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">TA {MADRASAH_INFO.tahunAjaran}</span>
          <span aria-hidden="true">·</span>
          <span>NPSN {MADRASAH_INFO.npsn}</span>
        </div>
      </aside>

      {/* Right Login Form */}
      <main className="flex-1 flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between gap-3 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-3.5">
              <MadrasahLogo size={42} className="shrink-0" />
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  {needsAdminSetup ? 'Konfigurasi Akun Admin Awal' : 'Masuk ke SIPENGUJI'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{MADRASAH_INFO.namaMadrasah}</p>
              </div>
            </div>
            {isStaging && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold tracking-wide shrink-0">
                STAGING
              </span>
            )}
          </div>

          {isStaging && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <strong className="font-semibold">Lingkungan Uji Staging Terisolasi:</strong> Database,
              penyimpanan berkas, dan sumber data SAUM uji terpisah sepenuhnya dari sistem produksi.
            </div>
          )}

          {needsAdminSetup && (
            <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs leading-relaxed">
              <strong className="font-semibold">Inisialisasi Satu Kali:</strong> Belum ada akun Admin
              terdaftar pada database ini. Buat akun Admin awal yang kuat untuk memulai pengelolaan sistem.
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {infoNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs leading-relaxed">
                {infoNotice}
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label htmlFor="sipenguji-username" className="block text-sm font-medium text-slate-700 mb-1.5">
                {needsAdminSetup ? 'Username Admin Awal' : 'Username'}
              </label>
              <input
                id="sipenguji-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={needsAdminSetup ? 'Contoh: admin_madrasah' : 'Masukkan username'}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800 transition-colors"
              />
            </div>

            {needsAdminSetup && (
              <div>
                <label htmlFor="sipenguji-admin-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email Admin (Opsional)
                </label>
                <input
                  id="sipenguji-admin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@madrasah.sch.id"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800 transition-colors"
                />
              </div>
            )}

            <div>
              <label htmlFor="sipenguji-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                {needsAdminSetup ? 'Password Admin Awal' : 'Password'}
              </label>
              <div className="relative">
                <input
                  id="sipenguji-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={needsAdminSetup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={needsAdminSetup ? 'Minimal 10 karakter kuat' : 'Masukkan password'}
                  className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {needsAdminSetup && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Wajib minimal 10 karakter dengan huruf besar, huruf kecil, serta angka atau simbol.
                </p>
              )}
            </div>

            {needsAdminSetup && (
              <div>
                <label htmlFor="sipenguji-confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Konfirmasi Password Admin
                </label>
                <input
                  id="sipenguji-confirm-password"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password Admin"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800 transition-colors"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 active:scale-[0.99] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>
                {loading
                  ? 'Memproses...'
                  : needsAdminSetup
                    ? 'Simpan & Aktifkan Admin Awal'
                    : 'Masuk'}
              </span>
            </button>
          </form>

          {/* Self Registration Link for Pengawas only */}
          {!needsAdminSetup && (
            <div className="mt-6 pt-5 border-t border-slate-100 space-y-3">
              <p className="text-xs text-slate-600">
                Belum memiliki akun Pengawas SIPENGUJI?
              </p>
              <button
                type="button"
                onClick={onGoRegister}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 hover:border-emerald-800 hover:bg-emerald-50/50 text-slate-900 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-emerald-800" aria-hidden="true" />
                <span>Pendaftaran Mandiri Pengawas</span>
              </button>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Pendaftaran publik hanya tersedia untuk peran Pengawas. Akun Admin dikelola secara internal.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
