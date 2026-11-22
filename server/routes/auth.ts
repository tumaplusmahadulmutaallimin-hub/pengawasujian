import { Router } from 'express';
import { db } from '../db/database.ts';
import {
  recalculateSupervisorAssignments,
  searchSaumSupervisorsReadOnly,
} from '../integrations/saumConnector.ts';
import {
  authenticateSession,
  buildAuthContext,
  SESSION_COOKIE_NAME,
} from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import {
  createNotification,
  notifyActiveAdmins,
} from '../services/notificationService.ts';
import type { IntegrationSettingRow, SupervisorProfileRow, UserRow } from '../types.ts';
import { extractClientIp, recordAuditLog } from '../utils/audit.ts';
import {
  generateId,
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../utils/crypto.ts';
import { getAppEnvironment } from '../utils/loadEnv.ts';

export const authRouter = Router();

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 20,
  message: 'Terlalu banyak percobaan autentikasi. Silakan coba kembali beberapa menit lagi.',
});

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createUserSession(userId: string): { rawToken: string; expiresAt: Date } {
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(`
    INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(generateId('ses'), tokenHash, userId, expiresAt.toISOString(), now.toISOString());

  return { rawToken, expiresAt };
}

function buildSessionCookieOptions(req: any, expiresAt?: Date) {
  const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  const options: Record<string, any> = {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
  };
  if (isSecure) {
    options.partitioned = true;
  }
  if (expiresAt) {
    options.expires = expiresAt;
  }
  return options;
}

function setSessionCookie(req: any, res: any, rawToken: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE_NAME, rawToken, buildSessionCookieOptions(req, expiresAt));
}

authRouter.post('/login', authRateLimiter, (req, res) => {
  const ip = extractClientIp(req);
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username dan password wajib diisi.' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? LIMIT 1').get(username) as
    | UserRow
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordAuditLog({
      userId: user?.id ?? null,
      usernameSnapshot: username,
      activity: 'LOGIN_FAILED',
      description: `Percobaan login gagal untuk username "${username}".`,
      ipAddress: ip,
    });
    res.status(401).json({ error: 'Username atau password tidak sesuai.' });
    return;
  }

  if (user.account_status !== 'ACTIVE') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'LOGIN_FAILED',
      description: `Login ditolak karena status akun ${user.account_status}.`,
      ipAddress: ip,
    });
    const statusText =
      user.account_status === 'PENDING_VERIFICATION'
        ? 'Akun Anda berstatus PENDING_VERIFICATION dan sedang menunggu persetujuan Admin SIPENGUJI.'
        : user.account_status === 'INACTIVE'
          ? 'Akun Anda dinonaktifkan. Hubungi Admin SIPENGUJI.'
          : 'Akun Anda sedang ditangguhkan (SUSPENDED). Hubungi Admin SIPENGUJI.';
    res.status(403).json({ error: statusText });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?').run(now, now, user.id);

  const updatedUser: UserRow = { ...user, last_login: now, updated_at: now };
  const profile = db
    .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ? LIMIT 1')
    .get(user.id) as SupervisorProfileRow | undefined;

  const { rawToken, expiresAt } = createUserSession(user.id);
  setSessionCookie(req, res, rawToken, expiresAt);

  recordAuditLog({
    userId: user.id,
    usernameSnapshot: user.username,
    activity: 'LOGIN_SUCCESS',
    description: `Pengguna ${user.username} (${user.role}) berhasil masuk ke SIPENGUJI.`,
    ipAddress: ip,
  });

  res.json(buildAuthContext(updatedUser, profile ?? null));
});

authRouter.post('/logout', (req, res) => {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const session = db
      .prepare('SELECT user_id FROM sessions WHERE token_hash = ? LIMIT 1')
      .get(tokenHash) as { user_id: string } | undefined;

    if (session) {
      const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(session.user_id) as
        | { id: string; username: string }
        | undefined;
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      if (user) {
        recordAuditLog({
          userId: user.id,
          usernameSnapshot: user.username,
          activity: 'LOGOUT',
          description: `Pengguna ${user.username} keluar dari sistem.`,
          ipAddress: extractClientIp(req),
        });
      }
    }
  }

  res.clearCookie(SESSION_COOKIE_NAME, buildSessionCookieOptions(req));
  res.json({ success: true });
});

authRouter.get('/environment', (_req, res) => {
  const environment = getAppEnvironment();
  res.json({
    environment,
    isStaging: environment === 'staging',
  });
});

authRouter.get('/session', (req, res) => {
  const environment = getAppEnvironment();
  const isStaging = environment === 'staging';
  const adminRow = db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN'")
    .get() as { cnt: number } | undefined;
  const needsAdminSetup = (adminRow?.cnt ?? 0) === 0;

  const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!rawToken) {
    res.json({
      authenticated: false,
      needsAdminSetup,
      environment,
      isStaging,
    });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const session = db
    .prepare('SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ? LIMIT 1')
    .get(tokenHash) as { id: string; user_id: string; expires_at: string } | undefined;

  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    }
    res.clearCookie(SESSION_COOKIE_NAME, buildSessionCookieOptions(req));
    res.json({
      authenticated: false,
      needsAdminSetup,
      environment,
      isStaging,
    });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(session.user_id) as
    | UserRow
    | undefined;

  if (!user || user.account_status !== 'ACTIVE') {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    res.clearCookie(SESSION_COOKIE_NAME, buildSessionCookieOptions(req));
    res.json({
      authenticated: false,
      needsAdminSetup,
      environment,
      isStaging,
    });
    return;
  }

  const profile = db
    .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ? LIMIT 1')
    .get(user.id) as SupervisorProfileRow | undefined;

  res.json({
    authenticated: true,
    needsAdminSetup: false,
    environment,
    isStaging,
    auth: buildAuthContext(user, profile ?? null),
  });
});

authRouter.post('/setup-admin', authRateLimiter, (req, res) => {
  const ip = extractClientIp(req);
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
    res.status(400).json({
      error: 'Username Admin harus 4–32 karakter (huruf kecil, angka, titik, garis bawah, atau tanda hubung).',
    });
    return;
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  if (password.length < 10 || !hasUpper || !hasLower || !hasDigitOrSymbol) {
    res.status(400).json({
      error:
        'Password Admin minimal 10 karakter serta wajib mengandung huruf besar, huruf kecil, dan angka atau simbol.',
    });
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Format email Admin tidak valid.' });
    return;
  }

  const now = new Date().toISOString();
  const adminId = generateId('usr');
  const passwordHash = hashPassword(password);

  try {
    db.exec('BEGIN IMMEDIATE');
    const adminRow = db
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN'")
      .get() as { cnt: number } | undefined;

    if ((adminRow?.cnt ?? 0) > 0) {
      db.exec('ROLLBACK');
      recordAuditLog({
        usernameSnapshot: username,
        activity: 'ACCESS_DENIED',
        description: 'Percobaan bootstrap ulang akun Admin awal ditolak karena Admin sudah tersedia.',
        ipAddress: ip,
      });
      res.status(403).json({
        error: 'Akun Admin awal sudah dikonfigurasi dan tidak dapat dibuat ulang.',
      });
      return;
    }

    const existingUser = db
      .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
      .get(username) as { id: string } | undefined;
    if (existingUser) {
      db.exec('ROLLBACK');
      res.status(409).json({ error: 'Username tersebut sudah digunakan. Pilih username Admin lain.' });
      return;
    }

    if (email) {
      const existingEmail = db
        .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
        .get(email) as { id: string } | undefined;
      if (existingEmail) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Email tersebut sudah terdaftar pada akun lain.' });
        return;
      }
    }

    db.prepare(`
      INSERT INTO users (
        id, username, email, password_hash, role, account_status, profile_completed, created_at, updated_at, last_login
      ) VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE', 1, ?, ?, ?)
    `).run(adminId, username, email || null, passwordHash, now, now, now);

    db.exec('COMMIT');
  } catch {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback error if transaction already closed
    }
    res.status(500).json({ error: 'Gagal menyimpan konfigurasi akun Admin awal.' });
    return;
  }

  recordAuditLog({
    userId: adminId,
    usernameSnapshot: username,
    activity: 'ADMIN_BOOTSTRAP_SETUP',
    description: `Akun Admin awal "${username}" berhasil dikonfigurasi melalui bootstrap satu kali.`,
    ipAddress: ip,
  });

  const adminUser = db
    .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .get(adminId) as unknown as UserRow;
  const { rawToken, expiresAt } = createUserSession(adminId);
  setSessionCookie(req, res, rawToken, expiresAt);

  res.status(201).json({
    success: true,
    message: 'Akun Admin awal berhasil dibuat dan sesi aktif dimulai.',
    auth: buildAuthContext(adminUser, null),
  });
});

authRouter.get('/me', authenticateSession, (req, res) => {
  res.json(req.auth);
});

authRouter.get('/saum-search', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const result = searchSaumSupervisorsReadOnly(query);
  res.json(result);
});

authRouter.post('/register', authRateLimiter, (req, res) => {
  const ip = extractClientIp(req);

  if (req.body?.role && String(req.body.role).toUpperCase() !== 'PENGAWAS') {
    recordAuditLog({
      usernameSnapshot: typeof req.body?.username === 'string' ? req.body.username : null,
      activity: 'ACCESS_DENIED',
      description: 'Percobaan pendaftaran publik dengan role non-PENGAWAS ditolak.',
      ipAddress: ip,
    });
    res.status(403).json({ error: 'Pendaftaran publik hanya tersedia untuk peran Pengawas.' });
    return;
  }

  let namaLengkap = typeof req.body?.namaLengkap === 'string' ? req.body.namaLengkap.trim() : '';
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  let nip = typeof req.body?.nip === 'string' ? req.body.nip.trim() : '';
  const nik = typeof req.body?.nik === 'string' ? req.body.nik.trim() : '';
  const noWhatsapp = typeof req.body?.noWhatsapp === 'string' ? req.body.noWhatsapp.trim() : '';
  let asalMadrasah = typeof req.body?.asalMadrasah === 'string' ? req.body.asalMadrasah.trim() : '';
  const jabatan = typeof req.body?.jabatan === 'string' ? req.body.jabatan.trim() : 'Guru / Pengawas Ruang';
  const mataPelajaran = typeof req.body?.mataPelajaran === 'string' ? req.body.mataPelajaran.trim() : '';
  const saumSupervisorId =
    typeof req.body?.saumSupervisorId === 'string' && req.body.saumSupervisorId.trim()
      ? req.body.saumSupervisorId.trim()
      : null;
  const verificationCode =
    typeof req.body?.verificationCode === 'string' ? req.body.verificationCode.trim() : '';
  const agreedToTerms = Boolean(req.body?.agreedToTerms);

  if (!agreedToTerms) {
    res.status(400).json({ error: 'Anda harus menyetujui pernyataan kebenaran data pendaftaran.' });
    return;
  }

  // If SAUM supervisor ID is supplied, validate against synced saum_supervisors reference
  if (saumSupervisorId) {
    const saumRef = db
      .prepare('SELECT * FROM saum_supervisors WHERE saum_id = ? AND is_active_in_source = 1 LIMIT 1')
      .get(saumSupervisorId) as unknown as
      | {
          saum_id: string;
          nama: string;
          nip: string | null;
          asal_madrasah: string | null;
          no_hp: string | null;
        }
      | undefined;

    if (!saumRef) {
      res.status(404).json({
        error: 'Data referensi pengawas SAUM yang dipilih tidak ditemukan atau belum tersinkronisasi.',
      });
      return;
    }

    // Do not trust name alone; if SAUM has NIP, ensure supplied NIP (if provided) matches
    if (saumRef.nip && nip && saumRef.nip.trim() !== nip) {
      recordAuditLog({
        usernameSnapshot: username || null,
        activity: 'REGISTER_FAILED',
        description: `Pencocokan NIP gagal untuk saum_supervisor_id ${saumSupervisorId}.`,
        ipAddress: ip,
      });
      res.status(403).json({
        error: 'NIP yang Anda masukkan tidak sesuai dengan data pengawas SAUM yang dipilih.',
      });
      return;
    }

    namaLengkap = saumRef.nama;
    if (saumRef.nip) nip = saumRef.nip;
    if (!asalMadrasah && saumRef.asal_madrasah) asalMadrasah = saumRef.asal_madrasah;
  }

  if (!namaLengkap || !username || !password || !asalMadrasah || !noWhatsapp) {
    res.status(400).json({
      error: 'Nama lengkap, asal madrasah, nomor WhatsApp, username, dan password wajib diisi.',
    });
    return;
  }

  if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
    res.status(400).json({
      error: 'Username harus 4–32 karakter (huruf kecil, angka, titik, garis bawah, atau tanda hubung).',
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password minimal harus terdiri dari 8 karakter.' });
    return;
  }

  if (!nip && !nik && !saumSupervisorId) {
    res.status(400).json({
      error: 'Masukkan NIP atau NIK sebagai pengenal unik agar identitas pengawas dapat diverifikasi.',
    });
    return;
  }

  const existingUser = db
    .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
    .get(username) as { id: string } | undefined;
  if (existingUser) {
    recordAuditLog({
      usernameSnapshot: username,
      activity: 'REGISTER_FAILED',
      description: `Pendaftaran gagal: username "${username}" sudah digunakan.`,
      ipAddress: ip,
    });
    res.status(409).json({ error: 'Username sudah terdaftar. Silakan pilih username lain.' });
    return;
  }

  if (email) {
    const existingEmail = db
      .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
      .get(email) as { id: string } | undefined;
    if (existingEmail) {
      res.status(409).json({ error: 'Email sudah digunakan oleh akun lain.' });
      return;
    }
  }

  if (saumSupervisorId) {
    const existingSaum = db
      .prepare('SELECT id FROM supervisor_profiles WHERE saum_supervisor_id = ? LIMIT 1')
      .get(saumSupervisorId) as { id: string } | undefined;
    if (existingSaum) {
      recordAuditLog({
        usernameSnapshot: username,
        activity: 'REGISTER_FAILED',
        description: `Percobaan akun ganda untuk saum_supervisor_id ${saumSupervisorId}.`,
        ipAddress: ip,
      });
      res.status(409).json({
        error: 'Identitas pengawas SAUM ini sudah tertaut dengan akun SIPENGUJI lain.',
      });
      return;
    }
  }

  if (nip) {
    const existingNip = db
      .prepare('SELECT id FROM supervisor_profiles WHERE nip = ? LIMIT 1')
      .get(nip) as { id: string } | undefined;
    if (existingNip) {
      recordAuditLog({
        usernameSnapshot: username,
        activity: 'REGISTER_FAILED',
        description: `Percobaan pendaftaran ganda dengan NIP ${nip}.`,
        ipAddress: ip,
      });
      res.status(409).json({
        error: 'NIP sudah terdaftar pada akun pengawas lain. Satu identitas hanya boleh memiliki satu akun.',
      });
      return;
    }
  }

  if (nik) {
    const existingNik = db
      .prepare('SELECT id FROM supervisor_profiles WHERE nik = ? LIMIT 1')
      .get(nik) as { id: string } | undefined;
    if (existingNik) {
      recordAuditLog({
        usernameSnapshot: username,
        activity: 'REGISTER_FAILED',
        description: `Percobaan pendaftaran ganda dengan NIK ${nik}.`,
        ipAddress: ip,
      });
      res.status(409).json({
        error: 'NIK sudah terdaftar pada akun pengawas lain. Satu identitas hanya boleh memiliki satu akun.',
      });
      return;
    }
  }

  // Strong verification check: panitia verificationCode -> ACTIVE; otherwise PENDING_VERIFICATION
  const integrationRow = db
    .prepare("SELECT registration_code_hash FROM integration_settings WHERE integration_name = 'SAUM_READ_ONLY' LIMIT 1")
    .get() as Pick<IntegrationSettingRow, 'registration_code_hash'> | undefined;

  let accountStatus: 'ACTIVE' | 'PENDING_VERIFICATION' = 'PENDING_VERIFICATION';
  if (verificationCode) {
    const expectedHash = integrationRow?.registration_code_hash;
    if (!expectedHash || hashToken(verificationCode) !== expectedHash) {
      recordAuditLog({
        usernameSnapshot: username,
        activity: 'REGISTER_FAILED',
        description: `Kode verifikasi pendaftaran tidak valid untuk username "${username}".`,
        ipAddress: ip,
      });
      res.status(403).json({
        error:
          'Kode verifikasi panitia tidak sesuai. Kosongkan kode jika ingin mendaftar dengan status PENDING_VERIFICATION untuk persetujuan Admin.',
      });
      return;
    }
    accountStatus = 'ACTIVE';
  }

  const now = new Date().toISOString();
  const userId = generateId('usr');
  const profileId = generateId('prf');
  const passwordHash = hashPassword(password);

  try {
    db.exec('BEGIN');
    db.prepare(`
      INSERT INTO users (
        id, username, email, password_hash, role, account_status, profile_completed, created_at, updated_at, last_login
      ) VALUES (?, ?, ?, ?, 'PENGAWAS', ?, 0, ?, ?, ?)
    `).run(
      userId,
      username,
      email || null,
      passwordHash,
      accountStatus,
      now,
      now,
      accountStatus === 'ACTIVE' ? now : null
    );

    db.prepare(`
      INSERT INTO supervisor_profiles (
        id, user_id, saum_supervisor_id, nama_lengkap, nip, nik, no_whatsapp, email,
        asal_madrasah, jabatan, mata_pelajaran, profile_completed, assignment_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'NOT_ASSIGNED', ?, ?)
    `).run(
      profileId,
      userId,
      saumSupervisorId,
      namaLengkap,
      nip || null,
      nik || null,
      noWhatsapp,
      email || null,
      asalMadrasah,
      jabatan,
      mataPelajaran || null,
      now,
      now
    );

    if (saumSupervisorId) {
      recalculateSupervisorAssignments();
    }

    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Gagal menyimpan pendaftaran akun pengawas.' });
    return;
  }

  recordAuditLog({
    userId,
    usernameSnapshot: username,
    activity: 'REGISTER_SUCCESS',
    description:
      accountStatus === 'ACTIVE'
        ? `Pendaftaran Pengawas "${username}" terverifikasi dan langsung ACTIVE${
            saumSupervisorId ? ` (saum_id: ${saumSupervisorId})` : ''
          }.`
        : `Pendaftaran Pengawas "${username}" tercatat dengan status PENDING_VERIFICATION${
            saumSupervisorId ? ` (saum_id: ${saumSupervisorId})` : ''
          }.`,
    ipAddress: ip,
  });

  createNotification({
    userId,
    type: accountStatus === 'ACTIVE' ? 'REGISTER_SUCCESS' : 'REGISTER_PENDING',
    title:
      accountStatus === 'ACTIVE'
        ? 'Pendaftaran Akun Pengawas Berhasil'
        : 'Pendaftaran Menunggu Verifikasi Admin',
    message:
      accountStatus === 'ACTIVE'
        ? 'Akun Anda telah aktif. Silakan lengkapi biodata dan unggah foto profil untuk kesiapan operasional.'
        : 'Pendaftaran akun Anda tercatat dengan status PENDING_VERIFICATION dan menunggu persetujuan Admin.',
    relatedEntityType: 'ACCOUNT',
    relatedEntityId: userId,
  });

  notifyActiveAdmins({
    type: accountStatus === 'ACTIVE' ? 'SUPERVISOR_REGISTERED' : 'SUPERVISOR_PENDING_APPROVAL',
    title:
      accountStatus === 'ACTIVE'
        ? 'Pengawas Baru Terdaftar (ACTIVE)'
        : 'Pendaftaran Pengawas Menunggu Persetujuan',
    message:
      accountStatus === 'ACTIVE'
        ? `${namaLengkap} (@${username}) mendaftar dengan kode panitia sah.`
        : `${namaLengkap} (@${username}) mendaftar mandiri dan menunggu verifikasi status akun.`,
    relatedEntityType: 'ACCOUNT',
    relatedEntityId: userId,
  });

  if (accountStatus === 'ACTIVE') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
    const profile = db
      .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ?')
      .get(userId) as unknown as SupervisorProfileRow;
    const { rawToken, expiresAt } = createUserSession(userId);
    setSessionCookie(req, res, rawToken, expiresAt);

    res.status(201).json({
      requiresAdminActivation: false,
      accountStatus,
      message: 'Pendaftaran berhasil dan terverifikasi. Silakan lengkapi profil Anda.',
      auth: buildAuthContext(user, profile),
    });
    return;
  }

  res.status(201).json({
    requiresAdminActivation: true,
    accountStatus,
    message:
      'Pendaftaran berhasil dikirim dengan status PENDING_VERIFICATION. Admin akan memverifikasi dan menyetujui akun Anda sebelum dapat login.',
  });
});
