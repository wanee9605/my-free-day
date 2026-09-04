'use client';

import { useState } from 'react';
import ShareButton from './ShareButton';
import { MAX_SHIFT_SPAN, MIN_SHIFT_SPAN, daysInMonth, normalizeWorkPattern } from '@/lib/calendar';
import { fmtRangeShort, fmtShort } from '@/lib/format';
import { SUPPORTED_YEARS } from '@/lib/holidays';
import { statutoryLeaveForYear } from '@/lib/leave';
import type { ManualResult, Suggestion } from '@/lib/manual';
import { MAX_BLACKOUT_RANGES, MAX_LEAVE_INPUT } from '@/lib/optimize';
import type { DateRange, OptimizeMode, WorkPattern } from '@/lib/types';
import { clampLeave, type PlannerState } from '@/lib/urlState';

interface Props {
  year: number;
  state: PlannerState;
  result: ManualResult;
  suggestions: Suggestion[];
  hoverRun: number;
  hoverDate: string | null;
  notBefore?: string;
  onChange: (next: PlannerState) => void;
  onHoverRun: (index: number) => void;
  onHoverDate: (date: string | null) => void;
  onToggleDay: (date: string) => void;
  onYearChange: (year: number) => void;
}

const MODES: { value: OptimizeMode; label: string; hint: string }[] = [
  { value: 'longestStreak', label: '긴 연휴', hint: '연차를 한 곳에 몰아 가장 긴 연휴부터 확보' },
  { value: 'totalGain', label: '많은 휴일', hint: '연차를 나눠 써서 늘어나는 휴일 총량을 최대화' },
];

const WORK_KINDS: { kind: WorkPattern['kind']; label: string; hint: string }[] = [
  { kind: 'week5', label: '주 5일', hint: '월~금 근무, 토·일 휴무' },
  { kind: 'week6', label: '주 6일', hint: '월~토 근무, 일요일만 휴무' },
  { kind: 'shift', label: '교대근무', hint: '근무·휴무 주기를 반복합니다. 공휴일은 쉬는 것으로 계산합니다' },
];

const FIELD =
  'w-full rounded-md border border-line bg-field px-2.5 py-2 text-[12.5px] font-medium text-ink outline-none transition focus:border-acc-mid';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-[14px] py-[13px]">
      <span className="text-xs font-semibold text-ink-2">{title}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line-soft" />;
}

