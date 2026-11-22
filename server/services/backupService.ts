import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  DB_PATH,
  DOCUMENTS_DIR,
  INCIDENTS_DIR,
  PROFILE_PHOTOS_DIR,
  db,
} from '../db/database.ts';
import { recalculateSupervisorAssignments } from '../integrations/saumConnector.ts';
import { recordAuditLog } from '../utils/audit.ts';
import { resolveConfinedPrivateFile } from '../utils/fileSecurity.ts';
import { notifyActiveAdmins } from './notificationService.ts';

type StorageBucket = 'profiles' | 'documents' | 'incidents';

interface TableSpec {
  name: string;
  columns: readonly string[];
}

// Ordered parent -> child for safe inserts with foreign keys
const BACKUP_TABLES: readonly TableSpec[] = [
  {
    name: 'users',
    columns: [
      'id',
      'username',
      'email',
      'password_hash',
      'role',
      'account_status',
      'profile_completed',
      'created_at',
      'updated_at',
      'last_login',
    ],
  },
  {
    name: 'supervisor_profiles',
    columns: [
      'id',
      'user_id',
      'saum_supervisor_id',
      'nama_lengkap',
      'nip',
      'nik',
      'jenis_kelamin',
      'tempat_lahir',
      'tanggal_lahir',
      'alamat',
      'no_whatsapp',
      'email',
      'asal_madrasah',
      'jabatan',
      'mata_pelajaran',
      'foto_profil',
      'profile_completed',
      'assignment_status',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'integration_settings',
    columns: [
      'id',
      'integration_name',
      'saum_base_url',
      'saum_data_path',
      'saum_secret_hash',
      'saum_secret_enc',
      'registration_code_hash',
      'connection_status',
      'last_sync_at',
      'sync_status',
      'auto_sync_enabled',
      'sync_interval_minutes',
      'consecutive_failures',
      'last_error_message',
      'max_upload_mb',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'audit_logs',
    columns: [
      'id',
      'user_id',
      'username_snapshot',
      'activity',
      'description',
      'ip_address',
      'created_at',
    ],
  },
  {
    name: 'saum_supervisors',
    columns: [
      'id',
      'saum_id',
      'nama',
      'nip',
      'asal_madrasah',
      'no_hp',
      'status',
      'source_name',
      'synced_at',
      'is_active_in_source',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'saum_exam_subjects',
    columns: [
      'id',
      'saum_id',
      'kode_mapel',
      'nama_mapel',
      'source_name',
      'synced_at',
      'is_active_in_source',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'saum_exam_rooms',
    columns: [
      'id',
      'saum_id',
      'kode_ruang',
      'nama_ruang',
      'kapasitas',
      'lokasi',
      'source_name',
      'synced_at',
      'is_active_in_source',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'saum_exam_schedules',
    columns: [
      'id',
      'saum_id',
      'mapel_id',
      'tanggal',
      'hari',
      'sesi',
      'waktu_mulai',
      'waktu_selesai',
      'ruang_ids_json',
      'source_name',
      'synced_at',
      'is_active_in_source',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'saum_supervisor_assignments',
    columns: [
      'id',
      'saum_id',
      'schedule_id',
      'room_id',
      'sesi',
      'pengawas1_id',
      'pengawas2_id',
      'source_name',
      'synced_at',
      'is_active_in_source',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'saum_students',
    columns: [
      'id',
      'saum_id',
      'nis',
      'nisn',
      'nama',
      'kelas',
      'nomor_peserta',
      'sesi',
      'room_id',
      'source_name',
      'synced_at',
      'is_active_in_source',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'saum_sync_logs',
    columns: [
      'id',
      'triggered_by_user_id',
      'trigger_type',
      'source_mode',
      'status',
      'supervisors_count',
      'schedules_count',
      'rooms_count',
      'subjects_count',
      'assignments_count',
      'students_count',
      'error_message',
      'duration_ms',
      'created_at',
    ],
  },
  {
    name: 'document_responsibilities',
    columns: [
      'id',
      'saum_assignment_id',
      'designated_saum_supervisor_id',
      'assigned_by_user_id',
      'note',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'supervisor_documents',
    columns: [
      'id',
      'assignment_id',
      'saum_assignment_id',
      'schedule_id',
      'room_id',
      'supervisor_id',
      'uploaded_by',
      'document_type',
      'original_filename',
      'storage_path',
      'mime_type',
      'file_size',
      'version',
      'is_latest',
      'verification_status',
      'admin_note',
      'verified_by',
      'verified_at',
      'uploaded_at',
      'updated_at',
    ],
  },
  {
    name: 'incident_reports',
    columns: [
      'id',
      'assignment_id',
      'saum_assignment_id',
      'supervisor_id',
      'schedule_id',
      'room_id',
      'incident_date',
      'incident_time',
      'category',
      'description',
      'action_taken',
      'attachment_path',
      'attachment_original_name',
      'attachment_mime_type',
      'attachment_file_size',
      'status',
      'reviewed_by',
      'reviewed_at',
      'admin_note',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'incident_status_history',
    columns: [
      'id',
      'incident_id',
      'changed_by_user_id',
      'changed_by_name',
      'from_status',
      'to_status',
      'note',
      'created_at',
    ],
  },
  {
    name: 'notifications',
    columns: [
      'id',
      'user_id',
      'type',
      'title',
      'message',
      'related_entity_type',
      'related_entity_id',
      'is_read',
      'read_at',
      'created_at',
    ],
  },
];

const BUCKET_DIRS: Record<StorageBucket, string> = {
  profiles: PROFILE_PHOTOS_DIR,
  documents: DOCUMENTS_DIR,
  incidents: INCIDENTS_DIR,
};

interface BackupFileEntry {
  bucket: StorageBucket;
  filename: string;
  size: number;
  sha256: string;
  contentBase64: string;
}

interface BackupPayload {
  tables: Record<string, Array<Record<string, unknown>>>;
  files: BackupFileEntry[];
}

interface BackupArchive {
  manifest: {
    formatVersion: number;
    service: 'SIPENGUJI';
    saumExcluded: true;
    createdAt: string;
    tableCount: number;
    fileCount: number;
    totalPrivateBytes: number;
    payloadSha256: string;
  };
  payload: BackupPayload;
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function listPrivateFilesForSummary(): { fileCount: number; totalBytes: number } {
  let fileCount = 0;
  let totalBytes = 0;
  for (const dir of Object.values(BUCKET_DIRS)) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const resolved = resolveConfinedPrivateFile(dir, name);
      if (!resolved) continue;
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        fileCount += 1;
        totalBytes += stat.size;
      }
    }
  }
  return { fileCount, totalBytes };
}

export function getBackupSummary() {
  const countTable = (name: string): number =>
    (db.prepare(`SELECT COUNT(*) as cnt FROM ${name}`).get() as { cnt: number }).cnt;

  const storage = listPrivateFilesForSummary();

  return {
    service: 'SIPENGUJI',
    saumIsolated: true,
    tables: {
      users: countTable('users'),
      supervisorProfiles: countTable('supervisor_profiles'),
      supervisorDocuments: countTable('supervisor_documents'),
      incidentReports: countTable('incident_reports'),
      notifications: countTable('notifications'),
      auditLogs: countTable('audit_logs'),
      saumSyncedSchedules: countTable('saum_exam_schedules'),
      saumSyncedStudents: countTable('saum_students'),
    },
    storage: {
      privateFileCount: storage.fileCount,
      totalBytes: storage.totalBytes,
    },
  };
}

export function createSipengujiBackupArchive(params: {
  requesterUserId: string;
  requesterUsername: string;
  ipAddress: string;
}): {
  filename: string;
  buffer: Buffer;
  manifest: BackupArchive['manifest'];
} {
  const tables: Record<string, Array<Record<string, unknown>>> = {};

  for (const spec of BACKUP_TABLES) {
    const colSelect = spec.columns.join(', ');
    tables[spec.name] = db
      .prepare(`SELECT ${colSelect} FROM ${spec.name}`)
      .all() as unknown as Array<Record<string, unknown>>;
  }

  const files: BackupFileEntry[] = [];
  let totalPrivateBytes = 0;

  for (const bucket of Object.keys(BUCKET_DIRS) as StorageBucket[]) {
    const dir = BUCKET_DIRS[bucket];
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir).sort();
    for (const name of entries) {
      const resolved = resolveConfinedPrivateFile(dir, name);
      if (!resolved) continue;
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) continue;
      const content = fs.readFileSync(resolved);
      totalPrivateBytes += content.length;
      files.push({
        bucket,
        filename: path.basename(resolved),
        size: content.length,
        sha256: sha256Hex(content),
        contentBase64: content.toString('base64'),
      });
    }
  }

  const payload: BackupPayload = { tables, files };
  const payloadSha256 = sha256Hex(JSON.stringify(payload));
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);

  const archive: BackupArchive = {
    manifest: {
      formatVersion: 1,
      service: 'SIPENGUJI',
      saumExcluded: true,
      createdAt: now.toISOString(),
      tableCount: BACKUP_TABLES.length,
      fileCount: files.length,
      totalPrivateBytes,
      payloadSha256,
    },
    payload,
  };

  const jsonBuffer = Buffer.from(JSON.stringify(archive), 'utf8');
  const gzipped = zlib.gzipSync(jsonBuffer, { level: 6 });

  recordAuditLog({
    userId: params.requesterUserId,
    usernameSnapshot: params.requesterUsername,
    activity: 'BACKUP_CREATED',
    description: `Admin mengunduh arsip backup SIPENGUJI (${BACKUP_TABLES.length} tabel, ${files.length} berkas privat). Data SAUM tidak disentuh.`,
    ipAddress: params.ipAddress,
  });

  return {
    filename: `sipenguji-backup-${stamp}.json.gz`,
    buffer: gzipped,
    manifest: archive.manifest,
  };
}

const MAX_UNCOMPRESSED_BACKUP_BYTES = 120 * 1024 * 1024;

export function restoreSipengujiBackupArchive(params: {
  archiveBuffer: Buffer;
  confirmRestore: boolean;
  requesterUserId: string;
  requesterUsername: string;
  ipAddress: string;
}):
  | {
      ok: true;
      restoredTables: number;
      restoredFiles: number;
      safetySnapshotPath: string | null;
      sessionPreserved: boolean;
    }
  | { ok: false; status: number; error: string } {
  if (!params.confirmRestore) {
    return {
      ok: false,
      status: 400,
      error: 'Konfirmasi pemulihan (confirmRestore=true) wajib disetujui sebelum menimpa data SIPENGUJI.',
    };
  }

  if (!params.archiveBuffer || params.archiveBuffer.length === 0) {
    return { ok: false, status: 400, error: 'Berkas backup kosong.' };
  }

  let rawJsonText: string;
  try {
    const isGzip = params.archiveBuffer.length >= 2 && params.archiveBuffer[0] === 0x1f && params.archiveBuffer[1] === 0x8b;
    if (isGzip) {
      const gunzipped = zlib.gunzipSync(params.archiveBuffer, {
        maxOutputLength: MAX_UNCOMPRESSED_BACKUP_BYTES,
      });
      rawJsonText = gunzipped.toString('utf8');
    } else {
      if (params.archiveBuffer.length > MAX_UNCOMPRESSED_BACKUP_BYTES) {
        return { ok: false, status: 400, error: 'Ukuran isi backup melampaui batas aman.' };
      }
      rawJsonText = params.archiveBuffer.toString('utf8');
    }
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Berkas backup gagal didekompresi. Pastikan arsip .json.gz atau .json valid.',
    };
  }

  let parsed: BackupArchive;
  try {
    parsed = JSON.parse(rawJsonText) as BackupArchive;
  } catch {
    return { ok: false, status: 400, error: 'Format JSON di dalam berkas backup tidak valid.' };
  }

  if (
    !parsed ||
    !parsed.manifest ||
    parsed.manifest.service !== 'SIPENGUJI' ||
    parsed.manifest.saumExcluded !== true ||
    parsed.manifest.formatVersion !== 1 ||
    !parsed.payload ||
    typeof parsed.payload !== 'object' ||
    !parsed.payload.tables ||
    !Array.isArray(parsed.payload.files)
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Struktur manifest backup bukan arsip SIPENGUJI yang sah.',
    };
  }

  const computedPayloadSha = sha256Hex(JSON.stringify(parsed.payload));
  if (computedPayloadSha !== parsed.manifest.payloadSha256) {
    return {
      ok: false,
      status: 400,
      error: 'Integritas backup gagal diverifikasi (checksum SHA-256 tidak cocok).',
    };
  }

  for (const spec of BACKUP_TABLES) {
    if (!Array.isArray(parsed.payload.tables[spec.name])) {
      return {
        ok: false,
        status: 400,
        error: `Tabel wajib "${spec.name}" tidak ditemukan di dalam berkas backup.`,
      };
    }
  }

  const usersRows = parsed.payload.tables.users || [];
  const hasRestoredAdmin = usersRows.some(
    (u) => u.role === 'ADMIN' && u.account_status === 'ACTIVE'
  );
  if (!hasRestoredAdmin) {
    return {
      ok: false,
      status: 400,
      error: 'Arsip backup tidak memiliki akun ADMIN ACTIVE sehingga pemulihan ditolak untuk mencegah terkunci.',
    };
  }

  // Validate every private file entry & checksum before writing anything
  const decodedFiles: Array<{
    bucket: StorageBucket;
    filename: string;
    targetPath: string;
    buffer: Buffer;
  }> = [];

  for (const entry of parsed.payload.files) {
    if (
      !entry ||
      (entry.bucket !== 'profiles' &&
        entry.bucket !== 'documents' &&
        entry.bucket !== 'incidents') ||
      typeof entry.filename !== 'string' ||
      typeof entry.contentBase64 !== 'string' ||
      typeof entry.sha256 !== 'string'
    ) {
      return {
        ok: false,
        status: 400,
        error: 'Metadata berkas privat di dalam arsip backup tidak valid.',
      };
    }

    const baseName = path.basename(entry.filename);
    if (baseName !== entry.filename || baseName.includes('\0')) {
      return {
        ok: false,
        status: 400,
        error: 'Nama berkas di dalam backup mengandung karakter path tidak aman.',
      };
    }

    const dir = BUCKET_DIRS[entry.bucket];
    const targetPath = resolveConfinedPrivateFile(dir, baseName);
    if (!targetPath) {
      return {
        ok: false,
        status: 400,
        error: 'Lokasi pemulihan berkas berada di luar direktori privat SIPENGUJI.',
      };
    }

    const fileBuf = Buffer.from(entry.contentBase64, 'base64');
    if (sha256Hex(fileBuf) !== entry.sha256) {
      return {
        ok: false,
        status: 400,
        error: `Checksum berkas "${baseName}" di dalam arsip backup tidak cocok.`,
      };
    }

    decodedFiles.push({
      bucket: entry.bucket,
      filename: baseName,
      targetPath,
      buffer: fileBuf,
    });
  }

  // Create pre-restore safety snapshot of current SIPENGUJI database
  let safetySnapshotPath: string | null = null;
  try {
    if (fs.existsSync(DB_PATH)) {
      const safetyFile = path.join(path.dirname(DB_PATH), 'pre-restore-safety.db');
      fs.copyFileSync(DB_PATH, safetyFile);
      safetySnapshotPath = 'data/pre-restore-safety.db';
    }
  } catch {
    safetySnapshotPath = null;
  }

  // Restore DB inside transaction
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    // Delete child -> parent
    for (let i = BACKUP_TABLES.length - 1; i >= 0; i -= 1) {
      db.exec(`DELETE FROM ${BACKUP_TABLES[i].name};`);
    }

    // Insert parent -> child using strictly whitelisted columns
    for (const spec of BACKUP_TABLES) {
      const rows = parsed.payload.tables[spec.name] || [];
      if (rows.length === 0) continue;
      const colList = spec.columns.join(', ');
      const placeholders = spec.columns.map(() => '?').join(', ');
      const stmt = db.prepare(
        `INSERT INTO ${spec.name} (${colList}) VALUES (${placeholders})`
      );
      for (const row of rows) {
        const values = spec.columns.map((col) => {
          const val = row[col];
          return val === undefined ? null : (val as string | number | null);
        });
        stmt.run(...values);
      }
    }

    // Keep sessions only for users that exist & are ACTIVE in restored DB
    db.exec(
      "DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users WHERE account_status = 'ACTIVE')"
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    db.exec('PRAGMA foreign_keys = ON;');
    return {
      ok: false,
      status: 500,
      error: `Pemulihan database gagal dan telah dibatalkan otomatis: ${
        err instanceof Error ? err.message : 'kesalahan SQL'
      }`,
    };
  }
  db.exec('PRAGMA foreign_keys = ON;');

  // Replace private storage files atomically per directory bucket
  for (const bucket of Object.keys(BUCKET_DIRS) as StorageBucket[]) {
    const dir = BUCKET_DIRS[bucket];
    fs.mkdirSync(dir, { recursive: true });
    const existing = fs.readdirSync(dir);
    for (const name of existing) {
      const resolved = resolveConfinedPrivateFile(dir, name);
      if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        fs.unlinkSync(resolved);
      }
    }
  }

  for (const file of decodedFiles) {
    fs.writeFileSync(file.targetPath, file.buffer, { mode: 0o600 });
  }

  recalculateSupervisorAssignments();

  const requesterStillActive = Boolean(
    db
      .prepare("SELECT id FROM users WHERE id = ? AND account_status = 'ACTIVE' LIMIT 1")
      .get(params.requesterUserId)
  );

  recordAuditLog({
    userId: requesterStillActive ? params.requesterUserId : null,
    usernameSnapshot: params.requesterUsername,
    activity: 'BACKUP_RESTORED',
    description: `Admin memulihkan arsip backup SIPENGUJI (${BACKUP_TABLES.length} tabel, ${decodedFiles.length} berkas privat).`,
    ipAddress: params.ipAddress,
  });

  notifyActiveAdmins({
    type: 'BACKUP_RESTORED',
    title: 'Backup SIPENGUJI Dipulihkan',
    message: `Data SIPENGUJI dipulihkan oleh ${params.requesterUsername} (${decodedFiles.length} berkas privat, database SAUM tetap tidak tersentuh).`,
    relatedEntityType: 'BACKUP',
    relatedEntityId: null,
  });

  return {
    ok: true,
    restoredTables: BACKUP_TABLES.length,
    restoredFiles: decodedFiles.length,
    safetySnapshotPath,
    sessionPreserved: requesterStillActive,
  };
}
