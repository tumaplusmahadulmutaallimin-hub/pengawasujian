export type UserRole = 'ADMIN' | 'PENGAWAS';

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export type ProfileStatus = 'INCOMPLETE' | 'COMPLETE';

export type AssignmentStatus = 'NOT_ASSIGNED' | 'ASSIGNED' | 'COMPLETED';

export type OperationalAccessStatus = 'LOCKED' | 'AVAILABLE';

export type AuthScreen = 'login' | 'register';

export type AdminRoute =
  | 'dashboard'
  | 'jadwal-ujian'
  | 'monitoring-ruang'
  | 'monitoring-peserta'
  | 'verifikasi-dokumen'
  | 'laporan-kejadian'
  | 'manajemen-akun'
  | 'detail-pengawas'
  | 'integrasi-saum'
  | 'audit-log';

export type PengawasRoute =
  | 'dashboard'
  | 'jadwal-saya'
  | 'detail-tugas'
  | 'monitoring-peserta'
  | 'dokumen-pengawasan'
  | 'laporan-kejadian'
  | 'lengkapi-profil'
  | 'status-penugasan'
  | 'akses-operasional';

export type ScheduleLifecycleStatus =
  | 'AKAN_DATANG'
  | 'BERLANGSUNG'
  | 'SELESAI'
  | 'BELUM_TERJADWAL';

export type ScheduleDateRange = 'all' | 'today' | 'tomorrow' | 'week' | 'month';

export interface SupervisorProfile {
  id: string;
  user_id: string;
  saum_supervisor_id: string | null;
  nama_lengkap: string;
  nip: string | null;
  nik: string | null;
  jenis_kelamin: string | null;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  alamat: string | null;
  no_whatsapp: string | null;
  email: string | null;
  asal_madrasah: string | null;
  jabatan: string | null;
  mata_pelajaran: string | null;
  foto_profil: string | null;
  profile_completed: number;
  assignment_status: AssignmentStatus;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  profileCompleted: boolean;
  profileStatus: ProfileStatus;
  assignmentStatus: AssignmentStatus;
  operationalAccessStatus: OperationalAccessStatus;
  lastLogin: string | null;
  createdAt: string;
}

export interface AuthContextResponse {
  user: AuthUser;
  profile: SupervisorProfile | null;
}

export interface AuthSessionStatusResponse {
  authenticated: boolean;
  needsAdminSetup: boolean;
  environment: 'staging' | 'production' | 'development';
  isStaging: boolean;
  auth?: AuthContextResponse;
}

export interface SupervisorListItem extends AuthUser {
  assignmentCount?: number;
  profile: SupervisorProfile | null;
}

export interface SaumFreshnessInfo {
  lastSyncAt: string | null;
  connectionStatus: string;
  syncStatus: string;
  isStaleOrDisconnected: boolean;
  warningMessage: string | null;
}

export interface IntegrationSettingsSafe {
  id: string;
  integration_name: string;
  hasBaseUrlConfigured: boolean;
  saum_base_url_display: string;
  hasDataPathConfigured: boolean;
  data_source_label: string;
  hasSecretConfigured: boolean;
  hasRegistrationCodeConfigured: boolean;
  connection_status: string;
  last_sync_at: string | null;
  sync_status: string;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  consecutive_failures: number;
  last_error_message: string | null;
  updated_at: string;
}

export interface SaumEntityCounts {
  supervisors: number;
  schedules: number;
  rooms: number;
  subjects: number;
  assignments: number;
  students: number;
}

export interface SaumConnectionTestResult {
  connected: boolean;
  sourceMode: 'FILE_READ_ONLY' | 'HTTP_READ_ONLY' | 'UNAVAILABLE';
  readOnlyVerified: boolean;
  osPermissionSummary: string;
  connectionStatus: 'CONNECTED_READ_ONLY' | 'NOT_CONFIGURED' | 'ERROR';
  message: string;
  previewCounts: SaumEntityCounts | null;
}

export interface SaumSyncLogItem {
  id: string;
  triggered_by_user_id: string | null;
  trigger_type: 'MANUAL' | 'SCHEDULED';
  source_mode: string;
  status: 'SUCCESS' | 'FAILED';
  supervisors_count: number;
  schedules_count: number;
  rooms_count: number;
  subjects_count: number;
  assignments_count: number;
  students_count: number;
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  user_id: string | null;
  username_snapshot: string | null;
  activity: string;
  description: string;
  ip_address: string | null;
  created_at: string;
}

export interface AdminScheduleRoomItem {
  roomId: string;
  kodeRuang: string | null;
  namaRuang: string;
  assignmentId: string | null;
  pengawas1Id: string | null;
  pengawas1Nama: string | null;
  pengawas2Id: string | null;
  pengawas2Nama: string | null;
  studentCount: number;
}

