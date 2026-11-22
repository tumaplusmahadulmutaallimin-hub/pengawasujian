import { ReactNode, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  FileCheck2,
  GraduationCap,
  Home,
  Lock,
  LogOut,
  Menu,
  UserCircle2,
  X,
} from 'lucide-react';
import { MadrasahLogo } from '../components/MadrasahLogo';
import { NotificationBell } from '../components/NotificationBell';
import { PanduanModal } from '../components/PanduanModal';
import type { AuthContextResponse, NotificationItem, PengawasRoute } from '../types';

interface PengawasLayoutProps {
  auth: AuthContextResponse;
  activeRoute: PengawasRoute;
  isStaging?: boolean;
  onNavigate: (route: PengawasRoute) => void;
  onSelectNotification?: (item: NotificationItem) => void;
  onLogout: () => void;
  children: ReactNode;
}

const PENGAWAS_NAV_ITEMS: {
  id: PengawasRoute;
  label: string;
  shortLabel: string;
  icon: typeof Home;
  showInMobileBar?: boolean;
}[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', icon: Home, showInMobileBar: true },
  { id: 'jadwal-saya', label: 'Jadwal Saya', shortLabel: 'Jadwal', icon: CalendarDays, showInMobileBar: true },
  { id: 'dokumen-pengawasan', label: 'Dokumen Pengawasan', shortLabel: 'Dokumen', icon: FileCheck2, showInMobileBar: true },
  { id: 'laporan-kejadian', label: 'Laporan Kejadian', shortLabel: 'Kejadian', icon: AlertTriangle, showInMobileBar: true },
  { id: 'monitoring-peserta', label: 'Monitoring Peserta', shortLabel: 'Peserta', icon: GraduationCap, showInMobileBar: true },
  { id: 'status-penugasan', label: 'Status Penugasan', shortLabel: 'Tugas', icon: CalendarClock, showInMobileBar: false },
  { id: 'lengkapi-profil', label: 'Profil Saya', shortLabel: 'Profil', icon: UserCircle2, showInMobileBar: false },
  { id: 'akses-operasional', label: 'Akses Operasional', shortLabel: 'Akses', icon: Lock, showInMobileBar: false },
];

export function PengawasLayout({
  auth,
  activeRoute,
  isStaging,
  onNavigate,
  onSelectNotification,
  onLogout,
  children,
}: PengawasLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { user, profile } = auth;
  const activeItem =
    activeRoute === 'detail-tugas'
      ? { id: 'detail-tugas', label: 'Detail Penugasan' }
      : (PENGAWAS_NAV_ITEMS.find((item) => item.id === activeRoute) ?? PENGAWAS_NAV_ITEMS[0]);
  const mobileBarItems = PENGAWAS_NAV_ITEMS.filter((i) => i.showInMobileBar);

  const displayName = profile?.nama_lengkap || user.username;
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const handleSelect = (route: PengawasRoute) => {
    onNavigate(route);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Rail */}
      <aside className="hidden lg:flex lg:w-[250px] lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200">
          <MadrasahLogo size={34} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-slate-900 truncate">SIPENGUJI</p>
            <p className="text-[11px] text-emerald-800 font-medium truncate">Portal Pengawas</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Navigasi Pengawas">
          {PENGAWAS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.id === activeRoute ||
              (item.id === 'jadwal-saya' && activeRoute === 'detail-tugas');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full min-h-[42px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors cursor-pointer text-left ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-800' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="mb-3">
            <p className="text-xs font-semibold text-slate-900 truncate">{displayName}</p>
            <p className="text-[11px] font-mono text-slate-500 truncate">@{user.username}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <MadrasahLogo size={32} />
                <div>
                  <p className="text-sm font-bold text-slate-900">SIPENGUJI</p>
                  <p className="text-[11px] text-emerald-800 font-medium">Portal Pengawas</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup menu"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {PENGAWAS_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.id === activeRoute ||
                  (item.id === 'jadwal-saya' && activeRoute === 'detail-tugas');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-medium text-left ${
                      isActive ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 lg:pl-[250px] flex flex-col min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-20 h-[52px] lg:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu pengawas"
              className="lg:hidden min-w-[40px] min-h-[40px] -ml-1 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            {activeRoute !== 'dashboard' ? (
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                aria-label="Kembali ke Dashboard"
                className="lg:hidden min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="lg:hidden flex items-center">
                <MadrasahLogo size={28} />
              </div>
            )}
            <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
              {activeItem.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isStaging && (
              <span className="px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold tracking-wide">
                STAGING
              </span>
            )}
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              aria-label="Panduan Pengawas"
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-800" />
              <span className="hidden sm:inline">Panduan</span>
            </button>
            <NotificationBell onSelectNotification={onSelectNotification} />
            <button
              type="button"
              onClick={() => onNavigate('lengkapi-profil')}
              className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-emerald-50 text-emerald-900 text-xs font-bold flex items-center justify-center hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              {initials}
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-6 lg:pb-10 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (56px) */}
      <nav
        aria-label="Navigasi Cepat Pengawas"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center"
      >
        {mobileBarItems.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeRoute === tab.id ||
            (tab.id === 'jadwal-saya' && activeRoute === 'detail-tugas');
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-emerald-800' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium leading-none">{tab.shortLabel}</span>
            </button>
          );
        })}
      </nav>
      <PanduanModal open={guideOpen} role="PENGAWAS" onClose={() => setGuideOpen(false)} />
    </div>
  );
}
