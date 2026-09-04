import type { Ref } from 'react';
import { fmtRange } from '@/lib/format';
import type { OptimizeResult } from '@/lib/types';

interface Props {
  result: OptimizeResult;
  leave: number;
  ref?: Ref<HTMLElement>;
}

function Stat({
  label,
  value,
  unit,
  sub,
  featured = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  featured?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 px-6 py-6 ${featured ? 'bg-white/[0.07]' : ''}`}>
      <span className="eyebrow text-forest-300/80">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span key={String(value)} className="numeral animate-pop text-4xl text-white sm:text-5xl">
          {value}
        </span>
        {unit && <span className="text-sm font-semibold text-forest-200/70">{unit}</span>}
      </span>
      {sub && <span className="truncate text-xs text-forest-100/60">{sub}</span>}
    </div>
  );
}

export default function SummaryBar({ result, leave, ref }: Props) {
  const range = result.longestStreakRange;
  const avgEfficiency = result.totalLeaveUsed > 0 ? Math.round((result.totalGain / result.totalLeaveUsed) * 10) / 10 : 0;

  return (
    <section
      ref={ref}
      aria-live="polite"
      aria-label="요약"
      className="overflow-hidden rounded-3xl bg-forest-900 shadow-deep"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
        <p className="text-base font-bold text-white sm:text-lg">
          {result.totalLeaveUsed > 0 ? (
            <>
              연차 {result.totalLeaveUsed}일로 <span className="text-forest-300">총 휴일 {result.totalOffDays}일</span>을 만듭니다
            </>
          ) : (
            <>연차 없이 최장 {result.longestStreak}일 연휴</>
          )}
        </p>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-white/15 px-3 py-1 text-forest-100">
            추천 연휴 {result.recommendations.length}건
          </span>
          {result.unusedLeave > 0 && leave > 0 && (
            <span
              className="rounded-full bg-gold-soft px-3 py-1 text-forest-950"
              title="더 써도 연휴가 늘어나지 않는 연차"
            >
              미사용 {result.unusedLeave}일
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0">
        <Stat label="사용 연차" value={result.totalLeaveUsed} unit={`/ ${leave}일`} />
        <Stat label="휴일 총 일수" value={result.totalOffDays} unit="일" sub={`연차로 +${result.totalGain}일`} />
        <Stat
          label="최장 연휴"
          value={result.longestStreak}
          unit="일"
          sub={range ? `${result.longestStreakLabel} · ${fmtRange(range.start, range.end)}` : undefined}
          featured
        />
        <Stat label="평균 가성비" value={avgEfficiency} unit="배" sub="연차 1일당 늘어나는 휴일" />
      </div>
    </section>
  );
}
