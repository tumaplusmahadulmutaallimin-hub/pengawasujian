import { ChangeEvent, FormEvent, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, Lock, UserCircle2 } from 'lucide-react';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type { AuthContextResponse } from '../../types';

interface LengkapiProfilPageProps {
  auth: AuthContextResponse;
  onProfileUpdated: (nextAuth: AuthContextResponse) => void;
}

export function LengkapiProfilPage({ auth, onProfileUpdated }: LengkapiProfilPageProps) {
  const profile = auth.profile;
  const saumLocked = Boolean(profile?.saum_supervisor_id);

  const [namaLengkap, setNamaLengkap] = useState(profile?.nama_lengkap ?? '');
  const [nip, setNip] = useState(profile?.nip ?? '');
  const [nik, setNik] = useState(profile?.nik ?? '');
  const [jenisKelamin, setJenisKelamin] = useState(profile?.jenis_kelamin ?? '');
  const [tempatLahir, setTempatLahir] = useState(profile?.tempat_lahir ?? '');
  const [tanggalLahir, setTanggalLahir] = useState(profile?.tanggal_lahir ?? '');
  const [alamat, setAlamat] = useState(profile?.alamat ?? '');
  const [noWhatsapp, setNoWhatsapp] = useState(profile?.no_whatsapp ?? '');
  const [email, setEmail] = useState(profile?.email ?? auth.user.email ?? '');
  const [asalMadrasah, setAsalMadrasah] = useState(profile?.asal_madrasah ?? '');
  const [jabatan, setJabatan] = useState(profile?.jabatan ?? 'Guru / Pengawas Ruang');
  const [mataPelajaran, setMataPelajaran] = useState(profile?.mata_pelajaran ?? '');

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(String(Date.now()));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await sipengujiApi.updateMyProfile({
        namaLengkap: namaLengkap.trim(),
        nip: nip.trim() || undefined,
        nik: nik.trim() || undefined,
        jenisKelamin,
        tempatLahir: tempatLahir.trim(),
        tanggalLahir,
        alamat: alamat.trim(),
        noWhatsapp: noWhatsapp.trim(),
        email: email.trim() || undefined,
        asalMadrasah: asalMadrasah.trim(),
        jabatan: jabatan.trim(),
        mataPelajaran: mataPelajaran.trim() || undefined,
      });
      onProfileUpdated(updated);
      setSuccessMsg(
        updated.user.profileCompleted
          ? 'Profil lengkap tersimpan dan siap digunakan.'
          : 'Biodata tersimpan. Unggah foto profil untuk menuntaskan kelengkapan profil.'
      );
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal memperbarui profil.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await sipengujiApi.uploadMyPhoto(file);
      onProfileUpdated(updated);
      setPhotoVersion(String(Date.now()));
      setSuccessMsg('Foto profil berhasil diunggah ke penyimpanan privat.');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal mengunggah foto profil.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const hasPhoto = Boolean(profile?.foto_profil);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {auth.user.profileCompleted ? 'Profil Pengawas Saya' : 'Lengkapi Profil Pengawas'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Lengkapi seluruh biodata wajib dan unggah foto profil untuk memenuhi syarat kelengkapan akun.
          </p>
        </div>

        <StatusText
          tone={auth.user.profileCompleted ? 'success' : 'warning'}
          label={auth.user.profileCompleted ? 'Profil: COMPLETE' : 'Profil: INCOMPLETE'}
        />
      </div>

      {!auth.user.profileCompleted && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm leading-relaxed">
          Profil Anda belum lengkap. Anda wajib melengkapi biodata dan mengunggah foto profil
          terlebih dahulu sebelum memenuhi syarat akses fitur operasional ujian.
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Private Photo Upload Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5">
        <div className="w-24 h-24 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
          {hasPhoto ? (
            <img
              src={sipengujiApi.getProfilePhotoUrl(auth.user.id, photoVersion)}
              alt={`Foto profil ${namaLengkap}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <UserCircle2 className="w-12 h-12 text-slate-400" />
          )}
        </div>

        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-sm font-bold text-slate-900">Foto Profil Resmi (Penyimpanan Privat)</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Format JPG, PNG, atau WEBP dengan ukuran maksimal 2 MB. Foto hanya dapat dilihat oleh
            Anda sendiri dan Admin SIPENGUJI.
          </p>

          <label className="mt-3 inline-flex min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold items-center gap-2 cursor-pointer transition-colors">
            <Camera className="w-4 h-4" />
            <span>{uploadingPhoto ? 'Mengunggah...' : hasPhoto ? 'Ganti Foto Profil' : 'Unggah Foto Profil'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelect}
              disabled={uploadingPhoto}
              className="sr-only"
            />
          </label>
        </div>
      </section>

      {/* Profile Form */}
      <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        {saumLocked && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Nama lengkap dan NIP ditautkan ke referensi SAUM dan dikunci dari perubahan manual.</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Nama Lengkap *</label>
          <input
            type="text"
            value={namaLengkap}
            onChange={(e) => setNamaLengkap(e.target.value)}
            readOnly={saumLocked}
            className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl read-only:bg-slate-100 focus:outline-none focus:border-emerald-800"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">NIP (jika ada)</label>
            <input
              type="text"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              readOnly={saumLocked}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl read-only:bg-slate-100 focus:outline-none focus:border-emerald-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">NIK (opsional)</label>
            <input
              type="text"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Jenis Kelamin *</label>
            <select
              value={jenisKelamin}
              onChange={(e) => setJenisKelamin(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            >
              <option value="">Pilih...</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Tempat Lahir *</label>
            <input
              type="text"
              value={tempatLahir}
              onChange={(e) => setTempatLahir(e.target.value)}
              placeholder="Kota kelahiran"
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Tanggal Lahir *</label>
            <input
              type="date"
              value={tanggalLahir}
              onChange={(e) => setTanggalLahir(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Alamat Lengkap *</label>
          <textarea
            rows={2}
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            placeholder="Alamat domisili saat ini"
            className="w-full p-3.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Nomor WhatsApp *</label>
            <input
              type="tel"
              value={noWhatsapp}
              onChange={(e) => setNoWhatsapp(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Asal Madrasah *</label>
            <input
              type="text"
              value={asalMadrasah}
              onChange={(e) => setAsalMadrasah(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Jabatan *</label>
            <input
              type="text"
              value={jabatan}
              onChange={(e) => setJabatan(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Mata Pelajaran</label>
            <input
              type="text"
              value={mataPelajaran}
              onChange={(e) => setMataPelajaran(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-800"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer transition-colors"
          >
            {saving ? 'Menyimpan...' : 'Simpan Profil Pengawas'}
          </button>
        </div>
      </form>
    </div>
  );
}
