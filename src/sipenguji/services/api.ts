import type {
  AccountStatus,
  AdminDashboardResponse,
  AdminDocumentListItem,
  AdminRoomsDistributionResponse,
  AdminScheduleItem,
  AuditLogItem,
  AuthContextResponse,
  AuthSessionStatusResponse,
  BackupRestoreResponse,
  BackupSummaryResponse,
  DocumentSlotSummary,
  DocumentType,
  IncidentCategoryOption,
  IncidentReportItem,
  IncidentStatus,
  IntegrationSettingsSafe,
  NotificationItem,
  PaginatedStudentsResponse,
  PengawasAssignmentDetail,
  PengawasDashboardResponse,
  SaumConnectionTestResult,
  SaumEntityCounts,
  SaumFreshnessInfo,
  SaumSearchResponse,
  SaumSyncLogItem,
  ScheduleDateRange,
  SupervisorDocumentAssignmentItem,
  SupervisorListItem,
} from '../types';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data?.error || 'Terjadi kesalahan saat memproses permintaan.',
      res.status,
      data?.code
    );
  }
  return data as T;
}

export const sipengujiApi = {
  getEnvironment: () =>
    requestJson<{ environment: 'staging' | 'production' | 'development'; isStaging: boolean }>(
      '/api/auth/environment'
    ),

  getSession: () => requestJson<AuthSessionStatusResponse>('/api/auth/session'),

  setupInitialAdmin: (payload: { username: string; password: string; email?: string }) =>
    requestJson<{
      success: boolean;
      message: string;
      auth: AuthContextResponse;
    }>('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () => requestJson<AuthContextResponse>('/api/auth/me'),

  login: (username: string, password: string) =>
    requestJson<AuthContextResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    requestJson<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  searchSaumSupervisors: (query: string) =>
    requestJson<SaumSearchResponse>(
      `/api/auth/saum-search?q=${encodeURIComponent(query)}`
    ),

  registerPengawas: (payload: {
    namaLengkap: string;
    username: string;
    password: string;
    email?: string;
    nip?: string;
    nik?: string;
    noWhatsapp: string;
    asalMadrasah: string;
    jabatan?: string;
    mataPelajaran?: string;
    saumSupervisorId?: string | null;
    verificationCode?: string;
    agreedToTerms: boolean;
  }) =>
    requestJson<{
      requiresAdminActivation: boolean;
      accountStatus: AccountStatus;
      message: string;
      auth?: AuthContextResponse;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMyProfile: (payload: {
    namaLengkap: string;
    nip?: string;
    nik?: string;
    jenisKelamin: string;
    tempatLahir: string;
    tanggalLahir: string;
    alamat: string;
    noWhatsapp: string;
    email?: string;
    asalMadrasah: string;
    jabatan: string;
    mataPelajaran?: string;
  }) =>
    requestJson<AuthContextResponse>('/api/profile/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  uploadMyPhoto: (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    return requestJson<AuthContextResponse>('/api/profile/me/photo', {
      method: 'POST',
      body: formData,
    });
  },

  getProfilePhotoUrl: (userId: string, cacheKey?: string) =>
    `/api/profiles/${encodeURIComponent(userId)}/photo${
      cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : ''
    }`,

  getPengawasDashboard: () => requestJson<PengawasDashboardResponse>('/api/pengawas/dashboard'),

  getPengawasSchedules: (params?: {
    range?: ScheduleDateRange;
    subjectId?: string;
    session?: string;
    roomId?: string;
    status?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.range) qs.set('range', params.range);
    if (params?.subjectId) qs.set('subjectId', params.subjectId);
    if (params?.session) qs.set('session', params.session);
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return requestJson<{
      assignmentStatus: string;
      operationalAccessStatus: string;
      saumSupervisorId: string | null;
      jakartaToday: string;
      saumFreshness: SaumFreshnessInfo;
      assignments: PengawasAssignmentDetail[];
      allAssignmentsCount: number;
      filterOptions: {
        subjects: Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;
        rooms: Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
        sessions: string[];
      };
    }>(`/api/pengawas/schedules${query ? `?${query}` : ''}`);
  },

  getPengawasAssignments: () =>
    requestJson<{
      assignmentStatus: string;
      operationalAccessStatus: string;
      saumSupervisorId: string | null;
      jakartaToday: string;
      saumFreshness: SaumFreshnessInfo;
      assignments: PengawasAssignmentDetail[];
    }>('/api/pengawas/assignments'),

  getPengawasAssignmentDetail: (assignmentId: string) =>
    requestJson<{
      assignment: PengawasAssignmentDetail;
      saumFreshness: SaumFreshnessInfo;
    }>(`/api/pengawas/assignments/${encodeURIComponent(assignmentId)}`),

  getPengawasAssignmentStudents: (
    assignmentId: string,
    params?: { page?: number; limit?: number; search?: string; kelas?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.kelas) qs.set('kelas', params.kelas);
    const query = qs.toString();
    return requestJson<
      PaginatedStudentsResponse & { assignment: PengawasAssignmentDetail }
    >(`/api/pengawas/assignments/${encodeURIComponent(assignmentId)}/students${query ? `?${query}` : ''}`);
  },

  getPengawasStudents: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    kelas?: string;
    roomId?: string;
    sesi?: string;
    subjectId?: string;
    scheduleId?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.kelas) qs.set('kelas', params.kelas);
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.sesi) qs.set('sesi', params.sesi);
    if (params?.subjectId) qs.set('subjectId', params.subjectId);
    if (params?.scheduleId) qs.set('scheduleId', params.scheduleId);
    const query = qs.toString();
    return requestJson<PaginatedStudentsResponse>(
      `/api/pengawas/students${query ? `?${query}` : ''}`
    );
  },

  checkOperationalAccess: () =>
    requestJson<{
      operationalAccessStatus: string;
      assignmentCount: number;
      message: string;
    }>('/api/pengawas/operational/access-check'),

  getAdminDashboard: () => requestJson<AdminDashboardResponse>('/api/admin/dashboard'),

  listSupervisors: (params?: {
    search?: string;
    status?: string;
    madrasah?: string;
    profileStatus?: string;
    assignmentStatus?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    if (params?.madrasah) qs.set('madrasah', params.madrasah);
    if (params?.profileStatus) qs.set('profileStatus', params.profileStatus);
    if (params?.assignmentStatus) qs.set('assignmentStatus', params.assignmentStatus);
    const query = qs.toString();
    return requestJson<{ supervisors: SupervisorListItem[]; madrasahOptions: string[] }>(
      `/api/admin/supervisors${query ? `?${query}` : ''}`
    );
  },

  getAdminSchedules: (params?: {
    range?: ScheduleDateRange;
    subjectId?: string;
    session?: string;
    roomId?: string;
    status?: string;
    search?: string;
    incompleteOnly?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.range) qs.set('range', params.range);
    if (params?.subjectId) qs.set('subjectId', params.subjectId);
    if (params?.session) qs.set('session', params.session);
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.incompleteOnly) qs.set('incompleteOnly', 'true');
    const query = qs.toString();
    return requestJson<{
      jakartaToday: string;
      schedules: AdminScheduleItem[];
      allSchedulesCount: number;
      saumFreshness: SaumFreshnessInfo;
      filterOptions: {
        subjects: Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;
        rooms: Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
        sessions: string[];
      };
    }>(`/api/admin/schedules${query ? `?${query}` : ''}`);
  },

  getAdminRooms: (params?: {
    search?: string;
    unassignedOnly?: boolean;
    sortBy?: 'namaRuang' | 'studentCount' | 'assignmentCount';
    sortDir?: 'asc' | 'desc';
  }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.unassignedOnly) qs.set('unassignedOnly', 'true');
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortDir) qs.set('sortDir', params.sortDir);
    const query = qs.toString();
    return requestJson<AdminRoomsDistributionResponse>(
      `/api/admin/rooms${query ? `?${query}` : ''}`
    );
  },

  getAdminStudents: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    kelas?: string;
    roomId?: string;
    sesi?: string;
    subjectId?: string;
    scheduleId?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.kelas) qs.set('kelas', params.kelas);
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.sesi) qs.set('sesi', params.sesi);
    if (params?.subjectId) qs.set('subjectId', params.subjectId);
    if (params?.scheduleId) qs.set('scheduleId', params.scheduleId);
    const query = qs.toString();
    return requestJson<PaginatedStudentsResponse>(
      `/api/admin/students${query ? `?${query}` : ''}`
    );
  },

  getSupervisorDetail: (userId: string) =>
    requestJson<SupervisorListItem>(`/api/admin/supervisors/${encodeURIComponent(userId)}`),

  createSupervisorAccount: (payload: {
    namaLengkap: string;
    username: string;
    password: string;
    email?: string;
    nip?: string;
    asalMadrasah?: string;
    mataPelajaran?: string;
    accountStatus: 'ACTIVE' | 'INACTIVE';
  }) =>
    requestJson<{ id: string; username: string; accountStatus: AccountStatus }>(
      '/api/admin/supervisors',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  updateSupervisorStatus: (userId: string, accountStatus: AccountStatus) =>
    requestJson<{ userId: string; accountStatus: AccountStatus }>(
      `/api/admin/supervisors/${encodeURIComponent(userId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ accountStatus }),
      }
    ),

  getIntegrationSettings: () =>
    requestJson<{
      settings: IntegrationSettingsSafe;
      counts: SaumEntityCounts;
      syncLogs: SaumSyncLogItem[];
    }>('/api/admin/integration'),

  updateIntegrationSettings: (payload: {
    saumBaseUrl?: string;
    saumDataPath?: string;
    saumSecret?: string;
    registrationCode?: string;
    autoSyncEnabled?: boolean;
    syncIntervalMinutes?: number;
  }) =>
    requestJson<{
      settings: IntegrationSettingsSafe;
      counts: SaumEntityCounts;
    }>('/api/admin/integration', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  testIntegrationConnection: () =>
    requestJson<{
      testResult: SaumConnectionTestResult;
      settings: IntegrationSettingsSafe;
      counts: SaumEntityCounts;
    }>('/api/admin/integration/test', {
      method: 'POST',
    }),

  syncSaumNow: () =>
    requestJson<{
      success: boolean;
      syncLog: SaumSyncLogItem;
      counts: SaumEntityCounts;
      message: string;
      settings: IntegrationSettingsSafe;
      syncLogs: SaumSyncLogItem[];
    }>('/api/admin/integration/sync', {
      method: 'POST',
    }),

  getSyncLogs: () =>
    requestJson<{
      syncLogs: SaumSyncLogItem[];
      counts: SaumEntityCounts;
    }>('/api/admin/integration/sync-logs'),

  getAuditLogs: (params?: { activity?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.activity) qs.set('activity', params.activity);
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return requestJson<{ logs: AuditLogItem[] }>(
      `/api/admin/audit-logs${query ? `?${query}` : ''}`
    );
  },

  // ==================== PHASE 05: DOKUMEN PENGAWAS ====================

  getSupervisorDocuments: () =>
    requestJson<{
      maxUploadMb: number;
      assignments: SupervisorDocumentAssignmentItem[];
      saumFreshness: SaumFreshnessInfo;
    }>('/api/supervisor/documents'),

  uploadSupervisorDocument: (assignmentId: string, documentType: DocumentType, file: File) => {
    const formData = new FormData();
    formData.append('assignmentId', assignmentId);
    formData.append('documentType', documentType);
    formData.append('file', file);
    return requestJson<{
      success: boolean;
      documentId: string;
      document: DocumentSlotSummary;
      message: string;
    }>('/api/supervisor/documents', {
      method: 'POST',
      body: formData,
    });
  },

  uploadSupervisorDocumentRevision: (documentId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson<{
      success: boolean;
      documentId: string;
      document: DocumentSlotSummary;
      message: string;
    }>(`/api/supervisor/documents/${encodeURIComponent(documentId)}/revisions`, {
      method: 'POST',
      body: formData,
    });
  },

  getSupervisorDocumentPreviewUrl: (
    documentId: string,
    versionId?: string,
    download = false
  ) => {
    const qs = new URLSearchParams();
    if (versionId) qs.set('versionId', versionId);
    if (download) qs.set('download', '1');
    const query = qs.toString();
    return `/api/supervisor/documents/${encodeURIComponent(documentId)}/preview${
      query ? `?${query}` : ''
    }`;
  },

  getAdminDocuments: (params?: {
    date?: string;
    supervisorId?: string;
    roomId?: string;
    subjectId?: string;
    session?: string;
    documentType?: string;
    status?: string;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.supervisorId) qs.set('supervisorId', params.supervisorId);
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.subjectId) qs.set('subjectId', params.subjectId);
    if (params?.session) qs.set('session', params.session);
    if (params?.documentType) qs.set('documentType', params.documentType);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return requestJson<{
      stats: {
        total: number;
        notUploaded: number;
        pendingReview: number;
        accepted: number;
        revisionRequired: number;
      };
      documents: AdminDocumentListItem[];
      maxUploadMb: number;
      filterOptions: {
        dates: string[];
        supervisors: Array<{ saum_id: string; nama: string }>;
        rooms: Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
        subjects: Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;
        sessions: string[];
      };
      saumFreshness: SaumFreshnessInfo;
    }>(`/api/admin/documents${query ? `?${query}` : ''}`);
  },

  getAdminDocumentPreviewUrl: (
    documentId: string,
    versionId?: string,
    download = false
  ) => {
    const qs = new URLSearchParams();
    if (versionId) qs.set('versionId', versionId);
    if (download) qs.set('download', '1');
    const query = qs.toString();
    return `/api/admin/documents/${encodeURIComponent(documentId)}/preview${
      query ? `?${query}` : ''
    }`;
  },

  acceptAdminDocument: (documentId: string, adminNote?: string) =>
    requestJson<{
      success: boolean;
      document: any;
      message: string;
    }>(`/api/admin/documents/${encodeURIComponent(documentId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ adminNote }),
    }),

  requestRevisionAdminDocument: (documentId: string, adminNote: string) =>
    requestJson<{
      success: boolean;
      document: any;
      message: string;
    }>(`/api/admin/documents/${encodeURIComponent(documentId)}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ adminNote }),
    }),

  assignDocumentPic: (
    saumAssignmentId: string,
    designatedSaumSupervisorId: string,
    note?: string
  ) =>
    requestJson<{
      success: boolean;
      picSaumSupervisorId: string;
      picNama: string;
      message: string;
    }>(`/api/admin/assignments/${encodeURIComponent(saumAssignmentId)}/pic`, {
      method: 'POST',
      body: JSON.stringify({ designatedSaumSupervisorId, note }),
    }),

  updateUploadLimit: (maxUploadMb: number) =>
    requestJson<{
      success: boolean;
      maxUploadMb: number;
      message: string;
    }>('/api/admin/settings/upload-limit', {
      method: 'PUT',
      body: JSON.stringify({ maxUploadMb }),
    }),

  // ==================== PHASE 05: LAPORAN KEJADIAN ====================

  getSupervisorIncidents: () =>
    requestJson<{
      categories: IncidentCategoryOption[];
      maxUploadMb: number;
      myAssignments: Array<{
        assignmentId: string;
        scheduleId: string;
        roomId: string;
        tanggal: string;
        sesi: string;
        namaMapel: string;
        namaRuang: string;
      }>;
      incidents: IncidentReportItem[];
      saumFreshness: SaumFreshnessInfo;
    }>('/api/supervisor/incidents'),

  createSupervisorIncident: (payload: {
    assignmentId: string;
    incidentDate: string;
    incidentTime: string;
    category: string;
    description: string;
    actionTaken?: string;
    attachment?: File | null;
  }) => {
    const formData = new FormData();
    formData.append('assignmentId', payload.assignmentId);
    formData.append('incidentDate', payload.incidentDate);
    formData.append('incidentTime', payload.incidentTime);
    formData.append('category', payload.category);
    formData.append('description', payload.description);
    formData.append('actionTaken', payload.actionTaken || '');
    if (payload.attachment) {
      formData.append('attachment', payload.attachment);
    }
    return requestJson<{
      success: boolean;
      incident: IncidentReportItem;
      message: string;
    }>('/api/supervisor/incidents', {
      method: 'POST',
      body: formData,
    });
  },

  getSupervisorIncidentAttachmentUrl: (incidentId: string, download = false) =>
    `/api/supervisor/incidents/${encodeURIComponent(incidentId)}/attachment${
      download ? '?download=1' : ''
    }`,

  getAdminIncidents: (params?: {
    status?: string;
    category?: string;
    date?: string;
    roomId?: string;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    if (params?.date) qs.set('date', params.date);
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return requestJson<{
      stats: {
        total: number;
        submitted: number;
        underReview: number;
        resolved: number;
        rejected: number;
      };
      categories: IncidentCategoryOption[];
      incidents: IncidentReportItem[];
      filterOptions: {
        rooms: Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
      };
      saumFreshness: SaumFreshnessInfo;
    }>(`/api/admin/incidents${query ? `?${query}` : ''}`);
  },

  getAdminIncidentAttachmentUrl: (incidentId: string, download = false) =>
    `/api/admin/incidents/${encodeURIComponent(incidentId)}/attachment${
      download ? '?download=1' : ''
    }`,

  reviewAdminIncident: (
    incidentId: string,
    status: Exclude<IncidentStatus, 'SUBMITTED'>,
    adminNote?: string
  ) =>
    requestJson<{
      success: boolean;
      incident: IncidentReportItem;
      message: string;
    }>(`/api/admin/incidents/${encodeURIComponent(incidentId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, adminNote }),
    }),

  // ==================== PHASE 05: NOTIFIKASI INTERNAL ====================

  getNotifications: () =>
    requestJson<{
      notifications: NotificationItem[];
      unreadCount: number;
    }>('/api/notifications'),

  markNotificationRead: (notificationId: string) =>
    requestJson<{ success: boolean; notification: NotificationItem }>(
      `/api/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'PATCH' }
    ),

  markAllNotificationsRead: () =>
    requestJson<{ success: boolean; updatedCount: number }>('/api/notifications/read-all', {
      method: 'PATCH',
    }),

  // ==================== PHASE 06: BACKUP & RESTORE ====================

  getBackupSummary: () => requestJson<BackupSummaryResponse>('/api/admin/backup/summary'),

  downloadBackupArchive: async (): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch('/api/admin/backup/download', {
      credentials: 'include',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(errData?.error || 'Gagal mengunduh arsip backup SIPENGUJI.', res.status);
    }
    const disp = res.headers.get('content-disposition') || '';
    const match = disp.match(/filename="([^"]+)"/i);
    const filename = match?.[1] || 'sipenguji-backup.json.gz';
    const blob = await res.blob();
    return { blob, filename };
  },

  restoreBackupArchive: (file: File, confirmRestore: boolean) => {
    const formData = new FormData();
    formData.append('backup', file);
    formData.append('confirmRestore', confirmRestore ? 'true' : 'false');
    return requestJson<BackupRestoreResponse>('/api/admin/backup/restore', {
      method: 'POST',
      body: formData,
    });
  },
};
