import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/database.ts';
import {
  authenticateSession,
  requireOperationalAccess,
  requireRole,
} from '../middleware/auth.ts';
import {
  getSupervisorDocumentForAccess,
  getSupervisorDocumentsOverview,
  resolveStoredDocumentFile,
  uploadInitialSupervisorDocument,
  uploadSupervisorDocumentRevision,
} from '../services/documentService.ts';
import {
  createIncidentReport,
  getSupervisorIncidentDetail,
  listSupervisorIncidents,
  resolveStoredIncidentAttachment,
} from '../services/incidentService.ts';
import {
  getAssignmentsForSaumSupervisor,
  getSaumFreshnessInfo,
  getSingleAssignmentForSupervisor,
  queryExamStudents,
} from '../services/saumViewService.ts';
import { extractClientIp, recordAuditLog } from '../utils/audit.ts';
import { getMaxUploadMb, streamPrivateFileResponse } from '../utils/fileSecurity.ts';
import {
  getJakartaNow,
  matchesJakartaDateRange,
  type ScheduleDateRange,
} from '../utils/scheduleTime.ts';

export const pengawasRouter = Router();

pengawasRouter.use(authenticateSession, requireRole('PENGAWAS'));

const HARD_UPLOAD_CAP_BYTES = 25 * 1024 * 1024;
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: HARD_UPLOAD_CAP_BYTES,
    files: 1,
  },
});

function handleSingleFileUpload(fieldName: string) {
  return (req: any, res: any, next: any) => {
    uploadMiddleware.single(fieldName)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: `Ukuran berkas terlalu besar. Batas maksimal upload aktif adalah ${getMaxUploadMb()} MB.`,
          });
          return;
        }
        res.status(400).json({ error: 'Gagal memproses berkas yang diunggah.' });
        return;
      }
      next();
    });
  };
}

pengawasRouter.get('/profile', (req, res) => {
  res.json(req.auth);
});

pengawasRouter.get('/dashboard', (req, res) => {
  const { user, profile } = req.auth!;
  const saumSupervisorId = profile?.saum_supervisor_id ?? null;
  const assignments = getAssignmentsForSaumSupervisor(saumSupervisorId);
  const jakartaNow = getJakartaNow();
  const saumFreshness = getSaumFreshnessInfo();

  const todayCount = assignments.filter((a) => a.tanggal === jakartaNow.dateStr).length;
  const upcomingCount = assignments.filter((a) => a.scheduleStatus === 'AKAN_DATANG').length;
  const ongoingCount = assignments.filter((a) => a.scheduleStatus === 'BERLANGSUNG').length;
  const completedCount = assignments.filter((a) => a.scheduleStatus === 'SELESAI').length;

  const nearestAssignment =
    assignments.find((a) => a.scheduleStatus === 'BERLANGSUNG') ??
    assignments.find((a) => a.scheduleStatus === 'AKAN_DATANG') ??
    assignments[assignments.length - 1] ??
    null;

  const docOverview = getSupervisorDocumentsOverview(saumSupervisorId);
  const allDocSlots = docOverview.assignments.flatMap((a) => [
    a.documents.ATTENDANCE_LIST,
    a.documents.EXAM_REPORT,
  ]);
  const incidentsData = listSupervisorIncidents(user.id, saumSupervisorId);
  const recentActivities = db
    .prepare(
      'SELECT id, activity, description, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8'
    )
    .all(user.id) as unknown as Array<{
    id: string;
    activity: string;
    description: string;
    created_at: string;
  }>;

  res.json({
    accountStatus: user.accountStatus,
    profileStatus: user.profileStatus,
    assignmentStatus: user.assignmentStatus,
    operationalAccessStatus: user.operationalAccessStatus,
    assignmentCount: assignments.length,
    saumLinked: Boolean(saumSupervisorId),
    saumIntegrationNote:
      assignments.length > 0
        ? `Ditemukan ${assignments.length} penugasan ruang ujian yang disinkronkan secara READ-ONLY dari SAUM.`
        : 'Belum ada penugasan pengawasan yang tersedia untuk akun Anda. Silakan periksa kembali setelah Admin melakukan sinkronisasi data jadwal dari SAUM.',
    jakartaToday: jakartaNow.dateStr,
    saumFreshness,
    summary: {
      total: assignments.length,
      today: todayCount,
      upcoming: upcomingCount,
      ongoing: ongoingCount,
      completed: completedCount,
    },
    documentSummary: {
      totalSlots: allDocSlots.length,
      notUploaded: allDocSlots.filter((d) => d.verificationStatus === 'NOT_UPLOADED').length,
      pendingReview: allDocSlots.filter((d) => d.verificationStatus === 'PENDING_REVIEW').length,
      accepted: allDocSlots.filter((d) => d.verificationStatus === 'ACCEPTED').length,
      revisionRequired: allDocSlots.filter((d) => d.verificationStatus === 'REVISION_REQUIRED')
        .length,
    },
    incidentsCount: incidentsData.incidents.length,
    nearestAssignment,
    recentActivities,
  });
});

