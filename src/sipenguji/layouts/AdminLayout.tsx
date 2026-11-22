import { ReactNode, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  DoorOpen,
  FileCheck2,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { MadrasahLogo } from '../components/MadrasahLogo';
import { NotificationBell } from '../components/NotificationBell';
import { PanduanModal } from '../components/PanduanModal';
import { MADRASAH_INFO } from '../config/madrasah';
import type { AdminRoute, AuthUser, NotificationItem } from '../types';

interface AdminLayoutProps {
  user: AuthUser;
  activeRoute: AdminRoute;
  isStaging?: boolean;
  onNavigate: (route: AdminRoute) => void;
  onSelectNotification?: (item: NotificationItem) => void;
  onLogout: () => void;
  children: ReactNode;
}

const ADMIN_NAV_ITEMS: { id: AdminRoute; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard Admin', icon: LayoutDashboard },
  { id: 'jadwal-ujian', label: 'Jadwal Ujian', icon: CalendarClock },
  { id: 'monitoring-ruang', label: 'Monitoring Ruang', icon: DoorOpen },
  { id: 'monitoring-peserta', label: 'Monitoring Peserta', icon: GraduationCap },
  { id: 'verifikasi-dokumen', label: 'Verifikasi Dokumen', icon: FileCheck2 },
  { id: 'laporan-kejadian', label: 'Laporan Kejadian', icon: AlertTriangle },
  { id: 'manajemen-akun', label: 'Manajemen Akun', icon: Users },
  { id: 'integrasi-saum', label: 'Integrasi SAUM', icon: Link2 },
  { id: 'audit-log', label: 'Audit Log', icon: FileClock },
];

export function AdminLayout({
  user,
  activeRoute,
  isStaging,
  onNavigate,
  onSelectNotification,
  onLogout,
  children,
}: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const activeLabel =
    activeRoute === 'detail-pengawas'
      ? 'Detail Profil Pengawas'
      : (ADMIN_NAV_ITEMS.find((i) => i.id === activeRoute)?.label ?? 'Dashboard Admin');

  const handleSelect = (route: AdminRoute) => {
    onNavigate(route);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar (Navy + Emerald Accent) */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 text-slate-100 border-r border-slate-800 z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800">
          <MadrasahLogo size={34} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white truncate">SIPENGUJI</p>
            <p className="text-[11px] text-amber-400 truncate">Konsol Admin</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Navigasi Admin">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.id === activeRoute ||
              (item.id === 'manajemen-akun' && activeRoute === 'detail-pengawas');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full min-h-[42px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors cursor-pointer text-left ${
                  isActive
                    ? 'bg-emerald-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-3">
            <p className="text-xs font-semibold text-white truncate">{user.username}</p>
            <p className="text-[11px] text-slate-400 truncate">Administrator SIPENGUJI</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-white h-full border-r border-slate-800 flex flex-col z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <MadrasahLogo size={32} />
                <div>
                  <p className="text-sm font-bold text-white">SIPENGUJI</p>
                  <p className="text-[11px] text-amber-400">Konsol Admin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeRoute;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-medium text-left ${
                      isActive ? 'bg-emerald-800 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:pl-[260px] flex flex-col min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu admin"
              className="lg:hidden min-w-[40px] min-h-[40px] -ml-1 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">Admin</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">{activeLabel}</span>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isStaging && (
              <span className="px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold tracking-wide">
                STAGING
              </span>
            )}
            <span className="text-xs text-slate-500 whitespace-nowrap hidden md:inline">
              {MADRASAH_INFO.namaMadrasah} · TA {MADRASAH_INFO.tahunAjaran}
            </span>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              title="Panduan Penggunaan Admin"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-800" />
              <span className="hidden sm:inline">Panduan</span>
            </button>
            <NotificationBell onSelectNotification={onSelectNotification} />
            <span className="hidden sm:inline-flex items-center px-2.5 py-1.5 rounded-xl bg-slate-100 text-xs font-mono font-semibold text-slate-800">
              @{user.username}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      <PanduanModal open={guideOpen} role="ADMIN" onClose={() => setGuideOpen(false)} />
    </div>
  );
}
