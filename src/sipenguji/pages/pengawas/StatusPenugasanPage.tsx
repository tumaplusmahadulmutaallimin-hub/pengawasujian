import { useEffect, useState } from 'react';
import { CalendarClock, Clock, Info, MapPin, Users } from 'lucide-react';
import { StatusText } from '../../components/StatusText';
import { ApiError, sipengujiApi } from '../../services/api';
import type { AuthContextResponse, PengawasAssignmentDetail } from '../../types';

interface StatusPenugasanPageProps {
  auth: AuthContextResponse;
}

export function StatusPenugasanPage({ auth }: StatusPenugasanPageProps) {
  const { user, profile } = auth;
  const [assignments, setAssignments] = useState<PengawasAssignmentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    sipengujiApi
      .getPengawasAssignments()
      .then((res) => {
        if (active) setAssignments(res.assignments);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Gagal memuat daftar penugasan.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Status Penugasan</h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Daftar penugasan ruang dan jadwal ujian milik Anda berdasarkan sinkronisasi READ-ONLY SAUM.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Status Penugasan Saat Ini</p>
              <p className="text-base font-bold text-slate-900">{user.assignmentStatus}</p>
            </div>
          </div>

          <StatusText
            tone={user.assignmentStatus === 'ASSIGNED' ? 'success' : 'warning'}
            label={user.assignmentStatus}
          />
        </div>

        <dl className="space-y-2.5 text-xs sm:text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">ID Referensi SAUM</dt>
            <dd className="font-mono text-slate-900">
              {profile?.saum_supervisor_id || 'Belum tertaut'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Status Akun</dt>
            <dd className="font-mono text-slate-900">{user.accountStatus}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Status Profil</dt>
            <dd className="font-mono text-slate-900">{user.profileStatus}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Jumlah Penugasan Aktif</dt>
            <dd className="font-mono tabular-nums text-slate-900">{assignments.length} sesi</dd>
          </div>
        </dl>

        {user.assignmentStatus !== 'ASSIGNED' && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5 leading-relaxed">
            <Info className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
            <span>
              {profile?.saum_supervisor_id
                ? 'Akun Anda sudah tertaut dengan data pengawas SAUM, tetapi pada sinkronisasi terakhir belum terdapat jadwal penugasan ruang aktif untuk Anda. Akun dan profil tetap dapat diakses.'
                : 'Akun Anda belum tertaut ke ID Pengawas SAUM atau sinkronisasi SAUM belum dijalankan oleh Admin. Fitur operasional akan terbuka otomatis setelah penugasan yang sah terbaca.'}
            </span>
          </div>
        )}
      </section>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-xs sm:text-sm text-slate-500">
          Memuat rincian penugasan dari database SIPENGUJI...
        </div>
      ) : assignments.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            Jadwal & Ruang Tugas Anda ({assignments.length})
          </h3>
          <div className="space-y-3">
            {assignments.map((item) => (
              <article
                key={item.assignmentId}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-emerald-800 font-semibold">
                      {item.peranPengawas}
                      {item.kodeMapel ? ` · ${item.kodeMapel}` : ''}
                    </p>
                    <h4 className="text-base font-bold text-slate-900 mt-0.5">{item.namaMapel}</h4>
                  </div>
                  <span className="text-xs font-mono text-slate-600 tabular-nums shrink-0">
                    {item.hari ? `${item.hari}, ` : ''}
                    {item.tanggal || '-'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-mono tabular-nums">
                      {item.sesi ? `Sesi ${item.sesi} · ` : ''}
                      {item.waktuMulai || '-'} – {item.waktuSelesai || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      {item.kodeRuang ? `${item.kodeRuang} — ` : ''}
                      {item.namaRuang}
                      {item.kapasitas ? ` (Kap. ${item.kapasitas})` : ''}
                    </span>
                  </div>
                </div>

                {item.rekanPengawas && (
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600">
                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      Rekan Seruang:{' '}
                      <strong className="text-slate-900">{item.rekanPengawas.nama}</strong>
                      {item.rekanPengawas.asalMadrasah
                        ? ` (${item.rekanPengawas.asalMadrasah})`
                        : ''}
                    </span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