function handleListMySchedulesOrAssignments(req: any, res: any) {
  const { user, profile } = req.auth!;
  const saumSupervisorId = profile?.saum_supervisor_id ?? null;
  const allMine = getAssignmentsForSaumSupervisor(saumSupervisorId);
  const jakartaNow = getJakartaNow();

  const rangeParam = typeof req.query.range === 'string' ? req.query.range.toLowerCase() : 'all';
  const range: ScheduleDateRange = ['today', 'tomorrow', 'week', 'month'].includes(rangeParam)
    ? (rangeParam as ScheduleDateRange)
    : 'all';
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId.trim() : '';
  const session = typeof req.query.session === 'string' ? req.query.session.trim() : '';
  const roomId = typeof req.query.roomId === 'string' ? req.query.roomId.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';

  const filtered = allMine.filter((item) => {
    if (!matchesJakartaDateRange(item.tanggal, range, jakartaNow)) return false;
    if (subjectId && item.mapelId !== subjectId) return false;
    if (session && item.sesi !== session) return false;
    if (roomId && item.roomId !== roomId) return false;
    if (status !== 'ALL' && item.scheduleStatus !== status) return false;
    return true;
  });

  const subjectMap = new Map<string, { saum_id: string; kode_mapel: string | null; nama_mapel: string }>();
  const roomMap = new Map<string, { saum_id: string; kode_ruang: string | null; nama_ruang: string }>();
  const sessionSet = new Set<string>();

  for (const a of allMine) {
    if (a.mapelId && !subjectMap.has(a.mapelId)) {
      subjectMap.set(a.mapelId, {
        saum_id: a.mapelId,
        kode_mapel: a.kodeMapel,
        nama_mapel: a.namaMapel,
      });
    }
    if (!roomMap.has(a.roomId)) {
      roomMap.set(a.roomId, {
        saum_id: a.roomId,
        kode_ruang: a.kodeRuang,
        nama_ruang: a.namaRuang,
      });
    }
    if (a.sesi) sessionSet.add(a.sesi);
  }

  res.json({
    assignmentStatus: user.assignmentStatus,
    operationalAccessStatus: user.operationalAccessStatus,
    saumSupervisorId,
    jakartaToday: jakartaNow.dateStr,
    saumFreshness: getSaumFreshnessInfo(),
    assignments: filtered,
    allAssignmentsCount: allMine.length,
    filterOptions: {
      subjects: Array.from(subjectMap.values()),
      rooms: Array.from(roomMap.values()),
      sessions: Array.from(sessionSet).sort(),
    },
  });
}

pengawasRouter.get('/assignments', handleListMySchedulesOrAssignments);
pengawasRouter.get('/schedules', handleListMySchedulesOrAssignments);

