// 날짜·수치 표시 포맷 유틸
import { weekdayOf } from './calendar';

export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function parts(iso: string): { y: number; m: number; d: number; w: string } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, w: WEEKDAY_KO[weekdayOf(iso)] };
}

/** "9/13(월)" */
export function fmtShort(iso: string): string {
  const { m, d, w } = parts(iso);
  return `${m}/${d}(${w})`;
}

/** "9월 13일(월)" */
export function fmtKorean(iso: string): string {
  const { m, d, w } = parts(iso);
  return `${m}월 ${d}일(${w})`;
}

/** "2027.9.11(토) ~ 9.19(일)" — 해가 바뀌면 끝 날짜에도 연도 표기 */
export function fmtRange(start: string, end: string): string {
  const s = parts(start);
  const e = parts(end);
  const left = `${s.y}.${s.m}.${s.d}(${s.w})`;
  const right = s.y === e.y ? `${e.m}.${e.d}(${e.w})` : `${e.y}.${e.m}.${e.d}(${e.w})`;
  return `${left} ~ ${right}`;
}

/** "9.11 ~ 9.19" (짧은 형태, 공유 이미지·캘린더 툴팁용) */
export function fmtRangeShort(start: string, end: string): string {
  const s = parts(start);
  const e = parts(end);
  const right = s.y === e.y ? `${e.m}.${e.d}` : `${e.y}.${e.m}.${e.d}`;
  return `${s.m}.${s.d} ~ ${right}`;
}

/** "연차 1일당 3일" — 소수점 1자리, .0 은 생략 */
export function fmtEfficiency(efficiency: number): string {
  const rounded = Math.round(efficiency * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `연차 1일당 ${text}일`;
}

const SHORT_NAMES: Record<string, string> = {
  신정: '신정',
  '설날 연휴': '설날',
  설날: '설날',
  삼일절: '삼일절',
  어린이날: '어린이',
  부처님오신날: '석탄일',
  현충일: '현충일',
  광복절: '광복절',
  '추석 연휴': '추석',
  추석: '추석',
  개천절: '개천절',
  한글날: '한글날',
  성탄절: '성탄절',
};

/** 캘린더 셀에 들어갈 2~3글자 공휴일명 */
export function holidayShortName(name: string): string {
  if (name.startsWith('대체공휴일')) return '대체';
  if (SHORT_NAMES[name]) return SHORT_NAMES[name];
  const base = name.replace(/\s*연휴$/, '');
  return SHORT_NAMES[base] ?? base.slice(0, 3);
}

/** 선택 연차 목록 "9/13(월), 9/17(금)" — 많으면 앞 n개 + "외 k일" */
export function fmtSelectedDays(days: string[], max = 6): string {
  if (days.length === 0) return '—';
  const shown = days.slice(0, max).map(fmtShort).join(', ');
  return days.length > max ? `${shown} 외 ${days.length - max}일` : shown;
}
