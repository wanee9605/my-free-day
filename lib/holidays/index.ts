// 연도별 공휴일 로더 — 정적 JSON만 사용 (런타임 API 호출 없음)
import type { HolidayData } from '../types';
import h2027 from './2027.json';

const HOLIDAY_DATA: Record<number, HolidayData> = {
  2027: h2027 as HolidayData,
};

export const SUPPORTED_YEARS: number[] = Object.keys(HOLIDAY_DATA)
  .map(Number)
  .sort((a, b) => a - b);

export const DEFAULT_YEAR = 2027;

export function getHolidayData(year: number): HolidayData | undefined {
  return HOLIDAY_DATA[year];
}

export function isSupportedYear(year: number): boolean {
  return Number.isInteger(year) && year in HOLIDAY_DATA;
}
