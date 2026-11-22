import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const cwd = process.cwd();
const explicitEnv = process.env.SIPENGUJI_ENV?.trim().toLowerCase();

const candidateFiles: string[] = [];
if (explicitEnv === 'staging') {
  candidateFiles.push('.env.staging', '.env');
} else if (explicitEnv === 'production') {
  candidateFiles.push('.env.production', '.env');
} else {
  candidateFiles.push('.env', '.env.staging');
}

for (const filename of candidateFiles) {
  const fullPath = path.resolve(cwd, filename);
  if (!fs.existsSync(fullPath)) continue;
  const parsed = dotenv.parse(fs.readFileSync(fullPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (current === undefined || current.trim() === '') {
      process.env[key] = value;
    }
  }
}

export type AppEnvironmentMode = 'staging' | 'production' | 'development';

export function getAppEnvironment(): AppEnvironmentMode {
  const raw = process.env.SIPENGUJI_ENV?.trim().toLowerCase();
  if (raw === 'production') return 'production';
  if (raw === 'development') return 'development';
  if (raw === 'staging') return 'staging';
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') return 'production';
  return 'staging';
}

export function isPlaceholderEnvValue(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return (
    trimmed.startsWith('CHANGE_ME_') ||
    trimmed.startsWith('MY_')
  );
}

export function validateEnvironmentConfig(dbPath: string, storageRoot: string): void {
  const mode = getAppEnvironment();
  const dbLower = dbPath.toLowerCase();
  const storageLower = storageRoot.toLowerCase();

  if (dbLower.includes('saum') || storageLower.includes('saum')) {
    throw new Error('KONFIGURASI DITOLAK: SIPENGUJI tidak boleh menggunakan lokasi database atau penyimpanan SAUM.');
  }

  if (mode === 'production') {
    const sessionSecret = process.env.SIPENGUJI_SESSION_SECRET?.trim();
    if (!sessionSecret || isPlaceholderEnvValue(sessionSecret) || sessionSecret.length < 32) {
      throw new Error(
        'KONFIGURASI PRODUKSI TIDAK LENGKAP: SIPENGUJI_SESSION_SECRET wajib diisi minimal 32 karakter kuat.'
      );
    }
    if (!process.env.SIPENGUJI_DB_PATH?.trim() || !process.env.SIPENGUJI_PRIVATE_STORAGE?.trim()) {
      throw new Error(
        'KONFIGURASI PRODUKSI TIDAK LENGKAP: SIPENGUJI_DB_PATH dan SIPENGUJI_PRIVATE_STORAGE wajib dikonfigurasi terpisah.'
      );
    }
  }
}
