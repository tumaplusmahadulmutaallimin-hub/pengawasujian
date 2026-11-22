import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database.ts';
import { generateId } from './crypto.ts';

export type AllowedDocumentMime = 'image/jpeg' | 'image/png' | 'application/pdf';

const ALLOWED_EXTENSIONS_BY_MIME: Record<AllowedDocumentMime, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
};

const CANONICAL_EXT_BY_MIME: Record<AllowedDocumentMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export function getMaxUploadMb(): number {
  try {
    const row = db
      .prepare(
        "SELECT max_upload_mb FROM integration_settings WHERE integration_name = 'SAUM_READ_ONLY' LIMIT 1"
      )
      .get() as { max_upload_mb?: number } | undefined;
    if (row && typeof row.max_upload_mb === 'number' && Number.isFinite(row.max_upload_mb)) {
      return Math.max(1, Math.min(25, Math.round(row.max_upload_mb)));
    }
  } catch {
    // Fallback if queried during early bootstrap
  }
  const envVal = Number(process.env.SIPENGUJI_MAX_UPLOAD_MB);
  if (Number.isFinite(envVal) && envVal >= 1 && envVal <= 25) {
    return Math.round(envVal);
  }
  return 10;
}

export function getMaxUploadBytes(): number {
  return getMaxUploadMb() * 1024 * 1024;
}

export function detectAllowedUploadMimeFromMagicBytes(
  buffer: Buffer
): AllowedDocumentMime | null {
  if (!buffer || buffer.length < 8) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
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

  // PDF: %PDF- (may have leading whitespace/BOM in rare valid generators, check first 1024 bytes)
  const headAscii = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('ascii');
  if (headAscii.trimStart().startsWith('%PDF-')) {
    return 'application/pdf';
  }

  return null;
}

export function validateUploadedFileBuffer(params: {
  buffer: Buffer;
  originalName: string;
  declaredMime?: string;
}): { ok: true; mimeType: AllowedDocumentMime; canonicalExt: string; sanitizedOriginalName: string } | { ok: false; error: string; status: number } {
  const { buffer, originalName } = params;

  if (!buffer || buffer.length === 0) {
    return { ok: false, error: 'Berkas kosong atau tidak terbaca.', status: 400 };
  }

  const maxMb = getMaxUploadMb();
  const maxBytes = maxMb * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return {
      ok: false,
      error: `Ukuran berkas melebihi batas maksimal ${maxMb} MB.`,
      status: 400,
    };
  }

  const baseName = path.basename(originalName || 'dokumen').replace(/[\r\n\0]/g, '');
  const ext = path.extname(baseName).toLowerCase();

  if (!['.jpg', '.jpeg', '.png', '.pdf'].includes(ext)) {
    return {
      ok: false,
      error: 'Ekstensi berkas tidak diizinkan. Gunakan hanya JPG, JPEG, PNG, atau PDF.',
      status: 400,
    };
  }

  const detectedMime = detectAllowedUploadMimeFromMagicBytes(buffer);
  if (!detectedMime) {
    return {
      ok: false,
      error: 'Isi berkas tidak valid atau bukan file JPG, PNG, atau PDF asli.',
      status: 400,
    };
  }

  const allowedExtsForMime = ALLOWED_EXTENSIONS_BY_MIME[detectedMime];
  if (!allowedExtsForMime.includes(ext)) {
    return {
      ok: false,
      error: `Ekstensi berkas (${ext}) tidak sesuai dengan isi berkas sebenarnya (${detectedMime}).`,
      status: 400,
    };
  }

  const sanitizedOriginalName =
    baseName.replace(/[^a-zA-Z0-9._\s-]/g, '_').slice(0, 120) ||
    `dokumen.${CANONICAL_EXT_BY_MIME[detectedMime]}`;

  return {
    ok: true,
    mimeType: detectedMime,
    canonicalExt: CANONICAL_EXT_BY_MIME[detectedMime],
    sanitizedOriginalName,
  };
}

export function resolveConfinedPrivateFile(baseDir: string, storedFilename: string): string | null {
  const resolvedBase = path.resolve(baseDir);
  const safeName = path.basename(storedFilename);
  if (!safeName || safeName === '.' || safeName === '..') {
    return null;
  }
  const resolvedTarget = path.resolve(resolvedBase, safeName);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolvedTarget;
}

export function writePrivateFileAtomic(
  baseDir: string,
  prefix: string,
  ext: string,
  buffer: Buffer
): { storageName: string; fullPath: string } {
  fs.mkdirSync(baseDir, { recursive: true });
  const storageName = `${generateId(prefix)}.${ext}`;
  const fullPath = resolveConfinedPrivateFile(baseDir, storageName);
  if (!fullPath) {
    throw new Error('Gagal menentukan lokasi penyimpanan privat yang aman.');
  }
  fs.writeFileSync(fullPath, buffer, { mode: 0o600 });
  return { storageName, fullPath };
}

export function streamPrivateFileResponse(
  res: any,
  fullPath: string,
  mimeType: string,
  originalFilename: string,
  forceDownload = false
): void {
  const safeDispName = path
    .basename(originalFilename || 'dokumen')
    .replace(/["\\\r\n]/g, '_');
  const dispositionType = forceDownload ? 'attachment' : 'inline';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeDispName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (mimeType === 'application/pdf' && !forceDownload) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'none'; frame-ancestors 'self'"
    );
  } else {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox; frame-ancestors 'self'"
    );
  }
  fs.createReadStream(fullPath).pipe(res);
}
