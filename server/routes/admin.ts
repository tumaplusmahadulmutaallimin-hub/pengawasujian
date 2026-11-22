import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/database.ts';
import {
  getSaumSettingsSafe,
  getSyncedEntityCounts,
  syncFromSaumReadOnly,
  testSaumConnectionReadOnly,
} from '../integrations/saumConnector.ts';
import { authenticateSession, requireRole } from '../middleware/auth.ts';
import {
  createSipengujiBackupArchive,
  getBackupSummary,
  restoreSipengujiBackupArchive,
} from '../services/backupService.ts';
import {
  getAdminDocumentDetail,
  listAdminDocuments,
  resolveStoredDocumentFile,
  setAssignmentDocumentPic,
  verifyAdminDocument,
} from '../services/documentService.ts';
import {
  getAdminIncidentDetail,
  listAdminIncidents,
  resolveStoredIncidentAttachment,
  reviewAdminIncident,
} from '../services/incidentService.ts';
import { createNotification } from '../services/notificationService.ts';
import {
  getSaumFreshnessInfo,
  listAdminRoomsDistribution,
  listAdminSchedules,
  queryExamStudents,
} from '../services/saumViewService.ts';
import type { ScheduleDateRange } from '../utils/scheduleTime.ts';
import type {
  AccountStatus,
  AuditLogRow,
  SaumSyncLogRow,
  SupervisorProfileRow,
  UserRow,
} from '../types.ts';
import { extractClientIp, recordAuditLog } from '../utils/audit.ts';
import { encryptSecret, generateId, hashPassword, hashToken } from '../utils/crypto.ts';
import { getMaxUploadMb, streamPrivateFileResponse } from '../utils/fileSecurity.ts';

export const adminRouter = Router();

const backupUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

adminRouter.use(authenticateSession, requireRole('ADMIN'));

function computeOperationalStatus(user: UserRow, profile: SupervisorProfileRow | null) {
  const profileStatus =
    user.profile_completed === 1 && profile?.profile_completed === 1 ? 'COMPLETE' : 'INCOMPLETE';
  const assignmentStatus = profile?.assignment_status ?? 'NOT_ASSIGNED';
  const operationalAccessStatus =
    user.account_status === 'ACTIVE' &&
    profileStatus === 'COMPLETE' &&
    assignmentStatus === 'ASSIGNED'
      ? 'AVAILABLE'
      : 'LOCKED';

  return { profileStatus, assignmentStatus, operationalAccessStatus };
}

