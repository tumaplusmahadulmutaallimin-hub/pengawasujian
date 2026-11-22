import { useEffect, useState } from 'react';
import { AdminLayout } from './layouts/AdminLayout';
import { PengawasLayout } from './layouts/PengawasLayout';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminJadwalUjianPage } from './pages/admin/AdminJadwalUjianPage';
import { AdminLaporanKejadianPage } from './pages/admin/AdminLaporanKejadianPage';
import { AdminMonitoringPesertaPage } from './pages/admin/AdminMonitoringPesertaPage';
import { AdminMonitoringRuangPage } from './pages/admin/AdminMonitoringRuangPage';
import { AdminVerifikasiDokumenPage } from './pages/admin/AdminVerifikasiDokumenPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { DetailProfilPengawasPage } from './pages/admin/DetailProfilPengawasPage';
import { ManajemenAkunPage } from './pages/admin/ManajemenAkunPage';
import { PengaturanIntegrasiPage } from './pages/admin/PengaturanIntegrasiPage';
import { LoginPage } from './pages/LoginPage';
import { AksesOperasionalPage } from './pages/pengawas/AksesOperasionalPage';
import { DetailPenugasanPage } from './pages/pengawas/DetailPenugasanPage';
import { DokumenPengawasanPage } from './pages/pengawas/DokumenPengawasanPage';
import { LaporanKejadianPage } from './pages/pengawas/LaporanKejadianPage';
import { LengkapiProfilPage } from './pages/pengawas/LengkapiProfilPage';
import { PengawasDashboardPage } from './pages/pengawas/PengawasDashboardPage';
import { PengawasJadwalPage } from './pages/pengawas/PengawasJadwalPage';
import { PengawasMonitoringPesertaPage } from './pages/pengawas/PengawasMonitoringPesertaPage';
import { StatusPenugasanPage } from './pages/pengawas/StatusPenugasanPage';
import { RegisterPengawasPage } from './pages/RegisterPengawasPage';
import { sipengujiApi } from './services/api';
import type {
  AdminRoute,
  AuthContextResponse,
  AuthScreen,
  NotificationItem,
  PengawasRoute,
} from './types';

