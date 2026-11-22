import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { db, PROFILE_PHOTOS_DIR } from '../db/database.ts';
import { authenticateSession, buildAuthContext, requireRole } from '../middleware/auth.ts';
import type { SupervisorProfileRow, UserRow } from '../types.ts';
import { extractClientIp, recordAuditLog } from '../utils/audit.ts';
import { detectImageMimeFromMagicBytes, generateId } from '../utils/crypto.ts';

export const profileRouter = Router();

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: 1,
  },
});

function isProfileComplete(profile: SupervisorProfileRow): boolean {
  const requiredFields = [
    profile.nama_lengkap,
    profile.jenis_kelamin,
    profile.tempat_lahir,
    profile.tanggal_lahir,
    profile.alamat,
    profile.no_whatsapp,
    profile.asal_madrasah,
    profile.jabatan,
    profile.foto_profil,
  ];
  return requiredFields.every((value) => typeof value === 'string' && value.trim().length > 0);
}

profileRouter.get('/me', authenticateSession, (req, res) => {
  res.json(req.auth);
});

profileRouter.put('/me', authenticateSession, requireRole('PENGAWAS'), (req, res) => {
  const userId = req.auth!.user.id;
  const ip = extractClientIp(req);

  const existingProfile = db
    .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ? LIMIT 1')
    .get(userId) as SupervisorProfileRow | undefined;

  if (!existingProfile) {
    res.status(404).json({ error: 'Profil pengawas tidak ditemukan.' });
    return;
  }

  const saumLocked = Boolean(existingProfile.saum_supervisor_id);

  const namaLengkap = saumLocked
    ? existingProfile.nama_lengkap
    : typeof req.body?.namaLengkap === 'string'
      ? req.body.namaLengkap.trim()
      : existingProfile.nama_lengkap;
  const nip = saumLocked
    ? existingProfile.nip
    : typeof req.body?.nip === 'string'
      ? req.body.nip.trim() || null
      : existingProfile.nip;
  const nik = typeof req.body?.nik === 'string' ? req.body.nik.trim() || null : existingProfile.nik;
  const jenisKelamin =
    typeof req.body?.jenisKelamin === 'string'
      ? req.body.jenisKelamin.trim()
      : existingProfile.jenis_kelamin;
  const tempatLahir =
    typeof req.body?.tempatLahir === 'string'
      ? req.body.tempatLahir.trim()
      : existingProfile.tempat_lahir;
  const tanggalLahir =
    typeof req.body?.tanggalLahir === 'string'
      ? req.body.tanggalLahir.trim()
      : existingProfile.tanggal_lahir;
  const alamat =
    typeof req.body?.alamat === 'string' ? req.body.alamat.trim() : existingProfile.alamat;
  const noWhatsapp =
    typeof req.body?.noWhatsapp === 'string'
      ? req.body.noWhatsapp.trim()
      : existingProfile.no_whatsapp;
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase() || null
      : existingProfile.email;
  const asalMadrasah =
    typeof req.body?.asalMadrasah === 'string'
      ? req.body.asalMadrasah.trim()
      : existingProfile.asal_madrasah;
  const jabatan =
    typeof req.body?.jabatan === 'string' ? req.body.jabatan.trim() : existingProfile.jabatan;
  const mataPelajaran =
    typeof req.body?.mataPelajaran === 'string'
      ? req.body.mataPelajaran.trim() || null
      : existingProfile.mata_pelajaran;

  if (!namaLengkap || !jenisKelamin || !tempatLahir || !tanggalLahir || !alamat || !noWhatsapp || !asalMadrasah || !jabatan) {
    res.status(400).json({
      error:
        'Nama lengkap, jenis kelamin, tempat & tanggal lahir, alamat, nomor WhatsApp, asal madrasah, dan jabatan wajib diisi.',
    });
    return;
  }

  if (email) {
    const dupEmail = db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1')
      .get(email, userId) as { id: string } | undefined;
    if (dupEmail) {
      res.status(409).json({ error: 'Email sudah digunakan oleh akun lain.' });
      return;
    }
  }

  if (nip) {
    const dupNip = db
      .prepare('SELECT id FROM supervisor_profiles WHERE nip = ? AND user_id != ? LIMIT 1')
      .get(nip, userId) as { id: string } | undefined;
    if (dupNip) {
      res.status(409).json({ error: 'NIP sudah digunakan oleh akun pengawas lain.' });
      return;
    }
  }

  if (nik) {
    const dupNik = db
      .prepare('SELECT id FROM supervisor_profiles WHERE nik = ? AND user_id != ? LIMIT 1')
      .get(nik, userId) as { id: string } | undefined;
    if (dupNik) {
      res.status(409).json({ error: 'NIK sudah digunakan oleh akun pengawas lain.' });
      return;
    }
  }

  const nextProfileCandidate: SupervisorProfileRow = {
    ...existingProfile,
    nama_lengkap: namaLengkap,
    nip,
    nik,
    jenis_kelamin: jenisKelamin,
    tempat_lahir: tempatLahir,
    tanggal_lahir: tanggalLahir,
    alamat,
    no_whatsapp: noWhatsapp,
    email,
    asal_madrasah: asalMadrasah,
    jabatan,
    mata_pelajaran: mataPelajaran,
  };

  const completed = isProfileComplete(nextProfileCandidate) ? 1 : 0;
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE supervisor_profiles SET
        nama_lengkap = ?, nip = ?, nik = ?, jenis_kelamin = ?, tempat_lahir = ?,
        tanggal_lahir = ?, alamat = ?, no_whatsapp = ?, email = ?, asal_madrasah = ?,
        jabatan = ?, mata_pelajaran = ?, profile_completed = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      namaLengkap,
      nip,
      nik,
      jenisKelamin,
      tempatLahir,
      tanggalLahir,
      alamat,
      noWhatsapp,
      email,
      asalMadrasah,
      jabatan,
      mataPelajaran,
      completed,
      now,
      userId
    );

    db.prepare('UPDATE users SET email = ?, profile_completed = ?, updated_at = ? WHERE id = ?').run(
      email,
      completed,
      now,
      userId
    );
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Gagal memperbarui profil pengawas.' });
    return;
  }

  recordAuditLog({
    userId,
    usernameSnapshot: req.auth!.user.username,
    activity: 'PROFILE_UPDATED',
    description: `Profil pengawas "${req.auth!.user.username}" diperbarui (status profil: ${
      completed === 1 ? 'COMPLETE' : 'INCOMPLETE'
    }).`,
    ipAddress: ip,
  });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
  const profile = db
    .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ?')
    .get(userId) as unknown as SupervisorProfileRow;

  res.json(buildAuthContext(user, profile));
});

