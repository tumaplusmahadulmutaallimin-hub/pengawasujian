import fs from 'node:fs';
import { db, INCIDENTS_DIR } from '../db/database.ts';
import type {
  IncidentCategory,
  IncidentReportRow,
  IncidentStatus,
} from '../types.ts';
import { recordAuditLog } from '../utils/audit.ts';
import { generateId } from '../utils/crypto.ts';
import {
  getMaxUploadMb,
  resolveConfinedPrivateFile,
  validateUploadedFileBuffer,
  writePrivateFileAtomic,
} from '../utils/fileSecurity.ts';
import { getJakartaNow, normalizeDateYmd } from '../utils/scheduleTime.ts';
import { createNotification, notifyActiveAdmins } from './notificationService.ts';

export const INCIDENT_CATEGORIES: Array<{ code: IncidentCategory; label: string }> = [
  { code: 'KETERLAMBATAN_PENGAWAS', label: 'Keterlambatan Pengawas' },
  { code: 'PENGAWAS_TIDAK_HADIR', label: 'Pengawas Tidak Hadir' },
  { code: 'PENGAWAS_SAKIT', label: 'Pengawas Sakit' },
  { code: 'DUGAAN_KECURANGAN_PESERTA', label: 'Dugaan Kecurangan Peserta' },
  { code: 'GANGGUAN_TEKNIS_KOMPUTER', label: 'Gangguan Teknis Komputer' },
  { code: 'GANGGUAN_JARINGAN_INTERNET', label: 'Gangguan Jaringan Internet' },
  { code: 'GANGGUAN_LISTRIK', label: 'Gangguan Listrik' },
  { code: 'PERMASALAHAN_RUANG_UJIAN', label: 'Permasalahan Ruang Ujian' },
  { code: 'PERMASALAHAN_PESERTA', label: 'Permasalahan Peserta' },
  { code: 'KEJADIAN_LAINNYA', label: 'Kejadian Lainnya' },
];

const VALID_CATEGORIES = new Set<string>(INCIDENT_CATEGORIES.map((c) => c.code));

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  INCIDENT_CATEGORIES.map((c) => [c.code, c.label])
);

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  SUBMITTED: 'Terkirim',
  UNDER_REVIEW: 'Sedang Diperiksa',
  RESOLVED: 'Selesai Ditindaklanjuti',
  REJECTED: 'Ditolak',
};

function getAssignmentsContextMap() {
  const rows = db
    .prepare(`
      SELECT
        a.id as internal_id,
        a.saum_id as saum_assignment_id,
        a.schedule_id,
        a.room_id,
        a.sesi as assign_sesi,
        a.pengawas1_id,
        a.pengawas2_id,
        sch.tanggal,
        sch.hari,
        sch.sesi as sch_sesi,
        sch.waktu_mulai,
        sch.waktu_selesai,
        sub.kode_mapel,
        sub.nama_mapel,
        rm.kode_ruang,
        rm.nama_ruang
      FROM saum_supervisor_assignments a
      LEFT JOIN saum_exam_schedules sch ON sch.saum_id = a.schedule_id AND sch.is_active_in_source = 1
      LEFT JOIN saum_exam_subjects sub ON sub.saum_id = sch.mapel_id AND sub.is_active_in_source = 1
      LEFT JOIN saum_exam_rooms rm ON rm.saum_id = a.room_id AND rm.is_active_in_source = 1
      WHERE a.is_active_in_source = 1
    `)
    .all() as unknown as Array<{
    internal_id: string;
    saum_assignment_id: string;
    schedule_id: string;
    room_id: string;
    assign_sesi: string;
    pengawas1_id: string | null;
    pengawas2_id: string | null;
    tanggal: string | null;
    hari: string | null;
    sch_sesi: string | null;
    waktu_mulai: string | null;
    waktu_selesai: string | null;
    kode_mapel: string | null;
    nama_mapel: string | null;
    kode_ruang: string | null;
    nama_ruang: string | null;
  }>;

  const bySaumId = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    bySaumId.set(r.saum_assignment_id, r);
  }
  return { rows, bySaumId };
}

function getUserNamesMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of db
    .prepare(`
      SELECT u.id, u.username, u.role, sp.nama_lengkap
      FROM users u
      LEFT JOIN supervisor_profiles sp ON sp.user_id = u.id
    `)
    .all() as unknown as Array<{
    id: string;
    username: string;
    role: string;
    nama_lengkap: string | null;
  }>) {
    map.set(
      row.id,
      row.nama_lengkap || (row.role === 'ADMIN' ? `Admin (${row.username})` : row.username)
    );
  }
  return map;
}

function mapIncidentDto(
  row: IncidentReportRow,
  assignMap: Map<
    string,
    {
      saum_assignment_id: string;
      schedule_id: string;
      room_id: string;
      assign_sesi: string;
      sch_sesi: string | null;
      tanggal: string | null;
      kode_mapel: string | null;
      nama_mapel: string | null;
      kode_ruang: string | null;
      nama_ruang: string | null;
    }
  >,
  userNames: Map<string, string>,
  historyRows: Array<{
    id: string;
    incident_id: string;
    changed_by_user_id: string | null;
    changed_by_name: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: string;
  }> = []
) {
  const asg = assignMap.get(row.saum_assignment_id);
  const schRow = db
    .prepare(`
      SELECT sch.tanggal, sch.sesi, sub.kode_mapel, sub.nama_mapel
      FROM saum_exam_schedules sch
      LEFT JOIN saum_exam_subjects sub ON sub.saum_id = sch.mapel_id
      WHERE sch.saum_id = ? LIMIT 1
    `)
    .get(row.schedule_id) as
    | { tanggal: string | null; sesi: string | null; kode_mapel: string | null; nama_mapel: string | null }
    | undefined;

  const roomRow = db
    .prepare('SELECT kode_ruang, nama_ruang FROM saum_exam_rooms WHERE saum_id = ? LIMIT 1')
    .get(row.room_id) as { kode_ruang: string | null; nama_ruang: string } | undefined;

  return {
    id: row.id,
    assignmentId: row.saum_assignment_id,
    scheduleId: row.schedule_id,
    roomId: row.room_id,
    supervisorId: row.supervisor_id,
    reporterName: userNames.get(row.supervisor_id) ?? row.supervisor_id,
    incidentDate: row.incident_date,
    incidentTime: row.incident_time,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
    description: row.description,
    actionTaken: row.action_taken,
    hasAttachment: Boolean(row.attachment_path),
    attachmentOriginalName: row.attachment_original_name,
    attachmentMimeType: row.attachment_mime_type,
    attachmentFileSize: row.attachment_file_size,
    status: row.status,
    statusLabel: INCIDENT_STATUS_LABELS[row.status] ?? row.status,
    reviewedByUserId: row.reviewed_by,
    reviewedByName: row.reviewed_by ? (userNames.get(row.reviewed_by) ?? row.reviewed_by) : null,
    reviewedAt: row.reviewed_at,
    adminNote: row.admin_note,
    examDate: normalizeDateYmd(asg?.tanggal ?? schRow?.tanggal) || '-',
    sesi: asg?.sch_sesi || asg?.assign_sesi || schRow?.sesi || '-',
    kodeMapel: asg?.kode_mapel ?? schRow?.kode_mapel ?? null,
    namaMapel: asg?.nama_mapel ?? schRow?.nama_mapel ?? 'Mata pelajaran tidak tersedia',
    kodeRuang: asg?.kode_ruang ?? roomRow?.kode_ruang ?? null,
    namaRuang: asg?.nama_ruang ?? roomRow?.nama_ruang ?? row.room_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: historyRows.map((h) => ({
      id: h.id,
      changedByName: h.changed_by_name,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      note: h.note,
      createdAt: h.created_at,
    })),
  };
}

