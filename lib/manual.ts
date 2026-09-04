// /lib/manual.ts — 달력에서 연차를 직접 배치하는 모델.
// optimize() 가 "연차 개수 → 최적 배분"이라면 이쪽은 "고른 날짜 → 생기는 연휴"다.
// 추천으로 채우기(autofill)만 optimize() 를 쓰고, 그 뒤로는 사용자가 직접 만진다.
import { getHolidayData } from './holidays';
import { buildYearDays, optimize } from './optimize';
import type { DateRange, DayInfo, OptimizeMode, WorkPattern } from './types';

/** 연속으로 쉬는 구간 하나 */
export interface OffRun {
  start: string;
  end: string;
  /** 구간 전체 일수 */
  total: number;
  /** 이 구간에서 연차로 쓴 날 */
  leaveDays: string[];
  cost: number;
  /** 연차 1일이 만들어낸 휴일 수 */
  efficiency: number;
  /** 구간에 걸린 공휴일에서 뽑은 이름 ("추석 연휴"). 공휴일이 없으면 그냥 "연휴" */
  label: string;
}

export interface Suggestion {
  date: string;
  /** 이 날을 더 쓰면 늘어나는 휴식 일수 */
  gain: number;
}

export interface ManualInput {
  year: number;
  blackoutRanges: DateRange[];
  workPattern?: WorkPattern;
  notBefore?: string;
  selected: string[];
}

export interface ManualResult {
  year: number;
  days: DayInfo[];
  /** 선택된 날 중 실제로 연차가 되는 날 (평일·선택 가능일만) */
  used: string[];
  usedCount: number;
  /** 연차가 하나라도 들어간 연휴들의 총 일수 */
  restDays: number;
  /** 연차 1일당 휴일 수 */
  perLeave: number;
  /** 연차가 들어간 구간만, 긴 것부터 */
  runs: OffRun[];
  longestStreak: number;
  longestRun: OffRun | null;
  dataUpdatedAt: string;
}

function toSet(dates: Iterable<string>): Set<string> {
  return dates instanceof Set ? dates : new Set(dates);
}

/**
 * 공휴일·휴무일에 선택한 날을 얹어 연속 구간을 찾는다.
 * 패딩 날짜까지 포함해 훑으므로 성탄절→신정처럼 해를 넘기는 연휴도 이어진다.
 */
