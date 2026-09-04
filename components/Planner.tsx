'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SidePanel from './SidePanel';
import YearGrid from './YearGrid';
import { currentYearToday } from '@/lib/calendar';
import { autofillSelection, evaluate, suggestDays } from '@/lib/manual';
import { DEFAULT_STATE, parsePlannerState, plannerQueryString, type PlannerState } from '@/lib/urlState';

interface Props {
  year: number;
}

const THEME_KEY = 'mfd-theme';

export default function Planner({ year }: Props) {
  const router = useRouter();
  // 정적 HTML 은 기본값으로 그려 SEO 용 전체 콘텐츠를 담고, 마운트 후 URL 상태를 복원한다
  const [state, setState] = useState<PlannerState>(DEFAULT_STATE);
  const [restored, setRestored] = useState(false);
  const [notBefore, setNotBefore] = useState<string | undefined>(undefined);
  const [hoverRun, setHoverRun] = useState(-1);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setState(parsePlannerState(new URLSearchParams(window.location.search), year));
    setRestored(true);
  }, [year]);

  useEffect(() => {
    setNotBefore(currentYearToday(year));
  }, [year]);

  useEffect(() => {
    const stored = (() => {
      try {
        return window.localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    })();
    const prefersDark = stored ? stored === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    setDark(!!prefersDark);
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (!restored) return;
    const next = `${window.location.pathname}${plannerQueryString(state, year)}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState(window.history.state, '', next);
  }, [state, restored, year]);

  const result = useMemo(
    () =>
      evaluate({
        year,
        blackoutRanges: state.blackout,
        workPattern: state.work,
        notBefore,
        selected: state.selected,
      }),
    [year, state.blackout, state.work, state.selected, notBefore],
  );

  const usedSet = useMemo(() => new Set(result.used), [result.used]);
  // 하루짜리 연차도 달력에는 표시해야 하므로 연휴 뒤에 이어 붙인다 (hoverRun 인덱스가 그대로 맞는다)
  const bandRuns = useMemo(() => [...result.runs, ...result.stranded], [result.runs, result.stranded]);
  const suggestions = useMemo(
    () => suggestDays(result.days, usedSet, state.leave, 3),
    [result.days, usedSet, state.leave],
  );

  const toggleDay = useCallback(
    (date: string) => {
      setState((prev) => {
        if (prev.selected.includes(date)) {
          return { ...prev, selected: prev.selected.filter((d) => d !== date) };
        }
        if (prev.selected.length >= prev.leave) return prev; // 한도를 넘겨 놓지 않는다
        return { ...prev, selected: [...prev.selected, date].sort() };
      });
      setHoverRun(-1);
    },
    [],
  );

  const clearAll = useCallback(() => {
    setState((prev) => ({ ...prev, selected: [] }));
    setHoverRun(-1);
  }, []);

  const autofill = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selected: autofillSelection({
        year,
        blackoutRanges: prev.blackout,
        workPattern: prev.work,
        notBefore,
        selected: prev.selected,
        budget: prev.leave,
        mode: prev.mode,
        maxLeavePerCluster: prev.maxPerCluster,
      }),
    }));
    setHoverRun(-1);
  }, [year, notBefore]);

  const toggleTheme = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      try {
        window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      } catch {
        // 저장이 막힌 브라우저에서도 화면 전환은 되도록 무시한다
      }
      return next;
    });
  }, []);

  const handleYearChange = useCallback(
    (nextYear: number) => {
      if (nextYear === year) return;
      // 연도가 바뀌면 날짜가 달라지므로 배치는 비우고 설정만 넘긴다
      router.push(`/${nextYear}${plannerQueryString({ ...state, selected: [] }, nextYear)}`);
    },
    [router, state, year],
  );

  const headerButton = 'h-7 rounded-[5px] border px-2.5 text-xs transition';

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 flex h-[46px] items-center justify-between gap-3 border-b border-line bg-canvas px-3.5">
        <div className="flex min-w-0 items-baseline gap-[7px]">
          {/* 좁은 화면에서는 제목을 잘라서라도 배치 현황을 남긴다 — 달력을 내려보며 만질 때 유일한 피드백이라서 */}
          <h1 className="truncate text-[13px] font-semibold tracking-[-0.01em]">{year} 연차 직접 배치</h1>
          <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-ink-3 sm:text-xs">
            {result.usedCount}/{state.leave} · 휴식 {result.restDays}일
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={clearAll}
            className={`${headerButton} hidden border-line bg-surface font-medium text-ink-2 hover:border-acc-mid sm:block`}
          >
            비우기
          </button>
          <button
            type="button"
            onClick={autofill}
            className={`${headerButton} border-ink bg-ink font-semibold text-canvas hover:opacity-90`}
          >
            <span className="sm:hidden">채우기</span>
            <span className="hidden sm:inline">추천으로 채우기</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            className={`${headerButton} border-line bg-surface font-medium text-ink-2 hover:border-acc-mid`}
          >
            {dark ? '라이트' : '다크'}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1280px] flex-wrap items-start gap-3.5 p-3.5">
        <SidePanel
          year={year}
          state={state}
          result={result}
          suggestions={suggestions}
          hoverRun={hoverRun}
          hoverDate={hoverDate}
          notBefore={notBefore}
          onChange={setState}
          onHoverRun={setHoverRun}
          onHoverDate={setHoverDate}
          onToggleDay={toggleDay}
          onYearChange={handleYearChange}
        />

        <section className="flex min-w-0 flex-[3_1_600px] flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2 rounded-lg border border-line bg-surface px-3 py-[9px]">
            <span className="text-xs font-medium text-ink-2">평일을 누르면 연차가 놓이고, 다시 누르면 빠집니다.</span>
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
                <span className="font-bold text-sun">일</span>공휴일·일요일
              </span>
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
                <span className="font-bold text-sat">토</span>토요일
              </span>
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
                <span className="flex h-[15px] w-[17px] items-center justify-center rounded-[3px] border border-acc-mid bg-acc-soft text-[10px] font-bold text-acc-ink">
                  3
                </span>
                내 연차
              </span>
            </div>
          </div>

          <YearGrid
            year={year}
            days={result.days}
            runs={bandRuns}
            selected={usedSet}
            hoverRun={hoverRun}
            hoverDate={hoverDate}
            onToggle={toggleDay}
            onHoverRun={setHoverRun}
          />

          <footer className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-3 py-3">
            <h2 className="text-xs font-semibold text-ink-2">{year}년 연차 최적화 캘린더</h2>
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              보유 연차로 최소한의 연차를 써서 가장 긴 연휴를 만드는 날짜 조합을 찾아 줍니다. 공휴일·대체공휴일을 반영해
              징검다리 연휴를 계산하며, 계산은 모두 브라우저에서 이루어지고 입력한 내용은 서버에 저장되지 않습니다.
            </p>
            {result.dataUpdatedAt && (
              <p className="text-[11px] text-ink-4">공휴일 데이터 기준 {result.dataUpdatedAt} · 공공데이터포털 특일정보</p>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
}
