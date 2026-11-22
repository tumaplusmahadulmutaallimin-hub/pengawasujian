import fs from 'node:fs';
import { db, DOCUMENTS_DIR } from '../db/database.ts';
import type {
  DocumentType,
  DocumentVerificationStatus,
  SupervisorDocumentRow,
} from '../types.ts';
import { recordAuditLog } from '../utils/audit.ts';
import { generateId } from '../utils/crypto.ts';
import {
  getMaxUploadMb,
  resolveConfinedPrivateFile,
  validateUploadedFileBuffer,
  writePrivateFileAtomic,
} from '../utils/fileSecurity.ts';
import { normalizeDateYmd } from '../utils/scheduleTime.ts';
import {
  createNotification,
  findUserIdsBySaumSupervisorIds,
  notifyActiveAdmins,
} from './notificationService.ts';

interface AssignmentJoinedRow {
  assignment_row_id: string;
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
  mapel_id: string | null;
  kode_mapel: string | null;
  nama_mapel: string | null;
  kode_ruang: string | null;
  nama_ruang: string | null;
  lokasi: string | null;
}

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

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  ATTENDANCE_LIST: 'Daftar Hadir Peserta',
  EXAM_REPORT: 'Berita Acara Ujian',
};

function getSupervisorNamesMap(): Map<string, { nama: string; asalMadrasah: string | null }> {
  const map = new Map<string, { nama: string; asalMadrasah: string | null }>();
  for (const row of db
    .prepare('SELECT saum_id, nama, asal_madrasah FROM saum_supervisors WHERE is_active_in_source = 1')
    .all() as unknown as Array<{ saum_id: string; nama: string; asal_madrasah: string | null }>) {
    map.set(row.saum_id, { nama: row.nama, asalMadrasah: row.asal_madrasah });
  }
  return map;
}

