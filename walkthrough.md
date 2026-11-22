# Security Summary

SIPENGUJI is an isolated examination supervision companion application built separately from SAUM. All authentication, role-based authorization, private file storage, SAUM read-only synchronization, and independent backup/restore controls are enforced server-side.

## Implemented Safeguards

1. **Read-Only Isolation from SAUM**:
   - The SAUM connector (`server/integrations/saumConnector.ts`) only reads from explicitly configured HTTP GET endpoints or read-only JSON files and rejects restricted endpoints (`/api/auth/login`, `/api/state`, `/api/backup`).
   - All supervisor documents, incident reports, photos, notifications, audit logs, and backups are persisted exclusively in SIPENGUJI's isolated SQLite database (`data/sipenguji.db`) and private storage (`storage/private/`).

2. **Authentication, Session Cookies, & Origin Verification**:
   - Passwords are stored using per-user `scrypt` salted hashes (`server/utils/crypto.ts`).
   - Session tokens are cryptographically random, stored as SHA-256 digests in the `sessions` table, and delivered via `HttpOnly` cookies (`SameSite=None; Secure; Partitioned` on HTTPS/iframe, `SameSite=Lax` on local HTTP).
   - Public auth endpoints enforce rate limiting (`server/middleware/rateLimit.ts`), and cookie-authenticated mutating requests (`/api/*` POST/PUT/PATCH/DELETE) verify same-host `Origin` headers in `server.ts`.

3. **Role-Based Access Control & Object Ownership**:
   - Every `/api/admin/*` route enforces `authenticateSession` + `requireRole('ADMIN')`.
   - Every `/api/pengawas/*` and `/api/supervisor/*` route enforces `authenticateSession` + `requireRole('PENGAWAS')`, plus strict server-side assignment ownership checks for schedules, rooms, exam participants, documents, document previews, and incident reports.
   - Supervisor personal activity logs on `/api/pengawas/dashboard` select only non-sensitive columns scoped strictly by `user_id = req.auth.user.id`.

4. **File Upload Validation & Confined Private Streaming**:
   - All uploaded profile photos, supervision documents, and incident attachments are validated against both filename extension and binary magic bytes (`FF D8 FF` JPEG, PNG header, `%PDF-`) within server-enforced size limits (`server/utils/fileSecurity.ts`).
   - Private files are saved outside public static directories with `0o600` permissions, resolved via `path.basename` and directory confinement checks, and streamed with `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, and restrictive `Content-Security-Policy` headers.

5. **Integrity-Verified SIPENGUJI Backup & Restore & Error Handling**:
   - Backup archives (`server/services/backupService.ts`) include SHA-256 payload and per-file checksums, require explicit confirmation (`confirmRestore=true`), snapshot the current database before restoration, execute SQL updates inside a transaction with strictly whitelisted table and column lists, and exclude SAUM entirely.
   - Global Express error middleware in `server.ts` returns clean `400` JSON on malformed JSON requests and generic `500` JSON on unexpected failures without exposing stack traces.

---

## PoC Verification

All verification checks below are executed against an isolated temporary server instance (`SIPENGUJI_DB_PATH` and `SIPENGUJI_PRIVATE_STORAGE` pointed to temporary directories, with a `chmod 444` read-only SAUM JSON fixture whose SHA-256 hash is checked before and after tests).

1. **Cross-Role & Horizontal Access Rejection**:
   - Requesting `/api/admin/dashboard` or `/api/admin/backup/download` using a Pengawas session cookie returns HTTP `403` and logs an `ACCESS_DENIED` entry.
   - Requesting another room's students, documents, or another supervisor's incident report returns HTTP `403` (`FORBIDDEN`).
2. **Origin & Malformed Input Protection**:
   - Submitting a cookie-authenticated `POST` with a mismatched `Origin: https://untrusted.example` header returns HTTP `403`.
   - Submitting malformed JSON to `/api/auth/login` returns HTTP `400` without leaking server stack traces.
3. **Upload Spoofing & Path Confinement**:
   - Uploading an executable or text payload renamed to `.pdf` or `.jpg` is rejected with HTTP `400` because magic bytes do not match.
4. **Backup & Restore Integrity + SAUM Immutability**:
   - Downloading a `.json.gz` backup, modifying a tampered checksum, and attempting restore returns HTTP `400`.
   - Downloading a valid backup, mutating isolated SIPENGUJI DB + private files, and restoring with `confirmRestore=true` recovers all DB records and disk file byte checksums identically while keeping the `chmod 444` SAUM fixture SHA-256 unchanged.
