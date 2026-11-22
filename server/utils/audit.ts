import type { Request } from 'express';
import { db } from '../db/database.ts';
import { generateId } from './crypto.ts';

export interface AuditEntryInput {
  userId?: string | null;
  usernameSnapshot?: string | null;
  activity: string;
  description: string;
  ipAddress?: string | null;
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function recordAuditLog(entry: AuditEntryInput): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, username_snapshot, activity, description, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId('aud'),
    entry.userId ?? null,
    entry.usernameSnapshot ?? null,
    entry.activity,
    entry.description,
    entry.ipAddress ?? null,
    now
  );
}
