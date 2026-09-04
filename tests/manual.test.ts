// 달력 직접 배치 모델 (lib/manual.ts)
import { describe, expect, it } from 'vitest';
import {
  autofillSelection,
  computeRuns,
  decodeSelection,
  encodeSelection,
  evaluate,
  keepSelectable,
  restDaysOf,
  suggestDays,
} from '@/lib/manual';
import { buildYearDays } from '@/lib/optimize';

const YEAR = 2027;
const days = buildYearDays({ year: YEAR, blackoutRanges: [] });
const at = (iso: string) => days.find((d) => d.date === iso)!;

describe('computeRuns — 고른 날짜로 생기는 연휴', () => {
  it('연차를 놓지 않으면 공휴일·주말만으로 구간이 잡히고 cost 는 0이다', () => {
    const runs = computeRuns(days, []);
    expect(runs.every((r) => r.cost === 0)).toBe(true);
    // 2027 설 연휴 2/6(토)~2/9(대체공휴일 화)
    expect(runs.find((r) => r.start === '2027-02-06')?.end).toBe('2027-02-09');
  });

  it('추석 사이 평일 두 개를 놓으면 9/11~9/19 한 구간으로 이어진다', () => {
    const runs = computeRuns(days, ['2027-09-13', '2027-09-17']);
    const chuseok = runs.find((r) => r.start === '2027-09-11')!;
    expect(chuseok.end).toBe('2027-09-19');
    expect(chuseok.total).toBe(9);
    expect(chuseok.cost).toBe(2);
    expect(chuseok.efficiency).toBe(4.5);
    expect(chuseok.label).toBe('추석 연휴');
  });

  it('공휴일이 없는 구간은 그냥 "연휴" 로 부른다', () => {
    // 6/7(월)에 연차 → 6/5(토)~6/7(월). 6/6 현충일이 있으므로 이름이 붙는다
    expect(computeRuns(days, ['2027-06-07']).find((r) => r.start === '2027-06-05')?.label).toBe('현충일 연휴');
    // 3/2(화)만 놓으면 3/1 삼일절과 이어진다
    expect(computeRuns(days, ['2027-03-02']).find((r) => r.start === '2027-02-27')?.label).toBe('삼일절 연휴');
  });

  it('휴식 일수는 연차가 들어간 구간만 센다', () => {
    const none = restDaysOf(computeRuns(days, []));
    expect(none).toBe(0);
    expect(restDaysOf(computeRuns(days, ['2027-09-13', '2027-09-17']))).toBe(9);
  });
});

describe('keepSelectable — 못 고르는 날은 걸러낸다', () => {
  it('공휴일·주말·블랙아웃·연도 밖 날짜는 무시된다', () => {
    expect(at('2027-09-15').selectable).toBe(false); // 추석 당일
    const kept = keepSelectable(days, ['2027-09-13', '2027-09-15', '2027-01-02', '2028-01-03']);
    expect(kept).toEqual(['2027-09-13']);

    const blacked = buildYearDays({ year: YEAR, blackoutRanges: [{ start: '2027-09-01', end: '2027-09-30' }] });
    expect(keepSelectable(blacked, ['2027-09-13'])).toEqual([]);
  });
});

describe('suggestDays — 한 칸 더 쓰면', () => {
  it('휴식이 가장 많이 느는 날을 큰 순서로 준다', () => {
    const s = suggestDays(days, [], 3);
    expect(s.length).toBe(3);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].gain).toBeGreaterThanOrEqual(s[i].gain);
    for (const x of s) {
      expect(x.gain).toBeGreaterThan(0);
      expect(at(x.date).selectable).toBe(true);
    }
  });

  it('제안한 날을 실제로 놓으면 그만큼 휴식이 는다', () => {
    const [top] = suggestDays(days, [], 5);
    const before = restDaysOf(computeRuns(days, []));
    const after = restDaysOf(computeRuns(days, [top.date]));
    expect(after - before).toBe(top.gain);
  });

  it('한도를 다 쓰면 더 제안하지 않는다', () => {
    expect(suggestDays(days, ['2027-09-13', '2027-09-17'], 2)).toEqual([]);
  });
});

describe('evaluate — 화면·공유가 함께 보는 결과', () => {
  it('연차 수·휴식·효율·최장 연휴를 함께 낸다', () => {
    const r = evaluate({ year: YEAR, blackoutRanges: [], selected: ['2027-09-13', '2027-09-17'] });
    expect(r.usedCount).toBe(2);
    expect(r.restDays).toBe(9);
    expect(r.perLeave).toBe(4.5);
    expect(r.longestStreak).toBe(9);
    expect(r.longestRun?.start).toBe('2027-09-11');
    expect(r.runs).toHaveLength(1); // 연차가 든 구간만 남는다
    expect(r.dataUpdatedAt).not.toBe('');
  });

  it('긴 연휴가 먼저 오도록 정렬한다', () => {
    const r = evaluate({ year: YEAR, blackoutRanges: [], selected: ['2027-09-13', '2027-09-17', '2027-03-02'] });
    for (let i = 1; i < r.runs.length; i++) expect(r.runs[i - 1].total).toBeGreaterThanOrEqual(r.runs[i].total);
  });
});

describe('autofillSelection — 추천으로 채우기', () => {
  it('optimize 가 고른 날짜를 그대로 가져온다', () => {
    const picked = autofillSelection({ year: YEAR, blackoutRanges: [], selected: [], budget: 2, mode: 'longestStreak' });
    expect(picked).toEqual(['2027-09-13', '2027-09-17']);
    expect(evaluate({ year: YEAR, blackoutRanges: [], selected: picked }).longestStreak).toBe(9);
  });

  it('한 연휴 최대 연차를 지킨다', () => {
    const picked = autofillSelection({
      year: YEAR,
      blackoutRanges: [],
      selected: [],
      budget: 8,
      mode: 'totalGain',
      maxLeavePerCluster: 1,
    });
    const r = evaluate({ year: YEAR, blackoutRanges: [], selected: picked });
    for (const run of r.runs) expect(run.cost).toBeLessThanOrEqual(1);
  });
});

describe('URL 인코딩 — 날짜를 36진수 두 자리로', () => {
  it('왕복해도 그대로다', () => {
    const dates = ['2027-01-01', '2027-09-13', '2027-09-17', '2027-12-31'];
    const encoded = encodeSelection(YEAR, dates);
    expect(encoded).toHaveLength(dates.length * 2);
    expect(decodeSelection(YEAR, encoded)).toEqual(dates);
  });

  it('25일치가 50자에 들어간다', () => {
    const many = Array.from({ length: 25 }, (_, i) => `2027-0${1 + (i % 9)}-${String(1 + i).padStart(2, '0')}`);
    expect(encodeSelection(YEAR, many).length).toBeLessThanOrEqual(50);
  });

  it('다른 해·중복·망가진 값은 버린다', () => {
    expect(encodeSelection(YEAR, ['2028-01-01'])).toBe('');
    expect(decodeSelection(YEAR, encodeSelection(YEAR, ['2027-05-04', '2027-05-04']))).toEqual(['2027-05-04']);
    for (const bad of [null, undefined, '', 'z', 'ABC', '!!', 'zzzz']) {
      expect(decodeSelection(YEAR, bad)).toEqual([]);
    }
  });
});