export function computeRuns(days: DayInfo[], selected: Iterable<string>): OffRun[] {
  const sel = toSet(selected);
  const isOff = (d: DayInfo) => d.isOff || sel.has(d.date);
  const runs: OffRun[] = [];

  let i = 0;
  while (i < days.length) {
    if (!isOff(days[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && isOff(days[j + 1])) j++;

    const leaveDays: string[] = [];
    const names: string[] = [];
    for (let k = i; k <= j; k++) {
      if (!days[k].isOff && sel.has(days[k].date)) leaveDays.push(days[k].date);
      const name = days[k].holidayName;
      if (name && days[k].holidayType !== 'substitute') {
        const base = name.replace(/\s*연휴$/, '').trim();
        if (!names.includes(base)) names.push(base);
      }
    }

    const total = j - i + 1;
    runs.push({
      start: days[i].date,
      end: days[j].date,
      total,
      leaveDays,
      cost: leaveDays.length,
      efficiency: leaveDays.length > 0 ? Math.round((total / leaveDays.length) * 10) / 10 : 0,
      label: names.length > 0 ? `${names.join('·')} 연휴` : '연휴',
    });
    i = j + 1;
  }
  return runs;
}

/** 연차를 한 개라도 쓴 구간들의 총 일수 = "이 연차로 만들어낸 휴식" */
export function restDaysOf(runs: OffRun[]): number {
  return runs.reduce((sum, r) => (r.cost > 0 ? sum + r.total : sum), 0);
}

/** 선택 가능한 날만 남긴다 (평일·블랙아웃 밖·지난 날짜 제외) */
export function keepSelectable(days: DayInfo[], selected: Iterable<string>): string[] {
  const sel = toSet(selected);
  return days.filter((d) => d.selectable && sel.has(d.date)).map((d) => d.date);
}

/**
 * 한 칸 더 썼을 때 휴식이 가장 많이 늘어나는 날들.
 * 후보마다 구간을 다시 계산하지만 하루 O(n) 이라 1년치도 순간이다.
 */
export function suggestDays(days: DayInfo[], selected: Iterable<string>, budget: number, limit = 3): Suggestion[] {
  const sel = toSet(selected);
  if (sel.size >= budget) return [];

  const baseline = restDaysOf(computeRuns(days, sel));
  const found: Suggestion[] = [];
  for (const day of days) {
    if (!day.selectable || sel.has(day.date)) continue;
    const trial = new Set(sel);
    trial.add(day.date);
    const gain = restDaysOf(computeRuns(days, trial)) - baseline;
    if (gain > 0) found.push({ date: day.date, gain });
  }
  found.sort((a, b) => b.gain - a.gain || a.date.localeCompare(b.date));
  return found.slice(0, limit);
}

/** 화면·공유 이미지·.ics 가 모두 이 결과 하나를 본다 */
export function evaluate(input: ManualInput): ManualResult {
  const days = buildYearDays(input);
  const used = keepSelectable(days, input.selected);
  const runs = computeRuns(days, used)
    .filter((r) => r.cost > 0)
    .sort((a, b) => b.total - a.total || a.start.localeCompare(b.start));
  const restDays = runs.reduce((sum, r) => sum + r.total, 0);
  const longestRun = runs[0] ?? null;

  return {
    year: input.year,
    days,
    used,
    usedCount: used.length,
    restDays,
    perLeave: used.length > 0 ? Math.round((restDays / used.length) * 10) / 10 : 0,
    runs,
    longestStreak: longestRun?.total ?? 0,
    longestRun,
    dataUpdatedAt: getHolidayData(input.year)?.updatedAt ?? '',
  };
}

/**
 * 선택한 날짜를 URL 에 싣기 위한 인코딩.
 * 연중 며칠째인지를 36진수 두 자리로 적어 25일치가 50자에 들어간다.
 */
const DAY_MS = 86_400_000;

function dayOfYear(year: number, iso: string): number {
  const start = Date.UTC(year, 0, 1);
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - start) / DAY_MS) + 1;
}

function fromDayOfYear(year: number, n: number): string {
  const t = Date.UTC(year, 0, 1) + (n - 1) * DAY_MS;
  const d = new Date(t);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function encodeSelection(year: number, dates: string[]): string {
  const nums = dates
    .filter((d) => d.startsWith(`${year}-`))
    .map((d) => dayOfYear(year, d))
    .filter((n) => n >= 1 && n <= 366)
    .sort((a, b) => a - b);
  return [...new Set(nums)].map((n) => n.toString(36).padStart(2, '0')).join('');
}

export function decodeSelection(year: number, raw: string | null | undefined): string[] {
  if (!raw || raw.length % 2 !== 0 || !/^[0-9a-z]+$/.test(raw)) return [];
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const n = parseInt(raw.slice(i, i + 2), 36);
    if (Number.isInteger(n) && n >= 1 && n <= 366) out.push(fromDayOfYear(year, n));
  }
  return [...new Set(out)].filter((d) => d.startsWith(`${year}-`)).sort();
}

/** 추천으로 채우기: optimize() 가 고른 날짜를 그대로 선택 상태로 옮긴다 */
export function autofillSelection(
  input: ManualInput & { budget: number; mode: OptimizeMode; maxLeavePerCluster?: number },
): string[] {
  const r = optimize({
    year: input.year,
    annualLeaveCount: input.budget,
    blackoutRanges: input.blackoutRanges,
    mode: input.mode,
    workPattern: input.workPattern,
    notBefore: input.notBefore,
    maxLeavePerCluster: input.maxLeavePerCluster,
  });
  return r.recommendations.flatMap((x) => x.selectedDays).sort();
}
