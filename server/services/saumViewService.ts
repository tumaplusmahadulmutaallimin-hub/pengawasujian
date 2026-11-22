import { db } from '../db/database.ts';
import { getSaumSettingsSafe } from '../integrations/saumConnector.ts';
import type { PengawasAssignmentDetail, ScheduleLifecycleStatus } from '../types.ts';
import {
  computeScheduleStatus,
  getJakartaNow,
  matchesJakartaDateRange,
  normalizeDateYmd,
  type ScheduleDateRange,
} from '../utils/scheduleTime.ts';

export interface SaumFreshnessInfo {
  lastSyncAt: string | null;
  connectionStatus: string;
  syncStatus: string;
  isStaleOrDisconnected: boolean;
  warningMessage: string | null;
}

export function getSaumFreshnessInfo(): SaumFreshnessInfo {
  const settings = getSaumSettingsSafe();
  const isStaleOrDisconnected =
    settings.connection_status !== 'CONNECTED_READ_ONLY' || settings.sync_status === 'FAILED';

  let warningMessage: string | null = null;
  if (isStaleOrDisconnected) {
    if (settings.last_sync_at) {
      warningMessage =
        'Koneksi SAUM saat ini belum terhubung atau sinkronisasi terakhir gagal. Data yang ditampilkan berasal dari sinkronisasi valid terakhir dan mungkin belum memuat pembaruan terbaru dari SAUM.';
    } else {
      warningMessage =
        'SIPENGUJI belum terhubung atau belum pernah disinkronkan dengan SAUM. Data jadwal, ruang, dan peserta akan tampil setelah Admin menjalankan sinkronisasi READ-ONLY.';
    }
  }

  return {
    lastSyncAt: settings.last_sync_at,
    connectionStatus: settings.connection_status,
    syncStatus: settings.sync_status,
    isStaleOrDisconnected,
    warningMessage,
  };
}

interface StudentCountLookup {
  exact: Map<string, number>;
  anySesi: Map<string, number>;
  roomTotal: Map<string, number>;
}

function buildStudentCountLookup(): StudentCountLookup {
  const exact = new Map<string, number>();
  const anySesi = new Map<string, number>();
  const roomTotal = new Map<string, number>();

  const rows = db
    .prepare(
      `SELECT room_id, COALESCE(NULLIF(TRIM(sesi), ''), '__ANY__') as sesi_key, COUNT(*) as cnt
       FROM saum_students
       WHERE is_active_in_source = 1 AND room_id IS NOT NULL
       GROUP BY room_id, sesi_key`
    )
    .all() as unknown as Array<{ room_id: string; sesi_key: string; cnt: number }>;

  for (const row of rows) {
    roomTotal.set(row.room_id, (roomTotal.get(row.room_id) ?? 0) + row.cnt);
    if (row.sesi_key === '__ANY__') {
      anySesi.set(row.room_id, (anySesi.get(row.room_id) ?? 0) + row.cnt);
    } else {
      const key = `${row.room_id}::${row.sesi_key}`;
      exact.set(key, (exact.get(key) ?? 0) + row.cnt);
    }
  }

  return { exact, anySesi, roomTotal };
}

function resolveRoomSessionStudentCount(
  lookup: StudentCountLookup,
  roomId: string,
  sesi: string
): number {
  return (lookup.exact.get(`${roomId}::${sesi}`) ?? 0) + (lookup.anySesi.get(roomId) ?? 0);
}

