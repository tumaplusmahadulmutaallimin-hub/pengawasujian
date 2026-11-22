import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getAppEnvironment, isPlaceholderEnvValue } from './loadEnv.ts';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

function getEncryptionKey(): Buffer {
  const envSecret = process.env.SIPENGUJI_SESSION_SECRET?.trim();
  if (envSecret && !isPlaceholderEnvValue(envSecret) && envSecret.length >= 32) {
    return crypto.createHash('sha256').update(envSecret).digest();
  }

  if (getAppEnvironment() === 'production') {
    throw new Error('SIPENGUJI_SESSION_SECRET produksi belum dikonfigurasi atau terlalu lemah.');
  }

  const dbDir = path.dirname(
    path.resolve(process.cwd(), process.env.SIPENGUJI_DB_PATH || 'data/sipenguji.db')
  );
  const keyPath = path.join(dbDir, '.sipenguji-secret-key');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  if (fs.existsSync(keyPath)) {
    const existing = fs.readFileSync(keyPath, 'utf8').trim();
    if (existing.length === 64) {
      return Buffer.from(existing, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, generated.toString('hex'), { mode: 0o600 });
  return generated;
}

export function ensurePersistentSessionSecret(): void {
  void getEncryptionKey();
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, hexHash] = parts;
  if (!salt || !hexHash) return false;

  const expectedBuffer = Buffer.from(hexHash, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });

  if (expectedBuffer.length !== derivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, derivedBuffer);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function maskIdentifier(value: string | null | undefined, visibleTail = 4): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= visibleTail) return '****';
  return `${'*'.repeat(Math.max(4, trimmed.length - visibleTail))}${trimmed.slice(-visibleTail)}`;
}

export function detectImageMimeFromMagicBytes(
  buffer: Buffer
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}
