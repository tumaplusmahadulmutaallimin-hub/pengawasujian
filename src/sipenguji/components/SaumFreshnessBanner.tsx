import { AlertTriangle, Clock } from 'lucide-react';
import type { SaumFreshnessInfo } from '../types';

interface SaumFreshnessBannerProps {
  freshness?: SaumFreshnessInfo | null;
}

export function SaumFreshnessBanner({ freshness }: SaumFreshnessBannerProps) {
  if (!freshness) return null;

  const formattedSync = freshness.lastSyncAt
    ? new Date(freshness.lastSyncAt).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'medium',
        timeStyle: 'short',
      }) + ' WIB'
    : 'Belum pernah disinkronkan';

  if (freshness.isStaleOrDisconnected) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">
            {freshness.lastSyncAt
              ? 'Menampilkan Data Sinkronisasi Terakhir yang Valid'
              : 'Integrasi SAUM Belum Disinkronkan'}
          </p>
          <p className="text-amber-900 leading-relaxed">{freshness.warningMessage}</p>
          <p className="font-mono text-[11px] text-amber-800">
            Sinkronisasi terakhir: {formattedSync}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-500">
      <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
      <span>
        Sumber data SAUM (Read-Only) · Sinkronisasi terakhir:{' '}
        <span className="font-mono text-slate-700">{formattedSync}</span>
      </span>
    </div>
  );
}