export function createIncidentReport(params: {
  assignmentIdInput: string;
  requesterUserId: string;
  requesterUsername: string;
  requesterDisplayName: string;
  requesterSaumSupervisorId: string | null;
  incidentDate?: string;
  incidentTime?: string;
  categoryRaw: string;
  description: string;
  actionTaken?: string;
  attachmentBuffer?: Buffer;
  attachmentOriginalName?: string;
  attachmentDeclaredMime?: string;
  ipAddress: string | null;
}): { ok: true; incident: ReturnType<typeof mapIncidentDto> } | { ok: false; status: number; error: string } {
  const assignmentKey = params.assignmentIdInput?.trim();
  if (!assignmentKey) {
    return { ok: false, status: 400, error: 'Pilih jadwal penugasan terkait kejadian.' };
  }

  const { rows, bySaumId } = getAssignmentsContextMap();
  const assignment =
    bySaumId.get(assignmentKey) ?? rows.find((r) => r.internal_id === assignmentKey);

  if (!assignment) {
    return { ok: false, status: 404, error: 'Jadwal penugasan tidak ditemukan.' };
  }

  const isMember =
    Boolean(params.requesterSaumSupervisorId) &&
    (assignment.pengawas1_id === params.requesterSaumSupervisorId ||
      assignment.pengawas2_id === params.requesterSaumSupervisorId);

  if (!isMember) {
    recordAuditLog({
      userId: params.requesterUserId,
      usernameSnapshot: params.requesterUsername,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${params.requesterUsername}" mencoba membuat laporan kejadian untuk penugasan ${assignment.saum_assignment_id} di luar hak tugasnya.`,
      ipAddress: params.ipAddress,
    });
    return {
      ok: false,
      status: 403,
      error: 'Akses ditolak. Anda hanya dapat membuat laporan kejadian pada penugasan Anda sendiri.',
    };
  }

  const category = params.categoryRaw?.trim().toUpperCase();
  if (!category || !VALID_CATEGORIES.has(category)) {
    return { ok: false, status: 400, error: 'Kategori kejadian tidak valid.' };
  }

  const description = params.description?.trim() || '';
  if (!description || description.length < 5) {
    return {
      ok: false,
      status: 400,
      error: 'Deskripsi kejadian wajib diisi minimal 5 karakter.',
    };
  }

  const jakartaNow = getJakartaNow();
  const incidentDate =
    normalizeDateYmd(params.incidentDate) || jakartaNow.dateStr;
  const rawTime = params.incidentTime?.trim() || jakartaNow.timeStr;
  const incidentTime = /^\d{1,2}:\d{2}/.test(rawTime)
    ? rawTime.slice(0, 5)
    : jakartaNow.timeStr;
  const actionTaken = params.actionTaken?.trim() || '';

  let storedAttachment: {
    storageName: string;
    fullPath: string;
    mimeType: string;
    sanitizedOriginalName: string;
    fileSize: number;
  } | null = null;

  if (params.attachmentBuffer && params.attachmentBuffer.length > 0) {
    const validation = validateUploadedFileBuffer({
      buffer: params.attachmentBuffer,
      originalName: params.attachmentOriginalName || 'lampiran.jpg',
      declaredMime: params.attachmentDeclaredMime,
    });
    if (validation.ok === false) {
      return { ok: false, status: validation.status, error: validation.error };
    }
    try {
      const written = writePrivateFileAtomic(
        INCIDENTS_DIR,
        'inc',
        validation.canonicalExt,
        params.attachmentBuffer
      );
      storedAttachment = {
        storageName: written.storageName,
        fullPath: written.fullPath,
        mimeType: validation.mimeType,
        sanitizedOriginalName: validation.sanitizedOriginalName,
        fileSize: params.attachmentBuffer.length,
      };
    } catch {
      return {
        ok: false,
        status: 500,
        error: 'Gagal menyimpan lampiran laporan ke penyimpanan privat.',
      };
    }
  }

  const incidentId = generateId('inc');
  const now = new Date().toISOString();

  try {
    db.exec('BEGIN');
    db.prepare(`
      INSERT INTO incident_reports (
        id, assignment_id, saum_assignment_id, supervisor_id, schedule_id, room_id,
        incident_date, incident_time, category, description, action_taken,
        attachment_path, attachment_original_name, attachment_mime_type, attachment_file_size,
        status, reviewed_by, reviewed_at, admin_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', NULL, NULL, NULL, ?, ?)
    `).run(
      incidentId,
      assignment.internal_id,
      assignment.saum_assignment_id,
      params.requesterUserId,
      assignment.schedule_id,
      assignment.room_id,
      incidentDate,
      incidentTime,
      category,
      description,
      actionTaken,
      storedAttachment?.storageName ?? null,
      storedAttachment?.sanitizedOriginalName ?? null,
      storedAttachment?.mimeType ?? null,
      storedAttachment?.fileSize ?? null,
      now,
      now
    );

    db.prepare(`
      INSERT INTO incident_status_history (
        id, incident_id, changed_by_user_id, changed_by_name, from_status, to_status, note, created_at
      ) VALUES (?, ?, ?, ?, NULL, 'SUBMITTED', ?, ?)
    `).run(
      generateId('inh'),
      incidentId,
      params.requesterUserId,
      params.requesterDisplayName,
      'Laporan kejadian dikirim oleh Pengawas.',
      now
    );
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    if (storedAttachment) {
      try {
        fs.unlinkSync(storedAttachment.fullPath);
      } catch {
        // Ignore cleanup failure
      }
    }
    return { ok: false, status: 500, error: 'Gagal menyimpan laporan kejadian di database.' };
  }

  const catLabel = CATEGORY_LABELS[category] ?? category;
  const roomLabel = assignment.nama_ruang || assignment.room_id;

  recordAuditLog({
    userId: params.requesterUserId,
    usernameSnapshot: params.requesterUsername,
    activity: 'INCIDENT_CREATED',
    description: `Laporan kejadian "${catLabel}" dibuat oleh ${params.requesterDisplayName} untuk ${roomLabel} (${incidentDate} ${incidentTime} WIB).`,
    ipAddress: params.ipAddress,
  });

  createNotification({
    userId: params.requesterUserId,
    type: 'INCIDENT_SUBMITTED',
    title: 'Laporan Kejadian Berhasil Dikirim',
    message: `Laporan "${catLabel}" untuk ${roomLabel} telah dikirim dan tercatat dalam antrean tindak lanjut Admin.`,
    relatedEntityType: 'INCIDENT',
    relatedEntityId: incidentId,
  });

  notifyActiveAdmins({
    type: 'INCIDENT_NEW',
    title: 'Laporan Kejadian Baru',
    message: `${params.requesterDisplayName} melaporkan "${catLabel}" di ${roomLabel} (${incidentDate} ${incidentTime} WIB).`,
    relatedEntityType: 'INCIDENT',
    relatedEntityId: incidentId,
  });

  const row = db
    .prepare('SELECT * FROM incident_reports WHERE id = ? LIMIT 1')
    .get(incidentId) as unknown as IncidentReportRow;
  const hist = db
    .prepare('SELECT * FROM incident_status_history WHERE incident_id = ? ORDER BY created_at DESC')
    .all(incidentId) as any[];

  return {
    ok: true,
    incident: mapIncidentDto(row, bySaumId, getUserNamesMap(), hist),
  };
}

