export type UserRole = 'ADMIN' | 'PENGAWAS';

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export type ProfileStatus = 'INCOMPLETE' | 'COMPLETE';

export type AssignmentStatus = 'NOT_ASSIGNED' | 'ASSIGNED' | 'COMPLETED';

export type OperationalAccessStatus = 'LOCKED' | 'AVAILABLE';

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: UserRole;
  account_status: AccountStatus;
  profile_completed: number;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export interface SupervisorProfileRow {
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

export interface IntegrationSettingRow {
  id: string;
  integration_name: string;
  saum_base_url: string;
  saum_data_path: string;
  saum_secret_hash: string | null;
  saum_secret_enc: string | null;
  registration_code_hash: string | null;
  connection_status: string;
  last_sync_at: string | null;
  sync_status: string;
  auto_sync_enabled: number;
  sync_interval_minutes: number;
  consecutive_failures: number;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  username_snapshot: string | null;
  activity: string;
  description: string;
  ip_address: string | null;
  created_at: string;
}

export interface SaumSyncLogRow {
  id: string;
  triggered_by_user_id: string | null;
  trigger_type: 'MANUAL' | 'SCHEDULED';
  source_mode: 'FILE_READ_ONLY' | 'HTTP_READ_ONLY' | 'UNAVAILABLE';
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

export interface SaumEntityCounts {
  supervisors: number;
  schedules: number;
  rooms: number;
  subjects: number;
  assignments: number;
  students: number;
}

export type ScheduleLifecycleStatus =
  | 'AKAN_DATANG'
  | 'BERLANGSUNG'
  | 'SELESAI'
  | 'BELUM_TERJADWAL';

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

export interface AuthenticatedContext {
  user: {
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
  };
  profile: SupervisorProfileRow | null;
}

export type DocumentType = 'ATTENDANCE_LIST' | 'EXAM_REPORT';

export type DocumentVerificationStatus =
  | 'NOT_UPLOADED'
  | 'PENDING_REVIEW'
  | 'ACCEPTED'
  | 'REVISION_REQUIRED';

export type IncidentStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';

export type IncidentCategory =
  | 'KETERLAMBATAN_PENGAWAS'
  | 'PENGAWAS_TIDAK_HADIR'
  | 'PENGAWAS_SAKIT'
  | 'DUGAAN_KECURANGAN_PESERTA'
  | 'GANGGUAN_TEKNIS_KOMPUTER'
  | 'GANGGUAN_JARINGAN_INTERNET'
  | 'GANGGUAN_LISTRIK'
  | 'PERMASALAHAN_RUANG_UJIAN'
  | 'PERMASALAHAN_PESERTA'
  | 'KEJADIAN_LAINNYA';

export interface SupervisorDocumentRow {
  id: string;
  assignment_id: string;
  saum_assignment_id: string;
  schedule_id: string;
  room_id: string;
  supervisor_id: string;
  uploaded_by: string;
  document_type: DocumentType;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  version: number;
  is_latest: number;
  verification_status: DocumentVerificationStatus;
  admin_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  uploaded_at: string;
  updated_at: string;
}

export interface IncidentReportRow {
  id: string;
  assignment_id: string;
  saum_assignment_id: string;
  supervisor_id: string;
  schedule_id: string;
  room_id: string;
  incident_date: string;
  incident_time: string;
  category: IncidentCategory;
  description: string;
  action_taken: string;
  attachment_path: string | null;
  attachment_original_name: string | null;
  attachment_mime_type: string | null;
  attachment_file_size: number | null;
  status: IncidentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
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

