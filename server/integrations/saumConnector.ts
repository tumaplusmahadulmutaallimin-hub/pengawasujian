import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database.ts';
import type {
  IntegrationSettingRow,
  SaumEntityCounts,
  SaumSyncLogRow,
} from '../types.ts';
import { recordAuditLog } from '../utils/audit.ts';
import { decryptSecret, generateId, maskIdentifier } from '../utils/crypto.ts';

/**
 * SAUM Read-Only Connector (PHASE 03)
 *
 * Strict invariants:
 * 1. Zero write methods against SAUM (no fs write flags, no HTTP POST/PUT/PATCH/DELETE).
 * 2. Never uses /api/auth/login, /api/state, or /api/backup.
 * 3. Never accesses saum-sessions.json.
 * 4. Never exposes credentials or full secret filesystem paths to frontend or logs.
 * 5. Handles transient atomic-rename read errors with bounded retries (max 3 attempts).
 */

export interface NormalizedSaumPayload {
  sourceMode: 'FILE_READ_ONLY' | 'HTTP_READ_ONLY';
  supervisors: Array<{
    saumId: string;
    nama: string;
    nip: string | null;
    asalMadrasah: string | null;
    noHp: string | null;
    status: string | null;
  }>;
  subjects: Array<{
    saumId: string;
    kodeMapel: string | null;
    namaMapel: string;
  }>;
  rooms: Array<{
    saumId: string;
    kodeRuang: string | null;
    namaRuang: string;
    kapasitas: number | null;
    lokasi: string | null;
  }>;
  schedules: Array<{
    saumId: string;
    mapelId: string;
    tanggal: string;
    hari: string | null;
    sesi: string;
    waktuMulai: string | null;
    waktuSelesai: string | null;
    ruangIds: string[];
  }>;
  assignments: Array<{
    saumId: string;
    scheduleId: string;
    roomId: string;
    sesi: string;
    pengawas1Id: string | null;
    pengawas2Id: string | null;
  }>;
  students: Array<{
    saumId: string;
    nis: string | null;
    nisn: string | null;
    nama: string;
    kelas: string | null;
    nomorPeserta: string | null;
    sesi: string | null;
    roomId: string | null;
  }>;
}

export interface SaumSearchCandidatePublic {
  saumSupervisorId: string;
  namaLengkap: string;
  nipMasked: string | null;
  asalMadrasah: string | null;
  status: string | null;
  hasPhoneOnRecord: boolean;
}

