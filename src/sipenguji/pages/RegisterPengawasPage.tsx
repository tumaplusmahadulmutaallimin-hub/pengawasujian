import { FormEvent, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Search,
  UserCheck,
} from 'lucide-react';
import { MadrasahLogo } from '../components/MadrasahLogo';
import { MADRASAH_INFO } from '../config/madrasah';
import { ApiError, sipengujiApi } from '../services/api';
import type { AuthContextResponse, SaumSearchCandidate } from '../types';

interface RegisterPengawasPageProps {
  onBackToLogin: (notice?: string) => void;
  onRegisteredAndLoggedIn: (auth: AuthContextResponse) => void;
}

export function RegisterPengawasPage({
  onBackToLogin,
  onRegisteredAndLoggedIn,
}: RegisterPengawasPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: SAUM Supervisor Lookup
  const [saumQuery, setSaumQuery] = useState('');
  const [saumLoading, setSaumLoading] = useState(false);
  const [saumMessage, setSaumMessage] = useState<string | null>(null);
  const [saumAvailable, setSaumAvailable] = useState<boolean | null>(null);
  const [saumResults, setSaumResults] = useState<SaumSearchCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<SaumSearchCandidate | null>(null);

  // Step 2 & 3: Identity & Account Credentials
  const [namaLengkap, setNamaLengkap] = useState('');
  const [nip, setNip] = useState('');
  const [nik, setNik] = useState('');
  const [asalMadrasah, setAsalMadrasah] = useState(MADRASAH_INFO.namaMadrasah);
  const [mataPelajaran, setMataPelajaran] = useState('');
  const [noWhatsapp, setNoWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSaumSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!saumQuery.trim()) {
      setErrorMessage('Masukkan nama atau NIP pengawas terlebih dahulu.');
      return;
    }
    setErrorMessage(null);
    setSaumLoading(true);
    try {
      const res = await sipengujiApi.searchSaumSupervisors(saumQuery.trim());
      setSaumAvailable(res.saumAvailable);
      setSaumMessage(res.message);
      setSaumResults(res.results);
    } catch (err) {
      setSaumAvailable(false);
      setSaumMessage(
        err instanceof ApiError ? err.message : 'Gagal mencari data pengawas tersinkronisasi.'
      );
      setSaumResults([]);
    } finally {
      setSaumLoading(false);
    }
  };

  const handleSelectCandidate = (candidate: SaumSearchCandidate) => {
    setSelectedCandidate(candidate);
    setNamaLengkap(candidate.namaLengkap);
    if (candidate.asalMadrasah) setAsalMadrasah(candidate.asalMadrasah);
    setErrorMessage(null);
    setStep(2);
  };

  const handleNextToCredentials = (e: FormEvent) => {
    e.preventDefault();
    if (!namaLengkap.trim() || !asalMadrasah.trim() || !noWhatsapp.trim()) {
      setErrorMessage('Nama lengkap, asal madrasah, dan nomor WhatsApp wajib diisi.');
      return;
    }
    if (!nip.trim() && !nik.trim()) {
      setErrorMessage(
        'Masukkan NIP atau NIK sebagai bagian dari verifikasi identitas pengawas.'
      );
      return;
    }
    setErrorMessage(null);
    setStep(3);
  };

  const handleSubmitRegistration = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Username dan password wajib dibuat.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi password tidak cocok.');
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage('Anda wajib menyetujui pernyataan kebenaran identitas pendaftaran.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await sipengujiApi.registerPengawas({
        namaLengkap: namaLengkap.trim(),
        username: username.trim().toLowerCase(),
        password,
        email: email.trim() || undefined,
        nip: nip.trim() || undefined,
        nik: nik.trim() || undefined,
        noWhatsapp: noWhatsapp.trim(),
        asalMadrasah: asalMadrasah.trim(),
        mataPelajaran: mataPelajaran.trim() || undefined,
        saumSupervisorId: selectedCandidate?.saumSupervisorId ?? null,
        verificationCode: verificationCode.trim() || undefined,
        agreedToTerms,
      });

      if (!result.requiresAdminActivation && result.auth) {
        onRegisteredAndLoggedIn(result.auth);
      } else {
        onBackToLogin(result.message);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Gagal menyelesaikan pendaftaran pengawas.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            type="button"
            onClick={() => onBackToLogin()}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Login</span>
          </button>

          <div className="flex items-center gap-2.5">
            <MadrasahLogo size={34} />
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900">SIPENGUJI</p>
              <p className="text-[11px] text-slate-500">Pendaftaran Pengawas</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="pb-5 border-b border-slate-100">
            <p className="text-xs font-medium text-emerald-800">Langkah {step} dari 3</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              {step === 1
                ? 'Pencarian Nama Pengawas (Referensi SAUM)'
                : step === 2
                  ? 'Verifikasi & Identitas Pengawas'
                  : 'Pembuatan Akun & Persetujuan'}
            </h1>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[1, 2, 3].map((num) => (
                <div
                  key={num}
                  className={`h-1.5 rounded-full transition-colors ${
                    step >= num ? 'bg-emerald-800' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {step === 1 && (
            <div className="mt-6 space-y-5">
              <p className="text-sm text-slate-600 leading-relaxed">
                Cari nama Anda dari daftar pengawas SAUM yang telah disinkronkan secara READ-ONLY
                ke SIPENGUJI. Nama saja tidak cukup untuk klaim akun — pencocokan NIP dan verifikasi
                Admin tetap diterapkan.
              </p>

              <form onSubmit={handleSaumSearch} className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={saumQuery}
                    onChange={(e) => setSaumQuery(e.target.value)}
                    placeholder="Ketik nama lengkap atau NIP..."
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saumLoading}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  {saumLoading ? 'Mencari...' : 'Cari Pengawas'}
                </button>
              </form>

              {saumMessage && (
                <div
                  className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 leading-relaxed ${
                    saumAvailable
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-amber-50 border-amber-200 text-amber-950'
                  }`}
                >
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>{saumMessage}</span>
                </div>
              )}

              {saumResults.length > 0 && (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {saumResults.map((cand) => (
                    <button
                      key={cand.saumSupervisorId}
                      type="button"
                      onClick={() => handleSelectCandidate(cand)}
                      className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-emerald-50/60 transition-colors cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{cand.namaLengkap}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {cand.nipMasked ? `NIP ${cand.nipMasked} · ` : ''}
                          {cand.asalMadrasah || MADRASAH_INFO.namaMadrasah}
                          {cand.status ? ` · ${cand.status}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
                        Pilih Identitas
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Atau isi formulir pendaftaran mandiri untuk diverifikasi Admin.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCandidate(null);
                    setErrorMessage(null);
                    setStep(2);
                  }}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold whitespace-nowrap cursor-pointer"
                >
                  Lanjut Isi Identitas Mandiri
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleNextToCredentials} className="mt-6 space-y-4">
              {selectedCandidate && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Tertaut ke referensi SAUM: <strong>{selectedCandidate.namaLengkap}</strong> (ID:{' '}
                    <span className="font-mono">{selectedCandidate.saumSupervisorId}</span>).
                    Masukkan NIP Anda untuk pencocokan identitas.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Lengkap & Gelar *
                </label>
                <input
                  type="text"
                  value={namaLengkap}
                  onChange={(e) => setNamaLengkap(e.target.value)}
                  readOnly={Boolean(selectedCandidate)}
                  placeholder="Contoh: Siti Rahmawati, S.Pd."
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl read-only:bg-slate-100 focus:outline-none focus:border-emerald-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    NIP {selectedCandidate?.nipMasked ? `(Cocokkan: ${selectedCandidate.nipMasked})` : ''}
                  </label>
                  <input
                    type="text"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    placeholder="18 digit NIP"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    NIK (wajib jika tanpa NIP)
                  </label>
                  <input
                    type="text"
                    value={nik}
                    onChange={(e) => setNik(e.target.value)}
                    placeholder="16 digit NIK"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Asal Madrasah *
                  </label>
                  <input
                    type="text"
                    value={asalMadrasah}
                    onChange={(e) => setAsalMadrasah(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Nomor WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={noWhatsapp}
                    onChange={(e) => setNoWhatsapp(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email (opsional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Mata Pelajaran Ampu (opsional)
                  </label>
                  <input
                    type="text"
                    value={mataPelajaran}
                    onChange={(e) => setMataPelajaran(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold cursor-pointer"
                >
                  Lanjut Buat Akun
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmitRegistration} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Username Login *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="4–32 karakter (huruf kecil, angka, titik, -)"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Password (min. 8 karakter) *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[44px] pl-3.5 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Ulangi Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-semibold text-slate-800">
                  Kode Verifikasi Panitia Madrasah (opsional)
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Isi kode panitia untuk aktivasi langsung, atau kosongkan"
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Tanpa kode verifikasi kuat, pendaftaran berstatus{' '}
                  <strong className="font-mono text-slate-700">PENDING_VERIFICATION</strong> dan
                  memerlukan persetujuan Admin sebelum dapat login.
                </p>
              </div>

              <label className="flex items-start gap-3 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-800"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  Saya menyatakan bahwa identitas yang didaftarkan adalah benar milik saya sendiri dan
                  bersedia mematuhi ketentuan pengawasan ujian madrasah.
                </span>
              </label>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Memproses...' : 'Daftar Akun Pengawas'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