/** 접이식 설정. 평소엔 닫혀 있어 배치 화면을 가리지 않는다 */
function Fold({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <details className="group px-[14px] py-[11px]">
      <summary className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">{title}</span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-4">
          {summary}
          <span className="transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="mt-2.5 flex flex-col gap-2.5">{children}</div>
    </details>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-1 rounded-lg border border-line-soft bg-canvas p-1" style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(o.value)}
            className={`min-h-8 rounded-md text-[11.5px] font-semibold transition ${
              active ? 'bg-ink text-canvas' : 'text-ink-3 hover:bg-surface hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SidePanel({
  year,
  state,
  result,
  suggestions,
  hoverRun,
  hoverDate,
  notBefore,
  onChange,
  onHoverRun,
  onHoverDate,
  onToggleDay,
  onYearChange,
}: Props) {
  // 입사일은 개인 정보라 URL 에 싣지 않고 여기서만 들고 있는다
  const [hireDate, setHireDate] = useState('');
  const computedLeave = hireDate === '' ? null : statutoryLeaveForYear(hireDate, year);

  const patch = (next: Partial<PlannerState>) => onChange({ ...state, ...next });
  const activeMode = MODES.find((m) => m.value === state.mode) ?? MODES[0];
  const activeWork = WORK_KINDS.find((w) => w.kind === state.work.kind) ?? WORK_KINDS[0];

  const setWorkKind = (kind: WorkPattern['kind']) => {
    if (kind === state.work.kind) return;
    patch({ work: kind === 'shift' ? normalizeWorkPattern({ kind: 'shift', workDays: 4, offDays: 2, anchor: `${year}-01-01` }) : { kind } });
  };
  const patchShift = (p: Partial<Extract<WorkPattern, { kind: 'shift' }>>) => {
    if (state.work.kind !== 'shift') return;
    patch({ work: normalizeWorkPattern({ ...state.work, ...p }) });
  };

  const addBlackoutMonth = (month: number) => {
    if (!month || state.blackout.length >= MAX_BLACKOUT_RANGES) return;
    const mm = String(month).padStart(2, '0');
    patch({
      blackout: [
        ...state.blackout,
        { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}` },
      ],
    });
  };

  const stats = [
    { key: '배치한 연차', value: `${result.usedCount} / ${state.leave}일`, accent: false },
    { key: '총 휴식', value: `${result.restDays}일`, accent: true },
    { key: '연차 1일당', value: `${result.perLeave.toFixed(1)}일`, accent: false },
  ];

  return (
    <section className="flex flex-[1_1_300px] flex-col overflow-hidden rounded-lg border border-line bg-surface lg:sticky lg:top-[60px]">
      <div className="flex flex-col gap-2.5 px-[14px] py-[13px]">
        <div className="flex items-baseline justify-between gap-2.5">
          <label htmlFor="budget" className="text-xs font-semibold text-ink-2">
            연차 한도
          </label>
          <span className="flex items-baseline gap-0.5">
            <span className="numeral text-[22px] font-semibold leading-none">{state.leave}</span>
            <span className="text-xs font-medium text-ink-3">일</span>
          </span>
        </div>
        <input
          id="budget"
          type="range"
          min={1}
          max={MAX_LEAVE_INPUT > 25 ? 25 : MAX_LEAVE_INPUT}
          step={1}
          value={state.leave}
          onChange={(e) => patch({ leave: clampLeave(e.target.valueAsNumber) })}
        />

        <div className="flex flex-col gap-px overflow-hidden rounded-md border border-line-soft bg-line-soft">
          {stats.map((s) => (
            <div key={s.key} className="flex items-baseline justify-between gap-2 bg-surface px-[11px] py-[9px]">
              <span className="text-xs font-medium text-ink-3">{s.key}</span>
              <span className={`text-[13px] font-semibold ${s.accent ? 'text-acc' : 'text-ink'}`}>{s.value}</span>
            </div>
          ))}
        </div>
        <span className="text-[11.5px] font-medium leading-[1.5] text-ink-4">
          달력의 평일을 눌러 연차를 직접 놓거나 뺄 수 있습니다.
        </span>
      </div>

      <Divider />

      <Section title="지금 한 칸 더 쓰면">
        {suggestions.map((s) => {
          const active = hoverDate === s.date;
          return (
            <button
              key={s.date}
              type="button"
              onClick={() => onToggleDay(s.date)}
              onMouseEnter={() => onHoverDate(s.date)}
              onMouseLeave={() => onHoverDate(null)}
              onFocus={() => onHoverDate(s.date)}
              onBlur={() => onHoverDate(null)}
              className={`flex items-center justify-between gap-2.5 rounded-md border px-[11px] py-[9px] text-left transition ${
                active ? 'border-acc-mid bg-acc-soft' : 'border-line-soft bg-canvas'
              }`}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-[12.5px] font-semibold text-ink">{fmtShort(s.date)} 추가</span>
                <span className="text-[11px] font-medium text-ink-3">이 날을 쓰면 앞뒤 휴일과 이어집니다</span>
              </span>
              <span className="text-[13px] font-semibold text-acc">+{s.gain}일</span>
            </button>
          );
        })}
        {suggestions.length === 0 && (
          <span className="text-[11.5px] font-medium text-ink-3">
            {result.usedCount >= state.leave
              ? '한도를 모두 썼습니다. 한도를 늘리거나 배치를 바꿔보세요.'
              : '더 이어붙일 수 있는 날이 없습니다.'}
          </span>
        )}
      </Section>

      <Divider />

      <Section title="만들어진 연휴">
        {result.runs.map((run, index) => {
          const active = hoverRun === index;
          return (
            <div
              key={run.start}
              onMouseEnter={() => onHoverRun(index)}
              onMouseLeave={() => onHoverRun(-1)}
              className={`flex items-center justify-between gap-2.5 rounded-md border px-[11px] py-[9px] transition ${
                active ? 'border-acc-mid bg-acc-soft' : 'border-line-soft bg-canvas'
              }`}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[12.5px] font-semibold text-ink">{fmtRangeShort(run.start, run.end)}</span>
                <span className="text-[11px] font-medium text-ink-3">
                  연차 {run.cost}일 · ×{run.efficiency.toFixed(1)}
                </span>
              </span>
              <span className="flex flex-none items-baseline gap-0.5">
                <span className="numeral text-[19px] font-semibold leading-none">{run.total}</span>
                <span className="text-[11px] font-medium text-ink-3">일</span>
              </span>
            </div>
          );
        })}
        {result.runs.length === 0 && (
          <span className="text-[11.5px] font-medium text-ink-3">
            {result.usedCount === 0 ? '아직 배치한 연차가 없습니다.' : '아직 이어지는 연휴가 없습니다.'}
          </span>
        )}

        {result.stranded.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-line bg-canvas px-[11px] py-[9px]">
            <span className="text-[11.5px] font-semibold text-ink-2">붙지 않은 연차 {result.stranded.length}일</span>
            <span className="text-[11px] leading-relaxed text-ink-3">
              앞뒤 휴일과 이어지지 않아 하루로 끝납니다. 눌러서 빼거나 옆 날짜로 옮겨 보세요.
            </span>
            <div className="flex flex-wrap gap-1">
              {result.stranded.map((run, i) => (
                <button
                  key={run.start}
                  type="button"
                  onClick={() => onToggleDay(run.start)}
                  onMouseEnter={() => onHoverRun(result.runs.length + i)}
                  onMouseLeave={() => onHoverRun(-1)}
                  className="rounded border border-line-soft bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 transition hover:border-sun hover:text-sun"
                  aria-label={`${fmtShort(run.start)} 연차 빼기`}
                >
                  {fmtShort(run.start)} ×
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Divider />

      <Fold title="연도 · 근무 형태" summary={`${year}년 · ${activeWork.label}`}>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-ink-4" htmlFor="year-select">
            연도
          </label>
          <select id="year-select" value={year} onChange={(e) => onYearChange(Number(e.target.value))} className={FIELD}>
            {SUPPORTED_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          {notBefore && (
            <span className="text-[11px] leading-relaxed text-ink-4">
              진행 중인 연도라 {Number(notBefore.slice(5, 7))}월 {Number(notBefore.slice(8, 10))}일 이전 날짜는 제외했습니다.
            </span>
          )}
        </div>

        <Segmented
          label="근무 형태"
          value={state.work.kind}
          options={WORK_KINDS.map((w) => ({ value: w.kind, label: w.label }))}
          onSelect={setWorkKind}
        />
        {state.work.kind === 'shift' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-ink-4" htmlFor="shift-work">
                근무 일수
              </label>
              <input
                id="shift-work"
                type="number"
                min={MIN_SHIFT_SPAN}
                max={MAX_SHIFT_SPAN}
                value={state.work.workDays}
                onChange={(e) => patchShift({ workDays: e.target.valueAsNumber })}
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-ink-4" htmlFor="shift-off">
                휴무 일수
              </label>
              <input
                id="shift-off"
                type="number"
                min={MIN_SHIFT_SPAN}
                max={MAX_SHIFT_SPAN}
                value={state.work.offDays}
                onChange={(e) => patchShift({ offDays: e.target.valueAsNumber })}
                className={FIELD}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-ink-4" htmlFor="shift-anchor">
                주기 기준일 (이 날부터 근무 시작)
              </label>
              <input
                id="shift-anchor"
                type="date"
                value={state.work.anchor}
                onChange={(e) => patchShift({ anchor: e.target.value })}
                className={FIELD}
              />
            </div>
          </div>
        )}
        <span className="text-[11px] leading-relaxed text-ink-4">{activeWork.hint}</span>
      </Fold>

      <Divider />

      <Fold
        title="추천 규칙 · 제외 기간"
        summary={`${activeMode.label}${state.maxPerCluster ? ` · 최대 ${state.maxPerCluster}일` : ''}${
          state.blackout.length > 0 ? ` · 제외 ${state.blackout.length}` : ''
        }`}
      >
        <Segmented
          label="우선순위"
          value={state.mode}
          options={MODES.map((m) => ({ value: m.value, label: m.label }))}
          onSelect={(mode) => patch({ mode })}
        />
        <span className="text-[11px] leading-relaxed text-ink-4">
          {activeMode.hint} — <strong className="font-semibold text-ink-3">추천으로 채우기</strong>를 누를 때 적용됩니다.
        </span>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-ink-4" htmlFor="max-run">
            한 연휴 최대 연차
          </label>
          <input
            id="max-run"
            type="number"
            min={1}
            max={MAX_LEAVE_INPUT}
            placeholder="제한 없음"
            value={state.maxPerCluster ?? ''}
            onChange={(e) =>
              patch({ maxPerCluster: e.target.value === '' ? undefined : clampLeave(Number(e.target.value)) || undefined })
            }
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-ink-4" htmlFor="blackout-month">
            연차를 쓸 수 없는 기간
          </label>
          <select
            id="blackout-month"
            value=""
            onChange={(e) => addBlackoutMonth(Number(e.target.value))}
            className={FIELD}
            disabled={state.blackout.length >= MAX_BLACKOUT_RANGES}
          >
            <option value="">월 단위로 제외…</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월 전체
              </option>
            ))}
          </select>
          {state.blackout.map((r, i) => (
            <div key={`${r.start}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-line-soft bg-canvas px-2.5 py-1.5">
              <span className="text-[11.5px] font-medium text-ink-2">{fmtRangeShort(r.start, r.end)}</span>
              <button
                type="button"
                onClick={() => patch({ blackout: state.blackout.filter((_, j) => j !== i) })}
                className="text-[11px] font-semibold text-ink-4 hover:text-sun"
                aria-label={`${fmtRangeShort(r.start, r.end)} 제외 해제`}
              >
                해제
              </button>
            </div>
          ))}
        </div>
      </Fold>

      <Divider />

      <Fold title="연차 개수 계산" summary={computedLeave ? `${computedLeave.days}일` : '입사일로'}>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-ink-4" htmlFor="hire-date">
            입사일
          </label>
          <input
            id="hire-date"
            type="date"
            value={hireDate}
            max={`${year}-12-31`}
            onChange={(e) => {
              setHireDate(e.target.value);
              const next = statutoryLeaveForYear(e.target.value, year);
              if (next) patch({ leave: clampLeave(next.days) });
            }}
            className={FIELD}
          />
        </div>
        {computedLeave ? (
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">
              {year}년 법정 연차 {computedLeave.days}일
            </strong>
            <br />
            {computedLeave.basis}
          </p>
        ) : (
          hireDate !== '' && <p className="text-[11.5px] text-ink-3">{year}년에는 아직 입사 전입니다.</p>
        )}
        <span className="text-[11px] leading-relaxed text-ink-4">
          근로기준법 60조 기준 최소값입니다. 회계연도 기준으로 운영하거나 회사 규정이 더 유리하면 실제 개수는 다를 수 있습니다.
          입사일은 공유 링크에 담기지 않습니다.
        </span>
      </Fold>

      <Divider />

      <Fold title="공유 · 내보내기" summary={`${result.usedCount}일 배치`}>
        <ShareButton year={year} state={state} result={result} />
      </Fold>
    </section>
  );
}