adminRouter.get('/dashboard', (_req, res) => {
  const totalPengawas = (
    db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'PENGAWAS'").get() as { cnt: number }
  ).cnt;
  const activePengawas = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'PENGAWAS' AND account_status = 'ACTIVE'")
      .get() as { cnt: number }
  ).cnt;
  const pendingPengawas = (
    db
      .prepare(
        "SELECT COUNT(*) as cnt FROM users WHERE role = 'PENGAWAS' AND account_status = 'PENDING_VERIFICATION'"
      )
      .get() as { cnt: number }
  ).cnt;
  const inactivePengawas = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'PENGAWAS' AND account_status = 'INACTIVE'")
      .get() as { cnt: number }
  ).cnt;
  const suspendedPengawas = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'PENGAWAS' AND account_status = 'SUSPENDED'")
      .get() as { cnt: number }
  ).cnt;
  const completedProfiles = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'PENGAWAS' AND profile_completed = 1")
      .get() as { cnt: number }
  ).cnt;
  const assignedPengawas = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM supervisor_profiles WHERE assignment_status = 'ASSIGNED'")
      .get() as { cnt: number }
  ).cnt;

  const integration = getSaumSettingsSafe();
  const saumCounts = getSyncedEntityCounts();
  const saumFreshness = getSaumFreshnessInfo();
  const allSchedulesData = listAdminSchedules({ range: 'all' });
  const jakartaToday = allSchedulesData.jakartaToday;

  const todaySchedules = allSchedulesData.schedules.filter((s) => s.tanggal === jakartaToday);
  const upcomingSchedules = allSchedulesData.schedules.filter(
    (s) => s.scheduleStatus === 'AKAN_DATANG'
  );
  const ongoingSchedules = allSchedulesData.schedules.filter(
    (s) => s.scheduleStatus === 'BERLANGSUNG'
  );
  const completedSchedules = allSchedulesData.schedules.filter((s) => s.scheduleStatus === 'SELESAI');

  const usedRoomIds = new Set<string>();
  const activeSupIds = new Set<string>();
  let studentsInSchedulesCount = 0;

  for (const sch of allSchedulesData.schedules) {
    studentsInSchedulesCount += sch.studentCount;
    for (const rm of sch.rooms) {
      usedRoomIds.add(rm.roomId);
      if (rm.pengawas1Id) activeSupIds.add(rm.pengawas1Id);
      if (rm.pengawas2Id) activeSupIds.add(rm.pengawas2Id);
    }
  }

  const recentLogs = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8')
    .all() as unknown as AuditLogRow[];

  const docSummary = listAdminDocuments({});
  const incidentSummary = listAdminIncidents({});

  res.json({
    stats: {
      totalPengawas,
      activePengawas,
      pendingPengawas,
      inactivePengawas,
      suspendedPengawas,
      completedProfiles,
      incompleteProfiles: Math.max(0, totalPengawas - completedProfiles),
      assignedPengawas,
      unassignedPengawas: Math.max(0, totalPengawas - assignedPengawas),
      totalSchedules: saumCounts.schedules,
      totalSubjects: saumCounts.subjects,
      totalRooms: saumCounts.rooms,
      totalStudents: saumCounts.students,
      totalAssignments: saumCounts.assignments,
    },
    jakartaToday,
    examSummary: {
      todayCount: todaySchedules.length,
      upcomingCount: upcomingSchedules.length,
      ongoingCount: ongoingSchedules.length,
      completedCount: completedSchedules.length,
      roomsUsedCount: usedRoomIds.size,
      assignedSupervisorsActiveCount: activeSupIds.size,
      studentsInSchedulesCount,
    },
    documentStats: docSummary.stats,
    incidentStats: incidentSummary.stats,
    saumFreshness,
    schedules: allSchedulesData.schedules,
    integration,
    saumCounts,
    recentLogs,
  });
});

