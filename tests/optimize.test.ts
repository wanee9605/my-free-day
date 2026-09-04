// 골든 테스트 케이스 (명세서 5.6절) — 2027년 기준
import { describe, expect, it } from 'vitest';
import { buildDays, daysInYear } from '@/lib/calendar';
import { findClusters } from '@/lib/cluster';
import { getHolidayData } from '@/lib/holidays';
import { buildClusters, optimize } from '@/lib/optimize';
import type { OptimizeInput } from '@/lib/types';

const YEAR = 2027;
const data = getHolidayData(YEAR)!;

function run(overrides: Partial<OptimizeInput>): ReturnType<typeof optimize> {
  return optimize({
    year: YEAR,
    annualLeaveCount: 0,
    blackoutRanges: [],
    workSaturday: false,
    mode: 'longestStreak',
    ...overrides,
  });
}

describe('1단계 calendar — 날짜 배열·휴일 마킹', () => {
  it('2027년 날짜 365일 + 앞뒤 패딩이 생성된다', () => {
    const days = buildDays({ year: YEAR, holidays: data.holidays });
    const inYear = days.filter((d) => d.inYear);
    expect(inYear).toHaveLength(daysInYear(YEAR));
    expect(inYear[0].date).toBe('2027-01-01');
    expect(inYear[0].weekday).toBe(5); // 금요일
    expect(inYear[inYear.length - 1].date).toBe('2027-12-31');
  });

  it('공휴일 20건(대체공휴일 5회)이 모두 휴일로 마킹된다', () => {
    expect(data.holidays).toHaveLength(20);
    expect(data.holidays.filter((h) => h.type === 'substitute')).toHaveLength(5);
    const days = buildDays({ year: YEAR, holidays: data.holidays });
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const h of data.holidays) {
      expect(byDate.get(h.date)?.isOff, h.date).toBe(true);
      expect(byDate.get(h.date)?.holidayName).toBe(h.name);
    }
    expect(byDate.get('2027-09-13')?.isOff).toBe(false); // 평일
    expect(byDate.get('2027-09-13')?.selectable).toBe(true);
  });

  it('블랙아웃 구간의 평일은 selectable=false 가 된다', () => {
    const days = buildDays({
      year: YEAR,
      holidays: data.holidays,
      blackoutRanges: [{ start: '2027-09-01', end: '2027-09-30' }],
    });
    const sept = days.filter((d) => d.date.startsWith('2027-09'));
    expect(sept.every((d) => !d.selectable)).toBe(true);
    expect(days.find((d) => d.date === '2027-10-05')?.selectable).toBe(true);
  });
});

describe('2단계 cluster — 클러스터 탐색', () => {
  it('공휴일 기준 클러스터가 8~15개로 압축된다', () => {
    const days = buildDays({ year: YEAR, holidays: data.holidays });
    const clusters = findClusters(days);
    expect(clusters.length).toBeGreaterThanOrEqual(8);
    expect(clusters.length).toBeLessThanOrEqual(15);
    for (const c of clusters) expect(c.holidayNames.length).toBeGreaterThan(0);
  });

  it('추석 클러스터는 9/11~9/19, 평일 후보는 9/13·9/17', () => {
    const clusters = buildClusters({ year: YEAR, blackoutRanges: [] });
    const chuseok = clusters.find((c) => c.label === '추석 연휴')!;
    expect(chuseok.startDate).toBe('2027-09-11');
    expect(chuseok.endDate).toBe('2027-09-19');
    expect(chuseok.workdays).toEqual(['2027-09-13', '2027-09-17']);
  });
});

