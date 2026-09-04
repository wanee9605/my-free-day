// 근로기준법 60조 기준 연차 산정 (lib/leave.ts)
import { describe, expect, it } from 'vitest';
import { completedMonths, completedYears, statutoryLeaveForYear } from '@/lib/leave';

describe('근속 기간 계산', () => {
  it('일자가 아직 안 지났으면 그 달은 세지 않는다', () => {
    expect(completedMonths('2026-01-15', '2026-02-14')).toBe(0);
    expect(completedMonths('2026-01-15', '2026-02-15')).toBe(1);
    expect(completedMonths('2026-01-31', '2026-02-28')).toBe(0);
    expect(completedYears('2026-03-01', '2027-02-28')).toBe(0);
    expect(completedYears('2026-03-01', '2027-03-01')).toBe(1);
  });
});

describe('대상 연도의 법정 연차', () => {
  const days = (hire: string, year = 2027) => statutoryLeaveForYear(hire, year)?.days;

  it('1~2년차는 15일, 3년차부터 2년마다 1일씩 붙는다', () => {
    expect(days('2026-01-01')).toBe(15); // 근속 1년
    expect(days('2025-01-01')).toBe(15); // 근속 2년
    expect(days('2024-01-01')).toBe(16); // 근속 3년
    expect(days('2023-01-01')).toBe(16); // 근속 4년
    expect(days('2022-01-01')).toBe(17); // 근속 5년
    expect(days('2021-03-01')).toBe(17); // 근속 5년 (연초 기준)
  });

  it('가산이 아무리 쌓여도 25일을 넘지 않는다', () => {
    expect(days('2000-01-01')).toBe(25);
    expect(statutoryLeaveForYear('2000-01-01', 2027)?.basis).toContain('상한');
  });

  it('입사 1년 미만은 개근 개월수만큼, 최대 11일', () => {
    expect(days('2027-03-01')).toBe(9); // 3/1 입사 → 연말까지 9개월
    expect(days('2027-12-01')).toBe(0); // 12/1 입사 → 아직 만 1개월 미만
    expect(days('2026-11-15')).toBe(11); // 상한에 걸림
    expect(statutoryLeaveForYear('2027-03-01', 2027)?.years).toBe(0);
  });

  it('대상 연도에 아직 입사 전이거나 날짜가 잘못되면 null', () => {
    expect(statutoryLeaveForYear('2028-01-01', 2027)).toBeNull();
    expect(statutoryLeaveForYear('2027-13-40', 2027)).toBeNull();
    expect(statutoryLeaveForYear('', 2027)).toBeNull();
  });

  it('연도를 바꾸면 근속이 늘어난 만큼 반영된다', () => {
    expect(days('2024-01-01', 2026)).toBe(15); // 근속 2년
    expect(days('2024-01-01', 2027)).toBe(16); // 근속 3년
    expect(days('2024-01-01', 2028)).toBe(16); // 근속 4년
  });
});