profileRouter.post(
  '/me/photo',
  authenticateSession,
  requireRole('PENGAWAS'),
  (req, res, next) => {
    upload.single('photo')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Ukuran foto profil maksimal 2 MB.' });
          return;
        }
        res.status(400).json({ error: 'Gagal memproses berkas foto yang diunggah.' });
        return;
      }
      next();
    });
  },
  (req, res) => {
    const userId = req.auth!.user.id;
    const ip = extractClientIp(req);

    if (!req.file) {
      res.status(400).json({ error: 'Pilih berkas foto (JPG, PNG, atau WEBP) terlebih dahulu.' });
      return;
    }

    const detectedMime = detectImageMimeFromMagicBytes(req.file.buffer);
    if (!detectedMime) {
      res.status(400).json({
        error: 'Format foto tidak valid. Hanya gambar JPG, PNG, atau WEBP asli yang diperbolehkan.',
      });
      return;
    }

    const ext = detectedMime === 'image/jpeg' ? 'jpg' : detectedMime === 'image/png' ? 'png' : 'webp';
    const filename = `${generateId('foto')}.${ext}`;
    const destPath = path.join(PROFILE_PHOTOS_DIR, filename);

    const existingProfile = db
      .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ? LIMIT 1')
      .get(userId) as SupervisorProfileRow | undefined;

    if (!existingProfile) {
      res.status(404).json({ error: 'Profil pengawas tidak ditemukan.' });
      return;
    }

    fs.writeFileSync(destPath, req.file.buffer, { mode: 0o600 });

    // Remove previous photo safely if present
    if (existingProfile.foto_profil) {
      const oldPath = path.join(PROFILE_PHOTOS_DIR, path.basename(existingProfile.foto_profil));
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    const updatedCandidate: SupervisorProfileRow = {
      ...existingProfile,
      foto_profil: filename,
    };
    const completed = isProfileComplete(updatedCandidate) ? 1 : 0;
    const now = new Date().toISOString();

    db.prepare(
      'UPDATE supervisor_profiles SET foto_profil = ?, profile_completed = ?, updated_at = ? WHERE user_id = ?'
    ).run(filename, completed, now, userId);

    db.prepare('UPDATE users SET profile_completed = ?, updated_at = ? WHERE id = ?').run(
      completed,
      now,
      userId
    );

    recordAuditLog({
      userId,
      usernameSnapshot: req.auth!.user.username,
      activity: 'PHOTO_UPLOADED',
      description: `Foto profil pengawas "${req.auth!.user.username}" disimpan di penyimpanan privat.`,
      ipAddress: ip,
    });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
    const profile = db
      .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ?')
      .get(userId) as unknown as SupervisorProfileRow;

    res.json(buildAuthContext(user, profile));
  }
);

profileRouter.get('/:userId/photo', authenticateSession, (req, res) => {
  const targetUserId = req.params.userId;
  const requester = req.auth!.user;

  if (requester.role !== 'ADMIN' && requester.id !== targetUserId) {
    recordAuditLog({
      userId: requester.id,
      usernameSnapshot: requester.username,
      activity: 'ACCESS_DENIED',
      description: `Pengawas "${requester.username}" mencoba mengakses foto profil milik user ${targetUserId}.`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses foto profil pengguna lain.' });
    return;
  }

  const profile = db
    .prepare('SELECT foto_profil FROM supervisor_profiles WHERE user_id = ? LIMIT 1')
    .get(targetUserId) as { foto_profil: string | null } | undefined;

  if (!profile?.foto_profil) {
    res.status(404).json({ error: 'Foto profil belum tersedia.' });
    return;
  }

  const safeName = path.basename(profile.foto_profil);
  const fullPath = path.join(PROFILE_PHOTOS_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Berkas foto tidak ditemukan di penyimpanan privat.' });
    return;
  }

  const ext = path.extname(safeName).toLowerCase();
  const contentType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(fullPath).pipe(res);
});