export interface AdminScheduleItem {
  scheduleId: string;
  mapelId: string;
  kodeMapel: string | null;
  namaMapel: string;
  tanggal: string;
  hari: string;
  sesi: string;
  waktuMulai: string;
  waktuSelesai: string;
  scheduleStatus: ScheduleLifecycleStatus;
  roomCount: number;
  studentCount: number;
  supervisorCount: number;
  rooms: AdminScheduleRoomItem[];
  hasIncompleteData: boolean;
  missingFields: string[];
}

export interface AdminDashboardResponse {
  stats: {
    totalPengawas: number;
    activePengawas: number;
    pendingPengawas: number;
    inactivePengawas: number;
    suspendedPengawas: number;
    completedProfiles: number;
    incompleteProfiles: number;
    assignedPengawas: number;
    unassignedPengawas: number;
    totalSchedules: number;
    totalSubjects: number;
    totalRooms: number;
    totalStudents: number;
    totalAssignments: number;
  };
  jakartaToday: string;
  examSummary: {
    todayCount: number;
    upcomingCount: number;
    ongoingCount: number;
    completedCount: number;
    roomsUsedCount: number;
    assignedSupervisorsActiveCount: number;
    studentsInSchedulesCount: number;
  };
  documentStats?: {
    total: number;
    notUploaded: number;
    pendingReview: number;
    accepted: number;
    revisionRequired: number;
  };
  incidentStats?: {
    total: number;
    submitted: number;
    underReview: number;
    resolved: number;
    rejected: number;
  };
  saumFreshness: SaumFreshnessInfo;
  schedules: AdminScheduleItem[];
  integration: IntegrationSettingsSafe;
  saumCounts: SaumEntityCounts;
  recentLogs: AuditLogItem[];
}

export interface SaumSearchCandidate {
  saumSupervisorId: string;
  namaLengkap: string;
  nipMasked: string | null;
  asalMadrasah: string | null;
  status: string | null;
  hasPhoneOnRecord: boolean;
}

export interface SaumSearchResponse {
  saumAvailable: boolean;
  totalSyncedSupervisors: number;
  message: string;
  results: SaumSearchCandidate[];
}

export interface PengawasAssignmentDetail {
  assignmentId: string;
  scheduleId: string;
  roomId: string;
  sesi: string;
  tanggal: string;
  hari: string;
  waktuMulai: string;
  waktuSelesai: string;
  mapelId: string | null;
  kodeMapel: string | null;
  namaMapel: string;
  namaRuang: string;
  kodeRuang: string | null;
  kapasitas: number | null;
  lokasi: string | null;
  peranPengawas: 'Pengawas 1' | 'Pengawas 2';
  pengawas1Nama: string | null;
  pengawas2Nama: string | null;
  rekanPengawas: {
    saumId: string;
    nama: string;
    asalMadrasah: string | null;
  } | null;
  scheduleStatus: ScheduleLifecycleStatus;
  studentCount: number;
}

export interface PengawasActivityItem {
  id: string;
  activity: string;
  description: string;
  created_at: string;
}

export interface PengawasDashboardResponse {
  accountStatus: AccountStatus;
  profileStatus: ProfileStatus;
  assignmentStatus: AssignmentStatus;
  operationalAccessStatus: OperationalAccessStatus;
  assignmentCount: number;
  saumLinked: boolean;
  saumIntegrationNote: string;
  jakartaToday: string;
  saumFreshness: SaumFreshnessInfo;
  summary: {
    total: number;
    today: number;
    upcoming: number;
    ongoing: number;
    completed: number;
  };
  documentSummary?: {
    totalSlots: number;
    notUploaded: number;
    pendingReview: number;
    accepted: number;
    revisionRequired: number;
  };
  incidentsCount?: number;
  nearestAssignment: PengawasAssignmentDetail | null;
  recentActivities?: PengawasActivityItem[];
}

export interface ExamStudentItem {
  saumId: string;
  nomorPeserta: string | null;
  nama: string;
  nis: string | null;
  nisn: string | null;
  kelas: string | null;
  sesi: string | null;
  roomId: string | null;
  kodeRuang: string | null;
  namaRuang: string | null;
  participantStatus: 'TERDAFTAR' | 'DIJADWALKAN';
}

export interface StudentFilterOptions {
  classes: string[];
  rooms: Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
  sessions: string[];
  subjects: Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;
  schedules: Array<{
    saum_id: string;
    tanggal: string;
    sesi: string;
    nama_mapel: string;
  }>;
}

export interface PaginatedStudentsResponse {
  students: ExamStudentItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filterOptions: StudentFilterOptions;
  saumFreshness: SaumFreshnessInfo;
}

