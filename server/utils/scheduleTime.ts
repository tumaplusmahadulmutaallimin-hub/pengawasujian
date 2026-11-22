export type ScheduleLifecycleStatus =
  | 'AKAN_DATANG'
  | 'BERLANGSUNG'
  | 'SELESAI'
  | 'BELUM_TERJADWAL';

export type ScheduleDateRange = 'all' | 'today' | 'tomorrow' | 'week' | 'month';

export function getJakartaNow(): {
  dateStr: string;
  timeStr: string;
  year: number;
  month: number;
  day: number;
} {
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateStr = dateFormatter.format(now); // YYYY-MM-DD
  let timeStr = timeFormatter.format(now); // HH:mm
  if (timeStr.startsWith('24:')) {
    timeStr = '00:' + timeStr.slice(3);
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  return { dateStr, timeStr, year: y, month: m, day: d };
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function getJakartaWeekBounds(todayStr: string): { start: string; end: string } {
  const [y, m, d] = todayStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = utcDate.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = addDaysToYmd(todayStr, diffToMonday);
  const end = addDaysToYmd(start, 6);
  return { start, end };
}

export function normalizeDateYmd(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const dmyMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }
  return null;
}

export function normalizeTimeHm(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace('.', ':');
  const match = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hh = match[1].padStart(2, '0');
  const mm = match[2];
  return `${hh}:${mm}`;
}

export function computeScheduleStatus(
  tanggalRaw: string | null | undefined,
  waktuMulaiRaw: string | null | undefined,
  waktuSelesaiRaw: string | null | undefined,
  jakartaNow = getJakartaNow()
): ScheduleLifecycleStatus {
  const tanggal = normalizeDateYmd(tanggalRaw);
  if (!tanggal) return 'BELUM_TERJADWAL';

  if (tanggal > jakartaNow.dateStr) return 'AKAN_DATANG';
  if (tanggal < jakartaNow.dateStr) return 'SELESAI';

  const start = normalizeTimeHm(waktuMulaiRaw);
  const end = normalizeTimeHm(waktuSelesaiRaw);
  if (!start || !end) {
    return 'BERLANGSUNG';
  }

  if (jakartaNow.timeStr < start) return 'AKAN_DATANG';
  if (jakartaNow.timeStr <= end) return 'BERLANGSUNG';
  return 'SELESAI';
}

export function matchesJakartaDateRange(
  tanggalRaw: string | null | undefined,
  range: ScheduleDateRange,
  jakartaNow = getJakartaNow()
): boolean {
  if (range === 'all') return true;
  const tanggal = normalizeDateYmd(tanggalRaw);
  if (!tanggal) return false;

  if (range === 'today') return tanggal === jakartaNow.dateStr;
  if (range === 'tomorrow') return tanggal === addDaysToYmd(jakartaNow.dateStr, 1);
  if (range === 'week') {
    const { start, end } = getJakartaWeekBounds(jakartaNow.dateStr);
    return tanggal >= start && tanggal <= end;
  }
  if (range === 'month') {
    return tanggal.slice(0, 7) === jakartaNow.dateStr.slice(0, 7);
  }
  return true;
}