function getUserDisplayNameMap(): Map<string, string> {
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

function getPicOverridesMap(): Map<
  string,
  { designatedSaumSupervisorId: string; note: string | null; updatedAt: string }
> {
  const map = new Map<
    string,
    { designatedSaumSupervisorId: string; note: string | null; updatedAt: string }
  >();
  for (const row of db
    .prepare('SELECT saum_assignment_id, designated_saum_supervisor_id, note, updated_at FROM document_responsibilities')
    .all() as unknown as Array<{
    saum_assignment_id: string;
    designated_saum_supervisor_id: string;
    note: string | null;
    updated_at: string;
  }>) {
    map.set(row.saum_assignment_id, {
      designatedSaumSupervisorId: row.designated_saum_supervisor_id,
      note: row.note,
      updatedAt: row.updated_at,
    });
  }
  return map;
}

export function resolveEffectiveDocumentPic(params: {
  saumAssignmentId: string;
  pengawas1Id: string | null;
  pengawas2Id: string | null;
  override?: { designatedSaumSupervisorId: string; note: string | null } | undefined;
}): {
  picSaumSupervisorId: string | null;
  isOverridden: boolean;
  overrideNote: string | null;
} {
  const { pengawas1Id, pengawas2Id, override } = params;
  if (
    override &&
    (override.designatedSaumSupervisorId === pengawas1Id ||
      override.designatedSaumSupervisorId === pengawas2Id)
  ) {
    return {
      picSaumSupervisorId: override.designatedSaumSupervisorId,
      isOverridden: true,
      overrideNote: override.note,
    };
  }
  return {
    picSaumSupervisorId: pengawas1Id || pengawas2Id || null,
    isOverridden: false,
    overrideNote: null,
  };
}

function queryJoinedAssignments(whereClause = '', params: string[] = []): AssignmentJoinedRow[] {
  return db
    .prepare(`
      SELECT
        a.id as assignment_row_id,
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
        sch.mapel_id,
        sub.kode_mapel,
        sub.nama_mapel,
        rm.kode_ruang,
        rm.nama_ruang,
        rm.lokasi
      FROM saum_supervisor_assignments a
      LEFT JOIN saum_exam_schedules sch ON sch.saum_id = a.schedule_id AND sch.is_active_in_source = 1
      LEFT JOIN saum_exam_subjects sub ON sub.saum_id = sch.mapel_id AND sub.is_active_in_source = 1
      LEFT JOIN saum_exam_rooms rm ON rm.saum_id = a.room_id AND rm.is_active_in_source = 1
      WHERE a.is_active_in_source = 1 ${whereClause}
      ORDER BY sch.tanggal ASC, sch.waktu_mulai ASC, a.sesi ASC, rm.nama_ruang ASC
    `)
    .all(...params) as unknown as AssignmentJoinedRow[];
}

function mapVersionSummary(
  row: SupervisorDocumentRow,
  userNames: Map<string, string>
): DocumentVersionSummary {
  return {
    id: row.id,
    version: row.version,
    isLatest: row.is_latest === 1,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    verificationStatus: row.verification_status,
    adminNote: row.admin_note,
    uploadedByUserId: row.uploaded_by,
    uploadedByName: userNames.get(row.uploaded_by) ?? row.uploaded_by,
    verifiedByUserId: row.verified_by,
    verifiedByName: row.verified_by ? (userNames.get(row.verified_by) ?? row.verified_by) : null,
    verifiedAt: row.verified_at,
    uploadedAt: row.uploaded_at,
  };
}

function buildSlotSummary(
  docType: DocumentType,
  rows: SupervisorDocumentRow[],
  userNames: Map<string, string>
): DocumentSlotSummary {
  const sorted = [...rows].sort((a, b) => b.version - a.version);
  const latest = sorted.find((r) => r.is_latest === 1) ?? sorted[0] ?? null;
  const versions = sorted.map((r) => mapVersionSummary(r, userNames));

  if (!latest) {
    return {
      documentType: docType,
      documentLabel: DOCUMENT_TYPE_LABELS[docType],
      latestDocumentId: null,
      verificationStatus: 'NOT_UPLOADED',
      version: 0,
      originalFilename: null,
      mimeType: null,
      fileSize: null,
      adminNote: null,
      uploadedByUserId: null,
      uploadedByName: null,
      verifiedByUserId: null,
      verifiedByName: null,
      verifiedAt: null,
      uploadedAt: null,
      versions: [],
    };
  }

  return {
    documentType: docType,
    documentLabel: DOCUMENT_TYPE_LABELS[docType],
    latestDocumentId: latest.id,
    verificationStatus: latest.verification_status,
    version: latest.version,
    originalFilename: latest.original_filename,
    mimeType: latest.mime_type,
    fileSize: latest.file_size,
    adminNote: latest.admin_note,
    uploadedByUserId: latest.uploaded_by,
    uploadedByName: userNames.get(latest.uploaded_by) ?? latest.uploaded_by,
    verifiedByUserId: latest.verified_by,
    verifiedByName: latest.verified_by
      ? (userNames.get(latest.verified_by) ?? latest.verified_by)
      : null,
    verifiedAt: latest.verified_at,
    uploadedAt: latest.uploaded_at,
    versions,
  };
}

export function getSupervisorDocumentsOverview(saumSupervisorId: string | null) {
  const maxUploadMb = getMaxUploadMb();
  if (!saumSupervisorId) {
    return { maxUploadMb, assignments: [] };
  }

  const assignments = queryJoinedAssignments(
    'AND (a.pengawas1_id = ? OR a.pengawas2_id = ?)',
    [saumSupervisorId, saumSupervisorId]
  );

  const supNames = getSupervisorNamesMap();
  const userNames = getUserDisplayNameMap();
  const overrides = getPicOverridesMap();

  const allDocs = db
    .prepare('SELECT * FROM supervisor_documents ORDER BY version DESC')
    .all() as unknown as SupervisorDocumentRow[];

  const docsByKey = new Map<string, SupervisorDocumentRow[]>();
  for (const d of allDocs) {
    const key = `${d.saum_assignment_id}::${d.document_type}`;
    const arr = docsByKey.get(key) ?? [];
    arr.push(d);
    docsByKey.set(key, arr);
  }

  const items = assignments.map((a) => {
    const override = overrides.get(a.saum_assignment_id);
    const pic = resolveEffectiveDocumentPic({
      saumAssignmentId: a.saum_assignment_id,
      pengawas1Id: a.pengawas1_id,
      pengawas2Id: a.pengawas2_id,
      override,
    });
    const isPengawas1 = a.pengawas1_id === saumSupervisorId;
    const partnerId = isPengawas1 ? a.pengawas2_id : a.pengawas1_id;
    const partner = partnerId ? supNames.get(partnerId) : undefined;
    const picSup = pic.picSaumSupervisorId ? supNames.get(pic.picSaumSupervisorId) : undefined;

    const attendanceRows = docsByKey.get(`${a.saum_assignment_id}::ATTENDANCE_LIST`) ?? [];
    const examReportRows = docsByKey.get(`${a.saum_assignment_id}::EXAM_REPORT`) ?? [];

    return {
      assignmentId: a.saum_assignment_id,
      internalAssignmentId: a.assignment_row_id,
      scheduleId: a.schedule_id,
      roomId: a.room_id,
      tanggal: normalizeDateYmd(a.tanggal) || a.tanggal || 'Belum tersedia',
      hari: a.hari || 'Belum tersedia',
      sesi: a.sch_sesi || a.assign_sesi || '-',
      waktuMulai: a.waktu_mulai || '-',
      waktuSelesai: a.waktu_selesai || '-',
      kodeMapel: a.kode_mapel,
      namaMapel: a.nama_mapel || 'Mata pelajaran belum tersedia',
      kodeRuang: a.kode_ruang,
      namaRuang: a.nama_ruang || 'Ruang belum tersedia',
      lokasi: a.lokasi,
      peranPengawas: isPengawas1 ? ('Pengawas 1' as const) : ('Pengawas 2' as const),
      rekanPengawas: partner
        ? {
            saumId: partnerId!,
            nama: partner.nama,
            asalMadrasah: partner.asalMadrasah,
          }
        : null,
      isDocumentPic: pic.picSaumSupervisorId === saumSupervisorId,
      picSaumSupervisorId: pic.picSaumSupervisorId,
      picNama: picSup?.nama ?? pic.picSaumSupervisorId ?? 'Belum ditentukan',
      isPicOverridden: pic.isOverridden,
      picNote: pic.overrideNote,
      documents: {
        ATTENDANCE_LIST: buildSlotSummary('ATTENDANCE_LIST', attendanceRows, userNames),
        EXAM_REPORT: buildSlotSummary('EXAM_REPORT', examReportRows, userNames),
      },
    };
  });

  return { maxUploadMb, assignments: items };
}

export function getSupervisorDocumentForAccess(
  documentId: string,
  requesterSaumSupervisorId: string | null,
  versionId?: string
): {
  status: 'NOT_FOUND' | 'FORBIDDEN' | 'OK';
  document?: SupervisorDocumentRow;
  targetFileRow?: SupervisorDocumentRow;
  slot?: DocumentSlotSummary;
  isDocumentPic?: boolean;
  assignmentSummary?: {
    saumAssignmentId: string;
    tanggal: string;
    namaMapel: string;
    sesi: string;
    namaRuang: string;
    picNama: string;
  };
} {
  const row = db
    .prepare('SELECT * FROM supervisor_documents WHERE id = ? LIMIT 1')
    .get(documentId) as unknown as SupervisorDocumentRow | undefined;

  if (!row) {
    return { status: 'NOT_FOUND' };
  }

  const assignment = queryJoinedAssignments('AND a.saum_id = ?', [row.saum_assignment_id])[0];
  if (!assignment) {
    return { status: 'NOT_FOUND' };
  }

  const isMember =
    Boolean(requesterSaumSupervisorId) &&
    (assignment.pengawas1_id === requesterSaumSupervisorId ||
      assignment.pengawas2_id === requesterSaumSupervisorId);

  if (!isMember) {
    return { status: 'FORBIDDEN' };
  }

  const supNames = getSupervisorNamesMap();
  const userNames = getUserDisplayNameMap();
  const overrides = getPicOverridesMap();
  const pic = resolveEffectiveDocumentPic({
    saumAssignmentId: assignment.saum_assignment_id,
    pengawas1Id: assignment.pengawas1_id,
    pengawas2Id: assignment.pengawas2_id,
    override: overrides.get(assignment.saum_assignment_id),
  });

  const allVersions = db
    .prepare(
      'SELECT * FROM supervisor_documents WHERE saum_assignment_id = ? AND document_type = ? ORDER BY version DESC'
    )
    .all(row.saum_assignment_id, row.document_type) as unknown as SupervisorDocumentRow[];

  const slot = buildSlotSummary(row.document_type, allVersions, userNames);
  const targetFileRow = versionId
    ? allVersions.find((v) => v.id === versionId)
    : allVersions.find((v) => v.id === documentId) ?? allVersions[0];

  if (!targetFileRow) {
    return { status: 'NOT_FOUND' };
  }

  return {
    status: 'OK',
    document: row,
    targetFileRow,
    slot,
    isDocumentPic: pic.picSaumSupervisorId === requesterSaumSupervisorId,
    assignmentSummary: {
      saumAssignmentId: assignment.saum_assignment_id,
      tanggal: normalizeDateYmd(assignment.tanggal) || assignment.tanggal || '-',
      namaMapel: assignment.nama_mapel || '-',
      sesi: assignment.sch_sesi || assignment.assign_sesi || '-',
      namaRuang: assignment.nama_ruang || '-',
      picNama: pic.picSaumSupervisorId
        ? (supNames.get(pic.picSaumSupervisorId)?.nama ?? pic.picSaumSupervisorId)
        : '-',
    },
  };
}

export function uploadInitialSupervisorDocument(params: {
  assignmentIdInput: string;
  documentTypeRaw: string;
  requesterUserId: string;
  requesterUsername: string;
  requesterSaumSupervisorId: string | null;
  fileBuffer: Buffer;
  originalName: string;
  declaredMime?: string;
  ipAddress: string | null;
}): { ok: true; document: DocumentSlotSummary; documentId: string } | { ok: false; status: number; error: string } {
  const docType = params.documentTypeRaw?.trim().toUpperCase();
  if (docType !== 'ATTENDANCE_LIST' && docType !== 'EXAM_REPORT') {
    return {
      ok: false,
      status: 400,
      error: 'Jenis dokumen harus ATTENDANCE_LIST atau EXAM_REPORT.',
    };
  }

  const assignment = queryJoinedAssignments('AND (a.saum_id = ? OR a.id = ?)', [
    params.assignmentIdInput.trim(),
    params.assignmentIdInput.trim(),
  ])[0];

  if (!assignment) {
    return { ok: false, status: 404, error: 'Penugasan pengawas tidak ditemukan.' };
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
      description: `Pengawas "${params.requesterUsername}" mencoba mengunggah dokumen ${docType} untuk penugasan ${assignment.saum_assignment_id} yang bukan hak tugasnya.`,
      ipAddress: params.ipAddress,
    });
    return {
      ok: false,
      status: 403,
      error: 'Akses ditolak. Anda tidak terdaftar pada penugasan ruang ujian ini.',
    };
  }

  const overrides = getPicOverridesMap();
  const pic = resolveEffectiveDocumentPic({
    saumAssignmentId: assignment.saum_assignment_id,
    pengawas1Id: assignment.pengawas1_id,
    pengawas2Id: assignment.pengawas2_id,
    override: overrides.get(assignment.saum_assignment_id),
  });

  if (pic.picSaumSupervisorId !== params.requesterSaumSupervisorId) {
    recordAuditLog({
      userId: params.requesterUserId,
      usernameSnapshot: params.requesterUsername,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${params.requesterUsername}" mencoba mengunggah dokumen ${docType} pada penugasan ${assignment.saum_assignment_id}, namun bukan penanggung jawab dokumen yang ditetapkan.`,
      ipAddress: params.ipAddress,
    });
    return {
      ok: false,
      status: 403,
      error:
        'Akses ditolak. Hanya penanggung jawab dokumen ruang ini yang berhak mengunggah dokumen utama.',
    };
  }

  const existingLatest = db
    .prepare(
      'SELECT * FROM supervisor_documents WHERE saum_assignment_id = ? AND document_type = ? ORDER BY version DESC LIMIT 1'
    )
    .get(assignment.saum_assignment_id, docType) as unknown as SupervisorDocumentRow | undefined;

  if (existingLatest) {
    if (existingLatest.verification_status === 'ACCEPTED') {
      return {
        ok: false,
        status: 409,
        error: 'Dokumen ini sudah diterima Admin dan tidak dapat diubah.',
      };
    }
    if (existingLatest.verification_status === 'PENDING_REVIEW') {
      return {
        ok: false,
        status: 409,
        error: 'Dokumen sudah dikirim dan sedang menunggu verifikasi Admin.',
      };
    }
    if (existingLatest.verification_status === 'REVISION_REQUIRED') {
      return {
        ok: false,
        status: 409,
        error: 'Dokumen memerlukan perbaikan. Gunakan endpoint upload revisi untuk membuat versi baru.',
      };
    }
  }

  const validation = validateUploadedFileBuffer({
    buffer: params.fileBuffer,
    originalName: params.originalName,
    declaredMime: params.declaredMime,
  });

  if (validation.ok === false) {
    return { ok: false, status: validation.status, error: validation.error };
  }

  let stored: { storageName: string; fullPath: string };
  try {
    stored = writePrivateFileAtomic(
      DOCUMENTS_DIR,
      'doc',
      validation.canonicalExt,
      params.fileBuffer
    );
  } catch {
    return {
      ok: false,
      status: 500,
      error: 'Gagal menyimpan berkas ke penyimpanan privat SIPENGUJI.',
    };
  }

  const now = new Date().toISOString();
  const docId = generateId('doc');

  try {
    db.exec('BEGIN');
    db.prepare(`
      INSERT INTO supervisor_documents (
        id, assignment_id, saum_assignment_id, schedule_id, room_id, supervisor_id, uploaded_by,
        document_type, original_filename, storage_path, mime_type, file_size,
        version, is_latest, verification_status, admin_note, verified_by, verified_at, uploaded_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'PENDING_REVIEW', NULL, NULL, NULL, ?, ?)
    `).run(
      docId,
      assignment.assignment_row_id,
      assignment.saum_assignment_id,
      assignment.schedule_id,
      assignment.room_id,
      params.requesterUserId,
      params.requesterUserId,
      docType,
      validation.sanitizedOriginalName,
      stored.storageName,
      validation.mimeType,
      params.fileBuffer.length,
      now,
      now
    );
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    try {
      fs.unlinkSync(stored.fullPath);
    } catch {
      // Ignore cleanup failure
    }
    return { ok: false, status: 500, error: 'Gagal mencatat metadata dokumen di database.' };
  }

  const label = DOCUMENT_TYPE_LABELS[docType];
  const roomLabel = assignment.nama_ruang || assignment.room_id;
  const mapelLabel = assignment.nama_mapel || assignment.schedule_id;

  recordAuditLog({
    userId: params.requesterUserId,
    usernameSnapshot: params.requesterUsername,
    activity: 'DOCUMENT_UPLOADED',
    description: `${label} v1 diunggah untuk ${roomLabel} (${mapelLabel} · ${assignment.assign_sesi}) [${validation.sanitizedOriginalName}].`,
    ipAddress: params.ipAddress,
  });

  createNotification({
    userId: params.requesterUserId,
    type: 'DOCUMENT_SUBMITTED',
    title: `${label} Berhasil Dikirim`,
    message: `${label} (v1) untuk ${roomLabel} — ${mapelLabel} telah dikirim dan menunggu verifikasi Admin.`,
    relatedEntityType: 'DOCUMENT',
    relatedEntityId: docId,
  });

  notifyActiveAdmins({
    type: 'DOCUMENT_PENDING_REVIEW',
    title: 'Dokumen Baru Menunggu Verifikasi',
    message: `${params.requesterUsername} mengunggah ${label} (v1) untuk ${roomLabel} (${mapelLabel}).`,
    relatedEntityType: 'DOCUMENT',
    relatedEntityId: docId,
  });

  const userNames = getUserDisplayNameMap();
  const rows = db
    .prepare(
      'SELECT * FROM supervisor_documents WHERE saum_assignment_id = ? AND document_type = ? ORDER BY version DESC'
    )
    .all(assignment.saum_assignment_id, docType) as unknown as SupervisorDocumentRow[];

  return {
    ok: true,
    documentId: docId,
    document: buildSlotSummary(docType, rows, userNames),
  };
}