describe('3단계 curve — 가성비 곡선', () => {
  it('추석 클러스터 곡선: 0→3일, 1→6일, 2→9일, 3→9일(증가 없음)', () => {
    const clusters = buildClusters({ year: YEAR, blackoutRanges: [] });
    const chuseok = clusters.find((c) => c.label === '추석 연휴')!;
    const streaks = chuseok.curve.map((p) => p.streak);
    expect(streaks[0]).toBe(3); // 9/14~9/16
    expect(streaks[1]).toBe(6); // 9/11~9/16 또는 9/14~9/19
    expect(streaks[2]).toBe(9); // 9/11~9/19
    expect(chuseok.curve[2].gain).toBe(6);
    expect(chuseok.curve[2].selectedDays).toEqual(['2027-09-13', '2027-09-17']);
    // 평일이 2개뿐이므로 곡선 길이는 3 (k=0,1,2)
    expect(chuseok.curve).toHaveLength(3);
  });

  it('곡선은 단조 증가한다', () => {
    const clusters = buildClusters({ year: YEAR, blackoutRanges: [] });
    for (const c of clusters) {
      for (let k = 1; k < c.curve.length; k++) {
        expect(c.curve[k].streak).toBeGreaterThanOrEqual(c.curve[k - 1].streak);
        expect(c.curve[k].usedLeave).toBeLessThanOrEqual(k);
      }
    }
  });
});

describe('5.6 골든 테스트 (2027)', () => {
  it('T1: 연차 2개, longestStreak → 9/13·9/17 선택, 9/11~9/19 9일 연휴', () => {
    const r = run({ annualLeaveCount: 2, mode: 'longestStreak' });
    expect(r.longestStreak).toBe(9);
    expect(r.longestStreakRange).toEqual({ start: '2027-09-11', end: '2027-09-19' });
    const top = r.recommendations.find((x) => x.label === '추석 연휴')!;
    expect(top.selectedDays).toEqual(['2027-09-13', '2027-09-17']);
    expect(top.cost).toBe(2);
    expect(top.efficiency).toBe(3);
    expect(r.totalLeaveUsed).toBe(2);
  });

  it('T2: 연차 3개, longestStreak → 2/10·2/11·2/12 선택, 2/6~2/14 9일 연휴', () => {
    const r = run({ annualLeaveCount: 3, mode: 'longestStreak' });
    expect(r.longestStreak).toBe(9);
    expect(r.longestStreakRange).toEqual({ start: '2027-02-06', end: '2027-02-14' });
    const seol = r.recommendations.find((x) => x.label === '설날 연휴')!;
    expect(seol.selectedDays).toEqual(['2027-02-10', '2027-02-11', '2027-02-12']);
    expect(r.totalLeaveUsed).toBe(3);
  });

  it('T3: 연차 0개 → 최장 연휴 = 설 연휴 2/6~2/9, 4일', () => {
    const r = run({ annualLeaveCount: 0 });
    expect(r.recommendations).toHaveLength(0);
    expect(r.longestStreak).toBe(4);
    expect(r.longestStreakRange).toEqual({ start: '2027-02-06', end: '2027-02-09' });
    expect(r.longestStreakLabel).toBe('설날 연휴');
    expect(r.totalLeaveUsed).toBe(0);
  });

  it('T4: 연차 2개 + 9월 전체 블랙아웃 → 추석 조합이 결과에서 제외된다', () => {
    const r = run({
      annualLeaveCount: 2,
      mode: 'longestStreak',
      blackoutRanges: [{ start: '2027-09-01', end: '2027-09-30' }],
    });
    const allDays = r.recommendations.flatMap((x) => x.selectedDays);
    expect(allDays.some((d) => d.startsWith('2027-09'))).toBe(false);
    expect(r.recommendations.find((x) => x.label === '추석 연휴')).toBeUndefined();
    expect(r.longestStreak).toBeLessThan(9);
    expect(r.totalLeaveUsed).toBe(2);
  });

  it('T5: 연차 100개 → 크래시 없이 처리, 모든 클러스터 포화 후 잔여 연차 미사용 표시', () => {
    for (const mode of ['totalGain', 'longestStreak'] as const) {
      const r = run({ annualLeaveCount: 100, mode });
      const clusters = buildClusters({ year: YEAR, blackoutRanges: [] });
      const capacity = clusters.reduce((s, c) => s + c.selectableWorkdays.length, 0);
      expect(r.totalLeaveUsed).toBe(capacity);
      expect(r.unusedLeave).toBe(100 - capacity);
      expect(r.unusedLeave).toBeGreaterThan(0);
      // 모든 클러스터가 포화 → 각 클러스터의 최대 곡선값과 일치
      for (const c of clusters) {
        if (c.selectableWorkdays.length === 0) continue;
        const rec = r.recommendations.find((x) => x.clusterId === c.id)!;
        expect(rec.streak).toBe(c.curve[c.curve.length - 1].streak);
      }
    }
  });
});

