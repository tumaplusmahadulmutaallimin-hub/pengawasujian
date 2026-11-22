import '../utils/loadEnv.ts';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, PRIVATE_STORAGE_ROOT, PROFILE_PHOTOS_DIR, db } from '../db/database.ts';
import { syncFromSaumReadOnly } from '../integrations/saumConnector.ts';
import { recordAuditLog } from '../utils/audit.ts';
import { generateId, hashPassword } from '../utils/crypto.ts';
import { getAppEnvironment } from '../utils/loadEnv.ts';
import { addDaysToYmd, getJakartaNow } from '../utils/scheduleTime.ts';

// Minimal valid 1x1 PNG for staging test supervisor profiles (stored strictly in staging private dir)
const STAGING_AVATAR_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function assertStagingIsolation(): void {
  const envMode = getAppEnvironment();
  if (envMode !== 'staging') {
    throw new Error('DITOLAK: Script prepareStaging hanya boleh dijalankan saat SIPENGUJI_ENV=staging.');
  }
  const dbNorm = DB_PATH.toLowerCase();
  const storageNorm = PRIVATE_STORAGE_ROOT.toLowerCase();
  if (!dbNorm.includes('staging') || !storageNorm.includes('staging')) {
    throw new Error(
      `DITOLAK: Path database (${DB_PATH}) dan penyimpanan (${PRIVATE_STORAGE_ROOT}) harus berada di direktori khusus staging.`
    );
  }
}