adminRouter.get('/supervisors', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const madrasahFilter =
    typeof req.query.madrasah === 'string' ? req.query.madrasah.trim().toLowerCase() : '';
  const profileStatusFilter =
    typeof req.query.profileStatus === 'string' ? req.query.profileStatus.toUpperCase() : 'ALL';
  const assignmentStatusFilter =
    typeof req.query.assignmentStatus === 'string'
      ? req.query.assignmentStatus.toUpperCase()
      : 'ALL';

  const assignmentCounts = new Map<string, number>();
  for (const row of db
    .prepare(
      'SELECT pengawas1_id, pengawas2_id FROM saum_supervisor_assignments WHERE is_active_in_source = 1'
    )
    .all() as unknown as Array<{ pengawas1_id: string | null; pengawas2_id: string | null }>) {
    if (row.pengawas1_id) {
      assignmentCounts.set(row.pengawas1_id, (assignmentCounts.get(row.pengawas1_id) || 0) + 1);
    }
    if (row.pengawas2_id && row.pengawas2_id !== row.pengawas1_id) {
      assignmentCounts.set(row.pengawas2_id, (assignmentCounts.get(row.pengawas2_id) || 0) + 1);
    }
  }

  const rows = db
    .prepare(`
      SELECT u.*, sp.id as sp_id, sp.saum_supervisor_id, sp.nama_lengkap, sp.nip, sp.nik,
             sp.jenis_kelamin, sp.tempat_lahir, sp.tanggal_lahir, sp.alamat, sp.no_whatsapp,
             sp.email as profile_email, sp.asal_madrasah, sp.jabatan, sp.mata_pelajaran,
             sp.foto_profil, sp.profile_completed as sp_profile_completed, sp.assignment_status
      FROM users u
      LEFT JOIN supervisor_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'PENGAWAS'
      ORDER BY u.created_at DESC
    `)
    .all() as any[];

  const madrasahSet = new Set<string>();
  const allMapped = rows.map((r) => {
    if (r.asal_madrasah && String(r.asal_madrasah).trim()) {
      madrasahSet.add(String(r.asal_madrasah).trim());
    }
    const profile: SupervisorProfileRow | null = r.sp_id
      ? {
          id: r.sp_id,
          user_id: r.id,
          saum_supervisor_id: r.saum_supervisor_id,
          nama_lengkap: r.nama_lengkap,
          nip: r.nip,
          nik: r.nik,
          jenis_kelamin: r.jenis_kelamin,
          tempat_lahir: r.tempat_lahir,
          tanggal_lahir: r.tanggal_lahir,
          alamat: r.alamat,
          no_whatsapp: r.no_whatsapp,
          email: r.profile_email,
          asal_madrasah: r.asal_madrasah,
          jabatan: r.jabatan,
          mata_pelajaran: r.mata_pelajaran,
          foto_profil: r.foto_profil,
          profile_completed: r.sp_profile_completed,
          assignment_status: r.assignment_status,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }
      : null;
    const computed = computeOperationalStatus(r as UserRow, profile);
    const assignmentCount = r.saum_supervisor_id
      ? assignmentCounts.get(r.saum_supervisor_id) ?? 0
      : 0;
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      accountStatus: r.account_status as AccountStatus,
      profileCompleted: Boolean(r.profile_completed === 1),
      profileStatus: computed.profileStatus,
      assignmentStatus: computed.assignmentStatus,
      operationalAccessStatus: computed.operationalAccessStatus,
      assignmentCount,
      lastLogin: r.last_login,
      createdAt: r.created_at,
      profile,
    };
  });

  const mapped = allMapped.filter((item) => {
    const matchStatus = statusFilter === 'ALL' || item.accountStatus === statusFilter;
    const matchProfile =
      profileStatusFilter === 'ALL' || item.profileStatus === profileStatusFilter;
    const matchAssignment =
      assignmentStatusFilter === 'ALL' || item.assignmentStatus === assignmentStatusFilter;
    const matchMadrasah =
      !madrasahFilter ||
      (item.profile?.asal_madrasah ?? '').toLowerCase() === madrasahFilter;
    const matchSearch =
      !search ||
      item.username.toLowerCase().includes(search) ||
      (item.profile?.nama_lengkap ?? '').toLowerCase().includes(search) ||
      (item.profile?.nip ?? '').toLowerCase().includes(search) ||
      (item.profile?.asal_madrasah ?? '').toLowerCase().includes(search);
    return matchStatus && matchProfile && matchAssignment && matchMadrasah && matchSearch;
  });

  res.json({
    supervisors: mapped,
    madrasahOptions: Array.from(madrasahSet).sort((a, b) => a.localeCompare(b, 'id')),
  });
});

