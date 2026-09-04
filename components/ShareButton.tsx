'use client';

import { useState } from 'react';
import { fmtRangeShort, fmtShort } from '@/lib/format';
import type { OptimizeResult } from '@/lib/types';
import { serializePlannerState, type PlannerState } from '@/lib/urlState';

interface Props {
  year: number;
  state: PlannerState;
  result: OptimizeResult;
  compact?: boolean; // 모바일 하단 바용
}

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

export function buildOgUrl(year: number, state: PlannerState): string {
  const params = serializePlannerState(state);
  params.set('year', String(year));
  return `/api/og?${params.toString()}`;
}

/** 단톡방에 붙여넣기 좋은 텍스트 요약 */
export function buildShareText(year: number, result: OptimizeResult, url: string): string {
  const lines: string[] = [];
  lines.push(
    result.totalLeaveUsed > 0
      ? `🗓 ${year} 연차 최적화 — 연차 ${result.totalLeaveUsed}일로 최장 ${result.longestStreak}일 연휴`
      : `🗓 ${year} 연차 최적화 — 연차 없이 최장 ${result.longestStreak}일 연휴`,
  );
  result.recommendations.forEach((r, i) => {
    lines.push(
      `${i + 1}. ${r.label} ${r.streak}일 (${fmtRangeShort(r.rangeStart, r.rangeEnd)}) · 연차 ${r.cost}일: ${r.selectedDays.map(fmtShort).join(', ')}`,
    );
  });
  if (result.unusedLeave > 0) lines.push(`※ 미사용 연차 ${result.unusedLeave}일`);
  lines.push(url);
  return lines.join('\n');
}

export default function ShareButton({ year, state, result, compact = false }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const ogUrl = buildOgUrl(year, state);
  const fileName = `연차최적화_${year}_${result.longestStreak}일연휴.png`;

  async function saveImage() {
    setStatus({ kind: 'busy', text: '이미지 만드는 중…' });
    try {
      const res = await fetch(ogUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'image/png' });

      // 모바일: 시스템 공유 시트(단톡방 등)로 바로 전달
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${year} 연차 최적화`,
            text: `연차 ${result.totalLeaveUsed}일로 최장 ${result.longestStreak}일 연휴`,
          });
          setStatus({ kind: 'done', text: '공유했어요' });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setStatus({ kind: 'idle' });
            return;
          }
          // 공유 실패 시 다운로드로 폴백
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ kind: 'done', text: '이미지를 저장했어요' });
    } catch (err) {
      setStatus({ kind: 'error', text: `이미지 생성 실패 (${err instanceof Error ? err.message : '알 수 없는 오류'})` });
    }
  }

  async function copy(text: string, doneText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ kind: 'done', text: doneText });
    } catch {
      setStatus({ kind: 'error', text: '복사 실패 — 주소창의 URL을 직접 복사해 주세요' });
    }
  }

  const busy = status.kind === 'busy';

  if (compact) {
    return (
      <button
        type="button"
        onClick={saveImage}
        disabled={busy}
        className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-forest-950 transition hover:bg-forest-100 disabled:opacity-60"
      >
        {busy ? '만드는 중…' : '이미지 공유'}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={saveImage}
        disabled={busy}
        className="min-h-10 rounded-xl bg-forest-900 px-4 text-sm font-bold text-white shadow-lift transition hover:bg-forest-800 disabled:opacity-60"
      >
        {busy ? '만드는 중…' : '이미지로 저장'}
      </button>
      <button
        type="button"
        onClick={() => copy(buildShareText(year, result, window.location.href), '결과 텍스트를 복사했어요')}
        className="min-h-10 rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink-soft transition hover:border-forest-300 hover:text-ink"
      >
        텍스트 복사
      </button>
      <button
        type="button"
        onClick={() => copy(window.location.href, '링크를 복사했어요')}
        className="min-h-10 rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink-soft transition hover:border-forest-300 hover:text-ink"
      >
        링크 복사
      </button>
      <a
        href={ogUrl}
        target="_blank"
        rel="noreferrer"
        className="min-h-10 rounded-lg px-2 py-2.5 text-xs font-medium text-ink-mute transition hover:text-forest-700"
      >
        미리보기
      </a>
      {status.kind !== 'idle' && (
        <span role="status" className={`text-xs ${status.kind === 'error' ? 'text-clay' : 'text-ink-mute'}`}>
          {status.text}
        </span>
      )}
    </div>
  );
}
