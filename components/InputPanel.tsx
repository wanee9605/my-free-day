'use client';

import { daysInMonth } from '@/lib/calendar';
import { SUPPORTED_YEARS } from '@/lib/holidays';
import { MAX_BLACKOUT_RANGES, MAX_LEAVE_INPUT } from '@/lib/optimize';
import type { DateRange, OptimizeMode } from '@/lib/types';
import { clampLeave, type PlannerState } from '@/lib/urlState';

interface Props {
  year: number;
  state: PlannerState;
  onChange: (next: PlannerState) => void; // 디바운스 적용 (타이핑)
  onCommit: (next: PlannerState) => void; // 즉시 반영 (버튼·토글)
  onYearChange: (year: number) => void;
}

const MODES: { value: OptimizeMode; label: string; hint: string }[] = [
  { value: 'longestStreak', label: '긴 연휴', hint: '연차를 한 곳에 몰아 가장 긴 연휴 1건을 먼저 확보' },
  { value: 'totalGain', label: '많은 휴일', hint: '연차를 나눠 써서 늘어나는 휴일 총량을 최대화' },
];

const LEAVE_PRESETS = [5, 10, 15, 20, 25];

const FIELD =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-forest-500';

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="eyebrow text-ink-mute">
      {children}
    </label>
  );
}