adminRouter.get('/schedules', (req, res) => {
  const rangeParam = typeof req.query.range === 'string' ? req.query.range.toLowerCase() : 'all';
  const range: ScheduleDateRange = ['today', 'tomorrow', 'week', 'month'].includes(rangeParam)
    ? (rangeParam as ScheduleDateRange)
    : 'all';
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
  const session = typeof req.query.session === 'string' ? req.query.session : undefined;
  const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const incompleteOnly = req.query.incompleteOnly === 'true';

  const result = listAdminSchedules({
    range,
    subjectId,
    session,
    roomId,
    status,
    search,
    incompleteOnly,
  });

  res.json({
    ...result,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

adminRouter.get('/rooms', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const unassignedOnly = req.query.unassignedOnly === 'true';
  const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'namaRuang';
  const sortBy = ['namaRuang', 'studentCount', 'assignmentCount'].includes(sortByRaw)
    ? (sortByRaw as 'namaRuang' | 'studentCount' | 'assignmentCount')
    : 'namaRuang';
  const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

  const result = listAdminRoomsDistribution({
    search,
    unassignedOnly,
    sortBy,
    sortDir,
  });

  res.json({
    ...result,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

adminRouter.get('/assignments', (_req, res) => {
  const schedules = listAdminSchedules({ range: 'all' }).schedules;
  const assignments = schedules.flatMap((sch) =>
    sch.rooms
      .filter((rm) => rm.assignmentId)
      .map((rm) => ({
        assignmentId: rm.assignmentId!,
        scheduleId: sch.scheduleId,
        tanggal: sch.tanggal,
        hari: sch.hari,
        sesi: sch.sesi,
        waktuMulai: sch.waktuMulai,
        waktuSelesai: sch.waktuSelesai,
        mapelId: sch.mapelId,
        kodeMapel: sch.kodeMapel,
        namaMapel: sch.namaMapel,
        roomId: rm.roomId,
        kodeRuang: rm.kodeRuang,
        namaRuang: rm.namaRuang,
        pengawas1Id: rm.pengawas1Id,
        pengawas1Nama: rm.pengawas1Nama,
        pengawas2Id: rm.pengawas2Id,
        pengawas2Nama: rm.pengawas2Nama,
        studentCount: rm.studentCount,
        scheduleStatus: sch.scheduleStatus,
      }))
  );
  res.json({ assignments, saumFreshness: getSaumFreshnessInfo() });
});

adminRouter.get('/students', (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const kelas = typeof req.query.kelas === 'string' ? req.query.kelas : undefined;
  const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
  const sesi = typeof req.query.sesi === 'string' ? req.query.sesi : undefined;
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
  const scheduleId = typeof req.query.scheduleId === 'string' ? req.query.scheduleId : undefined;

  const result = queryExamStudents({
    role: 'ADMIN',
    search,
    kelas,
    roomId,
    sesi,
    subjectId,
    scheduleId,
    page,
    limit,
  });

  res.json({
    ...result,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

adminRouter.get('/supervisors/:userId', (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE id = ? AND role = 'PENGAWAS' LIMIT 1")
    .get(req.params.userId) as unknown as UserRow | undefined;

  if (!user) {
    res.status(404).json({ error: 'Akun pengawas tidak ditemukan.' });
    return;
  }

  const profile = db
    .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ? LIMIT 1')
    .get(user.id) as unknown as SupervisorProfileRow | undefined;

  const computed = computeOperationalStatus(user, profile ?? null);

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    accountStatus: user.account_status,
    profileCompleted: Boolean(user.profile_completed === 1),
    profileStatus: computed.profileStatus,
    assignmentStatus: computed.assignmentStatus,
    operationalAccessStatus: computed.operationalAccessStatus,
    lastLogin: user.last_login,
    createdAt: user.created_at,
    profile: profile ?? null,
  });
});

adminRouter.post('/supervisors', (req, res) => {
  const ip = extractClientIp(req);
  const namaLengkap = typeof req.body?.namaLengkap === 'string' ? req.body.namaLengkap.trim() : '';
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const nip = typeof req.body?.nip === 'string' ? req.body.nip.trim() : '';
  const asalMadrasah = typeof req.body?.asalMadrasah === 'string' ? req.body.asalMadrasah.trim() : '';
  const mataPelajaran = typeof req.body?.mataPelajaran === 'string' ? req.body.mataPelajaran.trim() : '';
  const accountStatus: AccountStatus =
    req.body?.accountStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  if (!namaLengkap || !username || !password) {
    res.status(400).json({ error: 'Nama lengkap, username, dan password awal wajib diisi.' });
    return;
  }

  if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
    res.status(400).json({ error: 'Format username harus 4–32 karakter alfanumerik/titik/garis.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password minimal 8 karakter.' });
    return;
  }

  const dupUser = db.prepare('SELECT id FROM users WHERE username = ? LIMIT 1').get(username);
  if (dupUser) {
    res.status(409).json({ error: 'Username sudah terdaftar.' });
    return;
  }

  if (email) {
    const dupEmail = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
    if (dupEmail) {
      res.status(409).json({ error: 'Email sudah terdaftar.' });
      return;
    }
  }

  if (nip) {
    const dupNip = db.prepare('SELECT id FROM supervisor_profiles WHERE nip = ? LIMIT 1').get(nip);
    if (dupNip) {
      res.status(409).json({ error: 'NIP sudah digunakan oleh pengawas lain.' });
      return;
    }
  }

  const now = new Date().toISOString();
  const userId = generateId('usr');
  const profileId = generateId('prf');

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO users (
        id, username, email, password_hash, role, account_status, profile_completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'PENGAWAS', ?, 0, ?, ?)
    `).run(userId, username, email || null, hashPassword(password), accountStatus, now, now);

    db.prepare(`
      INSERT INTO supervisor_profiles (
        id, user_id, nama_lengkap, nip, email, asal_madrasah, mata_pelajaran,
        profile_completed, assignment_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'NOT_ASSIGNED', ?, ?)
    `).run(
      profileId,
      userId,
      namaLengkap,
      nip || null,
      email || null,
      asalMadrasah || null,
      mataPelajaran || null,
      now,
      now
    );
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Gagal membuat akun pengawas.' });
    return;
  }

  recordAuditLog({
    userId: req.auth!.user.id,
    usernameSnapshot: req.auth!.user.username,
    activity: 'ACCOUNT_CREATED',
    description: `Admin membuat akun pengawas "${username}" (${namaLengkap}) dengan status ${accountStatus}.`,
    ipAddress: ip,
  });

  res.status(201).json({ id: userId, username, accountStatus });
});

adminRouter.patch('/supervisors/:userId/status', (req, res) => {
  const targetUserId = req.params.userId;
  const nextStatus = req.body?.accountStatus as AccountStatus | undefined;

  if (
    !nextStatus ||
    !['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'].includes(nextStatus)
  ) {
    res.status(400).json({
      error: 'Status akun tidak valid. Gunakan ACTIVE, INACTIVE, SUSPENDED, atau PENDING_VERIFICATION.',
    });
    return;
  }

  const targetUser = db
    .prepare("SELECT * FROM users WHERE id = ? AND role = 'PENGAWAS' LIMIT 1")
    .get(targetUserId) as unknown as UserRow | undefined;

  if (!targetUser) {
    res.status(404).json({ error: 'Akun pengawas tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    now,
    targetUserId
  );

  if (nextStatus !== 'ACTIVE') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
  }

  recordAuditLog({
    userId: req.auth!.user.id,
    usernameSnapshot: req.auth!.user.username,
    activity: 'ACCOUNT_STATUS_CHANGED',
    description: `Admin mengubah status akun "${targetUser.username}" dari ${targetUser.account_status} menjadi ${nextStatus}.`,
    ipAddress: extractClientIp(req),
  });

  createNotification({
    userId: targetUserId,
    type: 'ACCOUNT_STATUS_CHANGED',
    title: `Status Akun Diperbarui: ${nextStatus}`,
    message: `Admin mengubah status akun Anda dari ${targetUser.account_status} menjadi ${nextStatus}.`,
    relatedEntityType: 'ACCOUNT',
    relatedEntityId: targetUserId,
  });

  res.json({ userId: targetUserId, accountStatus: nextStatus });
});

adminRouter.get('/integration', (_req, res) => {
  const settings = getSaumSettingsSafe();
  const counts = getSyncedEntityCounts();
  const syncLogs = db
    .prepare('SELECT * FROM saum_sync_logs ORDER BY created_at DESC LIMIT 20')
    .all() as unknown as SaumSyncLogRow[];

  res.json({
    settings,
    counts,
    syncLogs,
  });
});

adminRouter.put('/integration', (req, res) => {
  const saumBaseUrl =
    typeof req.body?.saumBaseUrl === 'string' ? req.body.saumBaseUrl.trim() : undefined;
  const saumDataPath =
    typeof req.body?.saumDataPath === 'string' ? req.body.saumDataPath.trim() : undefined;
  const newSaumSecret =
    typeof req.body?.saumSecret === 'string' ? req.body.saumSecret.trim() : '';
  const newRegCode =
    typeof req.body?.registrationCode === 'string' ? req.body.registrationCode.trim() : '';
  const autoSyncEnabled =
    typeof req.body?.autoSyncEnabled === 'boolean' ? (req.body.autoSyncEnabled ? 1 : 0) : undefined;
  const syncIntervalMinutes =
    typeof req.body?.syncIntervalMinutes === 'number'
      ? Math.max(5, Math.min(1440, Math.round(req.body.syncIntervalMinutes)))
      : undefined;

  if (saumBaseUrl) {
    try {
      const parsed = new URL(saumBaseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.status(400).json({ error: 'URL dasar SAUM harus menggunakan protokol http:// atau https://.' });
        return;
      }
      const lowerPath = parsed.pathname.toLowerCase();
      if (
        lowerPath.includes('/api/auth/login') ||
        lowerPath.includes('/api/state') ||
        lowerPath.includes('/api/backup')
      ) {
        res.status(400).json({
          error:
            'Endpoint /api/auth/login, /api/state, dan /api/backup dilarang digunakan untuk integrasi rutin.',
        });
        return;
      }
    } catch {
      res.status(400).json({ error: 'Format URL SAUM tidak valid.' });
      return;
    }
  }

  const current = db
    .prepare("SELECT * FROM integration_settings WHERE integration_name = 'SAUM_READ_ONLY' LIMIT 1")
    .get() as any;

  const nextUrl = saumBaseUrl !== undefined ? saumBaseUrl : current.saum_base_url;
  const nextPath = saumDataPath !== undefined ? saumDataPath : current.saum_data_path;
  const secretHash = newSaumSecret ? hashToken(newSaumSecret) : current.saum_secret_hash;
  const secretEnc = newSaumSecret ? encryptSecret(newSaumSecret) : current.saum_secret_enc;
  const regCodeHash = newRegCode ? hashToken(newRegCode) : current.registration_code_hash;
  const nextAutoSync = autoSyncEnabled !== undefined ? autoSyncEnabled : current.auto_sync_enabled;
  const nextInterval =
    syncIntervalMinutes !== undefined ? syncIntervalMinutes : current.sync_interval_minutes;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE integration_settings SET
      saum_base_url = ?,
      saum_data_path = ?,
      saum_secret_hash = ?,
      saum_secret_enc = ?,
      registration_code_hash = ?,
      auto_sync_enabled = ?,
      sync_interval_minutes = ?,
      consecutive_failures = 0,
      updated_at = ?
    WHERE integration_name = 'SAUM_READ_ONLY'
  `).run(nextUrl, nextPath, secretHash, secretEnc, regCodeHash, nextAutoSync, nextInterval, now);

  recordAuditLog({
    userId: req.auth!.user.id,
    usernameSnapshot: req.auth!.user.username,
    activity: 'INTEGRATION_SETTINGS_UPDATED',
    description: 'Admin memperbarui pengaturan konektor READ-ONLY SAUM.',
    ipAddress: extractClientIp(req),
  });

  res.json({
    settings: getSaumSettingsSafe(),
    counts: getSyncedEntityCounts(),
  });
});

adminRouter.post('/integration/test', async (req, res) => {
  const testResult = await testSaumConnectionReadOnly();

  recordAuditLog({
    userId: req.auth!.user.id,
    usernameSnapshot: req.auth!.user.username,
    activity: 'INTEGRATION_TEST',
    description: `Uji koneksi READ-ONLY SAUM: ${testResult.connectionStatus} (${testResult.message}).`,
    ipAddress: extractClientIp(req),
  });

  res.json({
    testResult,
    settings: getSaumSettingsSafe(),
    counts: getSyncedEntityCounts(),
  });
});

adminRouter.post('/integration/sync', async (req, res) => {
  const result = await syncFromSaumReadOnly(
    req.auth!.user.id,
    'MANUAL',
    req.auth!.user.username
  );

  const syncLogs = db
    .prepare('SELECT * FROM saum_sync_logs ORDER BY created_at DESC LIMIT 20')
    .all() as unknown as SaumSyncLogRow[];

  res.status(result.success ? 200 : 502).json({
    ...result,
    settings: getSaumSettingsSafe(),
    syncLogs,
  });
});

adminRouter.get('/integration/sync-logs', (_req, res) => {
  const syncLogs = db
    .prepare('SELECT * FROM saum_sync_logs ORDER BY created_at DESC LIMIT 50')
    .all() as unknown as SaumSyncLogRow[];

  res.json({
    syncLogs,
    counts: getSyncedEntityCounts(),
  });
});

adminRouter.get('/audit-logs', (req, res) => {
  const activity = typeof req.query.activity === 'string' ? req.query.activity.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const all = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200')
    .all() as unknown as AuditLogRow[];

  const filtered = all.filter((log) => {
    const matchActivity = !activity || activity === 'ALL' || log.activity === activity;
    const matchSearch =
      !search ||
      (log.username_snapshot ?? '').toLowerCase().includes(search) ||
      log.description.toLowerCase().includes(search) ||
      log.activity.toLowerCase().includes(search);
    return matchActivity && matchSearch;
  });

  res.json({ logs: filtered });
});

// ==================== PHASE 05: VERIFIKASI DOKUMEN PENGAWAS ====================

adminRouter.get('/documents', (req, res) => {
  const result = listAdminDocuments({
    date: typeof req.query.date === 'string' ? req.query.date : undefined,
    supervisorId:
      typeof req.query.supervisorId === 'string' ? req.query.supervisorId : undefined,
    roomId: typeof req.query.roomId === 'string' ? req.query.roomId : undefined,
    subjectId: typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined,
    session: typeof req.query.session === 'string' ? req.query.session : undefined,
    documentType:
      typeof req.query.documentType === 'string' ? req.query.documentType : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });

  res.json({
    ...result,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

adminRouter.get('/documents/:id', (req, res) => {
  const detail = getAdminDocumentDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    return;
  }

  const { targetFileRow: _ignored, ...safeDetail } = detail;
  res.json({
    document: safeDetail,
    maxUploadMb: getMaxUploadMb(),
  });
});

adminRouter.get('/documents/:id/preview', (req, res) => {
  const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
  const forceDownload = req.query.download === '1' || req.query.download === 'true';

  const detail = getAdminDocumentDetail(req.params.id, versionId);
  if (!detail || !detail.targetFileRow) {
    res.status(404).json({ error: 'Berkas dokumen tidak ditemukan.' });
    return;
  }

  const fullPath = resolveStoredDocumentFile(detail.targetFileRow.storage_path);
  if (!fullPath || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Berkas dokumen tidak ditemukan di penyimpanan privat.' });
    return;
  }

  streamPrivateFileResponse(
    res,
    fullPath,
    detail.targetFileRow.mime_type,
    detail.targetFileRow.original_filename,
    forceDownload
  );
});

adminRouter.post('/documents/:id/accept', (req, res) => {
  const adminNote = typeof req.body?.adminNote === 'string' ? req.body.adminNote : undefined;
  const result = verifyAdminDocument({
    documentId: req.params.id,
    decision: 'ACCEPTED',
    adminNote,
    adminUserId: req.auth!.user.id,
    adminUsername: req.auth!.user.username,
    ipAddress: extractClientIp(req),
  });

  if (result.ok === false) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    document: result.document,
    message: 'Dokumen telah diterima dan status verifikasi diperbarui menjadi ACCEPTED.',
  });
});

adminRouter.post('/documents/:id/request-revision', (req, res) => {
  const adminNote =
    typeof req.body?.adminNote === 'string'
      ? req.body.adminNote
      : typeof req.body?.note === 'string'
        ? req.body.note
        : '';

  const result = verifyAdminDocument({
    documentId: req.params.id,
    decision: 'REVISION_REQUIRED',
    adminNote,
    adminUserId: req.auth!.user.id,
    adminUsername: req.auth!.user.username,
    ipAddress: extractClientIp(req),
  });

  if (result.ok === false) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    document: result.document,
    message: 'Permintaan perbaikan dokumen telah dikirimkan kepada Pengawas.',
  });
});

adminRouter.post('/assignments/:saumAssignmentId/pic', (req, res) => {
  const designatedSaumSupervisorId =
    typeof req.body?.designatedSaumSupervisorId === 'string'
      ? req.body.designatedSaumSupervisorId
      : '';
  const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

  if (!designatedSaumSupervisorId.trim()) {
    res.status(400).json({ error: 'Pilih pengawas penanggung jawab dokumen terlebih dahulu.' });
    return;
  }

  const result = setAssignmentDocumentPic({
    saumAssignmentId: req.params.saumAssignmentId,
    designatedSaumSupervisorId,
    note,
    adminUserId: req.auth!.user.id,
    adminUsername: req.auth!.user.username,
    ipAddress: extractClientIp(req),
  });

  if (result.ok === false) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    ...result,
    message: `Penanggung jawab dokumen berhasil dialihkan ke ${result.picNama}.`,
  });
});

adminRouter.put('/settings/upload-limit', (req, res) => {
  const rawLimit = Number(req.body?.maxUploadMb);
  if (!Number.isFinite(rawLimit) || rawLimit < 1 || rawLimit > 25) {
    res.status(400).json({ error: 'Batas ukuran file harus antara 1 MB sampai 25 MB.' });
    return;
  }

  const maxUploadMb = Math.round(rawLimit);
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE integration_settings SET max_upload_mb = ?, updated_at = ? WHERE integration_name = 'SAUM_READ_ONLY'"
  ).run(maxUploadMb, now);

  recordAuditLog({
    userId: req.auth!.user.id,
    usernameSnapshot: req.auth!.user.username,
    activity: 'UPLOAD_LIMIT_UPDATED',
    description: `Admin memperbarui batas maksimal ukuran file upload menjadi ${maxUploadMb} MB.`,
    ipAddress: extractClientIp(req),
  });

  res.json({
    success: true,
    maxUploadMb,
    message: `Batas maksimal ukuran file diperbarui menjadi ${maxUploadMb} MB.`,
  });
});

// ==================== PHASE 05: MONITORING LAPORAN KEJADIAN ====================

adminRouter.get('/incidents', (req, res) => {
  const result = listAdminIncidents({
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    date: typeof req.query.date === 'string' ? req.query.date : undefined,
    roomId: typeof req.query.roomId === 'string' ? req.query.roomId : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });

  res.json({
    ...result,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

adminRouter.get('/incidents/:id', (req, res) => {
  const detail = getAdminIncidentDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: 'Laporan kejadian tidak ditemukan.' });
    return;
  }
  res.json({ incident: detail.incident });
});

adminRouter.get('/incidents/:id/attachment', (req, res) => {
  const detail = getAdminIncidentDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: 'Laporan kejadian tidak ditemukan.' });
    return;
  }
  if (!detail.row.attachment_path || !detail.row.attachment_mime_type) {
    res.status(404).json({ error: 'Laporan ini tidak memiliki lampiran berkas.' });
    return;
  }

  const fullPath = resolveStoredIncidentAttachment(detail.row.attachment_path);
  if (!fullPath || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Berkas lampiran tidak ditemukan di penyimpanan privat.' });
    return;
  }

  const forceDownload = req.query.download === '1' || req.query.download === 'true';
  streamPrivateFileResponse(
    res,
    fullPath,
    detail.row.attachment_mime_type,
    detail.row.attachment_original_name || 'lampiran',
    forceDownload
  );
});

adminRouter.post('/incidents/:id/review', (req, res) => {
  const nextStatusRaw = typeof req.body?.status === 'string' ? req.body.status : '';
  const adminNote = typeof req.body?.adminNote === 'string' ? req.body.adminNote : undefined;

  const result = reviewAdminIncident({
    incidentId: req.params.id,
    nextStatusRaw,
    adminNote,
    adminUserId: req.auth!.user.id,
    adminUsername: req.auth!.user.username,
    ipAddress: extractClientIp(req),
  });

  if (result.ok === false) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    incident: result.incident,
    message: `Status laporan kejadian diperbarui menjadi ${result.incident.statusLabel}.`,
  });
});