describe('직접 조정(fixedAllocations)·단계 힌트', () => {
  it('추천 카드는 다음 단계 힌트를 제공한다: 추석 연차 1일 → +1일 더 쓰면 9일', () => {
    const r = run({ annualLeaveCount: 1, mode: 'longestStreak' });
    const chuseok = r.recommendations.find((x) => x.label === '추석 연휴')!;
    expect(chuseok.cost).toBe(1);
    expect(chuseok.streak).toBe(6);
    expect(chuseok.nextStep).toEqual({ slot: 2, leave: 2, streak: 9 });
    expect(chuseok.prevStep).toEqual({ slot: 0, leave: 0, streak: 3 });
  });

  it('고정한 클러스터는 지정 연차를 먼저 받고, 나머지만 자동 배분된다', () => {
    const clusters = buildClusters({ year: YEAR, blackoutRanges: [] });
    const chuseok = clusters.find((c) => c.label === '추석 연휴')!;
    const r = run({ annualLeaveCount: 5, mode: 'totalGain', fixedAllocations: { [chuseok.id]: 0 } });
    expect(r.recommendations.find((x) => x.label === '추석 연휴')).toBeUndefined();
    expect(r.totalLeaveUsed).toBe(5);
    expect(r.baseHolidays.find((b) => b.clusterId === chuseok.id)?.nextStep?.streak).toBe(6);

    const r2 = run({ annualLeaveCount: 3, mode: 'longestStreak', fixedAllocations: { [chuseok.id]: 2 } });
    const rec = r2.recommendations.find((x) => x.label === '추석 연휴')!;
    expect(rec.fixed).toBe(true);
    expect(rec.cost).toBe(2);
    expect(r2.totalLeaveUsed).toBe(3);
  });

  it('고정 연차가 예산을 넘으면 예산까지만 배정된다', () => {
    const r = run({ annualLeaveCount: 2, mode: 'totalGain', fixedAllocations: { 7: 13 } });
    expect(r.totalLeaveUsed).toBeLessThanOrEqual(2);
  });
});

describe('totalGain 모드 — 배낭 DP', () => {
  it('그리디가 놓치는 조합을 잡는다: 연차 2개면 추석(gain 6)에 몰아 쓴다', () => {
    const r = run({ annualLeaveCount: 2, mode: 'totalGain' });
    expect(r.totalGain).toBe(6);
    expect(r.recommendations[0].label).toBe('추석 연휴');
  });

  it('연차 15개: 총 gain 이 longestStreak 모드 이상이고 사용량은 15 이하', () => {
    const a = run({ annualLeaveCount: 15, mode: 'totalGain' });
    const b = run({ annualLeaveCount: 15, mode: 'longestStreak' });
    expect(a.totalGain).toBeGreaterThanOrEqual(b.totalGain);
    expect(a.totalLeaveUsed).toBeLessThanOrEqual(15);
    expect(b.totalLeaveUsed).toBeLessThanOrEqual(15);
    expect(b.longestStreak).toBeGreaterThanOrEqual(a.longestStreak);
  });

  it('추천은 가성비(efficiency) 내림차순으로 정렬된다', () => {
    const r = run({ annualLeaveCount: 15, mode: 'totalGain' });
    for (let i = 1; i < r.recommendations.length; i++) {
      expect(r.recommendations[i - 1].efficiency).toBeGreaterThanOrEqual(r.recommendations[i].efficiency);
    }
  });

  it('성능: 연차 30개 재계산이 100ms 이내', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) run({ annualLeaveCount: 30, mode: 'totalGain' });
    const elapsed = (performance.now() - t0) / 10;
    expect(elapsed).toBeLessThan(100);
  });
});
