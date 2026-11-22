import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalendarScheduleItem {
  id: string;
  tanggal: string;
  hari: string;
  namaMapel: string;
  sesi: string;
  waktuMulai: string;
  waktuSelesai: string;
  subtitle: string;
  meta: string;
}

interface ScheduleCalendarViewProps {
  jakartaToday: string;
  items: CalendarScheduleItem[];
  onSelectItem?: (item: CalendarScheduleItem) => void;
  actionLabel?: string;
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function ScheduleCalendarView({
  jakartaToday,
  items,
  onSelectItem,
  actionLabel = 'Detail',
}: ScheduleCalendarViewProps) {
  const initialYm = useMemo(() => {
    const firstDated = items.find((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.tanggal));
    const seed = firstDated?.tanggal || jakartaToday;
    const [y, m] = seed.split('-').map(Number);
    return { year: y || 2026, month: m || 1 };
  }, [items.length === 0 ? jakartaToday : items[0].tanggal]);

  const [cursor, setCursor] = useState(initialYm);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarScheduleItem[]>();
    for (const item of items) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.tanggal)) continue;
      const list = map.get(item.tanggal) ?? [];
      list.push(item);
      map.set(item.tanggal, list);
    }
    return map;
  }, [items]);

  const calendarDays = useMemo(() => {
    const firstDayUtc = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
    const firstDow = firstDayUtc.getUTCDay(); // 0=Sun..6=Sat
    const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1;

    const cells: Array<{ ymd: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ ymd: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ ymd, dayNum: d });
    }
    return cells;
  }, [cursor]);

  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    setCursor({ year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1 });
    setSelectedDate(null);
  };

  const activeDate =
    selectedDate ??
    (itemsByDate.has(jakartaToday) ? jakartaToday : Array.from(itemsByDate.keys()).sort()[0] ?? null);
  const activeDayItems = activeDate ? itemsByDate.get(activeDate) ?? [] : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-emerald-800" />
            <h3 className="text-sm font-bold text-slate-900">
              {MONTHS_ID[cursor.month - 1]} {cursor.year}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Bulan sebelumnya"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Bulan berikutnya"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="py-1.5 text-[11px] font-semibold text-slate-500">
              {wd}
            </div>
          ))}
          {calendarDays.map((cell, idx) => {
            if (!cell.ymd || !cell.dayNum) {
              return <div key={`blank-${idx}`} className="h-12 sm:h-14" />;
            }
            const dayItems = itemsByDate.get(cell.ymd) ?? [];
            const isToday = cell.ymd === jakartaToday;
            const isSelected = cell.ymd === activeDate;
            return (
              <button
                key={cell.ymd}
                type="button"
                onClick={() => setSelectedDate(cell.ymd)}
                className={`h-12 sm:h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-800 border-emerald-800 text-white'
                    : isToday
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : dayItems.length > 0
                        ? 'bg-slate-50 border-slate-200 text-slate-900 hover:border-emerald-600'
                        : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className="text-xs font-mono font-semibold tabular-nums">{cell.dayNum}</span>
                {dayItems.length > 0 && (
                  <span
                    className={`text-[10px] font-mono leading-none ${
                      isSelected ? 'text-amber-300' : 'text-emerald-700 font-semibold'
                    }`}
                  >
                    {dayItems.length} sesi
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col">
        <div className="pb-3 border-b border-slate-100">
          <p className="text-xs text-slate-500">Agenda Tanggal Terpilih</p>
          <p className="text-sm font-bold font-mono text-slate-900 mt-0.5">
            {activeDate || 'Belum ada tanggal jadwal'}
          </p>
        </div>

        <div className="mt-3 space-y-2.5 flex-1">
          {activeDayItems.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Tidak ada jadwal ujian pada tanggal ini.
            </p>
          ) : (
            activeDayItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{item.namaMapel}</p>
                  <span className="text-[11px] font-mono text-emerald-800 font-semibold shrink-0">
                    Sesi {item.sesi}
                  </span>
                </div>
                <p className="text-xs font-mono text-slate-600 tabular-nums">
                  {item.waktuMulai} – {item.waktuSelesai}
                </p>
                <p className="text-xs text-slate-700">{item.subtitle}</p>
                <div className="pt-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">{item.meta}</span>
                  {onSelectItem && (
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer"
                    >
                      {actionLabel}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
