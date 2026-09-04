'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, daysInMonth, parseISO } from '@/lib/calendar';
import { WEEKDAY_KO, fmtKorean, fmtRangeShort, holidayShortName } from '@/lib/format';
import type { DayInfo, OptimizeResult } from '@/lib/types';
import type { CalendarFocus } from './LeavePlanner';

interface Props {
  year: number;
  days: DayInfo[]; // 대상 연도 날짜만 (inYear)
  result: OptimizeResult;
  focus: CalendarFocus | null;
}

interface Mark {
  leave?: boolean;
  band?: { clusterId: number; label: string; start: string; end: string; streak: number };
}

const LEGEND = [
  { key: 'holiday', label: '공휴일', className: 'bg-clay-soft border-clay/25' },
  { key: 'weekend', label: '주말', className: 'bg-ivory-deep border-line' },
  { key: 'leave', label: '추천 연차', className: 'bg-forest-900 border-forest-900' },
  { key: 'band', label: '확보된 연휴', className: 'bg-forest-50 border-forest-200' },
  { key: 'blackout', label: '블랙아웃', className: 'bg-line border-line' },
] as const;

function cellClass(day: DayInfo, mark: Mark | undefined, selected: boolean, focused: boolean): string {
  const base = 'relative flex h-11 flex-col items-center justify-center rounded-lg text-[11px] leading-none transition';
  let tone: string;
  if (mark?.leave) tone = 'bg-forest-900 text-white font-bold shadow-lift';
  else if (day.holidayName)
    tone = `bg-clay-soft text-clay font-bold ${mark?.band ? 'ring-1 ring-inset ring-forest-200' : ''}`;
  else if (mark?.band) tone = 'bg-forest-50 text-forest-800 font-semibold';
  else if (!day.isOff && !day.selectable) tone = 'bg-line text-ink-mute line-through';
  else if (day.isOffDuty) tone = 'bg-ivory-deep text-ink-soft';
  else tone = 'text-ink-soft hover:bg-ivory';
  const ring = selected
    ? 'outline outline-2 outline-offset-1 outline-ink'
    : focused
      ? 'outline outline-2 outline-offset-1 outline-gold'
      : '';
  return `${base} ${tone} ${ring}`;
}

function describe(day: DayInfo, mark: Mark | undefined): string {
  const bits: string[] = [];
  if (day.holidayName) bits.push(day.holidayName);
  else if (day.isOffDuty) bits.push(day.weekday === 0 || day.weekday === 6 ? '주말' : '휴무');
  if (mark?.leave) bits.push('추천 연차');
  if (!day.isOff && !day.selectable) bits.push('블랙아웃');
  if (mark?.band) bits.push(`${mark.band.label} ${fmtRangeShort(mark.band.start, mark.band.end)} · ${mark.band.streak}일`);
  return bits.length > 0 ? bits.join(' · ') : '평일';
}

