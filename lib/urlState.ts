// 입력 상태 ↔ URL 쿼리 변환 (공유 링크·OG 이미지가 동일 상태를 복원하도록)
import { isValidISODate, normalizeWorkPattern } from './calendar';
import { MAX_BLACKOUT_RANGES, MAX_LEAVE_INPUT, normalizeMaxPerCluster } from './optimize';
import { DEFAULT_WORK_PATTERN, type DateRange, type OptimizeMode, type WorkPattern } from './types';

export interface PlannerState {
  leave: number;
  mode: OptimizeMode;
  blackout: DateRange[]; // 입력 중인(미완성 포함) 구간. 계산 시 normalizeRanges 로 걸러짐
  fixed: Record<number, number>; // 사용자가 직접 조정한 클러스터별 연차 (clusterId → 슬롯)
  work: WorkPattern;
  /** 한 연휴에 몰아 쓸 수 있는 연차 상한. undefined 면 제한 없음 */
  maxPerCluster?: number;
}

export const DEFAULT_STATE: PlannerState = {
  leave: 15,
  mode: 'longestStreak',
  blackout: [],
  fixed: {},
  work: DEFAULT_WORK_PATTERN,
};

// work=week6 / work=4-2:2027-01-04 (근무 4일·휴무 2일, 주기 첫 근무일). 주 5일은 기본값이라 생략한다
const SHIFT_PARAM = /^(\d{1,2})-(\d{1,2}):(\d{4}-\d{2}-\d{2})$/;

export function parseWorkPattern(raw: string | null): WorkPattern {
  if (!raw) return DEFAULT_WORK_PATTERN;
  if (raw === 'week6') return { kind: 'week6' };
  const m = SHIFT_PARAM.exec(raw);
  if (!m) return DEFAULT_WORK_PATTERN;
  return normalizeWorkPattern({ kind: 'shift', workDays: Number(m[1]), offDays: Number(m[2]), anchor: m[3] });
}

export function serializeWorkPattern(work: WorkPattern): string | null {
  if (work.kind === 'week5') return null;
  if (work.kind === 'week6') return 'week6';
  return `${work.workDays}-${work.offDays}:${work.anchor}`;
}

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

  return {
    leave,
    mode,
    blackout,
    fixed,
    work: parseWorkPattern(params.get('work')),
    maxPerCluster: normalizeMaxPerCluster(Number(params.get('maxrun'))),
  };
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
  const work = serializeWorkPattern(state.work);
  if (work) params.set('work', work);
  const cap = normalizeMaxPerCluster(state.maxPerCluster);
  if (cap !== undefined) params.set('maxrun', String(cap));
  return params;
}

export function plannerQueryString(state: PlannerState): string {
  const qs = serializePlannerState(state).toString();
  return qs ? `?${qs}` : '';
}
