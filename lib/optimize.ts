// /lib/optimize.ts — 배낭 DP + 역추적으로 연차 배분 (4단계) 및 모드 분기 (5단계)
import { buildDays, normalizeRanges, parseISO } from './calendar';
import { findClusters } from './cluster';
import { withCurve } from './curve';
import { getHolidayData } from './holidays';
import type {
  BaseHoliday,
  Cluster,
  CurvePoint,
  DayInfo,
  LeaveStep,
  OptimizeInput,
  OptimizeMode,
  OptimizeResult,
  Recommendation,
} from './types';

export const MAX_LEAVE_INPUT = 30;
export const MAX_BLACKOUT_RANGES = 5;

/**
 * dp[i][n] = 앞의 i개 클러스터까지, 연차 n개 이하를 썼을 때의 최대 총 gain
 * dp[i][n] = max_{k ≤ min(n, m_i)} dp[i-1][n-k] + curve_i[k].gain
 *
 * 반환: 클러스터별 배정 슬롯 k.
 * 동점이면 더 적은 k를 택해 잔여 연차를 "미사용"으로 남긴다.
 * (그리디 금지 — 2개째에서 gain이 급증하는 클러스터를 놓치지 않기 위함)
 */
export function allocateByDP(clusters: Cluster[], leave: number): number[] {
  const C = clusters.length;
  const N = Math.max(0, leave);
  const dp: number[][] = [new Array<number>(N + 1).fill(0)];
  const choice: number[][] = [new Array<number>(N + 1).fill(0)];

  for (let i = 1; i <= C; i++) {
    const curve = clusters[i - 1].curve;
    const m = curve.length - 1;
    const prev = dp[i - 1];
    const row = new Array<number>(N + 1).fill(0);
    const pick = new Array<number>(N + 1).fill(0);
    for (let n = 0; n <= N; n++) {
      let best = -Infinity;
      let bestK = 0;
      const kMax = Math.min(n, m);
      for (let k = 0; k <= kMax; k++) {
        const v = prev[n - k] + curve[k].gain;
        if (v > best) {
          best = v;
          bestK = k;
        }
      }
      row[n] = best;
      pick[n] = bestK;
    }
    dp.push(row);
    choice.push(pick);
  }

  // 역추적
  const alloc = new Array<number>(C).fill(0);
  let n = N;
  for (let i = C; i >= 1; i--) {
    const k = choice[i][n];
    alloc[i - 1] = k;
    n -= k;
  }
  return alloc;
}

interface Primary {
  clusterIdx: number;
  k: number;
  point: CurvePoint;
}

function earlier(a: string, b: string): boolean {
  return parseISO(a) < parseISO(b);
}

/** 연차 N개 이하로 얻을 수 있는 최장 연휴 1건 (동점이면 더 이른 날짜) */
export function pickLongest(clusters: Cluster[], leave: number): Primary | null {
  let best: Primary | null = null;
  clusters.forEach((c, idx) => {
    const kMax = Math.min(leave, c.curve.length - 1);
    for (let k = 0; k <= kMax; k++) {
      const p = c.curve[k];
      if (
        !best ||
        p.streak > best.point.streak ||
        (p.streak === best.point.streak && earlier(p.rangeStart, best.point.rangeStart))
      ) {
        best = { clusterIdx: idx, k, point: p };
      }
    }
  });
  return best;
}

/** longestStreak 모드: 최장 연휴 1건을 먼저 확정하고, 잔여 연차만 나머지 클러스터에 DP */
export function allocateLongestFirst(clusters: Cluster[], leave: number): number[] {
  const alloc = new Array<number>(clusters.length).fill(0);
  const primary = pickLongest(clusters, leave);
  if (!primary) return alloc;

  alloc[primary.clusterIdx] = primary.k;
  const remaining = leave - primary.point.usedLeave;
  const rest = clusters.filter((_, i) => i !== primary.clusterIdx);
  const restAlloc = allocateByDP(rest, remaining);
  let j = 0;
  for (let i = 0; i < clusters.length; i++) {
    if (i === primary.clusterIdx) continue;
    alloc[i] = restAlloc[j++];
  }
  return alloc;
}

/** 대상 연도의 DayInfo 배열 (패딩 포함) */
export function buildYearDays(input: Pick<OptimizeInput, 'year' | 'blackoutRanges' | 'notBefore' | 'workPattern'>): DayInfo[] {
  const data = getHolidayData(input.year);
  if (!data) throw new Error(`지원하지 않는 연도입니다: ${input.year}`);
  return buildDays({
    year: input.year,
    holidays: data.holidays,
    blackoutRanges: normalizeRanges(input.blackoutRanges),
    notBefore: input.notBefore,
    workPattern: input.workPattern,
  });
}

/**
 * 한 연휴에 몰아 쓸 수 있는 연차 상한.
 * 곡선을 잘라 두면 DP·최장 연휴 선택·직접 조정이 모두 자연히 상한을 지킨다.
 */
export function normalizeMaxPerCluster(max: number | undefined): number | undefined {
  if (max === undefined || !Number.isFinite(max)) return undefined;
  const n = Math.floor(max);
  return n >= 1 ? Math.min(n, MAX_LEAVE_INPUT) : undefined;
}

function capCurve(cluster: Cluster, cap: number | undefined): Cluster {
  if (cap === undefined || cluster.curve.length - 1 <= cap) return cluster;
  return { ...cluster, curve: cluster.curve.slice(0, cap + 1) };
}