pengawasRouter.get('/assignments/:id', (req, res) => {
  const { user, profile } = req.auth!;
  const assignmentId = req.params.id;
  const check = getSingleAssignmentForSupervisor(assignmentId, profile?.saum_supervisor_id ?? null);

  if (check.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Detail penugasan tidak ditemukan.' });
    return;
  }

  if (check.status === 'FORBIDDEN' || !check.assignment) {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba mengakses detail penugasan ${assignmentId} yang bukan hak tugasnya.`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({
      error: 'Akses ditolak. Penugasan ini bukan milik Anda.',
    });
    return;
  }

  res.json({
    assignment: check.assignment,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

pengawasRouter.get('/assignments/:id/students', (req, res) => {
  const { user, profile } = req.auth!;
  const assignmentId = req.params.id;
  const check = getSingleAssignmentForSupervisor(assignmentId, profile?.saum_supervisor_id ?? null);

  if (check.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Penugasan tidak ditemukan.' });
    return;
  }

  if (check.status === 'FORBIDDEN' || !check.assignment) {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba mengakses peserta pada penugasan ${assignmentId} di luar ruang tugasnya.`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({
      error: 'Akses ditolak. Anda hanya dapat melihat peserta di ruang tugas Anda sendiri.',
    });
    return;
  }

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const kelas = typeof req.query.kelas === 'string' ? req.query.kelas : undefined;

  const result = queryExamStudents({
    role: 'PENGAWAS',
    saumSupervisorId: profile?.saum_supervisor_id ?? null,
    assignmentId,
    search,
    kelas,
    page,
    limit,
  });

  res.json({
    ...result,
    assignment: check.assignment,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

pengawasRouter.get('/students', (req, res) => {
  const { user, profile } = req.auth!;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const kelas = typeof req.query.kelas === 'string' ? req.query.kelas : undefined;
  const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
  const sesi = typeof req.query.sesi === 'string' ? req.query.sesi : undefined;
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
  const scheduleId = typeof req.query.scheduleId === 'string' ? req.query.scheduleId : undefined;
  const assignmentId =
    typeof req.query.assignmentId === 'string' ? req.query.assignmentId : undefined;

  const result = queryExamStudents({
    role: 'PENGAWAS',
    saumSupervisorId: profile?.saum_supervisor_id ?? null,
    search,
    kelas,
    roomId,
    sesi,
    subjectId,
    scheduleId,
    assignmentId,
    page,
    limit,
  });

  if (result.forbidden) {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba mengakses daftar peserta di luar ruang/jadwal tugasnya (${result.forbiddenReason}).`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({
      error:
        result.forbiddenReason ||
        'Akses ditolak. Anda hanya diizinkan melihat peserta pada ruang dan sesi penugasan Anda.',
    });
    return;
  }

  res.json({
    ...result,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

// ==================== PHASE 05: DOKUMEN PENGAWAS ====================

pengawasRouter.get('/documents', (req, res) => {
  const overview = getSupervisorDocumentsOverview(req.auth!.profile?.saum_supervisor_id ?? null);
  res.json({
    ...overview,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

pengawasRouter.get('/documents/:id', (req, res) => {
  const { user, profile } = req.auth!;
  const check = getSupervisorDocumentForAccess(
    req.params.id,
    profile?.saum_supervisor_id ?? null
  );

  if (check.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    return;
  }

  if (check.status === 'FORBIDDEN') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba melihat dokumen ${req.params.id} di luar penugasannya.`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({ error: 'Akses ditolak. Dokumen ini bukan bagian dari penugasan Anda.' });
    return;
  }

  res.json({
    document: check.slot,
    isDocumentPic: check.isDocumentPic,
    assignment: check.assignmentSummary,
    maxUploadMb: getMaxUploadMb(),
  });
});

pengawasRouter.get('/documents/:id/versions', (req, res) => {
  const { user, profile } = req.auth!;
  const check = getSupervisorDocumentForAccess(
    req.params.id,
    profile?.saum_supervisor_id ?? null
  );

  if (check.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    return;
  }

  if (check.status === 'FORBIDDEN') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba mengakses riwayat versi dokumen ${req.params.id} yang bukan hak tugasnya.`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({ error: 'Akses ditolak.' });
    return;
  }

  res.json({
    versions: check.slot?.versions ?? [],
    assignment: check.assignmentSummary,
  });
});

pengawasRouter.get('/documents/:id/preview', (req, res) => {
  const { user, profile } = req.auth!;
  const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
  const forceDownload = req.query.download === '1' || req.query.download === 'true';

  const check = getSupervisorDocumentForAccess(
    req.params.id,
    profile?.saum_supervisor_id ?? null,
    versionId
  );

  if (check.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Berkas dokumen tidak ditemukan.' });
    return;
  }

  if (check.status === 'FORBIDDEN') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba mengakses berkas dokumen ${req.params.id} di luar penugasannya.`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({ error: 'Akses ditolak.' });
    return;
  }

  if (!check.targetFileRow) {
    res.status(404).json({ error: 'Berkas dokumen tidak ditemukan.' });
    return;
  }

  const fullPath = resolveStoredDocumentFile(check.targetFileRow.storage_path);
  if (!fullPath || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Berkas dokumen tidak ditemukan di penyimpanan privat.' });
    return;
  }

  streamPrivateFileResponse(
    res,
    fullPath,
    check.targetFileRow.mime_type,
    check.targetFileRow.original_filename,
    forceDownload
  );
});

pengawasRouter.post(
  '/documents',
  handleSingleFileUpload('file'),
  (req, res) => {
    const { user, profile } = req.auth!;
    if (!req.file) {
      res.status(400).json({ error: 'Pilih berkas dokumen (JPG, JPEG, PNG, atau PDF) terlebih dahulu.' });
      return;
    }

    const assignmentIdInput =
      typeof req.body?.assignmentId === 'string' ? req.body.assignmentId : '';
    const documentTypeRaw =
      typeof req.body?.documentType === 'string' ? req.body.documentType : '';

    if (!assignmentIdInput.trim() || !documentTypeRaw.trim()) {
      res.status(400).json({ error: 'Penugasan dan jenis dokumen wajib dipilih.' });
      return;
    }

    const result = uploadInitialSupervisorDocument({
      assignmentIdInput,
      documentTypeRaw,
      requesterUserId: user.id,
      requesterUsername: user.username,
      requesterSaumSupervisorId: profile?.saum_supervisor_id ?? null,
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      declaredMime: req.file.mimetype,
      ipAddress: extractClientIp(req),
    });

    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      success: true,
      documentId: result.documentId,
      document: result.document,
      message: 'Dokumen berhasil diunggah dan menunggu verifikasi Admin.',
    });
  }
);

pengawasRouter.post(
  '/documents/:id/revisions',
  handleSingleFileUpload('file'),
  (req, res) => {
    const { user, profile } = req.auth!;
    if (!req.file) {
      res.status(400).json({ error: 'Pilih berkas revisi (JPG, JPEG, PNG, atau PDF) terlebih dahulu.' });
      return;
    }

    const result = uploadSupervisorDocumentRevision({
      documentId: req.params.id,
      requesterUserId: user.id,
      requesterUsername: user.username,
      requesterSaumSupervisorId: profile?.saum_supervisor_id ?? null,
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      declaredMime: req.file.mimetype,
      ipAddress: extractClientIp(req),
    });

    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      success: true,
      documentId: result.documentId,
      document: result.document,
      message: `Versi perbaikan v${result.document.version} berhasil diunggah dan menunggu pemeriksaan Admin.`,
    });
  }
);