export function getAssignmentsForSaumSupervisor(
  saumSupervisorId: string | null
): PengawasAssignmentDetail[] {
  if (!saumSupervisorId) return [];

  const jakartaNow = getJakartaNow();
  const rows = db
    .prepare(`
      SELECT
        a.saum_id as assignment_id,
        a.schedule_id,
        a.room_id,
        a.sesi as assign_sesi,
        a.pengawas1_id,
        a.pengawas2_id,
        sch.mapel_id,
        sch.tanggal,
        sch.hari,
        sch.sesi as sch_sesi,
        sch.waktu_mulai,
        sch.waktu_selesai,
        sub.kode_mapel,
        sub.nama_mapel,
        rm.nama_ruang,
        rm.kode_ruang,
        rm.kapasitas,
        rm.lokasi
      FROM saum_supervisor_assignments a
      LEFT JOIN saum_exam_schedules sch ON sch.saum_id = a.schedule_id AND sch.is_active_in_source = 1
      LEFT JOIN saum_exam_subjects sub ON sub.saum_id = sch.mapel_id AND sub.is_active_in_source = 1
      LEFT JOIN saum_exam_rooms rm ON rm.saum_id = a.room_id AND rm.is_active_in_source = 1
      WHERE a.is_active_in_source = 1
        AND (a.pengawas1_id = ? OR a.pengawas2_id = ?)
      ORDER BY sch.tanggal ASC, sch.waktu_mulai ASC, a.sesi ASC
    `)
    .all(saumSupervisorId, saumSupervisorId) as unknown as Array<{
    assignment_id: string;
    schedule_id: string;
    room_id: string;
    assign_sesi: string;
    pengawas1_id: string | null;
    pengawas2_id: string | null;
    mapel_id: string | null;
    tanggal: string | null;
    hari: string | null;
    sch_sesi: string | null;
    waktu_mulai: string | null;
    waktu_selesai: string | null;
    kode_mapel: string | null;
    nama_mapel: string | null;
    nama_ruang: string | null;
    kode_ruang: string | null;
    kapasitas: number | null;
    lokasi: string | null;
  }>;

  const studentLookup = buildStudentCountLookup();
  const findSupervisorStmt = db.prepare(
    'SELECT saum_id, nama, asal_madrasah FROM saum_supervisors WHERE saum_id = ? LIMIT 1'
  );

  return rows.map((r) => {
    const isPengawas1 = r.pengawas1_id === saumSupervisorId;
    const partnerId = isPengawas1 ? r.pengawas2_id : r.pengawas1_id;
    const p1 = r.pengawas1_id
      ? (findSupervisorStmt.get(r.pengawas1_id) as unknown as {
          saum_id: string;
          nama: string;
          asal_madrasah: string | null;
        } | undefined)
      : undefined;
    const p2 = r.pengawas2_id
      ? (findSupervisorStmt.get(r.pengawas2_id) as unknown as {
          saum_id: string;
          nama: string;
          asal_madrasah: string | null;
        } | undefined)
      : undefined;
    const partner = partnerId
      ? (findSupervisorStmt.get(partnerId) as unknown as {
          saum_id: string;
          nama: string;
          asal_madrasah: string | null;
        } | undefined)
      : undefined;

    const sesi = r.sch_sesi || r.assign_sesi || '-';
    const scheduleStatus = computeScheduleStatus(
      r.tanggal,
      r.waktu_mulai,
      r.waktu_selesai,
      jakartaNow
    );
    const studentCount = resolveRoomSessionStudentCount(studentLookup, r.room_id, sesi);

    return {
      assignmentId: r.assignment_id,
      scheduleId: r.schedule_id,
      roomId: r.room_id,
      sesi,
      tanggal: normalizeDateYmd(r.tanggal) || r.tanggal || 'Belum tersedia',
      hari: r.hari || 'Belum tersedia',
      waktuMulai: r.waktu_mulai || 'Belum tersedia',
      waktuSelesai: r.waktu_selesai || 'Belum tersedia',
      mapelId: r.mapel_id ?? null,
      kodeMapel: r.kode_mapel,
      namaMapel: r.nama_mapel || 'Mata pelajaran belum tersedia dari SAUM',
      namaRuang: r.nama_ruang || 'Ruang belum tersedia dari SAUM',
      kodeRuang: r.kode_ruang,
      kapasitas: r.kapasitas,
      lokasi: r.lokasi ?? null,
      peranPengawas: isPengawas1 ? 'Pengawas 1' : 'Pengawas 2',
      pengawas1Nama: p1?.nama ?? null,
      pengawas2Nama: p2?.nama ?? null,
      rekanPengawas: partner
        ? {
            saumId: partner.saum_id,
            nama: partner.nama,
            asalMadrasah: partner.asal_madrasah,
          }
        : null,
      scheduleStatus,
      studentCount,
    };
  });
}

