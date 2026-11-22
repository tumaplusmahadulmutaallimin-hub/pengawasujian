import { Router } from 'express';
import { authenticateSession } from '../middleware/auth.ts';
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService.ts';
import { extractClientIp, recordAuditLog } from '../utils/audit.ts';

export const notificationsRouter = Router();

notificationsRouter.use(authenticateSession);

notificationsRouter.get('/', (req, res) => {
  const result = listUserNotifications(req.auth!.user.id);
  res.json(result);
});

notificationsRouter.patch('/read-all', (req, res) => {
  const updatedCount = markAllNotificationsRead(req.auth!.user.id);
  res.json({ success: true, updatedCount });
});

notificationsRouter.patch('/:id/read', (req, res) => {
  const user = req.auth!.user;
  const result = markNotificationRead(req.params.id, user.id);

  if (result.status === 'NOT_FOUND') {
    res.status(404).json({ error: 'Notifikasi tidak ditemukan.' });
    return;
  }

  if (result.status === 'FORBIDDEN') {
    recordAuditLog({
      userId: user.id,
      usernameSnapshot: user.username,
      activity: 'ACCESS_DENIED',
      description: `Pengguna "${user.username}" mencoba mengubah status baca notifikasi milik pengguna lain (${req.params.id}).`,
      ipAddress: extractClientIp(req),
    });
    res.status(403).json({ error: 'Anda tidak memiliki izin mengubah notifikasi ini.' });
    return;
  }

  res.json({ success: true, notification: result.notification });
});