// ==================== PHASE 05: LAPORAN KEJADIAN ====================

pengawasRouter.get('/incidents', (req, res) => {
  const { user, profile } = req.auth!;
  const result = listSupervisorIncidents(user.id, profile?.saum_supervisor_id ?? null);
  res.json({
    ...result,
    saumFreshness: getSaumFreshnessInfo(),
  });
});

pengawasRouter.post(
  '/incidents',
  handleSingleFileUpload('attachment'),
  (req, res) => {
    const { user, profile } = req.auth!;
    const result = createIncidentReport({
      assignmentIdInput: typeof req.body?.assignmentId === 'string' ? req.body.assignmentId : '',
      requesterUserId: user.id,
      requesterUsername: user.username,
      requesterDisplayName: profile?.nama_lengkap || user.username,
      requesterSaumSupervisorId: profile?.saum_supervisor_id ?? null,
      incidentDate: typeof req.body?.incidentDate === 'string' ? req.body.incidentDate : undefined,
      incidentTime: typeof req.body?.incidentTime === 'string' ? req.body.incidentTime : undefined,
      categoryRaw: typeof req.body?.category === 'string' ? req.body.category : '',
      description: typeof req.body?.description === 'string' ? req.body.description : '',
      actionTaken: typeof req.body?.actionTaken === 'string' ? req.body.actionTaken : '',
      attachmentBuffer: req.file?.buffer,
      attachmentOriginalName: req.file?.originalname,
      attachmentDeclaredMime: req.file?.mimetype,
      ipAddress: extractClientIp(req),
    });

    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      success: true,
      incident: result.incident,
      message: 'Laporan kejadian berhasil dikirim dan dicatat untuk tindak lanjut Admin.',
    });
  }
);

