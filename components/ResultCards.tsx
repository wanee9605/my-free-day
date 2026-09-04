'use client';

import { addDays, parseISO } from '@/lib/calendar';
import { WEEKDAY_KO, fmtEfficiency, fmtRange, fmtRangeShort, fmtSelectedDays, holidayShortName } from '@/lib/format';
import type { DayInfo, OptimizeResult, Recommendation } from '@/lib/types';

interface Props {
  result: OptimizeResult;
  dayMap: Map<string, DayInfo>;
  onAdjust: (clusterId: number, slot: number | null) => void;
  onFocus: (clusterId: number, rangeStart: string) => void;
}

/** 연휴 구간을 요일 정렬된 미니 달력으로 표현 */
function StreakStrip({
  start,
  end,
  selected,
  dayMap,
}: {
  start: string;
  end: string;
  selected: string[];
  dayMap: Map<string, DayInfo>;
}) {
  const leaveSet = new Set(selected);
  const startDay = dayMap.get(start);
  const offset = startDay?.weekday ?? 0;
  const cells: (DayInfo | null)[] = Array.from({ length: offset }, () => null);
  const endMs = parseISO(end);
  for (let d = start; parseISO(d) <= endMs; d = addDays(d, 1)) cells.push(dayMap.get(d) ?? null);

  return (
    <div className="flex flex-col gap-1.5" aria-hidden>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-mute">
        {WEEKDAY_KO.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const isLeave = leaveSet.has(d.date);
          const tone = isLeave
            ? 'bg-forest-900 text-white'
            : d.holidayName
              ? 'bg-clay-soft text-clay'
              : d.isOffDuty
                ? 'bg-ivory-deep text-ink-soft'
                : 'bg-ivory text-ink-mute';
          return (
            <span
              key={d.date}
              className={`flex h-9 flex-col items-center justify-center rounded-lg text-[11px] font-bold leading-none ${tone}`}
            >
              <span className="tabular-nums">{Number(d.date.slice(8))}</span>
              <span className="mt-0.5 text-[8px] font-medium opacity-80">
                {isLeave ? '연차' : d.holidayName ? holidayShortName(d.holidayName) : ''}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  r,
  idx,
  dayMap,
  onAdjust,
  onFocus,
}: {
  r: Recommendation;
  idx: number;
  dayMap: Map<string, DayInfo>;
  onAdjust: Props['onAdjust'];
  onFocus: Props['onFocus'];
}) {
  const canAdd = r.nextStep !== null;
  const canRemove = r.prevStep !== null;
  const best = idx === 0;

  return (
    <li
      className={`animate-fade-up group flex flex-col gap-5 rounded-3xl border p-6 transition duration-300 hover:-translate-y-0.5 ${
        best
          ? 'border-forest-900/15 bg-surface shadow-raise'
          : 'border-line bg-surface shadow-lift hover:shadow-raise'
      }`}
      style={{ animationDelay: `${Math.min(idx, 6) * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-bold text-ink-soft">{r.label}</h3>
            {best && (
              <span className="eyebrow rounded-full bg-forest-900 px-2 py-0.5 text-[9px] text-white">Best</span>
            )}
            {r.fixed && (
              <span className="rounded-full border border-gold/40 bg-gold-soft px-2 py-0.5 text-[10px] font-bold text-gold">
                직접 조정
              </span>
            )}
          </div>
          <p className="display mt-2 text-4xl text-ink">
            <span key={r.streak} className="numeral animate-pop inline-block">
              {r.streak}
            </span>
            <span className="ml-1 text-2xl font-bold text-ink-soft">일</span>
          </p>
          <p className="mt-1.5 text-sm text-ink-soft">{fmtRange(r.rangeStart, r.rangeEnd)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-forest-200 bg-forest-50 px-2.5 py-1 text-[11px] font-bold text-forest-700">
          {fmtEfficiency(r.efficiency)}
        </span>
      </div>

      <StreakStrip start={r.rangeStart} end={r.rangeEnd} selected={r.selectedDays} dayMap={dayMap} />

      <p className="text-sm leading-relaxed text-ink-soft">
        <span className="font-bold text-ink">연차 {r.cost}일</span>
        <span className="text-ink-mute"> · {fmtSelectedDays(r.selectedDays)}</span>
      </p>

      <div className="mt-auto flex flex-col gap-3 border-t border-line-soft pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`${r.label} 연차 1일 줄이기`}
              disabled={!canRemove}
              onClick={() => r.prevStep && onAdjust(r.clusterId, r.prevStep.slot)}
              className="h-9 w-9 rounded-xl border border-line text-lg font-light text-ink-soft transition hover:border-forest-300 hover:text-ink disabled:opacity-25"
            >
              −
            </button>
            <span className="min-w-16 text-center text-xs font-bold tabular-nums text-ink">연차 {r.cost}일</span>
            <button
              type="button"
              aria-label={`${r.label} 연차 더 쓰기`}
              disabled={!canAdd}
              onClick={() => r.nextStep && onAdjust(r.clusterId, r.nextStep.slot)}
              className="h-9 w-9 rounded-xl border border-line text-lg font-light text-ink-soft transition hover:border-forest-300 hover:text-ink disabled:opacity-25"
            >
              +
            </button>
            {r.fixed && (
              <button
                type="button"
                onClick={() => onAdjust(r.clusterId, null)}
                className="ml-1 min-h-9 rounded-lg px-2 text-[11px] font-bold text-gold transition hover:bg-gold-soft"
              >
                자동
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onFocus(r.clusterId, r.rangeStart)}
            className="min-h-9 rounded-lg px-2 text-[11px] font-bold text-forest-700 transition hover:bg-forest-50"
          >
            달력에서 보기 ↓
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-ink-mute">
          {r.nextStep
            ? `연차 ${r.nextStep.leave - r.cost}일을 더 쓰면 ${r.nextStep.streak}일 연휴가 됩니다`
            : r.cost >= r.maxLeave
              ? '이 연휴는 최대로 확장되었습니다'
              : '남은 연차가 부족합니다'}
        </p>
      </div>
    </li>
  );
}

export default function ResultCards({ result, dayMap, onAdjust, onFocus }: Props) {
  const { recommendations, baseHolidays } = result;

  return (
    <div className="flex flex-col gap-5">
      {recommendations.length === 0 ? (
        <div className="animate-fade-up rounded-3xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="text-sm text-ink-soft">
            {result.totalLeaveUsed === 0 && result.unusedLeave === 0
              ? '보유 연차를 1일 이상 입력하면 추천 연휴가 표시됩니다.'
              : '블랙아웃 기간 때문에 연차를 쓸 수 있는 연휴가 없습니다. 기간을 조정해 보세요.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {recommendations.map((r, idx) => (
            <Card key={r.clusterId} r={r} idx={idx} dayMap={dayMap} onAdjust={onAdjust} onFocus={onFocus} />
          ))}
        </ul>
      )}

      {baseHolidays.length > 0 && (
        <details
          className="group rounded-3xl border border-line bg-surface px-6 py-4"
          open={recommendations.length === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-ink">
            <span>
              연차를 쓰지 않은 연휴
              <span className="ml-2 font-medium text-ink-mute">{baseHolidays.length}건</span>
            </span>
            <span className="text-xs font-medium text-ink-mute transition group-open:rotate-180">▾</span>
          </summary>
          <ul className="mt-4 flex flex-col gap-2">
            {baseHolidays.map((b) => (
              <li
                key={b.clusterId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ivory px-4 py-3"
              >
                <div className="text-xs text-ink-soft">
                  <span className="font-bold text-ink">{b.label}</span>{' '}
                  <span className="text-ink-mute">{fmtRangeShort(b.rangeStart, b.rangeEnd)}</span> ·{' '}
                  <span className="font-bold">{b.streak}일</span>
                </div>
                {b.nextStep ? (
                  <button
                    type="button"
                    onClick={() => onAdjust(b.clusterId, b.nextStep!.slot)}
                    className="min-h-9 rounded-xl border border-forest-200 bg-surface px-3 text-[11px] font-bold text-forest-700 transition hover:border-forest-500 hover:bg-forest-50"
                  >
                    연차 {b.nextStep.leave}일 쓰고 {b.nextStep.streak}일 연휴로
                  </button>
                ) : (
                  <span className="text-[11px] text-ink-mute">
                    {b.maxLeave === 0 ? '연차 사용 불가' : '남은 연차 부족'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
