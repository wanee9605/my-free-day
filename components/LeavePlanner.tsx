'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hero from './Hero';
import InputPanel from './InputPanel';
import ResultCards from './ResultCards';
import ShareButton from './ShareButton';
import SummaryBar from './SummaryBar';
import YearCalendar from './YearCalendar';
import { currentYearToday } from '@/lib/calendar';
import { buildYearDays, optimize } from '@/lib/optimize';
import { DEFAULT_STATE, parsePlannerState, plannerQueryString, type PlannerState } from '@/lib/urlState';

const DEBOUNCE_MS = 300;

interface Props {
  year: number;
}

export interface CalendarFocus {
  clusterId: number;
  month: number; // 1~12
  nonce: number;
}

function SectionHeading({ index, title, description, action }: { index: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="flex items-baseline gap-3">
        <span className="eyebrow text-forest-600">{index}</span>
        <div>
          <h2 className="display text-xl sm:text-2xl">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function LeavePlanner({ year }: Props) {
  const router = useRouter();
  // 서버·정적 HTML 은 기본값으로 렌더링(SEO용 전체 콘텐츠 포함)하고,
  // 마운트 후 URL 쿼리를 읽어 공유 링크 상태를 복원한다.
  const [state, setState] = useState<PlannerState>(DEFAULT_STATE);
  const [applied, setApplied] = useState<PlannerState>(DEFAULT_STATE);
  const [restored, setRestored] = useState(false);
  // 진행 중인 연도라면 이미 지난 날짜는 연차 후보에서 뺀다.
  // 서버 렌더에서는 undefined 로 둬 정적 HTML 에 연도 전체가 담기게 하고(SEO), 마운트 후 좁힌다.
  const [notBefore, setNotBefore] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState<CalendarFocus | null>(null);
  // 요약 카드가 화면에서 사라졌을 때만 모바일 하단 바를 띄운다 (같은 정보 중복 노출 방지)
  const summaryRef = useRef<HTMLElement | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  useEffect(() => {
    const fromUrl = parsePlannerState(new URLSearchParams(window.location.search));
    setState(fromUrl);
    setApplied(fromUrl);
    setRestored(true);
  }, []);

  useEffect(() => {
    setNotBefore(currentYearToday(year));
  }, [year]);

  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setShowStickyBar(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 타이핑 입력 → 300ms 디바운스 후 재계산
  useEffect(() => {
    if (state === applied) return;
    const timer = setTimeout(() => setApplied(state), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, applied]);

  // 계산 상태를 URL 쿼리에 반영 (공유 링크 복원용)
  useEffect(() => {
    if (!restored) return;
    const next = `${window.location.pathname}${plannerQueryString(applied)}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState(window.history.state, '', next);
  }, [applied, restored]);

  /** 버튼·토글처럼 이산적인 조작은 디바운스 없이 즉시 반영 */
  const commit = useCallback((next: PlannerState) => {
    setState(next);
    setApplied(next);
  }, []);

  const result = useMemo(
    () =>
      optimize({
        year,
        annualLeaveCount: applied.leave,
        blackoutRanges: applied.blackout,
        mode: applied.mode,
        fixedAllocations: applied.fixed,
        notBefore,
        workPattern: applied.work,
        maxLeavePerCluster: applied.maxPerCluster,
      }),
    [year, applied, notBefore],
  );

  const allDays = useMemo(
    () => buildYearDays({ year, blackoutRanges: applied.blackout, notBefore, workPattern: applied.work }),
    [year, applied.blackout, applied.work, notBefore],
  );
  const yearDays = useMemo(() => allDays.filter((d) => d.inYear), [allDays]);
  const dayMap = useMemo(() => new Map(allDays.map((d) => [d.date, d])), [allDays]);

  const handleYearChange = useCallback(
    (nextYear: number) => {
      if (nextYear === year) return;
      router.push(`/${nextYear}${plannerQueryString({ ...state, fixed: {} })}`);
    },
    [router, state, year],
  );

  /** 카드에서 연차 직접 조정. slot=null 이면 자동 배분으로 복귀 */
  const handleAdjust = useCallback(
    (clusterId: number, slot: number | null) => {
      const fixed = { ...state.fixed };
      if (slot === null) delete fixed[clusterId];
      else fixed[clusterId] = slot;
      commit({ ...state, fixed });
    },
    [state, commit],
  );

  const handleResetAll = useCallback(() => commit({ ...state, fixed: {} }), [state, commit]);

  const handleFocus = useCallback((clusterId: number, rangeStart: string) => {
    const month = Number(rangeStart.slice(5, 7));
    setFocus((prev) => ({ clusterId, month, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const fixedCount = Object.keys(applied.fixed).length;

  return (
    <div className="min-h-dvh">
      <Hero year={year} clusterCount={result.clusterCount} />

      {/* 히어로가 position: relative 라 z-index 없이는 뒤이은 카드를 덮는다 */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-28 sm:px-8 lg:pb-20">
        {/* 히어로에 겹쳐 올라오는 입력 패널 */}
        <div className="-mt-20 sm:-mt-24">
          <InputPanel
            year={year}
            state={state}
            onChange={setState}
            onCommit={commit}
            onYearChange={handleYearChange}
            notBefore={notBefore}
          />
        </div>

        <div className="mt-8">
          <SummaryBar ref={summaryRef} result={result} leave={applied.leave} />
        </div>

        <section aria-labelledby="results-heading" className="mt-16 flex flex-col gap-6">
          <SectionHeading
            index="01"
            title="추천 연휴"
            description="가성비가 높은 순서입니다. 카드에서 연차를 직접 늘리고 줄일 수 있어요."
            action={
              <div className="flex flex-wrap items-center gap-2">
                {fixedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="min-h-8 rounded-full border border-gold/40 bg-gold-soft px-3 text-xs font-semibold text-gold transition hover:border-gold"
                  >
                    직접 조정 {fixedCount}건 · 자동으로 되돌리기
                  </button>
                )}
                <ShareButton year={year} state={applied} result={result} />
              </div>
            }
          />
          <h2 id="results-heading" className="sr-only">
            추천 연휴
          </h2>
          <ResultCards result={result} dayMap={dayMap} onAdjust={handleAdjust} onFocus={handleFocus} />
        </section>

        <section aria-labelledby="calendar-heading" className="mt-16 flex flex-col gap-6">
          <SectionHeading index="02" title="연간 캘린더" description={`${year}년 전체 일정과 추천 연차 위치를 확인하세요.`} />
          <h2 id="calendar-heading" className="sr-only">
            연간 캘린더
          </h2>
          <YearCalendar year={year} days={yearDays} result={result} focus={focus} />
        </section>
      </main>

      <footer className="border-t border-line bg-ivory-deep">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          <p className="eyebrow text-forest-700">연차 최적화 캘린더</p>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-soft">
            공휴일 데이터 기준일 {result.dataUpdatedAt}. 임시공휴일 지정 등으로 실제 공휴일이 달라질 수 있으니 최종
            확정 전 관보와 회사 공지를 확인하세요. 주 5일 근무(토·일 휴무) 기준이며, 계산은 모두 브라우저에서
            처리되고 입력값은 저장되지 않습니다.
          </p>
        </div>
      </footer>

      {/* 모바일 하단 고정 바 — 요약 카드가 화면 밖일 때만 */}
      <div
        aria-hidden={!showStickyBar}
        className={`fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-forest-950/95 px-5 py-3 text-white backdrop-blur-md transition-transform duration-300 lg:hidden ${
          showStickyBar ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {result.totalLeaveUsed > 0
                ? `연차 ${result.totalLeaveUsed}일 → 최장 ${result.longestStreak}일 연휴`
                : `연차 없이 최장 ${result.longestStreak}일`}
            </p>
            <p className="truncate text-xs text-forest-200/80">
              추천 {result.recommendations.length}건 · 총 휴일 {result.totalOffDays}일
              {result.unusedLeave > 0 && applied.leave > 0 ? ` · 미사용 ${result.unusedLeave}일` : ''}
            </p>
          </div>
          <ShareButton year={year} state={applied} result={result} compact />
        </div>
      </div>
    </div>
  );
}
