// /lib/cluster.ts — 연휴 클러스터 탐색 (2단계)
import type { Cluster, DayInfo } from './types';

/**
 * 인접 휴일 블록을 같은 클러스터로 묶는 최대 평일 간격.
 * 평일 5일을 모두 연차로 채우면 앞뒤 주말이 이어지므로 5가 이론상 최대.
 *
 * 단, 일반 주말끼리의 간격도 정확히 5이므로 이 조건만 쓰면 1년 전체가
 * 하나의 클러스터로 합쳐진다. 그래서 병합은 "둘 중 한쪽 블록에 공휴일이 있을 때"만
 * 허용한다 — 공휴일이 없는 순수 주말끼리는 이어붙이지 않는다.
 */
export const MAX_GAP = 5;

export interface OffBlock {
  startIdx: number;
  endIdx: number;
  hasHoliday: boolean; // 대상 연도의 공휴일 포함 여부
}

/** 연속된 isOff 구간 목록 */
export function findOffBlocks(days: DayInfo[]): OffBlock[] {
  const blocks: OffBlock[] = [];
  let i = 0;
  while (i < days.length) {
    if (!days[i].isOff) {
      i++;
      continue;
    }
    const startIdx = i;
    let hasHoliday = false;
    while (i < days.length && days[i].isOff) {
      if (days[i].inYear && days[i].holidayName) hasHoliday = true;
      i++;
    }
    blocks.push({ startIdx, endIdx: i - 1, hasHoliday });
  }
  return blocks;
}

/** 공휴일명에서 "연휴" 접미어 제거 ("추석 연휴" → "추석") */
function holidayBaseName(name: string): string {
  return name.replace(/\s*연휴$/, '').trim();
}

function makeLabel(names: string[]): string {
  if (names.length === 0) return '연휴';
  return `${names.join('·')} 연휴`;
}

/** 연차 0개 기준 최대 연속 휴일 (대상 연도 날짜를 하나 이상 포함하는 구간만) */
export function maxOffRun(days: DayInfo[]): number {
  let best = 0;
  let run = 0;
  let runHasInYear = false;
  for (const d of days) {
    if (d.isOff) {
      run++;
      if (d.inYear) runHasInYear = true;
      if (runHasInYear && run > best) best = run;
    } else {
      run = 0;
      runHasInYear = false;
    }
  }
  return best;
}

function makeCluster(group: OffBlock[], days: DayInfo[], id: number): Cluster {
  const startIdx = group[0].startIdx;
  const endIdx = group[group.length - 1].endIdx;
  const slice = days.slice(startIdx, endIdx + 1);

  const names: string[] = [];
  for (const d of slice) {
    if (!d.inYear || !d.holidayName || d.holidayType === 'substitute') continue;
    const base = holidayBaseName(d.holidayName);
    if (!names.includes(base)) names.push(base);
  }

  const workdays = slice.filter((d) => !d.isOff).map((d) => d.date);
  const selectableWorkdays = slice.filter((d) => !d.isOff && d.selectable).map((d) => d.date);

  return {
    id,
    label: makeLabel(names),
    holidayNames: names,
    startDate: slice[0].date,
    endDate: slice[slice.length - 1].date,
    days: slice,
    workdays,
    selectableWorkdays,
    baseStreak: maxOffRun(slice),
    curve: [],
  };
}

/** 연휴 클러스터 탐색. 대상 연도의 공휴일을 하나 이상 포함하는 클러스터만 반환한다. */
export function findClusters(days: DayInfo[], maxGap: number = MAX_GAP): Cluster[] {
  const blocks = findOffBlocks(days);
  if (blocks.length === 0) return [];

  const groups: OffBlock[][] = [];
  let current: OffBlock[] = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    const prev = current[current.length - 1];
    const cur = blocks[i];
    const gap = cur.startIdx - prev.endIdx - 1;
    if (gap <= maxGap && (prev.hasHoliday || cur.hasHoliday)) {
      current.push(cur);
    } else {
      groups.push(current);
      current = [cur];
    }
  }
  groups.push(current);

  return groups
    .filter((g) => g.some((b) => b.hasHoliday))
    .map((g, idx) => makeCluster(g, days, idx));
}
