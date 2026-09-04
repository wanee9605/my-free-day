// /lib/curve.ts — 클러스터별 가성비 곡선 (3단계)
import type { Cluster, CurvePoint, DayInfo } from './types';

interface Interval {
  a: number; // days 인덱스 (inclusive)
  b: number;
  cost: number; // 구간 안의 평일 수 = 필요한 연차 수
  streak: number; // b - a + 1
  inYearDays: number;
}

/** 우선순위: 더 긴 연휴 > 대상 연도 날짜를 더 많이 포함 > 더 이른 시작일 */
function better(x: Interval, y: Interval): boolean {
  if (x.streak !== y.streak) return x.streak > y.streak;
  if (x.inYearDays !== y.inYearDays) return x.inYearDays > y.inYearDays;
  return x.a < y.a;
}

/**
 * 연차 k개(k = 0..maxCost)를 투입했을 때 얻는 최대 연속 휴일 곡선.
 *
 * 최대 연속 휴일은 항상 하나의 연속 구간이고, 그 구간 안의 평일을 전부 연차로
 * 채워야 하므로 "구간 → (비용, 길이)"를 전수 조사하면 부분집합 전수 탐색(2^m)과
 * 동일한 결과를 O(L²)에 얻는다. 평일이 12개를 넘는 클러스터도 상한 없이 정확히 계산된다.
 *
 * 곡선은 단조 증가하도록 후처리: curve[k] = k 이하의 비용으로 얻는 최선.
 * 따라서 curve[k].usedLeave ≤ k 이며, 그 차이는 "써도 늘어나지 않는" 연차다.
 */
export function computeCurve(days: DayInfo[], maxCost: number): CurvePoint[] {
  const L = days.length;
  const byCost: (Interval | undefined)[] = new Array(maxCost + 1);

  for (let a = 0; a < L; a++) {
    let cost = 0;
    let inYearDays = 0;
    for (let b = a; b < L; b++) {
      const d = days[b];
      if (!d.isOff) {
        if (!d.selectable) break; // 블랙아웃·연도 밖 평일은 넘을 수 없음
        cost++;
        if (cost > maxCost) break;
      }
      if (d.inYear) inYearDays++;
      if (inYearDays === 0) continue; // 패딩만으로 이뤄진 구간은 제외

      const cand: Interval = { a, b, cost, streak: b - a + 1, inYearDays };
      const cur = byCost[cost];
      if (!cur || better(cand, cur)) byCost[cost] = cand;
    }
  }

  const baseStreak = byCost[0]?.streak ?? 0;
  const curve: CurvePoint[] = [];
  let best: Interval | undefined;
  for (let k = 0; k <= maxCost; k++) {
    const cand = byCost[k];
    if (cand && (!best || cand.streak > best.streak)) best = cand;
    if (!best) {
      // 클러스터는 항상 휴일로 시작하므로 k=0 구간이 존재한다. 방어 코드.
      curve.push({
        cost: k,
        usedLeave: 0,
        streak: 0,
        gain: 0,
        selectedDays: [],
        rangeStart: days[0]?.date ?? '',
        rangeEnd: days[0]?.date ?? '',
      });
      continue;
    }
    const selectedDays: string[] = [];
    for (let i = best.a; i <= best.b; i++) if (!days[i].isOff) selectedDays.push(days[i].date);
    curve.push({
      cost: k,
      usedLeave: selectedDays.length,
      streak: best.streak,
      gain: best.streak - baseStreak,
      selectedDays,
      rangeStart: days[best.a].date,
      rangeEnd: days[best.b].date,
    });
  }
  return curve;
}

/** 클러스터에 곡선을 채워 반환 (원본은 변경하지 않음) */
export function withCurve(cluster: Cluster): Cluster {
  const curve = computeCurve(cluster.days, cluster.selectableWorkdays.length);
  return { ...cluster, curve, baseStreak: curve[0]?.streak ?? cluster.baseStreak };
}