// ==================== PHASE 06: BACKUP & RESTORE MANDIRI SIPENGUJI ====================

adminRouter.get('/backup/summary', (_req, res) => {
  res.json(getBackupSummary());
});

adminRouter.get('/backup/download', (req, res) => {
  const archive = createSipengujiBackupArchive({
    requesterUserId: req.auth!.user.id,
    requesterUsername: req.auth!.user.username,
    ipAddress: extractClientIp(req),
  });

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(archive.buffer);
});

adminRouter.post(
  '/backup/restore',
  (req, res, next) => {
    backupUploadMiddleware.single('backup')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Ukuran berkas backup melebihi batas maksimal 50 MB.' });
          return;
        }
        res.status(400).json({ error: 'Gagal memproses berkas backup yang diunggah.' });
        return;
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Pilih berkas arsip backup (.json.gz atau .json) terlebih dahulu.' });
      return;
    }

    const confirmRestore = req.body?.confirmRestore === 'true' || req.body?.confirmRestore === true;

    const result = restoreSipengujiBackupArchive({
      archiveBuffer: req.file.buffer,
      confirmRestore,
      requesterUserId: req.auth!.user.id,
      requesterUsername: req.auth!.user.username,
      ipAddress: extractClientIp(req),
    });

    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      ...result,
      message: `Pemulihan data SIPENGUJI berhasil (${result.restoredTables} tabel dan ${result.restoredFiles} berkas privat dipulihkan). Database SAUM tetap terpisah dan aman.`,
    });
  }
);