export interface SaumSearchResult {
  saumAvailable: boolean;
  totalSyncedSupervisors: number;
  message: string;
  results: SaumSearchCandidatePublic[];
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

function getIntegrationRow(): IntegrationSettingRow {
  return db
    .prepare("SELECT * FROM integration_settings WHERE integration_name = 'SAUM_READ_ONLY' LIMIT 1")
    .get() as unknown as IntegrationSettingRow;
}

export function getSyncedEntityCounts(): SaumEntityCounts {
  const countOf = (table: string) =>
    (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE is_active_in_source = 1`)
        .get() as { cnt: number }
    ).cnt;

  return {
    supervisors: countOf('saum_supervisors'),
    schedules: countOf('saum_exam_schedules'),
    rooms: countOf('saum_exam_rooms'),
    subjects: countOf('saum_exam_subjects'),
    assignments: countOf('saum_supervisor_assignments'),
    students: countOf('saum_students'),
  };
}

export function getSaumSettingsSafe() {
  const row = getIntegrationRow();
  const dataPathTrimmed = row.saum_data_path.trim();
  const baseUrlTrimmed = row.saum_base_url.trim();

  return {
    id: row.id,
    integration_name: row.integration_name,
    hasBaseUrlConfigured: Boolean(baseUrlTrimmed),
    saum_base_url_display: baseUrlTrimmed ? new URL(baseUrlTrimmed).origin : '',
    hasDataPathConfigured: Boolean(dataPathTrimmed),
    data_source_label: dataPathTrimmed ? path.basename(dataPathTrimmed) : '',
    hasSecretConfigured: Boolean(row.saum_secret_hash || row.saum_secret_enc),
    hasRegistrationCodeConfigured: Boolean(row.registration_code_hash),
    connection_status: row.connection_status,
    last_sync_at: row.last_sync_at,
    sync_status: row.sync_status,
    auto_sync_enabled: Boolean(row.auto_sync_enabled === 1),
    sync_interval_minutes: row.sync_interval_minutes || 15,
    consecutive_failures: row.consecutive_failures || 0,
    last_error_message: row.last_error_message,
    updated_at: row.updated_at,
  };
}

function validateSafeRemoteUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Protokol URL SAUM tidak valid.');
  }
  const pathname = parsed.pathname.toLowerCase();
  const forbiddenPaths = ['/api/auth/login', '/api/state', '/api/backup'];
  if (forbiddenPaths.some((fp) => pathname.includes(fp))) {
    throw new Error(
      'Endpoint tersebut dilarang digunakan sebagai sumber integrasi rutin SAUM.'
    );
  }
  return parsed.toString();
}

function normalizeSaumJson(
  raw: unknown,
  sourceMode: 'FILE_READ_ONLY' | 'HTTP_READ_ONLY'
): NormalizedSaumPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Struktur JSON sumber SAUM tidak valid (harus berupa objek JSON).');
  }

  const obj = raw as Record<string, unknown>;
  const asArray = (keys: string[]): Record<string, unknown>[] => {
    for (const k of keys) {
      if (Array.isArray(obj[k])) {
        return obj[k].filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'));
      }
    }
    return [];
  };

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const optStr = (v: unknown): string | null => {
    const s = str(v);
    return s.length > 0 ? s : null;
  };
  const optNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  const supervisorsRaw = asArray(['supervisors', 'pengawas']);
  const schedulesRaw = asArray(['examSchedules', 'schedules', 'jadwal']);
  const roomsRaw = asArray(['examRooms', 'rooms', 'ruang']);
  const subjectsRaw = asArray(['examSubjects', 'subjects', 'mapel', 'mataPelajaran']);
  const assignmentsRaw = asArray(['supervisorAssignments', 'assignments', 'penugasan']);
  const studentsRaw = asArray(['students', 'peserta', 'siswa']);

  if (
    supervisorsRaw.length === 0 &&
    schedulesRaw.length === 0 &&
    roomsRaw.length === 0 &&
    subjectsRaw.length === 0 &&
    assignmentsRaw.length === 0 &&
    studentsRaw.length === 0
  ) {
    throw new Error(
      'Berkas/respons JSON tidak memuat koleksi data SAUM yang dikenali (supervisors, schedules, rooms, subjects, assignments, students).'
    );
  }

  return {
    sourceMode,
    supervisors: supervisorsRaw
      .map((r) => ({
        saumId: str(r.id),
        nama: str(r.nama ?? r.namaLengkap ?? r.name),
        nip: optStr(r.nip),
        asalMadrasah: optStr(r.asalMadrasah ?? r.madrasah),
        noHp: optStr(r.noHp ?? r.no_hp ?? r.noWhatsapp),
        status: optStr(r.status),
      }))
      .filter((x) => x.saumId && x.nama),

    subjects: subjectsRaw
      .map((r) => ({
        saumId: str(r.id),
        kodeMapel: optStr(r.kodeMapel ?? r.kode),
        namaMapel: str(r.namaMapel ?? r.nama ?? r.name),
      }))
      .filter((x) => x.saumId && x.namaMapel),

    rooms: roomsRaw
      .map((r) => ({
        saumId: str(r.id),
        kodeRuang: optStr(r.kodeRuang ?? r.kode),
        namaRuang: str(r.namaRuang ?? r.nama ?? r.nomor ?? r.name),
        kapasitas: optNum(r.kapasitas),
        lokasi: optStr(r.lokasi ?? r.gedung),
      }))
      .filter((x) => x.saumId && x.namaRuang),

    schedules: schedulesRaw
      .map((r) => ({
        saumId: str(r.id),
        mapelId: str(r.mapelId ?? r.subjectId),
        tanggal: str(r.tanggal),
        hari: optStr(r.hari),
        sesi: str(r.sesi),
        waktuMulai: optStr(r.waktuMulai),
        waktuSelesai: optStr(r.waktuSelesai),
        ruangIds: Array.isArray(r.ruangIds)
          ? r.ruangIds.map((id) => str(id)).filter(Boolean)
          : [],
      }))
      .filter((x) => x.saumId && x.tanggal && x.sesi),

    assignments: assignmentsRaw
      .map((r) => ({
        saumId: str(r.id),
        scheduleId: str(r.scheduleId ?? r.jadwalId),
        roomId: str(r.roomId ?? r.ruangId),
        sesi: str(r.sesi),
        pengawas1Id: optStr(r.pengawas1Id),
        pengawas2Id: optStr(r.pengawas2Id),
      }))
      .filter((x) => x.saumId && x.scheduleId && x.roomId),

    students: studentsRaw
      .map((r) => ({
        saumId: str(r.id),
        nis: optStr(r.nis),
        nisn: optStr(r.nisn),
        nama: str(r.nama ?? r.name),
        kelas: optStr(r.kelas),
        nomorPeserta: optStr(r.nomorPeserta),
        sesi: optStr(r.sesi),
        roomId: optStr(r.ruangId ?? r.roomId),
      }))
      .filter((x) => x.saumId && x.nama),
  };
}

async function readLocalSaumFileWithRetry(filePath: string): Promise<unknown> {
  const resolved = path.resolve(filePath);
  if (path.basename(resolved).toLowerCase() === 'saum-sessions.json') {
    throw new Error('Akses ke saum-sessions.json dilarang oleh kebijakan keamanan SIPENGUJI.');
  }

  const delays = [0, 150, 300];
  let lastError: unknown = null;

  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      fs.accessSync(resolved, fs.constants.R_OK);
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        throw new Error('Lokasi sumber data SAUM bukan berupa berkas reguler.');
      }
      // Strictly open with read-only flag; never lock or write
      const content = await fs.promises.readFile(resolved, { encoding: 'utf8', flag: 'r' });
      return JSON.parse(content) as unknown;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError instanceof SyntaxError) {
    throw new Error('Format JSON sumber data SAUM tidak valid.');
  }
  const code = (lastError as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') {
    throw new Error('Berkas sumber data SAUM tidak ditemukan pada lokasi yang dikonfigurasi.');
  }
  if (code === 'EACCES' || code === 'EPERM') {
    throw new Error('Izin baca berkas sumber data SAUM ditolak oleh sistem operasi.');
  }
  throw new Error(
    lastError instanceof Error ? lastError.message : 'Gagal membaca berkas sumber data SAUM.'
  );
}

async function fetchRemoteSaumReadOnly(
  rawUrl: string,
  encryptedSecret: string | null
): Promise<unknown> {
  const safeUrl = validateSafeRemoteUrl(rawUrl);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (encryptedSecret) {
    const token = decryptSecret(encryptedSecret);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(safeUrl, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Endpoint SAUM merespons dengan status HTTP ${response.status}.`);
  }

