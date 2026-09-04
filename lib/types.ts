// /lib/types.ts — 연차 최적화 캘린더 공통 타입

export type HolidayType = 'public' | 'substitute' | 'temporary';

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayType;
}

export interface HolidayData {
  year: number;
  updatedAt: string; // 데이터 기준일 (YYYY-MM-DD)
  source?: string;
  holidays: Holiday[];
}

export interface DateRange {
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive)
}

export interface DayInfo {
  date: string;
  weekday: number; // 0=일 ... 6=토
  isOff: boolean; // 주말 또는 공휴일
  /** 근무 형태상 쉬는 날 (주 5일이면 주말, 교대근무면 휴무일) */
  isOffDuty: boolean;
  holidayName?: string;
  holidayType?: HolidayType;
  selectable: boolean; // 연차 사용 가능 여부 (블랙아웃·연도 밖이면 false)
  inYear: boolean; // 대상 연도에 속하는 날짜인지 (앞뒤 패딩 구분)
}

export interface CurvePoint {
  cost: number; // 배정 슬롯 k (연차 k개까지 투입 가능할 때)
  usedLeave: number; // 실제로 쓰는 연차 수 (= selectedDays.length, k 이하)
  streak: number; // 달성 최대 연속 휴일 일수
  gain: number; // streak - baseStreak
  selectedDays: string[]; // 이때 써야 할 연차 날짜
  rangeStart: string;
  rangeEnd: string;
}

export interface Cluster {
  id: number;
  label: string; // "추석 연휴"
  holidayNames: string[];
  startDate: string;
  endDate: string;
  days: DayInfo[];
  workdays: string[]; // 클러스터 내 평일 전체
  selectableWorkdays: string[]; // 그중 연차 사용 가능한 날
  baseStreak: number; // 연차 0개일 때 최대 연속 휴일
  curve: CurvePoint[]; // index = k
}

/** 연차를 더/덜 썼을 때 바뀌는 결과 미리보기 */
export interface LeaveStep {
  slot: number; // 이 결과를 얻기 위한 배정 슬롯 k
  leave: number; // 그때 실제 사용 연차
  streak: number;
}

export interface Recommendation {
  clusterId: number;
  label: string;
  cost: number; // 실제 사용 연차 수
  streak: number;
  gain: number;
  baseStreak: number;
  rangeStart: string;
  rangeEnd: string;
  selectedDays: string[];
  efficiency: number; // gain / cost
  maxLeave: number; // 이 클러스터에서 쓸 수 있는 최대 연차
  fixed: boolean; // 사용자가 직접 조정한 배정인지
  nextStep: LeaveStep | null; // 연차를 더 쓰면
  prevStep: LeaveStep | null; // 연차를 덜 쓰면
}

export interface BaseHoliday {
  clusterId: number;
  label: string;
  streak: number;
  rangeStart: string;
  rangeEnd: string;
  maxLeave: number;
  nextStep: LeaveStep | null;
}

export type OptimizeMode = 'totalGain' | 'longestStreak';

/**
 * 근무 형태. 어떤 날이 "쉬는 날"인지를 정하며, 공휴일은 어느 형태에서도 휴일로 본다.
 * - week5: 월~금 근무 (토·일 휴무)
 * - week6: 월~토 근무 (일요일만 휴무)
 * - shift: 근무 workDays일 → 휴무 offDays일 을 반복. anchor 는 한 주기의 첫 근무일
 */
export type WorkPattern =
  | { kind: 'week5' }
  | { kind: 'week6' }
  | { kind: 'shift'; workDays: number; offDays: number; anchor: string };

export const DEFAULT_WORK_PATTERN: WorkPattern = { kind: 'week5' };

export interface OptimizeInput {
  year: number;
  annualLeaveCount: number;
  blackoutRanges: DateRange[];
  mode: OptimizeMode;
  /** 근무 형태. 생략하면 주 5일 */
  workPattern?: WorkPattern;
  /** 사용자가 직접 지정한 클러스터별 연차 배정 (clusterId → 슬롯 k). 나머지는 자동 */
  fixedAllocations?: Record<number, number>;
  /** 이 날짜보다 이전인 평일은 연차 대상에서 제외. 진행 중인 연도에서만 쓴다 */
  notBefore?: string;
}

export interface OptimizeResult {
  year: number;
  mode: OptimizeMode;
  recommendations: Recommendation[]; // 연차를 쓰는 연휴, efficiency 내림차순
  baseHolidays: BaseHoliday[]; // 연차 없이도 생기는 3일 이상 연휴
  totalLeaveUsed: number;
  unusedLeave: number; // 배정하지 못한 잔여 연차
  totalOffDays: number; // 추천 연휴의 총 일수 합
  totalGain: number;
  longestStreak: number;
  longestStreakRange: DateRange | null;
  longestStreakLabel: string;
  clusterCount: number;
  dataUpdatedAt: string;
}