export function getSingleAssignmentForSupervisor(
  assignmentId: string,
  saumSupervisorId: string | null
): { status: 'NOT_FOUND' | 'FORBIDDEN' | 'OK'; assignment?: PengawasAssignmentDetail } {
  const raw = db
    .prepare(
      'SELECT saum_id, pengawas1_id, pengawas2_id FROM saum_supervisor_assignments WHERE saum_id = ? AND is_active_in_source = 1 LIMIT 1'
    )
    .get(assignmentId) as
    | { saum_id: string; pengawas1_id: string | null; pengawas2_id: string | null }
    | undefined;

  if (!raw) {
    return { status: 'NOT_FOUND' };
  }

  if (
    !saumSupervisorId ||
    (raw.pengawas1_id !== saumSupervisorId && raw.pengawas2_id !== saumSupervisorId)
  ) {
    return { status: 'FORBIDDEN' };
  }

  const allMine = getAssignmentsForSaumSupervisor(saumSupervisorId);
  const found = allMine.find((a) => a.assignmentId === assignmentId);
  if (!found) return { status: 'NOT_FOUND' };
  return { status: 'OK', assignment: found };
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

export function listAdminSchedules(filters?: {
  range?: ScheduleDateRange;
  subjectId?: string;
  session?: string;
  roomId?: string;
  status?: string;
  search?: string;
  incompleteOnly?: boolean;
}) {
  const jakartaNow = getJakartaNow();

  const schedules = db
    .prepare(`
      SELECT sch.*, sub.kode_mapel, sub.nama_mapel
      FROM saum_exam_schedules sch
      LEFT JOIN saum_exam_subjects sub ON sub.saum_id = sch.mapel_id AND sub.is_active_in_source = 1
      WHERE sch.is_active_in_source = 1
      ORDER BY sch.tanggal ASC, sch.waktu_mulai ASC, sch.sesi ASC
    `)
    .all() as unknown as Array<{
    saum_id: string;
    mapel_id: string;
    tanggal: string;
    hari: string | null;
    sesi: string;
    waktu_mulai: string | null;
    waktu_selesai: string | null;
    ruang_ids_json: string;
    kode_mapel: string | null;
    nama_mapel: string | null;
  }>;

  const roomsMap = new Map<
    string,
    { saum_id: string; kode_ruang: string | null; nama_ruang: string }
  >();
  for (const r of db
    .prepare('SELECT saum_id, kode_ruang, nama_ruang FROM saum_exam_rooms WHERE is_active_in_source = 1')
    .all() as unknown as Array<{
    saum_id: string;
    kode_ruang: string | null;
    nama_ruang: string;
  }>) {
    roomsMap.set(r.saum_id, r);
  }

  const supsMap = new Map<string, string>();
  for (const s of db
    .prepare('SELECT saum_id, nama FROM saum_supervisors WHERE is_active_in_source = 1')
    .all() as unknown as Array<{ saum_id: string; nama: string }>) {
    supsMap.set(s.saum_id, s.nama);
  }

  const assignments = db
    .prepare(
      'SELECT * FROM saum_supervisor_assignments WHERE is_active_in_source = 1'
    )
    .all() as unknown as Array<{
    saum_id: string;
    schedule_id: string;
    room_id: string;
    sesi: string;
    pengawas1_id: string | null;
    pengawas2_id: string | null;
  }>;

  const studentLookup = buildStudentCountLookup();

  const built: AdminScheduleItem[] = schedules.map((sch) => {
    const schAssignments = assignments.filter((a) => a.schedule_id === sch.saum_id);
    let parsedRuangIds: string[] = [];
    try {
      const rawArr = JSON.parse(sch.ruang_ids_json || '[]');
      if (Array.isArray(rawArr)) {
        parsedRuangIds = rawArr.map(String);
      }
    } catch {
      parsedRuangIds = [];
    }

    const roomIdsOrdered = Array.from(
      new Set([...schAssignments.map((a) => a.room_id), ...parsedRuangIds])
    );

    const distinctSupIds = new Set<string>();
    const rooms: AdminScheduleRoomItem[] = roomIdsOrdered.map((rId) => {
      const rm = roomsMap.get(rId);
      const asg = schAssignments.find((a) => a.room_id === rId);
      if (asg?.pengawas1_id) distinctSupIds.add(asg.pengawas1_id);
      if (asg?.pengawas2_id) distinctSupIds.add(asg.pengawas2_id);

      return {
        roomId: rId,
        kodeRuang: rm?.kode_ruang ?? null,
        namaRuang: rm?.nama_ruang ?? `Ruang (${rId})`,
        assignmentId: asg?.saum_id ?? null,
        pengawas1Id: asg?.pengawas1_id ?? null,
        pengawas1Nama: asg?.pengawas1_id ? supsMap.get(asg.pengawas1_id) ?? asg.pengawas1_id : null,
        pengawas2Id: asg?.pengawas2_id ?? null,
        pengawas2Nama: asg?.pengawas2_id ? supsMap.get(asg.pengawas2_id) ?? asg.pengawas2_id : null,
        studentCount: resolveRoomSessionStudentCount(studentLookup, rId, sch.sesi),
      };
    });

    const studentCount = rooms.reduce((acc, r) => acc + r.studentCount, 0);
    const scheduleStatus = computeScheduleStatus(
      sch.tanggal,
      sch.waktu_mulai,
      sch.waktu_selesai,
      jakartaNow
    );

    const missingFields: string[] = [];
    if (!sch.nama_mapel) missingFields.push('Mata pelajaran');
    if (!sch.waktu_mulai || !sch.waktu_selesai) missingFields.push('Jam ujian');
    if (rooms.length === 0) missingFields.push('Ruang ujian');
    if (distinctSupIds.size === 0) missingFields.push('Penugasan pengawas');

    return {
      scheduleId: sch.saum_id,
      mapelId: sch.mapel_id,
      kodeMapel: sch.kode_mapel,
      namaMapel: sch.nama_mapel || 'Belum tersedia dari SAUM',
      tanggal: normalizeDateYmd(sch.tanggal) || sch.tanggal || 'Belum tersedia',
      hari: sch.hari || 'Belum tersedia',
      sesi: sch.sesi || '-',
      waktuMulai: sch.waktu_mulai || 'Belum tersedia',
      waktuSelesai: sch.waktu_selesai || 'Belum tersedia',
      scheduleStatus,
      roomCount: rooms.length,
      studentCount,
      supervisorCount: distinctSupIds.size,
      rooms,
      hasIncompleteData: missingFields.length > 0,
      missingFields,
    };
  });

  const subjects = db
    .prepare('SELECT saum_id, kode_mapel, nama_mapel FROM saum_exam_subjects WHERE is_active_in_source = 1 ORDER BY nama_mapel ASC')
    .all() as unknown as Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;

  const allRooms = db
    .prepare('SELECT saum_id, kode_ruang, nama_ruang FROM saum_exam_rooms WHERE is_active_in_source = 1 ORDER BY nama_ruang ASC')
    .all() as unknown as Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;

  const sessions = Array.from(new Set(built.map((b) => b.sesi).filter(Boolean))).sort();

  const range = filters?.range ?? 'all';
  const subjectId = filters?.subjectId?.trim() || '';
  const session = filters?.session?.trim() || '';
  const roomId = filters?.roomId?.trim() || '';
  const status = filters?.status?.trim().toUpperCase() || 'ALL';
  const search = filters?.search?.trim().toLowerCase() || '';
  const incompleteOnly = Boolean(filters?.incompleteOnly);

  const filtered = built.filter((item) => {
    if (!matchesJakartaDateRange(item.tanggal, range, jakartaNow)) return false;
    if (subjectId && item.mapelId !== subjectId) return false;
    if (session && item.sesi !== session) return false;
    if (roomId && !item.rooms.some((r) => r.roomId === roomId)) return false;
    if (status !== 'ALL' && item.scheduleStatus !== status) return false;
    if (incompleteOnly && !item.hasIncompleteData) return false;
    if (search) {
      const hay = [
        item.namaMapel,
        item.kodeMapel || '',
        item.tanggal,
        item.hari,
        ...item.rooms.map((r) => `${r.namaRuang} ${r.pengawas1Nama || ''} ${r.pengawas2Nama || ''}`),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  return {
    jakartaToday: jakartaNow.dateStr,
    schedules: filtered,
    allSchedulesCount: built.length,
    filterOptions: {
      subjects,
      rooms: allRooms,
      sessions,
    },
  };
}

export function listAdminRoomsDistribution(filters?: {
  search?: string;
  unassignedOnly?: boolean;
  sortBy?: 'namaRuang' | 'studentCount' | 'assignmentCount';
  sortDir?: 'asc' | 'desc';
}) {
  const jakartaNow = getJakartaNow();
  const rooms = db
    .prepare('SELECT * FROM saum_exam_rooms WHERE is_active_in_source = 1 ORDER BY nama_ruang ASC')
    .all() as unknown as Array<{
    saum_id: string;
    kode_ruang: string | null;
    nama_ruang: string;
    kapasitas: number | null;
    lokasi: string | null;
  }>;

  const supsMap = new Map<string, { nama: string; asal_madrasah: string | null }>();
  const allSaumSups = db
    .prepare('SELECT saum_id, nama, nip, asal_madrasah, status FROM saum_supervisors WHERE is_active_in_source = 1 ORDER BY nama ASC')
    .all() as unknown as Array<{
    saum_id: string;
    nama: string;
    nip: string | null;
    asal_madrasah: string | null;
    status: string | null;
  }>;
  for (const s of allSaumSups) {
    supsMap.set(s.saum_id, { nama: s.nama, asal_madrasah: s.asal_madrasah });
  }

  const assignments = db
    .prepare(`
      SELECT
        a.*,
        sch.tanggal,
        sch.hari,
        sch.waktu_mulai,
        sch.waktu_selesai,
        sub.kode_mapel,
        sub.nama_mapel
      FROM saum_supervisor_assignments a
      LEFT JOIN saum_exam_schedules sch ON sch.saum_id = a.schedule_id AND sch.is_active_in_source = 1
      LEFT JOIN saum_exam_subjects sub ON sub.saum_id = sch.mapel_id AND sub.is_active_in_source = 1
      WHERE a.is_active_in_source = 1
      ORDER BY sch.tanggal ASC, a.sesi ASC
    `)
    .all() as unknown as Array<{
    saum_id: string;
    schedule_id: string;
    room_id: string;
    sesi: string;
    pengawas1_id: string | null;
    pengawas2_id: string | null;
    tanggal: string | null;
    hari: string | null;
    waktu_mulai: string | null;
    waktu_selesai: string | null;
    kode_mapel: string | null;
    nama_mapel: string | null;
  }>;

  const assignedSaumSupIds = new Set<string>();
  for (const a of assignments) {
    if (a.pengawas1_id) assignedSaumSupIds.add(a.pengawas1_id);
    if (a.pengawas2_id) assignedSaumSupIds.add(a.pengawas2_id);
  }

  const studentLookup = buildStudentCountLookup();

  const builtRooms = rooms.map((rm) => {
    const totalStudentsInRoom = studentLookup.roomTotal.get(rm.saum_id) ?? 0;

    const rmAsg = assignments.filter((a) => a.room_id === rm.saum_id);
    const mappedAssignments = rmAsg.map((a) => ({
      assignmentId: a.saum_id,
      scheduleId: a.schedule_id,
      tanggal: normalizeDateYmd(a.tanggal) || a.tanggal || 'Belum tersedia',
      hari: a.hari || 'Belum tersedia',
      sesi: a.sesi || '-',
      waktuMulai: a.waktu_mulai || 'Belum tersedia',
      waktuSelesai: a.waktu_selesai || 'Belum tersedia',
      kodeMapel: a.kode_mapel,
      namaMapel: a.nama_mapel || 'Belum tersedia',
      pengawas1Nama: a.pengawas1_id ? supsMap.get(a.pengawas1_id)?.nama ?? a.pengawas1_id : null,
      pengawas2Nama: a.pengawas2_id ? supsMap.get(a.pengawas2_id)?.nama ?? a.pengawas2_id : null,
      studentCount: resolveRoomSessionStudentCount(studentLookup, rm.saum_id, a.sesi),
      scheduleStatus: computeScheduleStatus(a.tanggal, a.waktu_mulai, a.waktu_selesai, jakartaNow),
      hasMissingSupervisor: !a.pengawas1_id && !a.pengawas2_id,
    }));

    const hasNoSupervisor =
      mappedAssignments.length === 0 || mappedAssignments.some((ma) => ma.hasMissingSupervisor);

    return {
      roomId: rm.saum_id,
      kodeRuang: rm.kode_ruang,
      namaRuang: rm.nama_ruang,
      kapasitas: rm.kapasitas,
      lokasi: rm.lokasi,
      studentCount: totalStudentsInRoom,
      assignmentCount: mappedAssignments.length,
      hasNoSupervisor,
      assignments: mappedAssignments,
    };
  });

  const search = filters?.search?.trim().toLowerCase() || '';
  const unassignedOnly = Boolean(filters?.unassignedOnly);
  const sortBy = filters?.sortBy || 'namaRuang';
  const sortDir = filters?.sortDir === 'desc' ? 'desc' : 'asc';

  const filteredRooms = builtRooms
    .filter((rm) => {
      if (unassignedOnly && !rm.hasNoSupervisor) return false;
      if (search) {
        const hay = [
          rm.namaRuang,
          rm.kodeRuang || '',
          rm.lokasi || '',
          ...rm.assignments.map(
            (a) => `${a.namaMapel} ${a.pengawas1Nama || ''} ${a.pengawas2Nama || ''}`
          ),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'studentCount') cmp = a.studentCount - b.studentCount;
      else if (sortBy === 'assignmentCount') cmp = a.assignmentCount - b.assignmentCount;
      else cmp = a.namaRuang.localeCompare(b.namaRuang, 'id');
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const unassignedSaumSupervisors = allSaumSups
    .filter((s) => !assignedSaumSupIds.has(s.saum_id))
    .map((s) => ({
      saumId: s.saum_id,
      nama: s.nama,
      nip: s.nip,
      asalMadrasah: s.asal_madrasah,
      status: s.status,
    }));

  const scheduleSummary = listAdminSchedules({ incompleteOnly: true });

  return {
    rooms: filteredRooms,
    totalRooms: builtRooms.length,
    roomsWithoutSupervisorCount: builtRooms.filter((r) => r.hasNoSupervisor).length,
    unassignedSaumSupervisors,
    incompleteSchedules: scheduleSummary.schedules,
  };
}

export interface StudentQueryParams {
  role: 'ADMIN' | 'PENGAWAS';
  saumSupervisorId?: string | null;
  search?: string;
  kelas?: string;
  roomId?: string;
  sesi?: string;
  subjectId?: string;
  scheduleId?: string;
  assignmentId?: string;
  page?: number;
  limit?: number;
}

export interface StudentQueryResponse {
  forbidden?: boolean;
  forbiddenReason?: string;
  students: Array<{
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
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filterOptions: {
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
  };
}

export function queryExamStudents(params: StudentQueryParams): StudentQueryResponse {
  const page = Math.max(1, Number.isFinite(params.page) ? Number(params.page) : 1);
  const maxLimit = params.role === 'ADMIN' ? 100 : 50;
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(params.limit) ? Number(params.limit) : 20));
  const offset = (page - 1) * limit;

  const activeRooms = db
    .prepare('SELECT saum_id, kode_ruang, nama_ruang FROM saum_exam_rooms WHERE is_active_in_source = 1 ORDER BY nama_ruang ASC')
    .all() as unknown as Array<{ saum_id: string; kode_ruang: string | null; nama_ruang: string }>;
  const roomMap = new Map(activeRooms.map((r) => [r.saum_id, r]));

  const activeSchedules = db
    .prepare(`
      SELECT sch.saum_id, sch.mapel_id, sch.tanggal, sch.sesi, sch.ruang_ids_json, sub.kode_mapel, sub.nama_mapel
      FROM saum_exam_schedules sch
      LEFT JOIN saum_exam_subjects sub ON sub.saum_id = sch.mapel_id AND sub.is_active_in_source = 1
      WHERE sch.is_active_in_source = 1
      ORDER BY sch.tanggal ASC, sch.sesi ASC
    `)
    .all() as unknown as Array<{
    saum_id: string;
    mapel_id: string;
    tanggal: string;
    sesi: string;
    ruang_ids_json: string;
    kode_mapel: string | null;
    nama_mapel: string | null;
  }>;

  const activeAssignments = db
    .prepare('SELECT * FROM saum_supervisor_assignments WHERE is_active_in_source = 1')
    .all() as unknown as Array<{
    saum_id: string;
    schedule_id: string;
    room_id: string;
    sesi: string;
    pengawas1_id: string | null;
    pengawas2_id: string | null;
  }>;

  // Build valid scheduled room+session pairs across SAUM
  const scheduledRoomSessions = new Set<string>();
  const scheduledRoomIds = new Set<string>();
  for (const a of activeAssignments) {
    scheduledRoomIds.add(a.room_id);
    scheduledRoomSessions.add(`${a.room_id}::${a.sesi}`);
  }
  for (const sch of activeSchedules) {
    try {
      const rIds = JSON.parse(sch.ruang_ids_json || '[]');
      if (Array.isArray(rIds)) {
        for (const rId of rIds) {
          scheduledRoomIds.add(String(rId));
          scheduledRoomSessions.add(`${String(rId)}::${sch.sesi}`);
        }
      }
    } catch {
      // Ignore malformed json
    }
  }

  let whereClauses: string[] = ['st.is_active_in_source = 1'];
  let sqlParams: (string | number)[] = [];

  let supervisorAssignments: PengawasAssignmentDetail[] = [];

  if (params.role === 'PENGAWAS') {
    supervisorAssignments = getAssignmentsForSaumSupervisor(params.saumSupervisorId ?? null);

    if (params.assignmentId) {
      const owned = supervisorAssignments.find((a) => a.assignmentId === params.assignmentId);
      if (!owned) {
        return {
          forbidden: true,
          forbiddenReason: 'Anda tidak memiliki izin mengakses daftar peserta pada penugasan ini.',
          students: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
          filterOptions: { classes: [], rooms: [], sessions: [], subjects: [], schedules: [] },
        };
      }
    }

    const allowedRoomIds = new Set(supervisorAssignments.map((a) => a.roomId));
    const allowedScheduleIds = new Set(supervisorAssignments.map((a) => a.scheduleId));

    if (params.roomId && !allowedRoomIds.has(params.roomId)) {
      return {
        forbidden: true,
        forbiddenReason: 'Anda tidak memiliki izin mengakses daftar peserta di ruang lain.',
        students: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        filterOptions: { classes: [], rooms: [], sessions: [], subjects: [], schedules: [] },
      };
    }

    if (params.scheduleId && !allowedScheduleIds.has(params.scheduleId)) {
      return {
        forbidden: true,
        forbiddenReason: 'Anda tidak memiliki izin mengakses daftar peserta pada jadwal lain.',
        students: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        filterOptions: { classes: [], rooms: [], sessions: [], subjects: [], schedules: [] },
      };
    }

    const scopedAssignments = params.assignmentId
      ? supervisorAssignments.filter((a) => a.assignmentId === params.assignmentId)
      : supervisorAssignments;

    if (scopedAssignments.length === 0) {
      return {
        students: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        filterOptions: { classes: [], rooms: [], sessions: [], subjects: [], schedules: [] },
      };
    }

    // Enforce room_id + sesi pairs in SQL directly from verified session assignments
    const pairClauses: string[] = [];
    for (const a of scopedAssignments) {
      pairClauses.push(
        "(st.room_id = ? AND (st.sesi IS NULL OR TRIM(st.sesi) = '' OR st.sesi = ?))"
      );
      sqlParams.push(a.roomId, a.sesi);
    }
    whereClauses.push(`(${pairClauses.join(' OR ')})`);
  }

  // Optional search & filters
  if (params.search?.trim()) {
    const q = `%${params.search.trim()}%`;
    whereClauses.push(
      '(st.nama LIKE ? OR st.nomor_peserta LIKE ? OR st.nis LIKE ? OR st.nisn LIKE ?)'
    );
    sqlParams.push(q, q, q, q);
  }

  if (params.kelas?.trim()) {
    whereClauses.push('st.kelas = ?');
    sqlParams.push(params.kelas.trim());
  }

  if (params.roomId?.trim()) {
    whereClauses.push('st.room_id = ?');
    sqlParams.push(params.roomId.trim());
  }

  if (params.sesi?.trim()) {
    whereClauses.push("(st.sesi = ? OR st.sesi IS NULL OR TRIM(st.sesi) = '')");
    sqlParams.push(params.sesi.trim());
  }

  // Filter by subjectId or scheduleId by resolving matching (room_id, sesi) pairs
  if (params.scheduleId?.trim() || params.subjectId?.trim()) {
    const matchingSchedules = activeSchedules.filter((sch) => {
      if (params.scheduleId?.trim() && sch.saum_id !== params.scheduleId.trim()) return false;
      if (params.subjectId?.trim() && sch.mapel_id !== params.subjectId.trim()) return false;
      return true;
    });

    const targetPairs: Array<{ roomId: string; sesi: string }> = [];
    for (const sch of matchingSchedules) {
      const asgRooms = activeAssignments
        .filter((a) => a.schedule_id === sch.saum_id)
        .map((a) => a.room_id);
      let jsonRooms: string[] = [];
      try {
        const arr = JSON.parse(sch.ruang_ids_json || '[]');
        if (Array.isArray(arr)) jsonRooms = arr.map(String);
      } catch {
        jsonRooms = [];
      }
      for (const rId of new Set([...asgRooms, ...jsonRooms])) {
        targetPairs.push({ roomId: rId, sesi: sch.sesi });
      }
    }

    if (targetPairs.length === 0) {
      whereClauses.push('1 = 0');
    } else {
      const subPairs: string[] = [];
      for (const tp of targetPairs) {
        subPairs.push(
          "(st.room_id = ? AND (st.sesi IS NULL OR TRIM(st.sesi) = '' OR st.sesi = ?))"
        );
        sqlParams.push(tp.roomId, tp.sesi);
      }
      whereClauses.push(`(${subPairs.join(' OR ')})`);
    }
  }

  const whereSql = whereClauses.join(' AND ');

  const total = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM saum_students st WHERE ${whereSql}`)
      .get(...sqlParams) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(`
      SELECT st.*
      FROM saum_students st
      WHERE ${whereSql}
      ORDER BY st.room_id ASC, st.sesi ASC, st.nomor_peserta ASC, st.nama ASC
      LIMIT ? OFFSET ?
    `)
    .all(...sqlParams, limit, offset) as unknown as Array<{
    saum_id: string;
    nis: string | null;
    nisn: string | null;
    nama: string;
    kelas: string | null;
    nomor_peserta: string | null;
    sesi: string | null;
    room_id: string | null;
  }>;

  const students = rows.map((st) => {
    const rm = st.room_id ? roomMap.get(st.room_id) : undefined;
    const isScheduled = Boolean(
      st.room_id &&
        (st.sesi
          ? scheduledRoomSessions.has(`${st.room_id}::${st.sesi}`)
          : scheduledRoomIds.has(st.room_id))
    );

    return {
      saumId: st.saum_id,
      nomorPeserta: st.nomor_peserta,
      nama: st.nama,
      nis: st.nis,
      nisn: st.nisn,
      kelas: st.kelas,
      sesi: st.sesi,
      roomId: st.room_id,
      kodeRuang: rm?.kode_ruang ?? null,
      namaRuang: rm?.nama_ruang ?? null,
      participantStatus: (isScheduled ? 'DIJADWALKAN' : 'TERDAFTAR') as 'TERDAFTAR' | 'DIJADWALKAN',
    };
  });

  // Scoped filter options (Pengawas only sees filter options for their own rooms/schedules!)
  let optionClasses: string[] = [];
  let optionRooms = activeRooms;
  let optionSessions: string[] = [];
  let optionSubjects: Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }> = [];
  let optionSchedules: Array<{ saum_id: string; tanggal: string; sesi: string; nama_mapel: string }> =
    [];

  if (params.role === 'ADMIN') {
    optionClasses = (
      db
        .prepare(
          "SELECT DISTINCT kelas FROM saum_students WHERE is_active_in_source = 1 AND kelas IS NOT NULL AND TRIM(kelas) != '' ORDER BY kelas ASC"
        )
        .all() as unknown as Array<{ kelas: string }>
    ).map((r) => r.kelas);

    optionSessions = Array.from(
      new Set([
        ...(
          db
            .prepare(
              "SELECT DISTINCT sesi FROM saum_students WHERE is_active_in_source = 1 AND sesi IS NOT NULL AND TRIM(sesi) != '' ORDER BY sesi ASC"
            )
            .all() as unknown as Array<{ sesi: string }>
        ).map((r) => r.sesi),
        ...activeSchedules.map((s) => s.sesi),
      ])
    ).sort();

    optionSubjects = db
      .prepare('SELECT saum_id, kode_mapel, nama_mapel FROM saum_exam_subjects WHERE is_active_in_source = 1 ORDER BY nama_mapel ASC')
      .all() as unknown as Array<{ saum_id: string; kode_mapel: string | null; nama_mapel: string }>;

    optionSchedules = activeSchedules.map((s) => ({
      saum_id: s.saum_id,
      tanggal: normalizeDateYmd(s.tanggal) || s.tanggal,
      sesi: s.sesi,
      nama_mapel: s.nama_mapel || s.saum_id,
    }));
  } else {
    const myRoomIds = new Set(supervisorAssignments.map((a) => a.roomId));
    optionRooms = activeRooms.filter((r) => myRoomIds.has(r.saum_id));
    optionSessions = Array.from(new Set(supervisorAssignments.map((a) => a.sesi))).sort();

    const seenSubj = new Map<string, { saum_id: string; kode_mapel: string | null; nama_mapel: string }>();
    const seenSch = new Map<string, { saum_id: string; tanggal: string; sesi: string; nama_mapel: string }>();
    for (const a of supervisorAssignments) {
      if (a.mapelId && !seenSubj.has(a.mapelId)) {
        seenSubj.set(a.mapelId, {
          saum_id: a.mapelId,
          kode_mapel: a.kodeMapel,
          nama_mapel: a.namaMapel,
        });
      }
      if (!seenSch.has(a.scheduleId)) {
        seenSch.set(a.scheduleId, {
          saum_id: a.scheduleId,
          tanggal: a.tanggal,
          sesi: a.sesi,
          nama_mapel: a.namaMapel,
        });
      }
    }
    optionSubjects = Array.from(seenSubj.values());
    optionSchedules = Array.from(seenSch.values());

    if (supervisorAssignments.length > 0) {
      const clsConds: string[] = [];
      const clsParams: string[] = [];
      for (const a of supervisorAssignments) {
        clsConds.push("(room_id = ? AND (sesi IS NULL OR TRIM(sesi) = '' OR sesi = ?))");
        clsParams.push(a.roomId, a.sesi);
      }
      optionClasses = (
        db
          .prepare(
            `SELECT DISTINCT kelas FROM saum_students WHERE is_active_in_source = 1 AND kelas IS NOT NULL AND TRIM(kelas) != '' AND (${clsConds.join(
              ' OR '
            )}) ORDER BY kelas ASC`
          )
          .all(...clsParams) as unknown as Array<{ kelas: string }>
      ).map((r) => r.kelas);
    }
  }

  return {
    students,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    filterOptions: {
      classes: optionClasses,
      rooms: optionRooms,
      sessions: optionSessions,
      subjects: optionSubjects,
      schedules: optionSchedules,
    },
  };
}