export default function YearCalendar({ year, days, result, focus }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null);
  // 서버·정적 HTML 은 12개월 전체를 렌더해 SEO 를 유지하고,
  // 모바일에서는 마운트 후 연차가 배정된 달만 접어서 스크롤 길이를 줄인다.
  const [onlyLeaveMonths, setOnlyLeaveMonths] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setOnlyLeaveMonths(true);
  }, []);

  const marks = useMemo(() => {
    const map = new Map<string, Mark>();
    for (const r of result.recommendations) {
      const band = { clusterId: r.clusterId, label: r.label, start: r.rangeStart, end: r.rangeEnd, streak: r.streak };
      const end = parseISO(r.rangeEnd);
      for (let d = r.rangeStart; parseISO(d) <= end; d = addDays(d, 1)) map.set(d, { ...(map.get(d) ?? {}), band });
      for (const d of r.selectedDays) map.set(d, { ...(map.get(d) ?? {}), leave: true });
    }
    return map;
  }, [result]);

  const leavePerMonth = useMemo(() => {
    const counts = new Array<number>(13).fill(0);
    for (const r of result.recommendations) for (const d of r.selectedDays) counts[Number(d.slice(5, 7))]++;
    return counts;
  }, [result]);

  // 카드의 "달력에서 보기" → 해당 월로 스크롤 + 구간 강조
  useEffect(() => {
    if (!focus) return;
    setFocusedCluster(focus.clusterId);
    setSelected(null);
    const timer = setTimeout(() => setFocusedCluster(null), 3500);
    const raf = requestAnimationFrame(() => {
      document.getElementById(`month-${year}-${focus.month}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [focus, year]);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const allMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const leaveMonths = useMemo(() => allMonths.filter((m) => leavePerMonth[m] > 0), [allMonths, leavePerMonth]);
  const collapsed = onlyLeaveMonths && leaveMonths.length > 0;
  const months = collapsed ? leaveMonths : allMonths;
  const selectedDay = selected ? byDate.get(selected) : undefined;

  const jumpTo = (month: number) => {
    if (collapsed && leavePerMonth[month] === 0) setOnlyLeaveMonths(false);
    requestAnimationFrame(() => {
      document.getElementById(`month-${year}-${month}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 월 바로가기 */}
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1.5" role="navigation" aria-label="월 바로가기">
          {allMonths.map((m) => {
            const n = leavePerMonth[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => jumpTo(m)}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition ${
                  n > 0
                    ? 'border-forest-900 bg-forest-900 text-white'
                    : 'border-line bg-surface text-ink-mute hover:border-forest-200 hover:text-forest-700'
                }`}
              >
                {m}월
                {n > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[10px] tabular-nums">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-3 text-[11px]" aria-label="범례">
          {LEGEND.map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              <span className={`inline-block h-3.5 w-3.5 rounded border ${l.className}`} aria-hidden />
              <span className="text-ink-soft">{l.label}</span>
            </li>
          ))}
        </ul>
        {leaveMonths.length > 0 && (
          <button
            type="button"
            onClick={() => setOnlyLeaveMonths((v) => !v)}
            aria-pressed={collapsed}
            className="min-h-9 rounded-full border border-line bg-surface px-3.5 text-xs font-bold text-ink-soft transition hover:border-forest-200 hover:text-forest-700"
          >
            {collapsed ? '12개월 전체 보기' : `연차 있는 달만 (${leaveMonths.length})`}
          </button>
        )}
      </div>

      <p className="min-h-6 text-sm" aria-live="polite">
        {selectedDay ? (
          <>
            <span className="font-bold text-ink">{fmtKorean(selectedDay.date)}</span>
            <span className="text-ink-soft"> · {describe(selectedDay, marks.get(selectedDay.date))}</span>
          </>
        ) : (
          <span className="text-ink-mute">날짜를 누르면 공휴일명과 연휴 정보가 표시됩니다.</span>
        )}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => {
          const first = `${year}-${String(month).padStart(2, '0')}-01`;
          const firstWeekday = byDate.get(first)?.weekday ?? 0;
          const count = daysInMonth(year, month);
          const cells: (DayInfo | null)[] = [
            ...Array.from({ length: firstWeekday }, () => null),
            ...Array.from({ length: count }, (_, i) => byDate.get(addDays(first, i)) ?? null),
          ];
          const leaveCount = leavePerMonth[month];
          const isFocusMonth = focus?.month === month && focusedCluster !== null;
          return (
            <section
              key={month}
              id={`month-${year}-${month}`}
              aria-label={`${month}월`}
              className={`scroll-mt-24 rounded-2xl border bg-surface p-4 transition ${
                isFocusMonth
                  ? 'border-gold shadow-raise'
                  : leaveCount > 0
                    ? 'border-forest-200 shadow-lift'
                    : 'border-line'
              }`}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="numeral text-lg text-ink">
                  {month}
                  <span className="ml-0.5 text-xs font-bold text-ink-mute">월</span>
                </h3>
                {leaveCount > 0 && (
                  <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[10px] font-bold text-forest-700">
                    연차 {leaveCount}일
                  </span>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-mute">
                {WEEKDAY_KO.map((w, i) => (
                  <div key={w} className={i === 0 ? 'text-clay/70' : ''}>
                    {w}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} aria-hidden />;
                  const mark = marks.get(day.date);
                  const focused = focusedCluster !== null && mark?.band?.clusterId === focusedCluster;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelected((cur) => (cur === day.date ? null : day.date))}
                      title={`${fmtKorean(day.date)} · ${describe(day, mark)}`}
                      aria-label={`${fmtKorean(day.date)} ${describe(day, mark)}`}
                      aria-pressed={selected === day.date}
                      className={cellClass(day, mark, selected === day.date, focused)}
                    >
                      <span className="tabular-nums">{Number(day.date.slice(8))}</span>
                      <span className="mt-0.5 w-full truncate px-0.5 text-[8px] font-medium opacity-85">
                        {mark?.leave ? '연차' : day.holidayName ? holidayShortName(day.holidayName) : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