  return (await response.json()) as unknown;
}

async function readSaumSourceOnce(row: IntegrationSettingRow): Promise<NormalizedSaumPayload> {
  const dataPath = row.saum_data_path.trim();
  const baseUrl = row.saum_base_url.trim();

  if (dataPath) {
    const raw = await readLocalSaumFileWithRetry(dataPath);
    return normalizeSaumJson(raw, 'FILE_READ_ONLY');
  }

  if (baseUrl) {
    const raw = await fetchRemoteSaumReadOnly(baseUrl, row.saum_secret_enc);
    return normalizeSaumJson(raw, 'HTTP_READ_ONLY');
  }

  throw new Error(
    'Sumber data SAUM belum dikonfigurasi. Isi Lokasi Berkas Read-Only atau Endpoint Read-Only SAUM terlebih dahulu.'
  );
}

export async function testSaumConnectionReadOnly(): Promise<SaumConnectionTestResult> {
  const row = getIntegrationRow();
  const dataPath = row.saum_data_path.trim();
  const baseUrl = row.saum_base_url.trim();

  if (!dataPath && !baseUrl) {
    db.prepare(
      "UPDATE integration_settings SET connection_status = 'NOT_CONFIGURED', last_error_message = NULL, updated_at = ? WHERE integration_name = 'SAUM_READ_ONLY'"
    ).run(new Date().toISOString());

    return {
      connected: false,
      sourceMode: 'UNAVAILABLE',
      readOnlyVerified: false,
      osPermissionSummary: 'Belum ada jalur sumber SAUM yang dikonfigurasi.',
      connectionStatus: 'NOT_CONFIGURED',
      message:
        'Belum terhubung ke SAUM. Konfigurasikan lokasi berkas read-only atau endpoint read-only SAUM terlebih dahulu.',
      previewCounts: null,
    };
  }

  try {
    const normalized = await readSaumSourceOnce(row);
    let osPermissionSummary = 'HTTP GET Read-Only terverifikasi (tanpa operasi tulis).';

    if (normalized.sourceMode === 'FILE_READ_ONLY') {
      const resolved = path.resolve(dataPath);
      let isWritableByProcess = false;
      try {
        fs.accessSync(resolved, fs.constants.W_OK);
        isWritableByProcess = true;
      } catch {
        isWritableByProcess = false;
      }
      osPermissionSummary = isWritableByProcess
        ? 'Berkas terbaca; konektor menggunakan mode flag "r" (read-only), disarankan membatasi izin OS ke read-only (chmod 444).'
        : 'Izin filesystem terverifikasi murni READ-ONLY (tanpa hak tulis).';
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE integration_settings SET connection_status = 'CONNECTED_READ_ONLY', last_error_message = NULL, updated_at = ? WHERE integration_name = 'SAUM_READ_ONLY'"
    ).run(now);

    return {
      connected: true,
      sourceMode: normalized.sourceMode,
      readOnlyVerified: true,
      osPermissionSummary,
      connectionStatus: 'CONNECTED_READ_ONLY',
      message: 'Koneksi READ-ONLY ke sumber data SAUM berhasil diverifikasi.',
      previewCounts: {
        supervisors: normalized.supervisors.length,
        schedules: normalized.schedules.length,
        rooms: normalized.rooms.length,
        subjects: normalized.subjects.length,
        assignments: normalized.assignments.length,
        students: normalized.students.length,
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Gagal menghubungi sumber data SAUM.';
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE integration_settings SET connection_status = 'ERROR', last_error_message = ?, updated_at = ? WHERE integration_name = 'SAUM_READ_ONLY'"
    ).run(errMsg, now);

    return {
      connected: false,
      sourceMode: dataPath ? 'FILE_READ_ONLY' : 'HTTP_READ_ONLY',
      readOnlyVerified: false,
      osPermissionSummary: 'Pemeriksaan akses baca gagal.',
      connectionStatus: 'ERROR',
      message: errMsg,
      previewCounts: null,
    };
  }
}

export function recalculateSupervisorAssignments(): void {
  const now = new Date().toISOString();
  const linkedProfiles = db
    .prepare(
      'SELECT id, user_id, saum_supervisor_id, assignment_status FROM supervisor_profiles WHERE saum_supervisor_id IS NOT NULL'
    )
    .all() as unknown as Array<{
    id: string;
    user_id: string;
    saum_supervisor_id: string;
    assignment_status: string;
  }>;

  const checkStmt = db.prepare(`
    SELECT COUNT(*) as cnt FROM saum_supervisor_assignments
    WHERE is_active_in_source = 1 AND (pengawas1_id = ? OR pengawas2_id = ?)
  `);
  const updateStmt = db.prepare(
    'UPDATE supervisor_profiles SET assignment_status = ?, updated_at = ? WHERE id = ?'
  );

  for (const profile of linkedProfiles) {
    const cnt = (checkStmt.get(profile.saum_supervisor_id, profile.saum_supervisor_id) as { cnt: number }).cnt;
    const nextStatus = cnt > 0 ? 'ASSIGNED' : 'NOT_ASSIGNED';
    if (profile.assignment_status !== nextStatus) {
      updateStmt.run(nextStatus, now, profile.id);
    }
  }
}

export async function syncFromSaumReadOnly(
  triggeredByUserId: string | null,
  triggerType: 'MANUAL' | 'SCHEDULED',
  usernameSnapshot?: string | null
): Promise<{
  success: boolean;
  syncLog: SaumSyncLogRow;
  counts: SaumEntityCounts;
  message: string;
}> {
  const startedAt = Date.now();
  const row = getIntegrationRow();
  const now = new Date().toISOString();

  try {
    const payload = await readSaumSourceOnce(row);

    db.exec('BEGIN');
    try {
      const markStaleAndUpsert = (
        table: string,
        saumIds: string[],
        upsertFn: () => void
      ) => {
        db.prepare(`UPDATE ${table} SET is_active_in_source = 0, updated_at = ?`).run(now);
        if (saumIds.length > 0) {
          upsertFn();
        }
      };

      markStaleAndUpsert(
        'saum_supervisors',
        payload.supervisors.map((s) => s.saumId),
        () => {
          const stmt = db.prepare(`
            INSERT INTO saum_supervisors (id, saum_id, nama, nip, asal_madrasah, no_hp, status, synced_at, is_active_in_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(saum_id) DO UPDATE SET
              nama = excluded.nama,
              nip = excluded.nip,
              asal_madrasah = excluded.asal_madrasah,
              no_hp = excluded.no_hp,
              status = excluded.status,
              synced_at = excluded.synced_at,
              is_active_in_source = 1,
              updated_at = excluded.updated_at
          `);
          for (const s of payload.supervisors) {
            stmt.run(
              generateId('ssup'),
              s.saumId,
              s.nama,
              s.nip,
              s.asalMadrasah,
              s.noHp,
              s.status,
              now,
              now,
              now
            );
          }
        }
      );

      markStaleAndUpsert(
        'saum_exam_subjects',
        payload.subjects.map((s) => s.saumId),
        () => {
          const stmt = db.prepare(`
            INSERT INTO saum_exam_subjects (id, saum_id, kode_mapel, nama_mapel, synced_at, is_active_in_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(saum_id) DO UPDATE SET
              kode_mapel = excluded.kode_mapel,
              nama_mapel = excluded.nama_mapel,
              synced_at = excluded.synced_at,
              is_active_in_source = 1,
              updated_at = excluded.updated_at
          `);
          for (const s of payload.subjects) {
            stmt.run(generateId('ssub'), s.saumId, s.kodeMapel, s.namaMapel, now, now, now);
          }
        }
      );

      markStaleAndUpsert(
        'saum_exam_rooms',
        payload.rooms.map((r) => r.saumId),
        () => {
          const stmt = db.prepare(`
            INSERT INTO saum_exam_rooms (id, saum_id, kode_ruang, nama_ruang, kapasitas, lokasi, synced_at, is_active_in_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(saum_id) DO UPDATE SET
              kode_ruang = excluded.kode_ruang,
              nama_ruang = excluded.nama_ruang,
              kapasitas = excluded.kapasitas,
              lokasi = excluded.lokasi,
              synced_at = excluded.synced_at,
              is_active_in_source = 1,
              updated_at = excluded.updated_at
          `);
          for (const r of payload.rooms) {
            stmt.run(
              generateId('srom'),
              r.saumId,
              r.kodeRuang,
              r.namaRuang,
              r.kapasitas,
              r.lokasi,
              now,
              now,
              now
            );
          }
        }
      );

      markStaleAndUpsert(
        'saum_exam_schedules',
        payload.schedules.map((s) => s.saumId),
        () => {
          const stmt = db.prepare(`
            INSERT INTO saum_exam_schedules (id, saum_id, mapel_id, tanggal, hari, sesi, waktu_mulai, waktu_selesai, ruang_ids_json, synced_at, is_active_in_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(saum_id) DO UPDATE SET
              mapel_id = excluded.mapel_id,
              tanggal = excluded.tanggal,
              hari = excluded.hari,
              sesi = excluded.sesi,
              waktu_mulai = excluded.waktu_mulai,
              waktu_selesai = excluded.waktu_selesai,
              ruang_ids_json = excluded.ruang_ids_json,
              synced_at = excluded.synced_at,
              is_active_in_source = 1,
              updated_at = excluded.updated_at
          `);
          for (const s of payload.schedules) {
            stmt.run(
              generateId('ssch'),
              s.saumId,
              s.mapelId,
              s.tanggal,
              s.hari,
              s.sesi,
              s.waktuMulai,
              s.waktuSelesai,
              JSON.stringify(s.ruangIds),
              now,
              now,
              now
            );
          }
        }
      );

      markStaleAndUpsert(
        'saum_supervisor_assignments',
        payload.assignments.map((a) => a.saumId),
        () => {
          const stmt = db.prepare(`
            INSERT INTO saum_supervisor_assignments (id, saum_id, schedule_id, room_id, sesi, pengawas1_id, pengawas2_id, synced_at, is_active_in_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(saum_id) DO UPDATE SET
              schedule_id = excluded.schedule_id,
              room_id = excluded.room_id,
              sesi = excluded.sesi,
              pengawas1_id = excluded.pengawas1_id,
              pengawas2_id = excluded.pengawas2_id,
              synced_at = excluded.synced_at,
              is_active_in_source = 1,
              updated_at = excluded.updated_at
          `);
          for (const a of payload.assignments) {
            stmt.run(
              generateId('sasg'),
              a.saumId,
              a.scheduleId,
              a.roomId,
              a.sesi,
              a.pengawas1Id,
              a.pengawas2Id,
              now,
              now,
              now
            );
          }
        }
      );

      markStaleAndUpsert(
        'saum_students',
        payload.students.map((st) => st.saumId),
        () => {
          const stmt = db.prepare(`
            INSERT INTO saum_students (id, saum_id, nis, nisn, nama, kelas, nomor_peserta, sesi, room_id, synced_at, is_active_in_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(saum_id) DO UPDATE SET
              nis = excluded.nis,
              nisn = excluded.nisn,
              nama = excluded.nama,
              kelas = excluded.kelas,
              nomor_peserta = excluded.nomor_peserta,
              sesi = excluded.sesi,
              room_id = excluded.room_id,
              synced_at = excluded.synced_at,
              is_active_in_source = 1,
              updated_at = excluded.updated_at
          `);
          for (const st of payload.students) {
            stmt.run(
              generateId('sstd'),
              st.saumId,
              st.nis,
              st.nisn,
              st.nama,
              st.kelas,
              st.nomorPeserta,
              st.sesi,
              st.roomId,
              now,
              now,
              now
            );
          }
        }
      );

      recalculateSupervisorAssignments();

      db.prepare(`
        UPDATE integration_settings SET
          connection_status = 'CONNECTED_READ_ONLY',
          last_sync_at = ?,
          sync_status = 'SUCCESS',
          consecutive_failures = 0,
          last_error_message = NULL,
          updated_at = ?
        WHERE integration_name = 'SAUM_READ_ONLY'
      `).run(now, now);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    const durationMs = Date.now() - startedAt;
    const counts = getSyncedEntityCounts();
    const logId = generateId('syn');
    const syncLog: SaumSyncLogRow = {
      id: logId,
      triggered_by_user_id: triggeredByUserId,
      trigger_type: triggerType,
      source_mode: payload.sourceMode,
      status: 'SUCCESS',
      supervisors_count: counts.supervisors,
      schedules_count: counts.schedules,
      rooms_count: counts.rooms,
      subjects_count: counts.subjects,
      assignments_count: counts.assignments,
      students_count: counts.students,
      error_message: null,
      duration_ms: durationMs,
      created_at: now,
    };

    db.prepare(`
      INSERT INTO saum_sync_logs (
        id, triggered_by_user_id, trigger_type, source_mode, status,
        supervisors_count, schedules_count, rooms_count, subjects_count,
        assignments_count, students_count, error_message, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      syncLog.id,
      syncLog.triggered_by_user_id,
      syncLog.trigger_type,
      syncLog.source_mode,
      syncLog.status,
      syncLog.supervisors_count,
      syncLog.schedules_count,
      syncLog.rooms_count,
      syncLog.subjects_count,
      syncLog.assignments_count,
      syncLog.students_count,
      syncLog.duration_ms,
      syncLog.created_at
    );

    recordAuditLog({
      userId: triggeredByUserId,
      usernameSnapshot: usernameSnapshot ?? 'SYSTEM',
      activity: 'SAUM_SYNC_SUCCESS',
      description: `Sinkronisasi READ-ONLY SAUM (${triggerType}) berhasil: ${counts.supervisors} pengawas, ${counts.schedules} jadwal, ${counts.rooms} ruang, ${counts.subjects} mapel, ${counts.assignments} penugasan, ${counts.students} peserta.`,
    });

    return {
      success: true,
      syncLog,
      counts,
      message: 'Sinkronisasi data SAUM (READ-ONLY) berhasil diselesaikan.',
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = err instanceof Error ? err.message : 'Sinkronisasi SAUM gagal.';
    const nextFailures = (row.consecutive_failures || 0) + 1;

    db.prepare(`
      UPDATE integration_settings SET
        connection_status = CASE WHEN saum_data_path = '' AND saum_base_url = '' THEN 'NOT_CONFIGURED' ELSE 'ERROR' END,
        sync_status = 'FAILED',
        consecutive_failures = ?,
        last_error_message = ?,
        updated_at = ?
      WHERE integration_name = 'SAUM_READ_ONLY'
    `).run(nextFailures, errorMessage, now);

    const sourceMode = row.saum_data_path.trim()
      ? 'FILE_READ_ONLY'
      : row.saum_base_url.trim()
        ? 'HTTP_READ_ONLY'
        : 'UNAVAILABLE';

    const syncLog: SaumSyncLogRow = {
      id: generateId('syn'),
      triggered_by_user_id: triggeredByUserId,
      trigger_type: triggerType,
      sourceMode,
      source_mode: sourceMode,
      status: 'FAILED',
      supervisors_count: 0,
      schedules_count: 0,
      rooms_count: 0,
      subjects_count: 0,
      assignments_count: 0,
      students_count: 0,
      error_message: errorMessage,
      duration_ms: durationMs,
      created_at: now,
    } as SaumSyncLogRow;

    db.prepare(`
      INSERT INTO saum_sync_logs (
        id, triggered_by_user_id, trigger_type, source_mode, status,
        supervisors_count, schedules_count, rooms_count, subjects_count,
        assignments_count, students_count, error_message, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, 'FAILED', 0, 0, 0, 0, 0, 0, ?, ?, ?)
    `).run(
      syncLog.id,
      syncLog.triggered_by_user_id,
      syncLog.trigger_type,
      syncLog.source_mode,
      syncLog.error_message,
      syncLog.duration_ms,
      syncLog.created_at
    );

    recordAuditLog({
      userId: triggeredByUserId,
      usernameSnapshot: usernameSnapshot ?? 'SYSTEM',
      activity: 'SAUM_SYNC_FAILED',
      description: `Sinkronisasi READ-ONLY SAUM (${triggerType}) gagal: ${errorMessage}`,
    });

    return {
      success: false,
      syncLog,
      counts: getSyncedEntityCounts(),
      message: errorMessage,
    };
  }
}

export function searchSaumSupervisorsReadOnly(query: string): SaumSearchResult {
  const totalSynced = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM saum_supervisors WHERE is_active_in_source = 1')
      .get() as { cnt: number }
  ).cnt;

  if (totalSynced === 0) {
    return {
      saumAvailable: false,
      totalSyncedSupervisors: 0,
      message:
        'Belum ada data pengawas SAUM yang tersinkronisasi di SIPENGUJI. Admin dapat menghubungkan sumber SAUM dan menjalankan sinkronisasi READ-ONLY terlebih dahulu, atau Anda dapat melanjutkan pendaftaran mandiri untuk diverifikasi Admin.',
      results: [],
    };
  }

  const trimmed = query.trim();
  const rows = trimmed
    ? (db
        .prepare(`
          SELECT saum_id, nama, nip, asal_madrasah, no_hp, status
          FROM saum_supervisors
          WHERE is_active_in_source = 1 AND (nama LIKE ? OR nip LIKE ?)
          ORDER BY nama ASC
          LIMIT 20
        `)
        .all(`%${trimmed}%`, `%${trimmed}%`) as unknown as Array<{
        saum_id: string;
        nama: string;
        nip: string | null;
        asal_madrasah: string | null;
        no_hp: string | null;
        status: string | null;
      }>)
    : [];

  return {
    saumAvailable: true,
    totalSyncedSupervisors: totalSynced,
    message:
      rows.length > 0
        ? `Ditemukan ${rows.length} data pengawas dari referensi sinkronisasi SAUM.`
        : 'Tidak ada nama pengawas yang cocok pada referensi SAUM tersinkronisasi.',
    results: rows.map((r) => ({
      saumSupervisorId: r.saum_id,
      namaLengkap: r.nama,
      nipMasked: maskIdentifier(r.nip, 4),
      asalMadrasah: r.asal_madrasah,
      status: r.status,
      hasPhoneOnRecord: Boolean(r.no_hp),
    })),
  };
}

let schedulerStarted = false;

export function startSaumPeriodicScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Check once per minute; only syncs when auto_sync_enabled=1, interval >= 5m, and consecutive_failures < 3
  const timer = setInterval(() => {
    const row = getIntegrationRow();
    if (!row || row.auto_sync_enabled !== 1) return;
    if ((row.consecutive_failures || 0) >= 3) return;
    if (!row.saum_data_path.trim() && !row.saum_base_url.trim()) return;

    const intervalMs = Math.max(5, row.sync_interval_minutes || 15) * 60 * 1000;
    const lastMs = row.last_sync_at ? new Date(row.last_sync_at).getTime() : 0;
    if (Date.now() - lastMs >= intervalMs) {
      void syncFromSaumReadOnly(null, 'SCHEDULED', 'SCHEDULER');
    }
  }, 60_000);

  timer.unref();
}
