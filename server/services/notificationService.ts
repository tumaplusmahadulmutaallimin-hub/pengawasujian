import { db } from '../db/database.ts';
import type { NotificationRow } from '../types.ts';
import { generateId } from '../utils/crypto.ts';

export function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}): NotificationRow {
  const id = generateId('ntf');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (
      id, user_id, type, title, message, related_entity_type, related_entity_id,
      is_read, read_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `).run(
    id,
    input.userId,
    input.type,
    input.title,
    input.message,
    input.relatedEntityType ?? null,
    input.relatedEntityId ?? null,
    now
  );

  return {
    id,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: input.relatedEntityId ?? null,
    is_read: 0,
    read_at: null,
    created_at: now,
  };
}

export function notifyActiveAdmins(input: {
  type: string;
  title: string;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}): void {
  const admins = db
    .prepare("SELECT id FROM users WHERE role = 'ADMIN' AND account_status = 'ACTIVE'")
    .all() as unknown as Array<{ id: string }>;

  for (const admin of admins) {
    createNotification({
      userId: admin.id,
      ...input,
    });
  }
}

export function findUserIdsBySaumSupervisorIds(
  saumIds: Array<string | null | undefined>
): string[] {
  const cleaned = Array.from(new Set(saumIds.filter((s): s is string => Boolean(s && s.trim()))));
  if (cleaned.length === 0) return [];
  const stmt = db.prepare(
    'SELECT user_id FROM supervisor_profiles WHERE saum_supervisor_id = ? LIMIT 1'
  );
  const found: string[] = [];
  for (const sid of cleaned) {
    const row = stmt.get(sid) as { user_id: string } | undefined;
    if (row?.user_id) found.push(row.user_id);
  }
  return Array.from(new Set(found));
}

export function listUserNotifications(userId: string): {
  notifications: NotificationRow[];
  unreadCount: number;
} {
  const notifications = db
    .prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60'
    )
    .all(userId) as unknown as NotificationRow[];

  const unreadCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(userId) as { cnt: number }
  ).cnt;

  return { notifications, unreadCount };
}

export function markNotificationRead(
  notificationId: string,
  requesterUserId: string
): { status: 'NOT_FOUND' | 'FORBIDDEN' | 'OK'; notification?: NotificationRow } {
  const row = db
    .prepare('SELECT * FROM notifications WHERE id = ? LIMIT 1')
    .get(notificationId) as unknown as NotificationRow | undefined;

  if (!row) {
    return { status: 'NOT_FOUND' };
  }
  if (row.user_id !== requesterUserId) {
    return { status: 'FORBIDDEN' };
  }

  if (row.is_read === 0) {
    const now = new Date().toISOString();
    db.prepare('UPDATE notifications SET is_read = 1, read_at = ? WHERE id = ?').run(
      now,
      notificationId
    );
    return { status: 'OK', notification: { ...row, is_read: 1, read_at: now } };
  }

  return { status: 'OK', notification: row };
}

export function markAllNotificationsRead(userId: string): number {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE notifications SET is_read = 1, read_at = ? WHERE user_id = ? AND is_read = 0')
    .run(now, userId);
  return Number(result.changes || 0);
}