export interface AdminRoomsDistributionResponse {
  rooms: Array<{
    roomId: string;
    kodeRuang: string | null;
    namaRuang: string;
    kapasitas: number | null;
    lokasi: string | null;
    studentCount: number;
    assignmentCount: number;
    hasNoSupervisor: boolean;
    assignments: Array<{
      assignmentId: string;
      scheduleId: string;
      tanggal: string;
      hari: string;
      sesi: string;
      waktuMulai: string;
      waktuSelesai: string;
      kodeMapel: string | null;
      namaMapel: string;
      pengawas1Nama: string | null;
      pengawas2Nama: string | null;
      studentCount: number;
      scheduleStatus: ScheduleLifecycleStatus;
      hasMissingSupervisor: boolean;
    }>;
  }>;
  totalRooms: number;
  roomsWithoutSupervisorCount: number;
  unassignedSaumSupervisors: Array<{
    saumId: string;
    nama: string;
    nip: string | null;
    asalMadrasah: string | null;
    status: string | null;
  }>;
  incompleteSchedules: AdminScheduleItem[];
  saumFreshness: SaumFreshnessInfo;
}

export type DocumentType = 'ATTENDANCE_LIST' | 'EXAM_REPORT';

export type DocumentVerificationStatus =
  | 'NOT_UPLOADED'
  | 'PENDING_REVIEW'
  | 'ACCEPTED'
  | 'REVISION_REQUIRED';

export interface DocumentVersionSummary {
  id: string;
  version: number;
  isLatest: boolean;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  verificationStatus: DocumentVerificationStatus;
  adminNote: string | null;
  uploadedByUserId: string;
  uploadedByName: string;
  verifiedByUserId: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  uploadedAt: string;
}

export interface DocumentSlotSummary {
  documentType: DocumentType;
  documentLabel: string;
  latestDocumentId: string | null;
  verificationStatus: DocumentVerificationStatus;
  version: number;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  adminNote: string | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  verifiedByUserId: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  uploadedAt: string | null;
  versions: DocumentVersionSummary[];
}

export interface SupervisorDocumentAssignmentItem {
  assignmentId: string;
  internalAssignmentId: string;
  scheduleId: string;
  roomId: string;
  tanggal: string;
  hari: string;
  sesi: string;
  waktuMulai: string;
  waktuSelesai: string;
  kodeMapel: string | null;
  namaMapel: string;
  kodeRuang: string | null;
  namaRuang: string;
  lokasi: string | null;
  peranPengawas: 'Pengawas 1' | 'Pengawas 2';
  rekanPengawas: {
    saumId: string;
    nama: string;
    asalMadrasah: string | null;
  } | null;
  isDocumentPic: boolean;
  picSaumSupervisorId: string | null;
  picNama: string;
  isPicOverridden: boolean;
  picNote: string | null;
  documents: {
    ATTENDANCE_LIST: DocumentSlotSummary;
    EXAM_REPORT: DocumentSlotSummary;
  };
}

export interface AdminDocumentListItem {
  slotKey: string;
  documentId: string | null;
  saumAssignmentId: string;
  scheduleId: string;
  roomId: string;
  mapelId: string | null;
  tanggal: string;
  hari: string;
  sesi: string;
  waktuMulai: string;
  waktuSelesai: string;
  kodeMapel: string | null;
  namaMapel: string;
  kodeRuang: string | null;
  namaRuang: string;
  pengawas1Id: string | null;
  pengawas1Nama: string | null;
  pengawas2Id: string | null;
  pengawas2Nama: string | null;
  picSaumSupervisorId: string | null;
  picNama: string;
  isPicOverridden: boolean;
  picNote: string | null;
  documentType: DocumentType;
  documentLabel: string;
  verificationStatus: DocumentVerificationStatus;
  version: number;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  adminNote: string | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  verifiedByUserId: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  uploadedAt: string | null;
  versions: DocumentVersionSummary[];
}

export type IncidentStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';

export interface IncidentCategoryOption {
  code: string;
  label: string;
}

export interface IncidentHistoryItem {
  id: string;
  changedByName: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

export interface IncidentReportItem {
  id: string;
  assignmentId: string;
  scheduleId: string;
  roomId: string;
  supervisorId: string;
  reporterName: string;
  incidentDate: string;
  incidentTime: string;
  category: string;
  categoryLabel: string;
  description: string;
  actionTaken: string;
  hasAttachment: boolean;
  attachmentOriginalName: string | null;
  attachmentMimeType: string | null;
  attachmentFileSize: number | null;
  status: IncidentStatus;
  statusLabel: string;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  adminNote: string | null;
  examDate: string;
  sesi: string;
  kodeMapel: string | null;
  namaMapel: string;
  kodeRuang: string | null;
  namaRuang: string;
  createdAt: string;
  updatedAt: string;
  history: IncidentHistoryItem[];
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: number;
  read_at: string | null;
  created_at: string;
}

export interface BackupSummaryResponse {
  service: string;
  saumIsolated: boolean;
  tables: {
    users: number;
    supervisorProfiles: number;
    supervisorDocuments: number;
    incidentReports: number;
    notifications: number;
    auditLogs: number;
    saumSyncedSchedules: number;
    saumSyncedStudents: number;
  };
  storage: {
    privateFileCount: number;
    totalBytes: number;
  };
}

export interface BackupRestoreResponse {
  success: boolean;
  restoredTables: number;
  restoredFiles: number;
  safetySnapshotPath: string | null;
  sessionPreserved: boolean;
  message: string;
}