pengawasRouter.get('/incidents/:id', (req, res) => {
  const { user } = req.auth!;
  const check = getSupervisorIncidentDetail(req.params.id, user.id);

  if (check.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Laporan kejadian tidak ditemukan.' });
    return;
  }

  if (check.status === 'FORBIDDEN') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba mengakses laporan kejadian milik pengawas lain (${req.params.id}).`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({ error: 'Akses ditolak. Anda hanya dapat melihat laporan kejadian milik Anda sendiri.' });
    return;
  }

  res.json({ incident: check.incident });
});

pengawasRouter.get('/incidents/:id/attachment', (req, res) => {
  const { user } = req.auth!;
  const check = getSupervisorIncidentDetail(req.params.id, user.id);

  if (check.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Laporan kejadian tidak ditemukan.' });
    return;
  }

  if (check.status === 'FORBIDDEN') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${user.username}" mencoba mengakses lampiran laporan kejadian milik pengawas lain (${req.params.id}).`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({ error: 'Akses ditolak.' });
    return;
  }

  if (!check.row.attachment_path || !check.row.attachment_mime_type) {
    res.status(404).json({ error: 'Laporan ini tidak memiliki lampiran berkas.' });
    return;
  }

  const fullPath = resolveStoredIncidentAttachment(check.row.attachment_path);
  if (!fullPath || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Lampiran tidak ditemukan di penyimpanan privat.' });
    return;
  }

  const forceDownload = req.query.download === '1' || req.query.download === 'true';
  streamPrivateFileResponse(
    res,
    fullPath,
    check.row.attachment_mime_type,
    check.row.attachment_original_name || 'lampiran',
    forceDownload
  );
});

pengawasRouter.get('/operational/access-check', requireOperationalAccess, (req, res) => {
  const assignments = getAssignmentsForSaumSupervisor(
    req.auth!.profile?.saum_supervisor_id ?? null
  );
  res.json({
    operationalAccessStatus: 'AVAILABLE',
    assignmentCount: assignments.length,
    message:
      'Akses fitur operasional diizinkan karena akun ACTIVE, profil COMPLETE, dan penugasan SAUM sah.',
  });
});
