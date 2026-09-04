// /lib/calendar.ts — 날짜 배열 생성 및 휴일 마킹 (1단계)
import type { DateRange, DayInfo, Holiday } from './types';

const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYY-MM-DD → UTC epoch ms (타임존 영향 제거) */
export function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(iso: string, n: number): string {
  return toISO(parseISO(iso) + n * DAY_MS);
}

/** 0=일 ... 6=토 */
export function weekdayOf(iso: string): number {
  return new Date(parseISO(iso)).getUTCDay();
}

/** a → b 까지의 일수 차 (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / DAY_MS);
}

/** 두 날짜를 모두 포함하는 구간 길이 */
export function spanDays(start: string, end: string): number {
  return diffDays(start, end) + 1;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** month: 1~12 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidISODate(iso: unknown): iso is string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return toISO(parseISO(iso)) === iso;
}

/**
 * 연도 앞뒤로 붙이는 패딩 일수.
 * 연말·연초 연휴(성탄절 → 다음 해 신정 등)가 해를 넘겨 이어지는 것을 계산에 반영하기 위함.
 * 패딩 날짜는 연차 사용 대상(selectable)이 아니며, 주말과 고정 공휴일(신정·성탄절)만 휴일로 본다.
 */
export const PADDING_DAYS = 10;

const FIXED_HOLIDAYS_OUTSIDE_YEAR: Record<string, string> = {
  '01-01': '신정',
  '12-25': '성탄절',
};

/** 오늘 날짜(한국 기준). 서버·브라우저 어디서 불러도 같은 값이 나오도록 시간대를 고정한다. */
export function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/** 대상 연도가 진행 중이면 오늘 날짜를, 아니면 undefined 를 준다 (buildDays 의 notBefore 용) */
export function currentYearToday(year: number): string | undefined {
  const today = todayInSeoul();
  return today.startsWith(`${year}-`) ? today : undefined;
}

export interface BuildDaysOptions {
  year: number;
  holidays: Holiday[];
  blackoutRanges?: DateRange[];
  /** 이 날짜보다 이전인 평일은 연차 대상에서 제외 (진행 중인 연도에서 지난 날짜를 추천하지 않기 위함) */
  notBefore?: string;
  padding?: number;
}

/** 대상 연도(+패딩)의 모든 날짜를 DayInfo[]로 생성 */
export function buildDays({
  year,
  holidays,
  blackoutRanges = [],
  notBefore,
  padding = PADDING_DAYS,
}: BuildDaysOptions): DayInfo[] {
  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  const start = parseISO(`${year}-01-01`) - padding * DAY_MS;
  const end = parseISO(`${year}-12-31`) + padding * DAY_MS;
  const yearPrefix = `${year}-`;
  const days: DayInfo[] = [];

  for (let t = start; t <= end; t += DAY_MS) {
    const date = toISO(t);
    const weekday = new Date(t).getUTCDay();
    const inYear = date.startsWith(yearPrefix);
    const isWeekend = weekday === 0 || weekday === 6;

    let holidayName: string | undefined;
    let holidayType: DayInfo['holidayType'];
    if (inYear) {
      const h = holidayMap.get(date);
      if (h) {
        holidayName = h.name;
        holidayType = h.type;
      }
    } else {
      const fixed = FIXED_HOLIDAYS_OUTSIDE_YEAR[date.slice(5)];
      if (fixed) {
        holidayName = fixed;
        holidayType = 'public';
      }
    }

    const isOff = isWeekend || holidayName !== undefined;
    const inBlackout = blackoutRanges.some((r) => r.start <= date && date <= r.end);
    const isPast = notBefore !== undefined && date < notBefore;
    const selectable = inYear && !isOff && !inBlackout && !isPast;

    days.push({ date, weekday, isOff, isWeekend, holidayName, holidayType, selectable, inYear });
  }

  return days;
}

/** 블랙아웃 구간 정규화: 유효한 날짜만, start ≤ end 보장 */
export function normalizeRanges(ranges: DateRange[] | undefined): DateRange[] {
  if (!ranges) return [];
  const out: DateRange[] = [];
  for (const r of ranges) {
    if (!r || !isValidISODate(r.start) || !isValidISODate(r.end)) continue;
    out.push(r.start <= r.end ? { start: r.start, end: r.end } : { start: r.end, end: r.start });
  }
  return out;
}