export function listSupervisorIncidents(
  requesterUserId: string,
  requesterSaumSupervisorId: string | null
) {
  const { rows: assignments, bySaumId } = getAssignmentsContextMap();
  const userNames = getUserNamesMap();

  const myAssignments = requesterSaumSupervisorId
    ? assignments
        .filter(
          (a) =>
            a.pengawas1_id === requesterSaumSupervisorId ||
            a.pengawas2_id === requesterSaumSupervisorId
        )
        .map((a) => ({
          assignmentId: a.saum_assignment_id,
          scheduleId: a.schedule_id,
          roomId: a.room_id,
          tanggal: normalizeDateYmd(a.tanggal) || a.tanggal || '-',
          sesi: a.sch_sesi || a.assign_sesi || '-',
          namaMapel: a.nama_mapel || '-',
          namaRuang: a.nama_ruang || '-',
        }))
    : [];

  const incidentRows = db
    .prepare('SELECT * FROM incident_reports WHERE supervisor_id = ? ORDER BY created_at DESC')
    .all(requesterUserId) as unknown as IncidentReportRow[];

  const histStmt = db.prepare(
    'SELECT * FROM incident_status_history WHERE incident_id = ? ORDER BY created_at DESC'
  );

  const incidents = incidentRows.map((row) =>
    mapIncidentDto(row, bySaumId, userNames, histStmt.all(row.id) as any[])
  );

  return {
    categories: INCIDENT_CATEGORIES,
    maxUploadMb: getMaxUploadMb(),
    myAssignments,
    incidents,
  };
}

