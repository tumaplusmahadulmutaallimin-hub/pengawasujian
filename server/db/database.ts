import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ensurePersistentSessionSecret,
  generateId,
  hashPassword,
  hashToken,
} from '../utils/crypto.ts';
import {
  getAppEnvironment,
  isPlaceholderEnvValue,
  validateEnvironmentConfig,
} from '../utils/loadEnv.ts';

export const DB_PATH = path.resolve(
  process.cwd(),
  process.env.SIPENGUJI_DB_PATH || 'data/sipenguji.db'
);
export const PRIVATE_STORAGE_ROOT = path.resolve(
  process.cwd(),
  process.env.SIPENGUJI_PRIVATE_STORAGE || 'storage/private'
);
export const PROFILE_PHOTOS_DIR = path.join(PRIVATE_STORAGE_ROOT, 'profiles');
export const DOCUMENTS_DIR = path.join(PRIVATE_STORAGE_ROOT, 'documents');
export const INCIDENTS_DIR = path.join(PRIVATE_STORAGE_ROOT, 'incidents');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(PROFILE_PHOTOS_DIR, { recursive: true });
fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
fs.mkdirSync(INCIDENTS_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'PENGAWAS')),
    account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(account_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')),
    profile_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS supervisor_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    saum_supervisor_id TEXT UNIQUE,
    nama_lengkap TEXT NOT NULL,
    nip TEXT,
    nik TEXT,
    jenis_kelamin TEXT,
    tempat_lahir TEXT,
    tanggal_lahir TEXT,
    alamat TEXT,
    no_whatsapp TEXT,
    email TEXT,
    asal_madrasah TEXT,
    jabatan TEXT,
    mata_pelajaran TEXT,
    foto_profil TEXT,
    profile_completed INTEGER NOT NULL DEFAULT 0,
    assignment_status TEXT NOT NULL DEFAULT 'NOT_ASSIGNED' CHECK(assignment_status IN ('NOT_ASSIGNED', 'ASSIGNED', 'COMPLETED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_supervisor_nip_unique
    ON supervisor_profiles(nip)
    WHERE nip IS NOT NULL AND TRIM(nip) != '';

  CREATE UNIQUE INDEX IF NOT EXISTS idx_supervisor_nik_unique
    ON supervisor_profiles(nik)
    WHERE nik IS NOT NULL AND TRIM(nik) != '';

  CREATE TABLE IF NOT EXISTS integration_settings (
    id TEXT PRIMARY KEY,
    integration_name TEXT NOT NULL UNIQUE,
    saum_base_url TEXT NOT NULL DEFAULT '',
    saum_data_path TEXT NOT NULL DEFAULT '',
    saum_secret_hash TEXT,
    saum_secret_enc TEXT,
    registration_code_hash TEXT,
    connection_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    last_sync_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'IDLE',
    auto_sync_enabled INTEGER NOT NULL DEFAULT 0,
    sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_error_message TEXT,
    max_upload_mb INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    username_snapshot TEXT,
    activity TEXT NOT NULL,
    description TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_activity ON audit_logs(activity);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  -- PHASE 03: SAUM Read-Only Reference Tables (Isolated in SIPENGUJI DB)
  CREATE TABLE IF NOT EXISTS saum_supervisors (
    id TEXT PRIMARY KEY,
    saum_id TEXT NOT NULL UNIQUE,
    nama TEXT NOT NULL,
    nip TEXT,
    asal_madrasah TEXT,
    no_hp TEXT,
    status TEXT,
    source_name TEXT NOT NULL DEFAULT 'SAUM_READ_ONLY',
    synced_at TEXT NOT NULL,
    is_active_in_source INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saum_exam_subjects (
    id TEXT PRIMARY KEY,
    saum_id TEXT NOT NULL UNIQUE,
    kode_mapel TEXT,
    nama_mapel TEXT NOT NULL,
    source_name TEXT NOT NULL DEFAULT 'SAUM_READ_ONLY',
    synced_at TEXT NOT NULL,
    is_active_in_source INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saum_exam_rooms (
    id TEXT PRIMARY KEY,
    saum_id TEXT NOT NULL UNIQUE,
    kode_ruang TEXT,
    nama_ruang TEXT NOT NULL,
    kapasitas INTEGER,
    lokasi TEXT,
    source_name TEXT NOT NULL DEFAULT 'SAUM_READ_ONLY',
    synced_at TEXT NOT NULL,
    is_active_in_source INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saum_exam_schedules (
    id TEXT PRIMARY KEY,
    saum_id TEXT NOT NULL UNIQUE,
    mapel_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    hari TEXT,
    sesi TEXT NOT NULL,
    waktu_mulai TEXT,
    waktu_selesai TEXT,
    ruang_ids_json TEXT NOT NULL DEFAULT '[]',
    source_name TEXT NOT NULL DEFAULT 'SAUM_READ_ONLY',
    synced_at TEXT NOT NULL,
    is_active_in_source INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saum_supervisor_assignments (
    id TEXT PRIMARY KEY,
    saum_id TEXT NOT NULL UNIQUE,
    schedule_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    sesi TEXT NOT NULL,
    pengawas1_id TEXT,
    pengawas2_id TEXT,
    source_name TEXT NOT NULL DEFAULT 'SAUM_READ_ONLY',
    synced_at TEXT NOT NULL,
    is_active_in_source INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_saum_assign_p1 ON saum_supervisor_assignments(pengawas1_id);
  CREATE INDEX IF NOT EXISTS idx_saum_assign_p2 ON saum_supervisor_assignments(pengawas2_id);
  CREATE INDEX IF NOT EXISTS idx_saum_assign_sched_room ON saum_supervisor_assignments(schedule_id, room_id, is_active_in_source);

  CREATE TABLE IF NOT EXISTS saum_students (
    id TEXT PRIMARY KEY,
    saum_id TEXT NOT NULL UNIQUE,
    nis TEXT,
    nisn TEXT,
    nama TEXT NOT NULL,
    kelas TEXT,
    nomor_peserta TEXT,
    sesi TEXT,
    room_id TEXT,
    source_name TEXT NOT NULL DEFAULT 'SAUM_READ_ONLY',
    synced_at TEXT NOT NULL,
    is_active_in_source INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_saum_students_room ON saum_students(room_id);
  CREATE INDEX IF NOT EXISTS idx_saum_students_room_sesi ON saum_students(room_id, sesi, is_active_in_source);

  CREATE TABLE IF NOT EXISTS saum_sync_logs (
    id TEXT PRIMARY KEY,
    triggered_by_user_id TEXT,
    trigger_type TEXT NOT NULL CHECK(trigger_type IN ('MANUAL', 'SCHEDULED')),
    source_mode TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED')),
    supervisors_count INTEGER NOT NULL DEFAULT 0,
    schedules_count INTEGER NOT NULL DEFAULT 0,
    rooms_count INTEGER NOT NULL DEFAULT 0,
    subjects_count INTEGER NOT NULL DEFAULT 0,
    assignments_count INTEGER NOT NULL DEFAULT 0,
    students_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- PHASE 05: Document Responsibility, Supervisor Documents, Incident Reports, Notifications
  CREATE TABLE IF NOT EXISTS document_responsibilities (
    id TEXT PRIMARY KEY,
    saum_assignment_id TEXT NOT NULL UNIQUE,
    designated_saum_supervisor_id TEXT NOT NULL,
    assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS supervisor_documents (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    saum_assignment_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    supervisor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK(document_type IN ('ATTENDANCE_LIST', 'EXAM_REPORT')),
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_latest INTEGER NOT NULL DEFAULT 1,
    verification_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(verification_status IN ('NOT_UPLOADED', 'PENDING_REVIEW', 'ACCEPTED', 'REVISION_REQUIRED')),
    admin_note TEXT,
    verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    verified_at TEXT,
    uploaded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sup_docs_lookup ON supervisor_documents(saum_assignment_id, document_type, is_latest);
  CREATE INDEX IF NOT EXISTS idx_sup_docs_status ON supervisor_documents(verification_status);
  CREATE INDEX IF NOT EXISTS idx_sup_docs_latest ON supervisor_documents(is_latest, verification_status);

  CREATE TABLE IF NOT EXISTS incident_reports (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    saum_assignment_id TEXT NOT NULL,
    supervisor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    schedule_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    incident_date TEXT NOT NULL,
    incident_time TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    action_taken TEXT NOT NULL DEFAULT '',
    attachment_path TEXT,
    attachment_original_name TEXT,
    attachment_mime_type TEXT,
    attachment_file_size INTEGER,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    admin_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_incidents_supervisor ON incident_reports(supervisor_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incident_reports(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS incident_status_history (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
    changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    changed_by_name TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_incident_hist_incident ON incident_status_history(incident_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
`);

function runSafeMigrations(): void {
  // Migrate users table if created in Phase 02 without PENDING_VERIFICATION in CHECK constraint
  const usersTableSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
    .get() as { sql: string } | undefined;

  if (usersTableSql?.sql && !usersTableSql.sql.includes('PENDING_VERIFICATION')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN;');
    try {
      db.exec(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          email TEXT UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN', 'PENGAWAS')),
          account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(account_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')),
          profile_completed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_login TEXT
        );
        INSERT INTO users_new SELECT * FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
      db.exec('COMMIT;');
    } catch {
      db.exec('ROLLBACK;');
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Safely add Phase 03 columns to integration_settings if upgrading from Phase 02 DB
  const intCols = db
    .prepare('PRAGMA table_info(integration_settings)')
    .all() as unknown as { name: string }[];
  const colNames = new Set(intCols.map((c) => c.name));

  if (!colNames.has('saum_secret_enc')) {
    db.exec('ALTER TABLE integration_settings ADD COLUMN saum_secret_enc TEXT;');
  }
  if (!colNames.has('auto_sync_enabled')) {
    db.exec('ALTER TABLE integration_settings ADD COLUMN auto_sync_enabled INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('sync_interval_minutes')) {
    db.exec('ALTER TABLE integration_settings ADD COLUMN sync_interval_minutes INTEGER NOT NULL DEFAULT 15;');
  }
  if (!colNames.has('consecutive_failures')) {
    db.exec('ALTER TABLE integration_settings ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('last_error_message')) {
    db.exec('ALTER TABLE integration_settings ADD COLUMN last_error_message TEXT;');
  }
  if (!colNames.has('max_upload_mb')) {
    db.exec('ALTER TABLE integration_settings ADD COLUMN max_upload_mb INTEGER NOT NULL DEFAULT 10;');
  }
}

export function seedInitialData(): void {
  validateEnvironmentConfig(DB_PATH, PRIVATE_STORAGE_ROOT);
  ensurePersistentSessionSecret();
  runSafeMigrations();
  const now = new Date().toISOString();

  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1")
    .get() as { id: string } | undefined;

  const envAdminPass = process.env.SIPENGUJI_ADMIN_DEFAULT_PASSWORD?.trim();
  if (!existingAdmin && envAdminPass && !isPlaceholderEnvValue(envAdminPass) && envAdminPass.length >= 10) {
    const adminId = generateId('usr');
    db.prepare(`
      INSERT INTO users (
        id, username, email, password_hash, role, account_status, profile_completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE', 1, ?, ?)
    `).run(
      adminId,
      'admin',
      'admin@sipenguji.madrasah.id',
      hashPassword(envAdminPass),
      now,
      now
    );

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, username_snapshot, activity, description, ip_address, created_at)
      VALUES (?, ?, ?, 'SYSTEM_SEED', 'Akun Admin awal SIPENGUJI dibuat dari konfigurasi environment aman.', '127.0.0.1', ?)
    `).run(generateId('aud'), adminId, 'admin', now);
  }

  const existingIntegration = db
    .prepare("SELECT id FROM integration_settings WHERE integration_name = 'SAUM_READ_ONLY' LIMIT 1")
    .get() as { id: string } | undefined;

  if (!existingIntegration) {
    const envRegCode = process.env.SIPENGUJI_REG_CODE?.trim();
    const hasEnvRegCode = Boolean(envRegCode && !isPlaceholderEnvValue(envRegCode) && envRegCode.length >= 8);
    // In staging without explicit code, generate a non-guessable hash; in production require explicit setup by Admin
    const regCodeHash = hasEnvRegCode
      ? hashToken(envRegCode!)
      : getAppEnvironment() === 'staging'
        ? hashToken(crypto.randomBytes(16).toString('hex'))
        : null;

    const envMaxMb = Number(process.env.SIPENGUJI_MAX_UPLOAD_MB);
    const initialMaxMb =
      Number.isFinite(envMaxMb) && envMaxMb >= 1 && envMaxMb <= 25 ? Math.round(envMaxMb) : 10;
    db.prepare(`
      INSERT INTO integration_settings (
        id, integration_name, saum_base_url, saum_data_path, saum_secret_hash,
        registration_code_hash, connection_status, last_sync_at, sync_status,
        auto_sync_enabled, sync_interval_minutes, consecutive_failures, max_upload_mb, created_at, updated_at
      ) VALUES (?, 'SAUM_READ_ONLY', '', '', NULL, ?, 'NOT_CONFIGURED', NULL, 'IDLE', 0, 15, 0, ?, ?, ?)
    `).run(generateId('int'), regCodeHash, initialMaxMb, now, now);
  }
}

seedInitialData();
