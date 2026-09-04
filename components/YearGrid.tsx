'use client';

import { memo, type CSSProperties } from 'react';
import type { OffRun } from '@/lib/manual';
import type { DayInfo } from '@/lib/types';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

interface Props {
  year: number;
  days: DayInfo[];
  runs: OffRun[];
  selected: Set<string>;
  hoverRun: number;
  hoverDate: string | null;
  onToggle: (date: string) => void;
  onHoverRun: (index: number) => void;
  /** 카드에서 "달력에서 보기" 를 눌렀을 때 스크롤 대상 */
  monthRefId?: (month: number) => string;
}

interface Cell {
  key: string;
  day: DayInfo | null;
  runIndex: number;
  bandLeft: boolean;
  bandRight: boolean;
}

/** 연차가 들어간 구간만 날짜 → 구간 번호로 펼친다 */
function buildRunIndex(runs: OffRun[]): Map<string, number> {
  const map = new Map<string, number>();
  runs.forEach((run, index) => {
    const [ys, ms, ds] = run.start.split('-').map(Number);
    const [ye, me, de] = run.end.split('-').map(Number);
    for (let t = Date.UTC(ys, ms - 1, ds); t <= Date.UTC(ye, me - 1, de); t += 86_400_000) {
      const d = new Date(t);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      map.set(iso, index);
    }
  });
  return map;
}