export function SipengujiApp() {
  const [auth, setAuth] = useState<AuthContextResponse | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [isStaging, setIsStaging] = useState(false);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  const [adminRoute, setAdminRoute] = useState<AdminRoute>('dashboard');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(null);

  const [pengawasRoute, setPengawasRoute] = useState<PengawasRoute>('dashboard');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [phase5InitialAssignmentId, setPhase5InitialAssignmentId] = useState<string>('');
  const [studentInitialRoomId, setStudentInitialRoomId] = useState<string>('');
  const [studentInitialScheduleId, setStudentInitialScheduleId] = useState<string>('');

  useEffect(() => {
    let active = true;
    sipengujiApi
      .getSession()
      .then((res) => {
        if (!active) return;
        setIsStaging(Boolean(res.isStaging));
        setNeedsAdminSetup(Boolean(res.needsAdminSetup));
        if (res.authenticated && res.auth) {
          setAuth(res.auth);
          if (res.auth.user.role === 'PENGAWAS' && !res.auth.user.profileCompleted) {
            setPengawasRoute('lengkapi-profil');
          }
        } else {
          setAuth(null);
        }
      })
      .catch(() => {
        if (active) setAuth(null);
      })
      .finally(() => {
        if (active) setBootstrapping(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLoginSuccess = (nextAuth: AuthContextResponse) => {
    setAuth(nextAuth);
    setLoginNotice(null);
    if (nextAuth.user.role === 'ADMIN') {
      setAdminRoute('dashboard');
    } else {
      setPengawasRoute(nextAuth.user.profileCompleted ? 'dashboard' : 'lengkapi-profil');
    }
  };

  const handleLogout = async () => {
    try {
      await sipengujiApi.logout();
    } catch {
      // Ignore logout network error and clear local state
    }
    setAuth(null);
    setAuthScreen('login');
    setSelectedAssignmentId(null);
    setPhase5InitialAssignmentId('');
    setStudentInitialRoomId('');
    setStudentInitialScheduleId('');
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-medium text-slate-600">Memeriksa sesi SIPENGUJI...</p>
      </div>
    );
  }

  if (!auth) {
    if (authScreen === 'register') {
      return (
        <RegisterPengawasPage
          onBackToLogin={(notice) => {
            if (notice) setLoginNotice(notice);
            setAuthScreen('login');
          }}
          onRegisteredAndLoggedIn={(nextAuth) => {
            setAuth(nextAuth);
            setPengawasRoute('lengkapi-profil');
          }}
        />
      );
    }

    return (
      <LoginPage
        onLoginSuccess={(nextAuth) => {
          setNeedsAdminSetup(false);
          handleLoginSuccess(nextAuth);
        }}
        onGoRegister={() => {
          setLoginNotice(null);
          setAuthScreen('register');
        }}
        infoNotice={loginNotice}
        isStaging={isStaging}
        needsAdminSetup={needsAdminSetup}
      />
    );
  }

  if (auth.user.role === 'ADMIN') {
    const handleAdminNotification = (item: NotificationItem) => {
      if (item.related_entity_type === 'DOCUMENT') {
        setAdminRoute('verifikasi-dokumen');
      } else if (item.related_entity_type === 'INCIDENT') {
        setAdminRoute('laporan-kejadian');
      } else if (item.related_entity_type === 'ACCOUNT') {
        if (item.related_entity_id) {
          setSelectedSupervisorId(item.related_entity_id);
          setAdminRoute('detail-pengawas');
        } else {
          setAdminRoute('manajemen-akun');
        }
      } else if (item.related_entity_type === 'BACKUP') {
        setAdminRoute('integrasi-saum');
      }
    };

    return (
      <AdminLayout
        user={auth.user}
        activeRoute={adminRoute}
        isStaging={isStaging}
        onNavigate={(route) => {
          setAdminRoute(route);
        }}
        onSelectNotification={handleAdminNotification}
        onLogout={handleLogout}
      >
        {adminRoute === 'dashboard' && (
          <AdminDashboardPage
            onNavigate={setAdminRoute}
            onSelectSupervisor={(userId) => {
              setSelectedSupervisorId(userId);
              setAdminRoute('detail-pengawas');
            }}
          />
        )}
        {adminRoute === 'jadwal-ujian' && <AdminJadwalUjianPage />}
        {adminRoute === 'monitoring-ruang' && <AdminMonitoringRuangPage />}
        {adminRoute === 'monitoring-peserta' && <AdminMonitoringPesertaPage />}
        {adminRoute === 'verifikasi-dokumen' && <AdminVerifikasiDokumenPage />}
        {adminRoute === 'laporan-kejadian' && <AdminLaporanKejadianPage />}
        {adminRoute === 'manajemen-akun' && (
          <ManajemenAkunPage
            onSelectSupervisor={(userId) => {
              setSelectedSupervisorId(userId);
              setAdminRoute('detail-pengawas');
            }}
          />
        )}
        {adminRoute === 'detail-pengawas' && selectedSupervisorId && (
          <DetailProfilPengawasPage
            userId={selectedSupervisorId}
            onBack={() => setAdminRoute('manajemen-akun')}
          />
        )}
        {adminRoute === 'integrasi-saum' && <PengaturanIntegrasiPage />}
        {adminRoute === 'audit-log' && <AuditLogPage />}
      </AdminLayout>
    );
  }

  const openAssignmentDetail = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setPengawasRoute('detail-tugas');
  };

  const openStudentsForRoom = (roomId: string, scheduleId: string) => {
    setStudentInitialRoomId(roomId);
    setStudentInitialScheduleId(scheduleId);
    setPengawasRoute('monitoring-peserta');
  };

  const openDocumentsForAssignment = (assignmentId: string) => {
    setPhase5InitialAssignmentId(assignmentId);
    setPengawasRoute('dokumen-pengawasan');
  };

  const openIncidentsForAssignment = (assignmentId: string) => {
    setPhase5InitialAssignmentId(assignmentId);
    setPengawasRoute('laporan-kejadian');
  };

  const handlePengawasNotification = (item: NotificationItem) => {
    if (item.related_entity_type === 'DOCUMENT') {
      setPengawasRoute('dokumen-pengawasan');
    } else if (item.related_entity_type === 'INCIDENT') {
      setPengawasRoute('laporan-kejadian');
    } else if (item.related_entity_type === 'ACCOUNT') {
      setPengawasRoute('status-penugasan');
    }
  };

  // PENGAWAS portal
  return (
    <PengawasLayout
      auth={auth}
      activeRoute={pengawasRoute}
      isStaging={isStaging}
      onNavigate={(route) => {
        if (route === 'monitoring-peserta') {
          setStudentInitialRoomId('');
          setStudentInitialScheduleId('');
        }
        if (route !== 'dokumen-pengawasan' && route !== 'laporan-kejadian') {
          setPhase5InitialAssignmentId('');
        }
        setPengawasRoute(route);
      }}
      onSelectNotification={handlePengawasNotification}
      onLogout={handleLogout}
    >
      {pengawasRoute === 'dashboard' && (
        <PengawasDashboardPage
          auth={auth}
          onNavigate={setPengawasRoute}
          onOpenAssignmentDetail={openAssignmentDetail}
        />
      )}
      {pengawasRoute === 'jadwal-saya' && (
        <PengawasJadwalPage
          onOpenAssignmentDetail={openAssignmentDetail}
          onOpenStudentsForRoom={openStudentsForRoom}
        />
      )}
      {pengawasRoute === 'detail-tugas' && selectedAssignmentId && (
        <DetailPenugasanPage
          assignmentId={selectedAssignmentId}
          onBack={() => setPengawasRoute('jadwal-saya')}
          onOpenDocuments={openDocumentsForAssignment}
          onOpenIncidents={openIncidentsForAssignment}
        />
      )}
      {pengawasRoute === 'dokumen-pengawasan' && (
        <DokumenPengawasanPage initialAssignmentId={phase5InitialAssignmentId || undefined} />
      )}
      {pengawasRoute === 'laporan-kejadian' && (
        <LaporanKejadianPage
          auth={auth}
          initialAssignmentId={phase5InitialAssignmentId || undefined}
        />
      )}
      {pengawasRoute === 'monitoring-peserta' && (
        <PengawasMonitoringPesertaPage
          initialRoomId={studentInitialRoomId}
          initialScheduleId={studentInitialScheduleId}
        />
      )}
      {pengawasRoute === 'lengkapi-profil' && (
        <LengkapiProfilPage
          auth={auth}
          onProfileUpdated={(updated) => setAuth(updated)}
        />
      )}
      {pengawasRoute === 'status-penugasan' && <StatusPenugasanPage auth={auth} />}
      {pengawasRoute === 'akses-operasional' && (
        <AksesOperasionalPage auth={auth} onNavigate={setPengawasRoute} />
      )}
    </PengawasLayout>
  );
}
