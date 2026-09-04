import { getHolidayData } from '@/lib/holidays';

interface Props {
  year: number;
  clusterCount: number;
}

export default function Hero({ year, clusterCount }: Props) {
  const data = getHolidayData(year);
  const holidayCount = data?.holidays.length ?? 0;
  const substituteCount = data?.holidays.filter((h) => h.type === 'substitute').length ?? 0;

  const stats = [
    { value: holidayCount, unit: '일', label: '공휴일' },
    { value: substituteCount, unit: '회', label: '대체공휴일' },
    { value: clusterCount, unit: '개', label: '연휴 구간' },
  ];

  return (
    <section className="relative overflow-hidden bg-forest-950 text-white">
      {/* 미세한 격자와 상단 광원 */}
      <div className="grid-veil absolute inset-0" aria-hidden />
      <div
        className="absolute -top-40 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #1c8365, transparent)' }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-32 pt-14 sm:px-8 sm:pb-36 sm:pt-20 lg:pt-24">
        <p className="eyebrow text-forest-400">Annual Leave Optimizer</p>

        <h1 className="display mt-5 text-[2.5rem] text-white sm:text-6xl lg:text-7xl">
          {year}년,
          <br />
          <span className="text-forest-200">가장 적은 연차로</span>
          <br />
          가장 긴 연휴를.
        </h1>

        <p className="mt-7 max-w-xl text-base leading-relaxed text-forest-100/80 sm:text-lg">
          보유 연차 개수만 입력하면 공휴일과 주말 사이에 숨은 날짜 조합을 찾아 냅니다. 회사 성수기는 제외하고,
          원하는 연휴에는 연차를 직접 더 넣어 조정할 수 있습니다.
        </p>

        <dl className="mt-12 flex flex-wrap gap-x-12 gap-y-6 border-t border-white/10 pt-8">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <dt className="text-xs font-semibold tracking-wide text-forest-200/70">
                {year} {s.label}
              </dt>
              <dd className="numeral text-3xl text-white sm:text-4xl">
                {s.value}
                <span className="ml-1 text-lg font-semibold text-forest-300/80">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