export function uploadSupervisorDocumentRevision(params: {
  documentId: string;
  requesterUserId: string;
  requesterUsername: string;
  requesterSaumSupervisorId: string | null;
  fileBuffer: Buffer;
  originalName: string;
  declaredMime?: string;
  ipAddress: string | null;
}): { ok: true; document: DocumentSlotSummary; documentId: string } | { ok: false; status: number; error: string } {
  const existingRef = db
    .prepare('SELECT * FROM supervisor_documents WHERE id = ? LIMIT 1')
    .get(params.documentId) as unknown as SupervisorDocumentRow | undefined;

  if (!existingRef) {
    return { ok: false, status: 404, error: 'Dokumen tidak ditemukan.' };
  }

  const assignment = queryJoinedAssignments('AND a.saum_id = ?', [
    existingRef.saum_assignment_id,
  ])[0];
  if (!assignment) {
    return { ok: false, status: 404, error: 'Penugasan terkait dokumen tidak ditemukan.' };
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
      description: `Pengawas "${params.requesterUsername}" mencoba mengunggah revisi dokumen ${params.documentId} yang bukan hak tugasnya.`,
      ipAddress: params.ipAddress,
    });
    return { ok: false, status: 403, error: 'Akses ditolak.' };
  }

  const overrides = getPicOverridesMap();
  const pic = resolveEffectiveDocumentPic({
    saumAssignmentId: assignment.saum_assignment_id,
    pengawas1Id: assignment.pengawas1_id,
    pengawas2Id: assignment.pengawas2_id,
    override: overrides.get(assignment.saum_assignment_id),
  });

  if (pic.picSaumSupervisorId !== params.requesterSaumSupervisorId) {
    recordAuditLog({
      userId: params.requesterUserId,
      usernameSnapshot: params.requesterUsername,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${params.requesterUsername}" mencoba mengunggah revisi dokumen ${params.documentId} padahal bukan penanggung jawab dokumen.`,
      ipAddress: params.ipAddress,
    });
    return {
      ok: false,
      status: 403,
      error: 'Hanya penanggung jawab dokumen ruang ini yang dapat mengunggah revisi dokumen.',
    };
  }

  const latest = db
    .prepare(
      'SELECT * FROM supervisor_documents WHERE saum_assignment_id = ? AND document_type = ? ORDER BY version DESC LIMIT 1'
    )
    .get(existingRef.saum_assignment_id, existingRef.document_type) as unknown as
    | SupervisorDocumentRow
    | undefined;

  if (!latest) {
    return { ok: false, status: 404, error: 'Versi dokumen tidak ditemukan.' };
  }

  if (latest.verification_status === 'ACCEPTED') {
    return {
      ok: false,
      status: 403,
      error: 'Dokumen yang sudah diterima Admin tidak boleh diubah atau diunggah ulang.',
    };
  }

  if (latest.verification_status !== 'REVISION_REQUIRED') {
    return {
      ok: false,
      status: 409,
      error: 'Dokumen belum berstatus Perlu Perbaikan sehingga belum dapat diunggah ulang.',
    };
  }

  const validation = validateUploadedFileBuffer({
    buffer: params.fileBuffer,
    originalName: params.originalName,
    declaredMime: params.declaredMime,
  });

  if (validation.ok === false) {
    return { ok: false, status: validation.status, error: validation.error };
  }

  let stored: { storageName: string; fullPath: string };
  try {
    stored = writePrivateFileAtomic(
      DOCUMENTS_DIR,
      'doc',
      validation.canonicalExt,
      params.fileBuffer
    );
  } catch {
    return {
      ok: false,
      status: 500,
      error: 'Gagal menyimpan berkas revisi ke penyimpanan privat.',
    };
  }

  const now = new Date().toISOString();
  const nextDocId = generateId('doc');
  const nextVersion = latest.version + 1;

  try {
    db.exec('BEGIN');
    db.prepare(
      'UPDATE supervisor_documents SET is_latest = 0, updated_at = ? WHERE saum_assignment_id = ? AND document_type = ?'
    ).run(now, existingRef.saum_assignment_id, existingRef.document_type);

    db.prepare(`
      INSERT INTO supervisor_documents (
        id, assignment_id, saum_assignment_id, schedule_id, room_id, supervisor_id, uploaded_by,
        document_type, original_filename, storage_path, mime_type, file_size,
        version, is_latest, verification_status, admin_note, verified_by, verified_at, uploaded_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING_REVIEW', NULL, NULL, NULL, ?, ?)
    `).run(
      nextDocId,
      assignment.assignment_row_id,
      assignment.saum_assignment_id,
      assignment.schedule_id,
      assignment.room_id,
      params.requesterUserId,
      params.requesterUserId,
      existingRef.document_type,
      validation.sanitizedOriginalName,
      stored.storageName,
      validation.mimeType,
      params.fileBuffer.length,
      nextVersion,
      now,
      now
    );
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    try {
      fs.unlinkSync(stored.fullPath);
    } catch {
      // Ignore cleanup failure
    }
    return { ok: false, status: 500, error: 'Gagal menyimpan versi revisi dokumen.' };
  }

  const label = DOCUMENT_TYPE_LABELS[existingRef.document_type];
  const roomLabel = assignment.nama_ruang || assignment.room_id;
  const mapelLabel = assignment.nama_mapel || assignment.schedule_id;

  recordAuditLog({
    userId: params.requesterUserId,
    usernameSnapshot: params.requesterUsername,
    activity: 'DOCUMENT_REVISED',
    description: `${label} diunggah ulang menjadi v${nextVersion} untuk ${roomLabel} (${mapelLabel}) [${validation.sanitizedOriginalName}]. Versi sebelumnya tetap tersimpan.`,
    ipAddress: params.ipAddress,
  });

  createNotification({
    userId: params.requesterUserId,
    type: 'DOCUMENT_SUBMITTED',
    title: `Revisi ${label} (v${nextVersion}) Dikirim`,
    message: `Versi perbaikan ${label} (v${nextVersion}) untuk ${roomLabel} menunggu pemeriksaan ulang Admin.`,
    relatedEntityType: 'DOCUMENT',
    relatedEntityId: nextDocId,
  });

  notifyActiveAdmins({
    type: 'DOCUMENT_PENDING_REVIEW',
    title: `Revisi Dokumen v${nextVersion} Siap Diperiksa`,
    message: `${params.requesterUsername} mengunggah ulang ${label} (v${nextVersion}) untuk ${roomLabel} (${mapelLabel}).`,
    relatedEntityType: 'DOCUMENT',
    relatedEntityId: nextDocId,
  });

  const userNames = getUserDisplayNameMap();
  const rows = db
    .prepare(
      'SELECT * FROM supervisor_documents WHERE saum_assignment_id = ? AND document_type = ? ORDER BY version DESC'
    )
    .all(existingRef.saum_assignment_id, existingRef.document_type) as unknown as SupervisorDocumentRow[];

  return {
    ok: true,
    documentId: nextDocId,
    document: buildSlotSummary(existingRef.document_type, rows, userNames),
  };
}