function MonthCard({
  month,
  label,
  weeks,
  tag,
  selected,
  hoverRun,
  hoverDate,
  onToggle,
  onHoverRun,
  anchorId,
}: {
  month: number;
  label: string;
  weeks: Cell[][];
  tag: number | null;
  selected: Set<string>;
  hoverRun: number;
  hoverDate: string | null;
  onToggle: (date: string) => void;
  onHoverRun: (index: number) => void;
  anchorId?: string;
}) {
  return (
    <div
      id={anchorId}
      className="flex min-w-[196px] flex-[1_1_210px] flex-col gap-1.5 scroll-mt-16 rounded-lg border border-line bg-surface px-[11px] pt-[11px] pb-[9px]"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold tracking-[-0.01em]">{label}</span>
        {tag !== null && (
          <span className="rounded bg-acc-soft px-1.5 py-px text-[11px] font-semibold text-acc-ink">{tag}일</span>
        )}
      </div>

      <div className="grid grid-cols-7 border-b border-line-soft pb-0.5">
        {DOW.map((d, i) => (
          <span
            key={d}
            className={`text-center text-[10.5px] font-semibold ${i === 0 ? 'text-sun' : i === 6 ? 'text-sat' : 'text-ink-3'}`}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        {weeks.map((week, wi) => (
          <div key={`${month}-${wi}`} className="grid grid-cols-7">
            {week.map((cell) => (
              <DayCell
                key={cell.key}
                cell={cell}
                selected={selected}
                hoverRun={hoverRun}
                hoverDate={hoverDate}
                onToggle={onToggle}
                onHoverRun={onHoverRun}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCell({
  cell,
  selected,
  hoverRun,
  hoverDate,
  onToggle,
  onHoverRun,
}: {
  cell: Cell;
  selected: Set<string>;
  hoverRun: number;
  hoverDate: string | null;
  onToggle: (date: string) => void;
  onHoverRun: (index: number) => void;
}) {
  const day = cell.day;
  if (!day) return <div className="h-[38px]" />;

  const isLeave = selected.has(day.date) && !day.isOff;
  const inRun = cell.runIndex >= 0;
  const runActive = inRun && hoverRun === cell.runIndex;
  const isHinted = hoverDate === day.date;
  const edge = runActive || isHinted ? 'var(--dc-acc-mid)' : 'var(--dc-run-line)';

  let band: CSSProperties | null = null;
  if (inRun) {
    band = {
      position: 'absolute',
      top: 1,
      bottom: 1,
      left: 0,
      right: 0,
      background: isLeave ? 'var(--dc-acc-soft)' : 'var(--dc-run)',
      borderTop: `1px solid ${edge}`,
      borderBottom: `1px solid ${edge}`,
      borderLeft: cell.bandLeft ? `1px solid ${edge}` : 'none',
      borderRight: cell.bandRight ? `1px solid ${edge}` : 'none',
      borderTopLeftRadius: cell.bandLeft ? 6 : 0,
      borderBottomLeftRadius: cell.bandLeft ? 6 : 0,
      borderTopRightRadius: cell.bandRight ? 6 : 0,
      borderBottomRightRadius: cell.bandRight ? 6 : 0,
      boxShadow: runActive ? 'inset 0 0 0 1px var(--dc-acc-mid)' : undefined,
    };
  } else if (isHinted) {
    band = {
      position: 'absolute',
      top: 1,
      bottom: 1,
      left: 0,
      right: 0,
      background: 'var(--dc-hint)',
      border: '1px dashed var(--dc-acc-mid)',
      borderRadius: 6,
    };
  }

  const holiday = day.holidayName;
  const numberColor =
    holiday || day.weekday === 0 ? 'text-sun' : day.weekday === 6 ? 'text-sat' : isLeave ? 'text-acc-ink' : 'text-ink';
  const caption = holiday ? holiday.replace(/\s*연휴$/, '') : isLeave ? '연차' : '';
  const dayNumber = Number(day.date.slice(8, 10));
  const monthNumber = Number(day.date.slice(5, 7));
  const title = `${monthNumber}월 ${dayNumber}일${holiday ? ` · ${holiday}` : isLeave ? ' · 연차' : ''}`;

  const inner = (
    <>
      {band && <span style={band} aria-hidden />}
      <span className={`relative text-[12.5px] leading-none ${holiday || isLeave ? 'font-bold' : 'font-medium'} ${numberColor}`}>
        {dayNumber}
      </span>
      <span
        className={`relative max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-semibold leading-[1.1] ${
          holiday ? 'text-sun' : 'text-acc-ink'
        }`}
      >
        {caption}
      </span>
    </>
  );

  const shared = 'relative flex h-[38px] flex-col items-center justify-center gap-px';
  const hover = inRun ? { onMouseEnter: () => onHoverRun(cell.runIndex), onMouseLeave: () => onHoverRun(-1) } : {};

  if (!day.selectable) {
    return (
      <div className={shared} title={title} {...hover}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={title}
      aria-pressed={isLeave}
      aria-label={`${title}${isLeave ? ' 연차 취소' : ' 연차 사용'}`}
      onClick={() => onToggle(day.date)}
      className={`${shared} cursor-pointer rounded-md hover:shadow-[inset_0_0_0_1px_var(--dc-acc-mid)]`}
      {...hover}
    >
      {inner}
    </button>
  );
}

function YearGrid({ year, days, runs, selected, hoverRun, hoverDate, onToggle, onHoverRun, monthRefId }: Props) {
  const runIndex = buildRunIndex(runs);
  const inYear = days.filter((d) => d.date.startsWith(`${year}-`));

  const months = MONTHS.map((label, m) => {
    const monthDays = inYear.filter((d) => Number(d.date.slice(5, 7)) === m + 1);
    if (monthDays.length === 0) return { month: m, label, weeks: [] as Cell[][], tag: null };

    const cells: (DayInfo | null)[] = [];
    for (let i = 0; i < monthDays[0].weekday; i++) cells.push(null);
    cells.push(...monthDays);
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: Cell[][] = [];
    for (let w = 0; w < cells.length; w += 7) {
      const row = cells.slice(w, w + 7);
      weeks.push(
        row.map((day, ci) => {
          const idx = day ? (runIndex.get(day.date) ?? -1) : -1;
          const prev = row[ci - 1];
          const next = row[ci + 1];
          const prevIdx = prev ? (runIndex.get(prev.date) ?? -1) : -1;
          const nextIdx = next ? (runIndex.get(next.date) ?? -1) : -1;
          return {
            key: day ? day.date : `blank-${m}-${w}-${ci}`,
            day,
            runIndex: idx,
            bandLeft: idx >= 0 && (ci === 0 || prevIdx !== idx),
            bandRight: idx >= 0 && (ci === 6 || nextIdx !== idx),
          };
        }),
      );
    }

    // 이 달에 걸쳐 있는 연휴 중 가장 긴 것을 배지로
    const touching = runs.filter((r) => {
      const sm = Number(r.start.slice(5, 7));
      const em = Number(r.end.slice(5, 7));
      const sy = r.start.slice(0, 4);
      const ey = r.end.slice(0, 4);
      return (sy === String(year) && sm === m + 1) || (ey === String(year) && em === m + 1);
    });
    const best = touching.reduce<number | null>((acc, r) => (acc === null || r.total > acc ? r.total : acc), null);

    return { month: m, label, weeks, tag: best };
  });

  return (
    <div className="flex flex-wrap gap-2.5">
      {months.map((m) => (
        <MonthCard
          key={m.month}
          month={m.month}
          label={m.label}
          weeks={m.weeks}
          tag={m.tag}
          selected={selected}
          hoverRun={hoverRun}
          hoverDate={hoverDate}
          onToggle={onToggle}
          onHoverRun={onHoverRun}
          anchorId={monthRefId?.(m.month + 1)}
        />
      ))}
    </div>
  );
}

export default memo(YearGrid);
