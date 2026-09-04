// /lib/leave.ts — 입사일 → 법정 연차 개수 (근로기준법 60조)
// 회사가 회계연도 기준으로 운영하거나 규정이 법정 기준보다 유리하면 실제 개수는 달라진다.
// 여기서 내는 값은 "법정 최소" 이며 입력 보조용이다.
import { isValidISODate } from './calendar';

/** 가산 휴가를 포함한 법정 상한 */
export const MAX_STATUTORY_LEAVE = 25;
/** 입사 1년 미만일 때 1개월 개근마다 1일, 최대 11일 */
export const MAX_FIRST_YEAR_LEAVE = 11;

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** from → to 의 만 개월수 (일자가 아직 안 지났으면 한 달 빼고 센다) */
export function completedMonths(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  const months = (b.y - a.y) * 12 + (b.m - a.m);
  return b.d < a.d ? months - 1 : months;
}

/** from → to 의 만 근속 연수 */
export function completedYears(from: string, to: string): number {
  return Math.floor(completedMonths(from, to) / 12);
}

export interface StatutoryLeave {
  days: number;
  /** 대상 연도 시작 시점의 만 근속 연수 */
  years: number;
  /** 화면에 그대로 노출하는 산정 근거 */
  basis: string;
}

/**
 * 대상 연도에 쓸 수 있는 법정 연차.
 * - 1년 이상: 15일 + 최초 1년을 넘는 계속 근로 2년마다 1일 가산 (상한 25일)
 * - 1년 미만: 1개월 개근마다 1일 (상한 11일)
 * 근속 연수는 대상 연도 1월 1일 기준으로 센다. 입사 1년 미만이면 그 해 말까지 쌓이는 개수를 본다.
 */
export function statutoryLeaveForYear(hireDate: string, year: number): StatutoryLeave | null {
  if (!isValidISODate(hireDate)) return null;
  const yearEnd = `${year}-12-31`;
  if (hireDate > yearEnd) return null; // 대상 연도에 아직 입사 전

  const years = completedYears(hireDate, `${year}-01-01`);
  if (years >= 1) {
    const bonus = Math.floor((years - 1) / 2);
    const days = Math.min(MAX_STATUTORY_LEAVE, 15 + bonus);
    const capped = 15 + bonus > MAX_STATUTORY_LEAVE;
    return {
      days,
      years,
      basis: capped
        ? `${year}년 초 기준 근속 ${years}년 — 법정 상한 ${MAX_STATUTORY_LEAVE}일`
        : `${year}년 초 기준 근속 ${years}년 — 기본 15일${bonus > 0 ? ` + 가산 ${bonus}일` : ''}`,
    };
  }

  const months = Math.max(0, Math.min(MAX_FIRST_YEAR_LEAVE, completedMonths(hireDate, yearEnd)));
  return {
    days: months,
    years: 0,
    basis: `입사 1년 미만 — 1개월 개근마다 1일 (상한 ${MAX_FIRST_YEAR_LEAVE}일)`,
  };
}