/** 대상 연도의 클러스터(곡선 포함) 목록 */
export function buildClusters(
  input: Pick<OptimizeInput, 'year' | 'blackoutRanges' | 'notBefore' | 'workPattern' | 'maxLeavePerCluster'>,
): Cluster[] {
  const cap = normalizeMaxPerCluster(input.maxLeavePerCluster);
  return findClusters(buildYearDays(input)).map((c) => capCurve(withCurve(c), cap));
}

export function normalizeLeave(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

/** 현재 사용 연차(used)에서 연차를 더 썼을 때 연휴가 처음으로 늘어나는 지점 */
export function nextStep(curve: CurvePoint[], used: number): LeaveStep | null {
  const current = curve[Math.min(used, curve.length - 1)];
  if (!current) return null;
  for (let k = used + 1; k < curve.length; k++) {
    if (curve[k].streak > current.streak) {
      return { slot: k, leave: curve[k].usedLeave, streak: curve[k].streak };
    }
  }
  return null;
}

/** 연차를 1개 덜 썼을 때의 결과 */
export function prevStep(curve: CurvePoint[], used: number): LeaveStep | null {
  if (used <= 0) return null;
  const p = curve[used - 1];
  return p ? { slot: used - 1, leave: p.usedLeave, streak: p.streak } : null;
}

/**
 * 사용자가 고정한 클러스터는 지정 슬롯을 먼저 배정하고(예산 초과분은 잘라냄),
 * 남은 연차만 모드에 따라 나머지 클러스터에 자동 배분한다.
 */
export function allocate(
  clusters: Cluster[],
  leave: number,
  mode: OptimizeMode,
  fixed: Record<number, number> | undefined,
): number[] {
  const alloc = new Array<number>(clusters.length).fill(0);
  let remaining = leave;
  const freeIdx: number[] = [];

  clusters.forEach((c, i) => {
    const f = fixed?.[c.id];
    if (f === undefined || !Number.isFinite(f)) {
      freeIdx.push(i);
      return;
    }
    const k = Math.max(0, Math.min(Math.floor(f), c.curve.length - 1, remaining));
    alloc[i] = k;
    remaining -= c.curve[k]?.usedLeave ?? 0;
  });

  const free = freeIdx.map((i) => clusters[i]);
  const sub = mode === 'longestStreak' ? allocateLongestFirst(free, remaining) : allocateByDP(free, remaining);
  freeIdx.forEach((i, j) => {
    alloc[i] = sub[j];
  });
  return alloc;
}

export function optimize(input: OptimizeInput): OptimizeResult {
  const data = getHolidayData(input.year);
  if (!data) throw new Error(`지원하지 않는 연도입니다: ${input.year}`);

  const leave = normalizeLeave(input.annualLeaveCount);
  const clusters = buildClusters(input);
  const alloc = allocate(clusters, leave, input.mode, input.fixedAllocations);

  const recommendations: Recommendation[] = [];
  const baseHolidays: BaseHoliday[] = [];
  let totalLeaveUsed = 0;
  let totalOffDays = 0;
  let totalGain = 0;
  let longest: { streak: number; rangeStart: string; rangeEnd: string; label: string } | undefined;

  clusters.forEach((c, i) => {
    const base = c.curve[0];
    const point = c.curve[alloc[i]] ?? base;
    if (!point) return;
    const maxLeave = c.curve.length - 1; // 상한이 걸리면 그만큼 줄어든다
    const isFixed = input.fixedAllocations?.[c.id] !== undefined;

    if (base && base.streak >= 3 && point.usedLeave === 0) {
      baseHolidays.push({
        clusterId: c.id,
        label: c.label,
        streak: base.streak,
        rangeStart: base.rangeStart,
        rangeEnd: base.rangeEnd,
        maxLeave,
        nextStep: nextStep(c.curve, 0),
      });
    }

    if (
      !longest ||
      point.streak > longest.streak ||
      (point.streak === longest.streak && earlier(point.rangeStart, longest.rangeStart))
    ) {
      longest = { streak: point.streak, rangeStart: point.rangeStart, rangeEnd: point.rangeEnd, label: c.label };
    }

    if (point.usedLeave > 0) {
      totalLeaveUsed += point.usedLeave;
      totalOffDays += point.streak;
      totalGain += point.gain;
      recommendations.push({
        clusterId: c.id,
        label: c.label,
        cost: point.usedLeave,
        streak: point.streak,
        gain: point.gain,
        baseStreak: c.baseStreak,
        rangeStart: point.rangeStart,
        rangeEnd: point.rangeEnd,
        selectedDays: point.selectedDays,
        efficiency: point.gain / point.usedLeave,
        maxLeave,
        fixed: isFixed,
        nextStep: nextStep(c.curve, point.usedLeave),
        prevStep: prevStep(c.curve, point.usedLeave),
      });
    }
  });

  recommendations.sort(
    (a, b) =>
      b.efficiency - a.efficiency ||
      b.streak - a.streak ||
      parseISO(a.rangeStart) - parseISO(b.rangeStart),
  );

  return {
    year: input.year,
    mode: input.mode,
    recommendations,
    baseHolidays,
    totalLeaveUsed,
    unusedLeave: leave - totalLeaveUsed,
    totalOffDays,
    totalGain,
    longestStreak: longest?.streak ?? 0,
    longestStreakRange: longest ? { start: longest.rangeStart, end: longest.rangeEnd } : null,
    longestStreakLabel: longest?.label ?? '',
    clusterCount: clusters.length,
    dataUpdatedAt: data.updatedAt,
  };
}
