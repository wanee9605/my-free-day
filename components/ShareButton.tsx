'use client';

import { useState } from 'react';
import { fmtRangeShort, fmtShort } from '@/lib/format';
import { buildIcs, icsFileName } from '@/lib/ics';
import type { ManualResult } from '@/lib/manual';
import { serializePlannerState, type PlannerState } from '@/lib/urlState';

interface Props {
  year: number;
  state: PlannerState;
  result: ManualResult;
}

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

export function buildOgUrl(year: number, state: PlannerState): string {
  const params = serializePlannerState(state, year);
  params.set('year', String(year));
  return `/api/og?${params.toString()}`;
}

/** 단톡방에 붙여넣기 좋은 텍스트 요약 */
export function buildShareText(year: number, result: ManualResult, url: string): string {
  const lines: string[] = [
    result.usedCount > 0
      ? `🗓 ${year} 연차 계획 — 연차 ${result.usedCount}일로 최장 ${result.longestStreak}일 연휴`
      : `🗓 ${year} 연차 계획 — 아직 배치한 연차가 없습니다`,
  ];
  result.runs.forEach((r, i) => {
    lines.push(
      `${i + 1}. ${r.label} ${r.total}일 (${fmtRangeShort(r.start, r.end)}) · 연차 ${r.cost}일: ${r.leaveDays.map(fmtShort).join(', ')}`,
    );
  });
  if (result.stranded.length > 0) {
    lines.push(`※ 붙지 않은 연차 ${result.stranded.length}일: ${result.stranded.map((r) => fmtShort(r.start)).join(', ')}`);
  }
  if (result.usedCount > 0) lines.push(`※ 총 휴식 ${result.restDays}일 · 연차 1일당 ${result.perLeave.toFixed(1)}일`);
  lines.push(url);
  return lines.join('\n');
}

const BUTTON = 'min-h-9 rounded-md border px-3 text-[12px] font-semibold transition';

export default function ShareButton({ year, state, result }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const ogUrl = buildOgUrl(year, state);
  const empty = result.usedCount === 0;

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ kind: 'done', text: done });
    } catch {
      setStatus({ kind: 'error', text: '복사하지 못했어요' });
    }
  }

  async function saveImage() {
    setStatus({ kind: 'busy', text: '이미지 만드는 중…' });
    try {
      const res = await fetch(ogUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `연차계획_${year}_${result.longestStreak}일연휴.png`, { type: 'image/png' });
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${year} 연차 계획` });
        setStatus({ kind: 'idle' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ kind: 'done', text: '이미지를 저장했어요' });
    } catch {
      setStatus({ kind: 'error', text: '이미지를 만들지 못했어요' });
    }
  }

  /** 구글·애플·아웃룩이 모두 읽는 .ics 로 내려받는다 (연동에 로그인이 필요 없다) */
  function saveCalendar() {
    if (empty) {
      setStatus({ kind: 'error', text: '내보낼 연차가 없어요' });
      return;
    }
    try {
      const ics = buildIcs(year, [...result.runs, ...result.stranded], { sourceUrl: window.location.href });
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = icsFileName(year);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ kind: 'done', text: '캘린더 파일을 내려받았어요' });
    } catch {
      setStatus({ kind: 'error', text: '캘린더 파일을 만들지 못했어요' });
    }
  }

  const busy = status.kind === 'busy';

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={saveImage}
          disabled={busy}
          className={`${BUTTON} border-ink bg-ink text-canvas hover:opacity-90 disabled:opacity-60`}
        >
          {busy ? '만드는 중…' : '이미지로 저장'}
        </button>
        <button type="button" onClick={saveCalendar} className={`${BUTTON} border-line bg-canvas text-ink-2 hover:border-acc-mid hover:text-ink`}>
          캘린더에 추가
        </button>
        <button
          type="button"
          onClick={() => copy(buildShareText(year, result, window.location.href), '결과 텍스트를 복사했어요')}
          className={`${BUTTON} border-line bg-canvas text-ink-2 hover:border-acc-mid hover:text-ink`}
        >
          텍스트 복사
        </button>
        <button
          type="button"
          onClick={() => copy(window.location.href, '링크를 복사했어요')}
          className={`${BUTTON} border-line bg-canvas text-ink-2 hover:border-acc-mid hover:text-ink`}
        >
          링크 복사
        </button>
      </div>
      {status.kind !== 'idle' && (
        <span role="status" className={`text-[11px] ${status.kind === 'error' ? 'text-sun' : 'text-ink-3'}`}>
          {status.text}
        </span>
      )}
      <span className="text-[11px] leading-relaxed text-ink-4">
        링크에는 배치한 연차와 설정이 함께 담깁니다. `.ics` 는 연휴 구간과 연차 사용일을 각각 일정으로 넣습니다.
      </span>
    </div>
  );
}
