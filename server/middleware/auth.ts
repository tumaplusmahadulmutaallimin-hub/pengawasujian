import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/database.ts';
import type {
  AssignmentStatus,
  AuthenticatedContext,
  OperationalAccessStatus,
  ProfileStatus,
  SupervisorProfileRow,
  UserRole,
  UserRow,
} from '../types.ts';
import { extractClientIp, recordAuditLog } from '../utils/audit.ts';
import { hashToken } from '../utils/crypto.ts';

export const SESSION_COOKIE_NAME = 'sipenguji_session';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
    }
  }
}

export function buildAuthContext(
  user: UserRow,
  profile: SupervisorProfileRow | null
): AuthenticatedContext {
  const profileCompleted =
    user.role === 'ADMIN'
      ? true
      : Boolean(user.profile_completed === 1 && profile?.profile_completed === 1);
  const profileStatus: ProfileStatus = profileCompleted ? 'COMPLETE' : 'INCOMPLETE';
  const assignmentStatus: AssignmentStatus = profile?.assignment_status ?? 'NOT_ASSIGNED';

  const operationalAccessStatus: OperationalAccessStatus =
    user.role === 'PENGAWAS' &&
    user.account_status === 'ACTIVE' &&
    profileStatus === 'COMPLETE' &&
    assignmentStatus === 'ASSIGNED'
      ? 'AVAILABLE'
      : 'LOCKED';

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      accountStatus: user.account_status,
      profileCompleted,
      profileStatus,
      assignmentStatus,
      operationalAccessStatus,
      lastLogin: user.last_login,
      createdAt: user.created_at,
    },
    profile,
  };
}

export function authenticateSession(req: Request, res: Response, next: NextFunction): void {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!rawToken) {
    res.status(401).json({ error: 'Sesi autentikasi tidak ditemukan. Silakan masuk terlebih dahulu.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const session = db
    .prepare('SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ? LIMIT 1')
    .get(tokenHash) as { id: string; user_id: string; expires_at: string } | undefined;

  if (!session) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
    return;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Sesi telah kedaluwarsa. Silakan masuk kembali.' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(session.user_id) as
    | UserRow
    | undefined;

  if (!user) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
    return;
  }

  if (user.account_status !== 'ACTIVE') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(403).json({
      error: `Akun berstatus ${user.account_status} dan tidak diizinkan mengakses sistem.`,
    });
    return;
  }

  const profile = db
    .prepare('SELECT * FROM supervisor_profiles WHERE user_id = ? LIMIT 1')
    .get(user.id) as SupervisorProfileRow | undefined;

  req.auth = buildAuthContext(user, profile ?? null);
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autentikasi diperlukan.' });
      return;
    }

    if (!allowedRoles.includes(req.auth.user.role)) {
      recordAuditLog({
        userId: req.auth.user.id,
        usernameSnapshot: req.auth.user.username,
        activity: 'ACCESS_DENIED',
        description: `Percobaan akses tanpa izin oleh role ${req.auth.user.role} ke ${req.originalUrl}.`,
        ipAddress: extractClientIp(req),
      });
      res.status(403).json({
        error: 'Akses ditolak. Peran Anda tidak memiliki izin untuk fitur ini.',
      });
      return;
    }

    next();
  };
}

export function requireOperationalAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Autentikasi diperlukan.' });
    return;
  }

  const { user } = req.auth;
  if (user.role !== 'PENGAWAS') {
    res.status(403).json({ error: 'Endpoint ini khusus untuk Pengawas.' });
    return;
  }

  if (user.accountStatus !== 'ACTIVE') {
    res.status(403).json({
      error: 'Akses operasional ditolak karena status akun tidak aktif.',
      code: 'ACCOUNT_NOT_ACTIVE',
      operationalAccessStatus: 'LOCKED',
    });
    return;
  }

  if (!user.profileCompleted) {
    res.status(403).json({
      error: 'Akses operasional terkunci. Lengkapi profil dan unggah foto profil terlebih dahulu.',
      code: 'PROFILE_INCOMPLETE',
      operationalAccessStatus: 'LOCKED',
    });
    return;
  }

  if (user.assignmentStatus !== 'ASSIGNED') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Akses fitur operasional ditolak karena status penugasan ${user.assignmentStatus}.`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({
      error:
        'Akses fitur operasional terkunci karena belum terdapat penugasan pengawas yang sah dari SAUM.',
      code: 'NO_VALID_ASSIGNMENT',
      assignmentStatus: user.assignmentStatus,
      operationalAccessStatus: 'LOCKED',
    });
    return;
  }

  next();
}
