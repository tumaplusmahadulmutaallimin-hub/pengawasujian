import type { NextFunction, Request, Response } from 'express';
import { extractClientIp } from '../utils/audit.ts';

interface Bucket {
  timestamps: number[];
}

export function createRateLimiter(options: {
  windowMs: number;
  maxAttempts: number;
  message: string;
}) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = extractClientIp(req);
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const existing = buckets.get(key) ?? { timestamps: [] };
    existing.timestamps = existing.timestamps.filter((t) => t > cutoff);

    if (existing.timestamps.length >= options.maxAttempts) {
      const oldest = existing.timestamps[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: options.message,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    existing.timestamps.push(now);
    buckets.set(key, existing);
    next();
  };
}