function writeReadOnlyStagingSaumSample(targetPath: string): void {
  const jakarta = getJakartaNow();
  const yesterday = addDaysToYmd(jakarta.dateStr, -1);
  const today = jakarta.dateStr;
  const tomorrow = addDaysToYmd(jakarta.dateStr, 1);

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayLabel = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return dayNames[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  };

  const payload = {
    sourceSystem: 'SAUM_STAGING_SANDBOX_READ_ONLY',
    generatedAt: new Date().toISOString(),
    supervisors: [
      {
        id: 'sup_stg_1',
        nama: 'Ahmad Fauzi, S.Pd.',
        nip: '198405122010011001',
        asalMadrasah: 'MAN 1 Uji Staging',
        noHp: '081200001001',
        status: 'ACTIVE',
      },
      {
        id: 'sup_stg_2',
        nama: 'Siti Aminah, M.Pd.',
        nip: '198709212012012002',
        asalMadrasah: 'MAN 1 Uji Staging',
        noHp: '081200001002',
        status: 'ACTIVE',
      },
      {
        id: 'sup_stg_3',
        nama: 'Budi Santoso, S.Ag.',
        nip: '198903152014021003',
        asalMadrasah: 'MAN 2 Uji Staging',
        noHp: '081200001003',
        status: 'ACTIVE',
      },
      {
        id: 'sup_stg_4',
        nama: 'Nurul Hidayah, S.Si.',
        nip: '199111082019032004',
        asalMadrasah: 'MAN 2 Uji Staging',
        noHp: '081200001004',
        status: 'ACTIVE',
      },
    ],
    subjects: [
      { id: 'mapel_stg_1', kodeMapel: 'MTK-12', namaMapel: 'Matematika Wajib' },
      { id: 'mapel_stg_2', kodeMapel: 'BIN-12', namaMapel: 'Bahasa Indonesia' },
      { id: 'mapel_stg_3', kodeMapel: 'FQH-12', namaMapel: 'Fikih' },
    ],
    rooms: [
      { id: 'room_stg_1', kodeRuang: 'R01', namaRuang: 'Ruang 01 · Lab Komputer A', kapasitas: 30, lokasi: 'Gedung Utama Lt. 1' },
      { id: 'room_stg_2', kodeRuang: 'R02', namaRuang: 'Ruang 02 · Lab Komputer B', kapasitas: 30, lokasi: 'Gedung Utama Lt. 1' },
      { id: 'room_stg_3', kodeRuang: 'R03', namaRuang: 'Ruang 03 · Kelas XII-A', kapasitas: 30, lokasi: 'Gedung Timur Lt. 2' },
    ],
    schedules: [
      {
        id: 'sch_stg_past',
        mapelId: 'mapel_stg_3',
        tanggal: yesterday,
        hari: dayLabel(yesterday),
        sesi: 'Sesi 1',
        waktuMulai: '07:30',
        waktuSelesai: '09:30',
        ruangIds: ['room_stg_1'],
      },
      {
        id: 'sch_stg_today_1',
        mapelId: 'mapel_stg_1',
        tanggal: today,
        hari: dayLabel(today),
        sesi: 'Sesi 1',
        waktuMulai: '07:30',
        waktuSelesai: '09:30',
        ruangIds: ['room_stg_1', 'room_stg_3'],
      },
      {
        id: 'sch_stg_tomorrow',
        mapelId: 'mapel_stg_2',
        tanggal: tomorrow,
        hari: dayLabel(tomorrow),
        sesi: 'Sesi 1',
        waktuMulai: '07:30',
        waktuSelesai: '09:30',
        ruangIds: ['room_stg_2'],
      },
    ],
    assignments: [
      {
        id: 'asg_stg_past',
        scheduleId: 'sch_stg_past',
        roomId: 'room_stg_1',
        sesi: 'Sesi 1',
        pengawas1Id: 'sup_stg_1',
        pengawas2Id: null,
      },
      {
        id: 'asg_stg_today_r1',
        scheduleId: 'sch_stg_today_1',
        roomId: 'room_stg_1',
        sesi: 'Sesi 1',
        pengawas1Id: 'sup_stg_1',
        pengawas2Id: 'sup_stg_2',
      },
      {
        id: 'asg_stg_today_r3',
        scheduleId: 'sch_stg_today_1',
        roomId: 'room_stg_3',
        sesi: 'Sesi 1',
        pengawas1Id: 'sup_stg_3',
        pengawas2Id: null,
      },
      {
        id: 'asg_stg_tomorrow_r2',
        scheduleId: 'sch_stg_tomorrow',
        roomId: 'room_stg_2',
        sesi: 'Sesi 1',
        pengawas1Id: 'sup_stg_1',
        pengawas2Id: 'sup_stg_2',
      },
    ],
    students: [
      ...Array.from({ length: 6 }, (_, idx) => ({
        id: `stu_stg_r1_${idx + 1}`,
        nis: `26010${idx + 1}`,
        nisn: `0088100${idx + 1}`,
        nama: `Peserta Uji R01 #${idx + 1}`,
        kelas: 'XII IPA 1',
        nomorPeserta: `STG-R01-00${idx + 1}`,
        sesi: 'Sesi 1',
        roomId: 'room_stg_1',
      })),
      ...Array.from({ length: 6 }, (_, idx) => ({
        id: `stu_stg_r2_${idx + 1}`,
        nis: `26020${idx + 1}`,
        nisn: `0088200${idx + 1}`,
        nama: `Peserta Uji R02 #${idx + 1}`,
        kelas: 'XII IPA 2',
        nomorPeserta: `STG-R02-00${idx + 1}`,
        sesi: 'Sesi 1',
        roomId: 'room_stg_2',
      })),
      ...Array.from({ length: 6 }, (_, idx) => ({
        id: `stu_stg_r3_${idx + 1}`,
        nis: `26030${idx + 1}`,
        nisn: `0088300${idx + 1}`,
        nama: `Peserta Uji R03 #${idx + 1}`,
        kelas: 'XII IPS 1',
        nomorPeserta: `STG-R03-00${idx + 1}`,
        sesi: 'Sesi 1',
        roomId: 'room_stg_3',
      })),
    ],
  };

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) {
    fs.chmodSync(targetPath, 0o644);
  }
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.chmodSync(targetPath, 0o444); // Enforce OS read-only permission on staging fixture
}

