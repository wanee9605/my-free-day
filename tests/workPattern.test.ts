// 근무 형태(주 5일 / 주 6일 / 교대근무) — lib/calendar.ts 의 isOffDuty 와 그 파급
import { describe, expect, it } from 'vitest';
import { buildDays, isOffDuty, normalizeWorkPattern } from '@/lib/calendar';
import { getHolidayData } from '@/lib/holidays';
import { buildYearDays, optimize } from '@/lib/optimize';
import type { WorkPattern } from '@/lib/types';
import { parseWorkPattern, serializeWorkPattern } from '@/lib/urlState';

const YEAR = 2027;
const holidays = getHolidayData(YEAR)!.holidays;
const dayMap = (work?: WorkPattern) => new Map(buildDays({ year: YEAR, holidays, workPattern: work }).map((d) => [d.date, d]));

describe('isOffDuty', () => {
  it('주 5일은 토·일이, 주 6일은 일요일만 휴무다', () => {
    const w5 = dayMap({ kind: 'week5' });
    const w6 = dayMap({ kind: 'week6' });
    // 2027-01-02 토, 01-03 일, 01-04 월
    expect(w5.get('2027-01-02')?.isOffDuty).toBe(true);
    expect(w6.get('2027-01-02')?.isOffDuty).toBe(false);
    expect(w6.get('2027-01-02')?.selectable).toBe(true); // 토요일이 연차 대상이 된다
    for (const m of [w5, w6]) expect(m.get('2027-01-03')?.isOffDuty).toBe(true);
    expect(w6.get('2027-01-04')?.isOffDuty).toBe(false);
  });

  it('교대근무는 기준일부터 근무 N일 → 휴무 M일 을 반복한다', () => {
    const shift: WorkPattern = { kind: 'shift', workDays: 4, offDays: 2, anchor: '2027-01-01' };
    const off = (d: string) => isOffDuty(d, 0, shift); // weekday 는 교대에서 쓰이지 않는다
    expect(['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'].every((d) => !off(d))).toBe(true);
    expect(['2027-01-05', '2027-01-06'].every(off)).toBe(true);
    expect(off('2027-01-07')).toBe(false); // 다음 주기 시작
    expect(off('2027-01-11')).toBe(true);
    // 기준일 이전에도 주기가 성립한다
    expect(off('2026-12-31')).toBe(true);
  });

  it('주기가 7일이 아니면 요일과 어긋나 토요일 근무·월요일 휴무가 생긴다', () => {
    const m = dayMap({ kind: 'shift', workDays: 4, offDays: 2, anchor: '2027-01-01' }); // 주기 6일
    const inYear = [...m.values()].filter((d) => d.inYear);
    expect(inYear.some((d) => d.weekday === 6 && !d.isOffDuty)).toBe(true); // 근무하는 토요일
    expect(inYear.some((d) => d.weekday === 1 && d.isOffDuty)).toBe(true); // 쉬는 월요일
  });

  it('주기가 7일이면 요일과 어긋나지 않는다: 월요일 시작 5-2 는 주 5일과 같다', () => {
    const shift = dayMap({ kind: 'shift', workDays: 5, offDays: 2, anchor: '2027-01-04' }); // 2027-01-04 = 월
    const week5 = dayMap({ kind: 'week5' });
    for (const [date, d] of week5) expect(shift.get(date)?.isOffDuty, date).toBe(d.isOffDuty);
  });

  it('주기 값이 이상하면 안전한 범위로 다듬는다', () => {
    const w = normalizeWorkPattern({ kind: 'shift', workDays: 0, offDays: 99, anchor: 'not-a-date' });
    expect(w).toEqual({ kind: 'shift', workDays: 1, offDays: 14, anchor: '2000-01-01' });
    expect(normalizeWorkPattern(undefined)).toEqual({ kind: 'week5' });
  });
});

describe('근무 형태가 결과에 반영된다', () => {
  it('주 6일이면 토요일이 연차 후보가 되어 쉬는 날이 줄어든다', () => {
    const w5 = buildYearDays({ year: YEAR, blackoutRanges: [], workPattern: { kind: 'week5' } });
    const w6 = buildYearDays({ year: YEAR, blackoutRanges: [], workPattern: { kind: 'week6' } });
    const offCount = (days: typeof w5) => days.filter((d) => d.inYear && d.isOff).length;
    expect(offCount(w6)).toBeLessThan(offCount(w5));
    const r = optimize({ year: YEAR, annualLeaveCount: 3, blackoutRanges: [], mode: 'longestStreak', workPattern: { kind: 'week6' } });
    expect(r.totalLeaveUsed).toBeGreaterThan(0);
  });

  it('교대근무에서도 추천 연차는 반드시 근무일에만 배정된다', () => {
    const work: WorkPattern = { kind: 'shift', workDays: 4, offDays: 2, anchor: '2027-01-01' };
    const r = optimize({ year: YEAR, annualLeaveCount: 4, blackoutRanges: [], mode: 'longestStreak', workPattern: work });
    const picked = r.recommendations.flatMap((x) => x.selectedDays);
    expect(picked.length).toBeGreaterThan(0);
    const m = dayMap(work);
    for (const d of picked) {
      expect(m.get(d)?.isOff, d).toBe(false); // 이미 쉬는 날에 연차를 쓰지 않는다
      expect(m.get(d)?.inYear, d).toBe(true);
    }
    expect(r.longestStreak).toBeGreaterThanOrEqual(r.recommendations[0].streak);
  });
});

describe('URL 왕복', () => {
  it('주 5일은 생략하고, 나머지는 문자열로 왕복한다', () => {
    expect(serializeWorkPattern({ kind: 'week5' })).toBeNull();
    expect(serializeWorkPattern({ kind: 'week6' })).toBe('week6');
    const shift: WorkPattern = { kind: 'shift', workDays: 4, offDays: 2, anchor: '2027-01-04' };
    expect(serializeWorkPattern(shift)).toBe('4-2:2027-01-04');
    expect(parseWorkPattern('4-2:2027-01-04')).toEqual(shift);
    expect(parseWorkPattern('week6')).toEqual({ kind: 'week6' });
  });

  it('망가진 값은 기본값으로 떨어진다', () => {
    for (const bad of [null, '', 'week9', '4-2', '4-2:oops', 'x-y:2027-01-04']) {
      expect(parseWorkPattern(bad)).toEqual({ kind: 'week5' });
    }
  });
});