export function listAdminDocuments(filters?: {
  date?: string;
  supervisorId?: string;
  roomId?: string;
  subjectId?: string;
  session?: string;
  documentType?: string;
  status?: string;
  search?: string;
}) {
  const assignments = queryJoinedAssignments();
  const supNames = getSupervisorNamesMap();
  const userNames = getUserDisplayNameMap();
  const overrides = getPicOverridesMap();

  const allDocs = db
    .prepare('SELECT * FROM supervisor_documents ORDER BY version DESC')
    .all() as unknown as SupervisorDocumentRow[];

  const docsByKey = new Map<string, SupervisorDocumentRow[]>();
  for (const d of allDocs) {
    const key = `${d.saum_assignment_id}::${d.document_type}`;
    const arr = docsByKey.get(key) ?? [];
    arr.push(d);
    docsByKey.set(key, arr);
  }

  const allSlots = assignments.flatMap((a) => {
    const pic = resolveEffectiveDocumentPic({
      saumAssignmentId: a.saum_assignment_id,
      pengawas1Id: a.pengawas1_id,
      pengawas2Id: a.pengawas2_id,
      override: overrides.get(a.saum_assignment_id),
    });

    const p1Name = a.pengawas1_id ? (supNames.get(a.pengawas1_id)?.nama ?? a.pengawas1_id) : null;
    const p2Name = a.pengawas2_id ? (supNames.get(a.pengawas2_id)?.nama ?? a.pengawas2_id) : null;
    const picName = pic.picSaumSupervisorId
      ? (supNames.get(pic.picSaumSupervisorId)?.nama ?? pic.picSaumSupervisorId)
      : 'Belum ditentukan';
    const tanggal = normalizeDateYmd(a.tanggal) || a.tanggal || '-';
    const sesi = a.sch_sesi || a.assign_sesi || '-';

    return (['ATTENDANCE_LIST', 'EXAM_REPORT'] as DocumentType[]).map((docType) => {
      const slotRows = docsByKey.get(`${a.saum_assignment_id}::${docType}`) ?? [];
      const summary = buildSlotSummary(docType, slotRows, userNames);

      return {
        slotKey: `${a.saum_assignment_id}::${docType}`,
        documentId: summary.latestDocumentId,
        saumAssignmentId: a.saum_assignment_id,
        scheduleId: a.schedule_id,
        roomId: a.room_id,
        mapelId: a.mapel_id,
        tanggal,
        hari: a.hari || '-',
        sesi,
        waktuMulai: a.waktu_mulai || '-',
        waktuSelesai: a.waktu_selesai || '-',
        kodeMapel: a.kode_mapel,
        namaMapel: a.nama_mapel || '-',
        kodeRuang: a.kode_ruang,
        namaRuang: a.nama_ruang || '-',
        pengawas1Id: a.pengawas1_id,
        pengawas1Nama: p1Name,
        pengawas2Id: a.pengawas2_id,
        pengawas2Nama: p2Name,
        picSaumSupervisorId: pic.picSaumSupervisorId,
        picNama: picName,
        isPicOverridden: pic.isOverridden,
        picNote: pic.overrideNote,
        documentType: docType,
        documentLabel: DOCUMENT_TYPE_LABELS[docType],
        verificationStatus: summary.verificationStatus,
        version: summary.version,
        originalFilename: summary.originalFilename,
        mimeType: summary.mimeType,
        fileSize: summary.fileSize,
        adminNote: summary.adminNote,
        uploadedByUserId: summary.uploadedByUserId,
        uploadedByName: summary.uploadedByName,
        verifiedByUserId: summary.verifiedByUserId,
        verifiedByName: summary.verifiedByName,
        verifiedAt: summary.verifiedAt,
        uploadedAt: summary.uploadedAt,
        versions: summary.versions,
      };
    });
  });

  const stats = {
    total: allSlots.length,
    notUploaded: allSlots.filter((s) => s.verificationStatus === 'NOT_UPLOADED').length,
    pendingReview: allSlots.filter((s) => s.verificationStatus === 'PENDING_REVIEW').length,
    accepted: allSlots.filter((s) => s.verificationStatus === 'ACCEPTED').length,
    revisionRequired: allSlots.filter((s) => s.verificationStatus === 'REVISION_REQUIRED').length,
  };

  const dateFilter = filters?.date?.trim() || '';
  const supervisorFilter = filters?.supervisorId?.trim() || '';
  const roomFilter = filters?.roomId?.trim() || '';
  const subjectFilter = filters?.subjectId?.trim() || '';
  const sessionFilter = filters?.session?.trim() || '';
  const docTypeFilter = filters?.documentType?.trim().toUpperCase() || '';
  const statusFilter = filters?.status?.trim().toUpperCase() || '';
  const search = filters?.search?.trim().toLowerCase() || '';

  const filtered = allSlots.filter((item) => {
    if (dateFilter && item.tanggal !== dateFilter) return false;
    if (
      supervisorFilter &&
      item.pengawas1Id !== supervisorFilter &&
      item.pengawas2Id !== supervisorFilter &&
      item.picSaumSupervisorId !== supervisorFilter
    ) {
      return false;
    }
    if (roomFilter && item.roomId !== roomFilter) return false;
    if (subjectFilter && item.mapelId !== subjectFilter) return false;
    if (sessionFilter && item.sesi !== sessionFilter) return false;
    if (docTypeFilter && docTypeFilter !== 'ALL' && item.documentType !== docTypeFilter) return false;
    if (statusFilter && statusFilter !== 'ALL' && item.verificationStatus !== statusFilter) {
      return false;
    }
    if (search) {
      const hay = [
        item.picNama,
        item.pengawas1Nama || '',
        item.pengawas2Nama || '',
        item.namaMapel,
        item.namaRuang,
        item.documentLabel,
        item.originalFilename || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const dates = Array.from(new Set(allSlots.map((s) => s.tanggal).filter((d) => d !== '-'))).sort();
  const supervisors = Array.from(supNames.entries()).map(([saum_id, val]) => ({
    saum_id,
    nama: val.nama,
  }));
  const rooms = db
    .prepare('SELECT saum_id, kode_ruang, nama_ruang FROM saum_exam_rooms WHERE is_active_in_source = 1 ORDER BY nama_ruang ASC')
    .all() as unknown as Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
  const subjects = db
    .prepare('SELECT saum_id, kode_mapel, nama_mapel FROM saum_exam_subjects WHERE is_active_in_source = 1 ORDER BY nama_mapel ASC')
    .all() as unknown as Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;
  const sessions = Array.from(new Set(allSlots.map((s) => s.sesi).filter((s) => s !== '-'))).sort();

  return {
    stats,
    documents: filtered,
    maxUploadMb: getMaxUploadMb(),
    filterOptions: {
      dates,
      supervisors,
      rooms,
      subjects,
      sessions,
    },
  };
}

export function getAdminDocumentDetail(documentId: string, versionId?: string) {
  const row = db
    .prepare('SELECT * FROM supervisor_documents WHERE id = ? LIMIT 1')
    .get(documentId) as unknown as SupervisorDocumentRow | undefined;

  if (!row) return null;

  const assignment = queryJoinedAssignments('AND a.saum_id = ?', [row.saum_assignment_id])[0];
  if (!assignment) return null;

  const supNames = getSupervisorNamesMap();
  const userNames = getUserDisplayNameMap();
  const overrides = getPicOverridesMap();
  const pic = resolveEffectiveDocumentPic({
    saumAssignmentId: assignment.saum_assignment_id,
    pengawas1Id: assignment.pengawas1_id,
    pengawas2Id: assignment.pengawas2_id,
    override: overrides.get(assignment.saum_assignment_id),
  });

  const allVersions = db
    .prepare(
      'SELECT * FROM supervisor_documents WHERE saum_assignment_id = ? AND document_type = ? ORDER BY version DESC'
    )
    .all(row.saum_assignment_id, row.document_type) as unknown as SupervisorDocumentRow[];

  const summary = buildSlotSummary(row.document_type, allVersions, userNames);
  const targetFileRow = versionId
    ? allVersions.find((v) => v.id === versionId)
    : allVersions.find((v) => v.id === documentId) ?? allVersions.find((v) => v.is_latest === 1) ?? allVersions[0];

  return {
    documentId: summary.latestDocumentId!,
    saumAssignmentId: assignment.saum_assignment_id,
    scheduleId: assignment.schedule_id,
    roomId: assignment.room_id,
    tanggal: normalizeDateYmd(assignment.tanggal) || assignment.tanggal || '-',
    hari: assignment.hari || '-',
    sesi: assignment.sch_sesi || assignment.assign_sesi || '-',
    waktuMulai: assignment.waktu_mulai || '-',
    waktuSelesai: assignment.waktu_selesai || '-',
    namaMapel: assignment.nama_mapel || '-',
    kodeMapel: assignment.kode_mapel,
    namaRuang: assignment.nama_ruang || '-',
    kodeRuang: assignment.kode_ruang,
    pengawas1Id: assignment.pengawas1_id,
    pengawas1Nama: assignment.pengawas1_id
      ? (supNames.get(assignment.pengawas1_id)?.nama ?? assignment.pengawas1_id)
      : null,
    pengawas2Id: assignment.pengawas2_id,
    pengawas2Nama: assignment.pengawas2_id
      ? (supNames.get(assignment.pengawas2_id)?.nama ?? assignment.pengawas2_id)
      : null,
    picSaumSupervisorId: pic.picSaumSupervisorId,
    picNama: pic.picSaumSupervisorId
      ? (supNames.get(pic.picSaumSupervisorId)?.nama ?? pic.picSaumSupervisorId)
      : 'Belum ditentukan',
    isPicOverridden: pic.isOverridden,
    ...summary,
    targetFileRow,
  };
}

export function verifyAdminDocument(params: {
  documentId: string;
  decision: 'ACCEPTED' | 'REVISION_REQUIRED';
  adminNote?: string;
  adminUserId: string;
  adminUsername: string;
  ipAddress: string | null;
}): { ok: true; document: ReturnType<typeof getAdminDocumentDetail> } | { ok: false; status: number; error: string } {
  const row = db
    .prepare('SELECT * FROM supervisor_documents WHERE id = ? LIMIT 1')
    .get(params.documentId) as unknown as SupervisorDocumentRow | undefined;

  if (!row) {
    return { ok: false, status: 404, error: 'Dokumen tidak ditemukan.' };
  }

  const note = params.adminNote?.trim() || '';
  if (params.decision === 'REVISION_REQUIRED' && !note) {
    return {
      ok: false,
      status: 400,
      error: 'Catatan alasan perbaikan wajib diisi saat meminta revisi dokumen.',
    };
  }

  const latest = db
    .prepare(
      'SELECT * FROM supervisor_documents WHERE saum_assignment_id = ? AND document_type = ? ORDER BY version DESC LIMIT 1'
    )
    .get(row.saum_assignment_id, row.document_type) as unknown as SupervisorDocumentRow | undefined;

  if (!latest) {
    return { ok: false, status: 404, error: 'Versi terbaru dokumen tidak ditemukan.' };
  }

  if (latest.verification_status === 'ACCEPTED') {
    return {
      ok: false,
      status: 409,
      error: 'Dokumen versi terbaru sudah berstatus ACCEPTED dan bersifat final.',
    };
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE supervisor_documents SET
      verification_status = ?,
      admin_note = ?,
      verified_by = ?,
      verified_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    params.decision,
    note || null,
    params.adminUserId,
    now,
    now,
    latest.id
  );

  const assignment = queryJoinedAssignments('AND a.saum_id = ?', [row.saum_assignment_id])[0];
  const label = DOCUMENT_TYPE_LABELS[row.document_type];
  const roomLabel = assignment?.nama_ruang || row.room_id;
  const mapelLabel = assignment?.nama_mapel || row.schedule_id;

  recordAuditLog({
    userId: params.adminUserId,
    usernameSnapshot: params.adminUsername,
    activity:
      params.decision === 'ACCEPTED' ? 'DOCUMENT_ACCEPTED' : 'DOCUMENT_REVISION_REQUESTED',
    description:
      params.decision === 'ACCEPTED'
        ? `Admin menerima ${label} v${latest.version} untuk ${roomLabel} (${mapelLabel}).${
            note ? ` Catatan: ${note}` : ''
          }`
        : `Admin meminta perbaikan ${label} v${latest.version} untuk ${roomLabel} (${mapelLabel}). Catatan: ${note}`,
    ipAddress: params.ipAddress,
  });

  const targetUserIds = Array.from(
    new Set([
      latest.uploaded_by,
      ...findUserIdsBySaumSupervisorIds([assignment?.pengawas1_id, assignment?.pengawas2_id]),
    ])
  );

  for (const uid of targetUserIds) {
    createNotification({
      userId: uid,
      type:
        params.decision === 'ACCEPTED'
          ? 'DOCUMENT_ACCEPTED'
          : 'DOCUMENT_REVISION_REQUIRED',
      title:
        params.decision === 'ACCEPTED'
          ? `${label} Diterima`
          : `${label} Perlu Perbaikan`,
      message:
        params.decision === 'ACCEPTED'
          ? `${label} (v${latest.version}) untuk ${roomLabel} — ${mapelLabel} telah diverifikasi dan diterima Admin.`
          : `${label} (v${latest.version}) untuk ${roomLabel} — ${mapelLabel} perlu diperbaiki. Catatan: ${note}`,
      relatedEntityType: 'DOCUMENT',
      relatedEntityId: latest.id,
    });
  }

  return {
    ok: true,
    document: getAdminDocumentDetail(latest.id),
  };
}

export function setAssignmentDocumentPic(params: {
  saumAssignmentId: string;
  designatedSaumSupervisorId: string;
  note?: string;
  adminUserId: string;
  adminUsername: string;
  ipAddress: string | null;
}): { ok: true; picSaumSupervisorId: string; picNama: string } | { ok: false; status: number; error: string } {
  const assignment = queryJoinedAssignments('AND a.saum_id = ?', [
    params.saumAssignmentId.trim(),
  ])[0];

  if (!assignment) {
    return { ok: false, status: 404, error: 'Penugasan pengawas tidak ditemukan.' };
  }

  const targetSupId = params.designatedSaumSupervisorId.trim();
  if (
    targetSupId !== assignment.pengawas1_id &&
    targetSupId !== assignment.pengawas2_id
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Penanggung jawab dokumen harus berasal dari pengawas yang ditugaskan pada ruang dan sesi ini.',
    };
  }

  const now = new Date().toISOString();
  const note = params.note?.trim() || null;

  const existing = db
    .prepare('SELECT id FROM document_responsibilities WHERE saum_assignment_id = ? LIMIT 1')
    .get(assignment.saum_assignment_id) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE document_responsibilities SET
        designated_saum_supervisor_id = ?,
        assigned_by_user_id = ?,
        note = ?,
        updated_at = ?
      WHERE saum_assignment_id = ?
    `).run(targetSupId, params.adminUserId, note, now, assignment.saum_assignment_id);
  } else {
    db.prepare(`
      INSERT INTO document_responsibilities (
        id, saum_assignment_id, designated_saum_supervisor_id, assigned_by_user_id, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('pic'),
      assignment.saum_assignment_id,
      targetSupId,
      params.adminUserId,
      note,
      now,
      now
    );
  }

  const supNames = getSupervisorNamesMap();
  const picNama = supNames.get(targetSupId)?.nama ?? targetSupId;

  recordAuditLog({
    userId: params.adminUserId,
    usernameSnapshot: params.adminUsername,
    activity: 'DOCUMENT_PIC_CHANGED',
    description: `Admin menetapkan ${picNama} (${targetSupId}) sebagai penanggung jawab dokumen untuk ${assignment.nama_ruang || assignment.room_id} (${assignment.nama_mapel || assignment.schedule_id} · ${assignment.assign_sesi}).${
      note ? ` Catatan: ${note}` : ''
    }`,
    ipAddress: params.ipAddress,
  });

  const userIds = findUserIdsBySaumSupervisorIds([
    assignment.pengawas1_id,
    assignment.pengawas2_id,
  ]);
  for (const uid of userIds) {
    createNotification({
      userId: uid,
      type: 'DOCUMENT_PIC_CHANGED',
      title: 'Perubahan Penanggung Jawab Dokumen',
      message: `Admin menetapkan ${picNama} sebagai penanggung jawab pengumpulan dokumen untuk ${assignment.nama_ruang || assignment.room_id} (${assignment.nama_mapel || assignment.schedule_id}).`,
      relatedEntityType: 'ASSIGNMENT',
      relatedEntityId: assignment.saum_assignment_id,
    });
  }

  return { ok: true, picSaumSupervisorId: targetSupId, picNama };
}

export function resolveStoredDocumentFile(storagePath: string): string | null {
  return resolveConfinedPrivateFile(DOCUMENTS_DIR, storagePath);
}
