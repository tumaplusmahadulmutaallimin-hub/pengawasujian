import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, FileCheck2, AlertTriangle, Info } from 'lucide-react';
import { sipengujiApi } from '../services/api';
import type { NotificationItem } from '../types';

interface NotificationBellProps {
  onSelectNotification?: (item: NotificationItem) => void;
}

function formatWibDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso)) + ' WIB';
  } catch {
    return iso;
  }
}

export function NotificationBell({ onSelectNotification }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await sipengujiApi.getNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Silent refresh failure
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleMarkRead = async (item: NotificationItem) => {
    if (item.is_read === 0) {
      try {
        await sipengujiApi.markNotificationRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: 1 } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Ignore
      }
    }
    if (onSelectNotification) {
      onSelectNotification(item);
      setOpen(false);
    }
  };

  const handleMarkAll = async () => {
    try {
      await sipengujiApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) loadNotifications();
        }}
        aria-label="Notifikasi SIPENGUJI"
        className="relative min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-12 w-[calc(100vw-24px)] sm:w-96 max-h-[75vh] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
            <div>
              <p className="text-sm font-bold text-slate-900">Notifikasi</p>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua notifikasi sudah dibaca'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Tandai semua</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading && notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">Memuat notifikasi...</p>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                Belum ada notifikasi aktivitas terbaru.
              </p>
            ) : (
              notifications.map((n) => {
                const isUnread = n.is_read === 0;
                const isDoc = n.related_entity_type === 'DOCUMENT';
                const isInc = n.related_entity_type === 'INCIDENT';
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleMarkRead(n)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                      isUnread ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isInc
                          ? 'bg-amber-100 text-amber-800'
                          : isDoc
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isInc ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : isDoc ? (
                        <FileCheck2 className="w-4 h-4" />
                      ) : (
                        <Info className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                          }`}
                        >
                          {n.title}
                        </p>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatWibDateTime(n.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