function upsertStagingAdmin(adminPassword: string): { id: string; username: string } {
  const now = new Date().toISOString();
  const existingDefault = db
    .prepare("SELECT id, username FROM users WHERE username = 'admin' LIMIT 1")
    .get() as { id: string; username: string } | undefined;

  const existingStgAdmin = db
    .prepare("SELECT id, username FROM users WHERE username = 'admin_stg' LIMIT 1")
    .get() as { id: string; username: string } | undefined;

  if (existingStgAdmin) {
    db.prepare('UPDATE users SET password_hash = ?, account_status = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(adminPassword),
      'ACTIVE',
      now,
      existingStgAdmin.id
    );
    return existingStgAdmin;
  }

  if (existingDefault) {
    db.prepare(
      'UPDATE users SET username = ?, email = ?, password_hash = ?, account_status = ?, updated_at = ? WHERE id = ?'
    ).run(
      'admin_stg',
      'admin.staging@sipenguji.madrasah.test',
      hashPassword(adminPassword),
      'ACTIVE',
      now,
      existingDefault.id
    );
    return { id: existingDefault.id, username: 'admin_stg' };
  }

  const adminId = generateId('usr');
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, account_status, profile_completed, created_at, updated_at)
    VALUES (?, 'admin_stg', 'admin.staging@sipenguji.madrasah.test', ?, 'ADMIN', 'ACTIVE', 1, ?, ?)
  `).run(adminId, hashPassword(adminPassword), now, now);
  return { id: adminId, username: 'admin_stg' };
}

function upsertStagingSupervisor(opts: {
  username: string;
  email: string;
  password: string;
  accountStatus: 'ACTIVE' | 'PENDING_VERIFICATION';
  saumSupervisorId: string | null;
  namaLengkap: string;
  nip: string | null;
  nik: string | null;
  asalMadrasah: string;
  jabatan: string;
  completeProfile: boolean;
}) {
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
    .get(opts.username) as { id: string } | undefined;

  let photoFilename: string | null = null;
  if (opts.completeProfile) {
    fs.mkdirSync(PROFILE_PHOTOS_DIR, { recursive: true });
    photoFilename = `staging-avatar-${opts.username}.png`;
    fs.writeFileSync(path.join(PROFILE_PHOTOS_DIR, photoFilename), STAGING_AVATAR_PNG, {
      mode: 0o600,
    });
  }

  const profileCompletedNum = opts.completeProfile ? 1 : 0;

  if (existing) {
    db.prepare(
      'UPDATE users SET email = ?, password_hash = ?, account_status = ?, profile_completed = ?, updated_at = ? WHERE id = ?'
    ).run(opts.email, hashPassword(opts.password), opts.accountStatus, profileCompletedNum, now, existing.id);

    db.prepare(`
      UPDATE supervisor_profiles SET
        saum_supervisor_id = ?, nama_lengkap = ?, nip = ?, nik = ?,
        jenis_kelamin = ?, tempat_lahir = ?, tanggal_lahir = ?, alamat = ?,
        no_whatsapp = ?, email = ?, asal_madrasah = ?, jabatan = ?,
        mata_pelajaran = ?, foto_profil = COALESCE(?, foto_profil),
        profile_completed = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      opts.saumSupervisorId,
      opts.namaLengkap,
      opts.nip,
      opts.nik,
      opts.completeProfile ? 'Laki-laki' : null,
      opts.completeProfile ? 'Kota Uji' : null,
      opts.completeProfile ? '1986-05-12' : null,
      opts.completeProfile ? 'Jl. Madrasah Uji Staging No. 10' : null,
      '081200009999',
      opts.email,
      opts.asalMadrasah,
      opts.jabatan,
      'Matematika',
      photoFilename,
      profileCompletedNum,
      now,
      existing.id
    );
    return existing.id;
  }

  const userId = generateId('usr');
  const profileId = generateId('prf');

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, account_status, profile_completed, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'PENGAWAS', ?, ?, ?, ?)
  `).run(userId, opts.username, opts.email, hashPassword(opts.password), opts.accountStatus, profileCompletedNum, now, now);

  db.prepare(`
    INSERT INTO supervisor_profiles (
      id, user_id, saum_supervisor_id, nama_lengkap, nip, nik, jenis_kelamin, tempat_lahir,
      tanggal_lahir, alamat, no_whatsapp, email, asal_madrasah, jabatan, mata_pelajaran,
      foto_profil, profile_completed, assignment_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_ASSIGNED', ?, ?)
  `).run(
    profileId,
    userId,
    opts.saumSupervisorId,
    opts.namaLengkap,
    opts.nip,
    opts.nik,
    opts.completeProfile ? 'Laki-laki' : null,
    opts.completeProfile ? 'Kota Uji' : null,
    opts.completeProfile ? '1986-05-12' : null,
    opts.completeProfile ? 'Jl. Madrasah Uji Staging No. 10' : null,
    '081200009999',
    opts.email,
    opts.asalMadrasah,
    opts.jabatan,
    'Matematika',
    photoFilename,
    profileCompletedNum,
    now,
    now
  );

  return userId;
}

async function main() {
  assertStagingIsolation();

  const adminPass = process.env.SIPENGUJI_ADMIN_DEFAULT_PASSWORD?.trim();
  const testSupPass = process.env.SIPENGUJI_STAGING_TEST_PASSWORD?.trim();
  const saumSampleRel =
    process.env.SIPENGUJI_SAUM_STAGING_DATA_PATH?.trim() ||
    'staging/saum-staging-sample.readonly.json';
  const saumSampleAbs = path.resolve(process.cwd(), saumSampleRel);

  if (!adminPass || adminPass.startsWith('CHANGE_ME_')) {
    throw new Error('SIPENGUJI_ADMIN_DEFAULT_PASSWORD khusus staging belum disetel.');
  }
  if (!testSupPass || testSupPass.startsWith('CHANGE_ME_')) {
    throw new Error('SIPENGUJI_STAGING_TEST_PASSWORD khusus staging belum disetel.');
  }

  writeReadOnlyStagingSaumSample(saumSampleAbs);
  const adminUser = upsertStagingAdmin(adminPass);

  // Configure SAUM connector in staging DB strictly to the read-only staging sample file
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE integration_settings SET
      saum_base_url = '',
      saum_data_path = ?,
      auto_sync_enabled = 0,
      updated_at = ?
    WHERE integration_name = 'SAUM_READ_ONLY'
  `).run(saumSampleRel, now);

  upsertStagingSupervisor({
    username: 'pengawas_stg1',
    email: 'pengawas1.staging@sipenguji.madrasah.test',
    password: testSupPass,
    accountStatus: 'ACTIVE',
    saumSupervisorId: 'sup_stg_1',
    namaLengkap: 'Ahmad Fauzi, S.Pd.',
    nip: '198405122010011001',
    nik: '3201000000000001',
    asalMadrasah: 'MAN 1 Uji Staging',
    jabatan: 'Guru / Pengawas Ruang',
    completeProfile: true,
  });

  upsertStagingSupervisor({
    username: 'pengawas_stg2',
    email: 'pengawas2.staging@sipenguji.madrasah.test',
    password: testSupPass,
    accountStatus: 'ACTIVE',
    saumSupervisorId: 'sup_stg_2',
    namaLengkap: 'Siti Aminah, M.Pd.',
    nip: '198709212012012002',
    nik: '3201000000000002',
    asalMadrasah: 'MAN 1 Uji Staging',
    jabatan: 'Guru / Pengawas Ruang',
    completeProfile: true,
  });

  upsertStagingSupervisor({
    username: 'pengawas_stg3',
    email: 'pengawas3.staging@sipenguji.madrasah.test',
    password: testSupPass,
    accountStatus: 'ACTIVE',
    saumSupervisorId: 'sup_stg_3',
    namaLengkap: 'Budi Santoso, S.Ag.',
    nip: '198903152014021003',
    nik: '3201000000000003',
    asalMadrasah: 'MAN 2 Uji Staging',
    jabatan: 'Guru / Pengawas Ruang',
    completeProfile: true,
  });

  upsertStagingSupervisor({
    username: 'pengawas_stg_pending',
    email: 'pending.staging@sipenguji.madrasah.test',
    password: testSupPass,
    accountStatus: 'PENDING_VERIFICATION',
    saumSupervisorId: null,
    namaLengkap: 'Calon Pengawas Pending Staging',
    nip: null,
    nik: '3201000000000098',
    asalMadrasah: 'MAN 1 Uji Staging',
    jabatan: 'Guru / Pengawas Ruang',
    completeProfile: false,
  });

  upsertStagingSupervisor({
    username: 'pengawas_stg_incomplete',
    email: 'incomplete.staging@sipenguji.madrasah.test',
    password: testSupPass,
    accountStatus: 'ACTIVE',
    saumSupervisorId: null,
    namaLengkap: 'Pengawas Profil Belum Lengkap',
    nip: null,
    nik: '3201000000000099',
    asalMadrasah: 'MAN 2 Uji Staging',
    jabatan: 'Guru / Pengawas Ruang',
    completeProfile: false,
  });

  const syncRes = await syncFromSaumReadOnly(adminUser.id, 'MANUAL', adminUser.username);
  if (!syncRes.success) {
    throw new Error(`Sinkronisasi SAUM staging gagal: ${syncRes.message}`);
  }

  recordAuditLog({
    userId: adminUser.id,
    usernameSnapshot: adminUser.username,
    activity: 'STAGING_PREPARED',
    description: 'Lingkungan staging SIPENGUJI disiapkan secara terisolasi dari produksi dan SAUM.',
    ipAddress: '127.0.0.1',
  });

  console.log('STAGING_READY', {
    environment: getAppEnvironment(),
    dbPath: DB_PATH,
    privateStorage: PRIVATE_STORAGE_ROOT,
    saumSource: saumSampleRel,
    counts: syncRes.counts,
  });
}

main().catch((err) => {
  console.error('STAGING_PREPARE_FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
