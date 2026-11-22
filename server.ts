import './server/utils/loadEnv.ts';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { PRIVATE_STORAGE_ROOT, db } from './server/db/database.ts';
import { startSaumPeriodicScheduler } from './server/integrations/saumConnector.ts';
import { SESSION_COOKIE_NAME } from './server/middleware/auth.ts';
import { adminRouter } from './server/routes/admin.ts';
import { authRouter } from './server/routes/auth.ts';
import { notificationsRouter } from './server/routes/notifications.ts';
import { pengawasRouter } from './server/routes/pengawas.ts';
import { profileRouter } from './server/routes/profile.ts';
import { extractClientIp, recordAuditLog } from './server/utils/audit.ts';
import { getAppEnvironment } from './server/utils/loadEnv.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Protect cookie-authenticated mutating API endpoints from cross-origin browser requests
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }

    const hasSessionCookie = Boolean(req.cookies?.[SESSION_COOKIE_NAME]);
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (hasSessionCookie && originHeader) {
      const requestHost = req.get('x-forwarded-host') || req.get('host') || '';
      try {
        const originHost = new URL(originHeader).host;
        if (requestHost && originHost !== requestHost) {
          recordAuditLog({
            activity: 'ACCESS_DENIED',
            description: `Permintaan mutasi lintas-origin ditolak (origin: ${originHost}, host: ${requestHost}).`,
            ipAddress: extractClientIp(req),
          });
          res.status(403).json({
            error: 'Permintaan lintas-origin tidak diizinkan oleh kebijakan keamanan SIPENGUJI.',
          });
          return;
        }
      } catch {
        res.status(403).json({ error: 'Header Origin permintaan tidak valid.' });
        return;
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    let dbOk = false;
    let storageOk = false;
    try {
      db.prepare('SELECT 1 as ok').get();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    try {
      fs.accessSync(PRIVATE_STORAGE_ROOT, fs.constants.R_OK | fs.constants.W_OK);
      storageOk = true;
    } catch {
      storageOk = false;
    }

    const healthy = dbOk && storageOk;
    const environment = getAppEnvironment();
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'SIPENGUJI',
      phase: '06',
      environment,
      isStaging: environment === 'staging',
      database: dbOk ? 'ok' : 'error',
      storage: storageOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/profiles', profileRouter);
  app.use('/api/pengawas', pengawasRouter);
  app.use('/api/supervisor', pengawasRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/notifications', notificationsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API SIPENGUJI tidak ditemukan.' });
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  // Centralized error handler returning clean JSON without stack traces
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Format JSON pada body permintaan tidak valid.' });
      return;
    }
    if (req.originalUrl.startsWith('/api')) {
      res.status(500).json({ error: 'Terjadi kesalahan internal pada layanan SIPENGUJI.' });
      return;
    }
    res.status(500).send('Terjadi kesalahan internal pada server SIPENGUJI.');
  });

  startSaumPeriodicScheduler();

  app.listen(port, '0.0.0.0', () => {
    console.log(`SIPENGUJI server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SIPENGUJI server:', err);
  process.exit(1);
});