export function getSupervisorIncidentDetail(incidentId: string, requesterUserId: string) {
  const row = db
    .prepare('SELECT * FROM incident_reports WHERE id = ? LIMIT 1')
    .get(incidentId) as unknown as IncidentReportRow | undefined;

  if (!row) return { status: 'NOT_FOUND' as const };
  if (row.supervisor_id !== requesterUserId) return { status: 'FORBIDDEN' as const };

  const { bySaumId } = getAssignmentsContextMap();
  const hist = db
    .prepare('SELECT * FROM incident_status_history WHERE incident_id = ? ORDER BY created_at DESC')
    .all(row.id) as any[];

  return {
    status: 'OK' as const,
    row,
    incident: mapIncidentDto(row, bySaumId, getUserNamesMap(), hist),
  };
}

export function listAdminIncidents(filters?: {
  status?: string;
  category?: string;
  date?: string;
  roomId?: string;
  search?: string;
}) {
  const { bySaumId } = getAssignmentsContextMap();
  const userNames = getUserNamesMap();
  const allRows = db
    .prepare('SELECT * FROM incident_reports ORDER BY created_at DESC')
    .all() as unknown as IncidentReportRow[];

  const histStmt = db.prepare(
    'SELECT * FROM incident_status_history WHERE incident_id = ? ORDER BY created_at DESC'
  );

  const allMapped = allRows.map((r) =>
    mapIncidentDto(r, bySaumId, userNames, histStmt.all(r.id) as any[])
  );

  const stats = {
    total: allMapped.length,
    submitted: allMapped.filter((i) => i.status === 'SUBMITTED').length,
    underReview: allMapped.filter((i) => i.status === 'UNDER_REVIEW').length,
    resolved: allMapped.filter((i) => i.status === 'RESOLVED').length,
    rejected: allMapped.filter((i) => i.status === 'REJECTED').length,
  };

  const statusFilter = filters?.status?.trim().toUpperCase() || '';
  const categoryFilter = filters?.category?.trim().toUpperCase() || '';
  const dateFilter = filters?.date?.trim() || '';
  const roomFilter = filters?.roomId?.trim() || '';
  const search = filters?.search?.trim().toLowerCase() || '';

  const filtered = allMapped.filter((item) => {
    if (statusFilter && statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (categoryFilter && categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (dateFilter && item.incidentDate !== dateFilter) return false;
    if (roomFilter && item.roomId !== roomFilter) return false;
    if (search) {
      const hay = [
        item.reporterName,
        item.categoryLabel,
        item.description,
        item.namaMapel,
        item.namaRuang,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const rooms = db
    .prepare('SELECT saum_id, kode_ruang, nama_ruang FROM saum_exam_rooms WHERE is_active_in_source = 1 ORDER BY nama_ruang ASC')
    .all() as unknown as Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;

  return {
    stats,
    categories: INCIDENT_CATEGORIES,
    incidents: filtered,
    filterOptions: { rooms },
  };
}

export function getAdminIncidentDetail(incidentId: string) {
  const row = db
    .prepare('SELECT * FROM incident_reports WHERE id = ? LIMIT 1')
    .get(incidentId) as unknown as IncidentReportRow | undefined;

  if (!row) return null;

  const { bySaumId } = getAssignmentsContextMap();
  const hist = db
    .prepare('SELECT * FROM incident_status_history WHERE incident_id = ? ORDER BY created_at DESC')
    .all(row.id) as any[];

  return {
    row,
    incident: mapIncidentDto(row, bySaumId, getUserNamesMap(), hist),
  };
}

export function reviewAdminIncident(params: {
  incidentId: string;
  nextStatusRaw: string;
  adminNote?: string;
  adminUserId: string;
  adminUsername: string;
  ipAddress: string | null;
}): { ok: true; incident: ReturnType<typeof mapIncidentDto> } | { ok: false; status: number; error: string } {
  const existing = db
    .prepare('SELECT * FROM incident_reports WHERE id = ? LIMIT 1')
    .get(params.incidentId) as unknown as IncidentReportRow | undefined;

  if (!existing) {
    return { ok: false, status: 404, error: 'Laporan kejadian tidak ditemukan.' };
  }

  const nextStatus = params.nextStatusRaw?.trim().toUpperCase() as IncidentStatus;
  if (!['UNDER_REVIEW', 'RESOLVED', 'REJECTED'].includes(nextStatus)) {
    return {
      ok: false,
      status: 400,
      error: 'Status tindak lanjut harus UNDER_REVIEW, RESOLVED, atau REJECTED.',
    };
  }

  const note = params.adminNote?.trim() || '';
  if (nextStatus === 'REJECTED' && !note) {
    return {
      ok: false,
      status: 400,
      error: 'Alasan penolakan laporan wajib diisi oleh Admin.',
    };
  }

  const now = new Date().toISOString();
  const adminLabel = `Admin (${params.adminUsername})`;

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE incident_reports SET
        status = ?,
        reviewed_by = ?,
        reviewed_at = ?,
        admin_note = ?,
        updated_at = ?
      WHERE id = ?
    `).run(nextStatus, params.adminUserId, now, note || existing.admin_note, now, existing.id);

    db.prepare(`
      INSERT INTO incident_status_history (
        id, incident_id, changed_by_user_id, changed_by_name, from_status, to_status, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('inh'),
      existing.id,
      params.adminUserId,
      adminLabel,
      existing.status,
      nextStatus,
      note || `Status diperbarui menjadi ${INCIDENT_STATUS_LABELS[nextStatus]}.`,
      now
    );

    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    return { ok: false, status: 500, error: 'Gagal memperbarui status laporan kejadian.' };
  }

  const statusText = INCIDENT_STATUS_LABELS[nextStatus];
  recordAuditLog({
    userId: params.adminUserId,
    usernameSnapshot: params.adminUsername,
    activity: 'INCIDENT_REVIEWED',
    description: `Admin mengubah status laporan kejadian ${existing.id} dari ${existing.status} menjadi ${nextStatus}${
      note ? ` dengan catatan: ${note}` : '.'
    }`,
    ipAddress: params.ipAddress,
  });

  createNotification({
    userId: existing.supervisor_id,
    type: 'INCIDENT_REVIEWED',
    title: `Laporan Kejadian: ${statusText}`,
    message: `Admin memperbarui laporan kejadian Anda (${CATEGORY_LABELS[existing.category] ?? existing.category}) menjadi "${statusText}"${
      note ? `. Catatan: ${note}` : '.'
    }`,
    relatedEntityType: 'INCIDENT',
    relatedEntityId: existing.id,
  });

  const detail = getAdminIncidentDetail(existing.id)!;
  return { ok: true, incident: detail.incident };
}

export function resolveStoredIncidentAttachment(storagePath: string): string | null {
  return resolveConfinedPrivateFile(INCIDENTS_DIR, storagePath);
}
