// 입력 상태 ↔ URL 쿼리 변환 (공유 링크·OG 이미지가 동일 상태를 복원하도록)
import { isValidISODate } from './calendar';
import { MAX_BLACKOUT_RANGES, MAX_LEAVE_INPUT } from './optimize';
import type { DateRange, OptimizeMode } from './types';

export interface PlannerState {
  leave: number;
  mode: OptimizeMode;
  blackout: DateRange[]; // 입력 중인(미완성 포함) 구간. 계산 시 normalizeRanges 로 걸러짐
  fixed: Record<number, number>; // 사용자가 직접 조정한 클러스터별 연차 (clusterId → 슬롯)
}

export const DEFAULT_STATE: PlannerState = {
  leave: 15,
  mode: 'longestStreak',
  blackout: [],
  fixed: {},
};

const MODE_PARAM: Record<OptimizeMode, string> = {
  longestStreak: 'longest',
  totalGain: 'total',
};

export function clampLeave(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_STATE.leave;
  return Math.min(MAX_LEAVE_INPUT, Math.max(0, Math.floor(n)));
}

type ParamSource = { get(name: string): string | null };

export function parsePlannerState(params: ParamSource | null | undefined): PlannerState {
  if (!params) return DEFAULT_STATE;

  const leaveRaw = params.get('leave');
  const leave = leaveRaw === null || leaveRaw === '' ? DEFAULT_STATE.leave : clampLeave(Number(leaveRaw));

  const modeRaw = params.get('mode');
  const mode: OptimizeMode = modeRaw === 'total' ? 'totalGain' : 'longestStreak';

  const blackout: DateRange[] = [];
  const blackoutRaw = params.get('blackout');
  if (blackoutRaw) {
    for (const token of blackoutRaw.split(',')) {
      const [start, end] = token.split('~');
      if (isValidISODate(start) && isValidISODate(end)) {
        blackout.push(start <= end ? { start, end } : { start: end, end: start });
      }
      if (blackout.length >= MAX_BLACKOUT_RANGES) break;
    }
  }

  const fixed: Record<number, number> = {};
  const fixRaw = params.get('fix');
  if (fixRaw) {
    for (const token of fixRaw.split(',')) {
      const [idStr, kStr] = token.split(':');
      const id = Number(idStr);
      const k = Number(kStr);
      if (Number.isInteger(id) && id >= 0 && Number.isInteger(k) && k >= 0 && k <= MAX_LEAVE_INPUT) fixed[id] = k;
    }
  }

  return { leave, mode, blackout, fixed };
}

/** 기본값과 같은 항목은 생략. 미완성 블랙아웃 구간은 제외 */
export function serializePlannerState(state: PlannerState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.leave !== DEFAULT_STATE.leave) params.set('leave', String(state.leave));
  if (state.mode !== DEFAULT_STATE.mode) params.set('mode', MODE_PARAM[state.mode]);
  const complete = state.blackout.filter((r) => isValidISODate(r.start) && isValidISODate(r.end));
  if (complete.length > 0) params.set('blackout', complete.map((r) => `${r.start}~${r.end}`).join(','));
  const fixEntries = Object.entries(state.fixed).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (fixEntries.length > 0) params.set('fix', fixEntries.map(([id, k]) => `${id}:${k}`).join(','));
  return params;
}

export function plannerQueryString(state: PlannerState): string {
  const qs = serializePlannerState(state).toString();
  return qs ? `?${qs}` : '';
}