export default function InputPanel({ year, state, onChange, onCommit, onYearChange }: Props) {
  const setLeaveTyped = (n: number) => onChange({ ...state, leave: clampLeave(n) });
  const setLeave = (n: number) => onCommit({ ...state, leave: clampLeave(n) });
  const setMode = (mode: OptimizeMode) => onCommit({ ...state, mode });
  // 블랙아웃이 바뀌면 클러스터 구성 자체가 달라지므로, 이전에 고정해 둔 배정은 버린다
  // (clusterId 가 다른 연휴를 가리키게 되는 것을 방지)
  const setBlackout = (blackout: DateRange[], immediate = false) =>
    (immediate ? onCommit : onChange)({ ...state, blackout, fixed: {} });

  const updateRange = (idx: number, patch: Partial<DateRange>) =>
    setBlackout(state.blackout.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRange = (idx: number) => setBlackout(state.blackout.filter((_, i) => i !== idx), true);
  const addRange = () => {
    if (state.blackout.length >= MAX_BLACKOUT_RANGES) return;
    setBlackout([...state.blackout, { start: '', end: '' }]);
  };
  const addMonth = (month: number) => {
    if (!month || state.blackout.length >= MAX_BLACKOUT_RANGES) return;
    const mm = String(month).padStart(2, '0');
    const range = {
      start: `${year}-${mm}-01`,
      end: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
    };
    if (state.blackout.some((r) => r.start === range.start && r.end === range.end)) return;
    setBlackout([...state.blackout, range], true);
  };

  const minDate = `${year}-01-01`;
  const maxDate = `${year}-12-31`;
  const activeMode = MODES.find((m) => m.value === state.mode) ?? MODES[0];
  const blackoutFull = state.blackout.length >= MAX_BLACKOUT_RANGES;

  return (
    <section
      aria-label="입력"
      className="rounded-3xl border border-line bg-surface p-6 shadow-raise sm:p-8"
    >
      <div className="grid gap-7 lg:grid-cols-12">
        {/* 보유 연차 */}
        <div className="flex flex-col gap-3 lg:col-span-4">
          <FieldLabel htmlFor="leave-count">보유 연차</FieldLabel>
          <div className="flex items-stretch overflow-hidden rounded-2xl border border-line bg-ivory focus-within:border-forest-500">
            <button
              type="button"
              aria-label="연차 1개 줄이기"
              onClick={() => setLeave(state.leave - 1)}
              disabled={state.leave <= 0}
              className="w-14 shrink-0 text-2xl font-light text-ink-soft transition hover:bg-line-soft hover:text-ink disabled:opacity-30"
            >
              −
            </button>
            <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1 border-x border-line bg-surface px-1">
              <input
                id="leave-count"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_LEAVE_INPUT}
                value={state.leave}
                onChange={(e) => setLeaveTyped(e.target.valueAsNumber)}
                className="numeral w-full min-w-0 bg-transparent py-3 text-center text-4xl text-ink outline-none"
              />
              <span className="shrink-0 pb-3.5 text-sm font-semibold text-ink-mute">일</span>
            </div>
            <button
              type="button"
              aria-label="연차 1개 늘리기"
              onClick={() => setLeave(state.leave + 1)}
              disabled={state.leave >= MAX_LEAVE_INPUT}
              className="w-14 shrink-0 text-2xl font-light text-ink-soft transition hover:bg-line-soft hover:text-ink disabled:opacity-30"
            >
              +
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5" aria-label="연차 빠른 선택">
            {LEAVE_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLeave(n)}
                aria-pressed={state.leave === n}
                className={`min-h-9 rounded-xl border text-xs font-semibold transition ${
                  state.leave === n
                    ? 'border-forest-900 bg-forest-900 text-white'
                    : 'border-line bg-surface text-ink-soft hover:border-forest-300 hover:text-forest-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* 우선순위 */}
        <div className="flex flex-col gap-3 lg:col-span-4">
          <FieldLabel>우선순위</FieldLabel>
          <div role="group" aria-label="우선순위" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-ivory p-1.5">
            {MODES.map((m) => {
              const active = m.value === state.mode;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMode(m.value)}
                  className={`min-h-12 rounded-xl text-sm font-bold transition ${
                    active ? 'bg-forest-900 text-white shadow-lift' : 'text-ink-soft hover:bg-surface hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-ink-mute">{activeMode.hint}</p>
        </div>

        {/* 연도 + 블랙아웃 */}
        <div className="flex flex-col gap-7 lg:col-span-4">
          <div className="flex flex-col gap-3">
            <FieldLabel htmlFor="year-select">연도</FieldLabel>
            <select id="year-select" value={year} onChange={(e) => onYearChange(Number(e.target.value))} className={FIELD}>
              {SUPPORTED_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel>블랙아웃 기간</FieldLabel>
              <span className="text-[11px] text-ink-mute">
                {state.blackout.length}/{MAX_BLACKOUT_RANGES}
              </span>
            </div>
            <div className="flex items-stretch gap-1.5">
              <label className="sr-only" htmlFor="blackout-month">
                월 단위로 추가
              </label>
              <select
                id="blackout-month"
                value=""
                disabled={blackoutFull}
                onChange={(e) => addMonth(Number(e.target.value))}
                className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 text-xs font-semibold text-ink-soft outline-none transition focus:border-forest-500 disabled:opacity-40"
              >
                <option value="">월 전체 제외…</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월 전체
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addRange}
                disabled={blackoutFull}
                className="min-h-10 shrink-0 rounded-xl border border-line px-3 text-xs font-semibold text-ink-soft transition hover:border-forest-300 hover:text-forest-700 disabled:opacity-40"
              >
                직접 입력
              </button>
            </div>

            {state.blackout.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-ink-mute">
                결산·성수기처럼 연차를 쓸 수 없는 기간을 제외합니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {state.blackout.map((r, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <label className="sr-only" htmlFor={`blackout-start-${idx}`}>
                      블랙아웃 {idx + 1} 시작일
                    </label>
                    <input
                      id={`blackout-start-${idx}`}
                      type="date"
                      min={minDate}
                      max={maxDate}
                      value={r.start}
                      onChange={(e) => updateRange(idx, { start: e.target.value })}
                      className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2 text-xs text-ink outline-none focus:border-forest-500"
                    />
                    <span className="text-ink-mute">–</span>
                    <label className="sr-only" htmlFor={`blackout-end-${idx}`}>
                      블랙아웃 {idx + 1} 종료일
                    </label>
                    <input
                      id={`blackout-end-${idx}`}
                      type="date"
                      min={r.start || minDate}
                      max={maxDate}
                      value={r.end}
                      onChange={(e) => updateRange(idx, { end: e.target.value })}
                      className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2 text-xs text-ink outline-none focus:border-forest-500"
                    />
                    <button
                      type="button"
                      aria-label={`블랙아웃 ${idx + 1} 삭제`}
                      onClick={() => removeRange(idx)}
                      className="h-10 w-9 shrink-0 rounded-xl text-ink-mute transition hover:bg-clay-soft hover:text-clay"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
