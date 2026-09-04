// 공유 이미지 생성 — 1080×1350, 쿼리 파라미터로 입력 상태를 전달받아 동일 결과를 재계산
import { ImageResponse } from 'next/og';
import { fmtRangeShort, fmtSelectedDays } from '@/lib/format';
import { currentYearToday } from '@/lib/calendar';
import { DEFAULT_YEAR, isSupportedYear } from '@/lib/holidays';
import { optimize } from '@/lib/optimize';
import { parsePlannerState } from '@/lib/urlState';

// Next 16부터 Edge Runtime은 deprecated → 기본(Node.js) 런타임 사용. next/og 는 두 런타임 모두 지원.
export const dynamic = 'force-dynamic';

const WIDTH = 1080;
const HEIGHT = 1350;

// globals.css 의 디자인 토큰과 동일한 팔레트
const C = {
  forest950: '#06251C',
  forest900: '#0B3B2E',
  forest700: '#176A51',
  forest300: '#7AD7B8',
  forest200: '#A7E3CC',
  ivory: '#FAF9F5',
  line: 'rgba(255,255,255,0.12)',
  gold: '#C19A3D',
};

async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const match = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!match) return null;
    const res = await fetch(match[1]);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year') ?? DEFAULT_YEAR);
  if (!isSupportedYear(year)) {
    return new Response('지원하지 않는 연도입니다', { status: 400 });
  }

  const state = parsePlannerState(searchParams);
  const result = optimize({
    year,
    annualLeaveCount: state.leave,
    blackoutRanges: state.blackout,
    workSaturday: false,
    notBefore: currentYearToday(year),
    mode: state.mode,
    fixedAllocations: state.fixed,
  });
  const cards = result.recommendations.slice(0, 3).map((r) => ({
    label: r.label,
    streak: `${r.streak}일`,
    range: fmtRangeShort(r.rangeStart, r.rangeEnd),
    leave: `연차 ${r.cost}일 · ${fmtSelectedDays(r.selectedDays, 4)}`,
  }));

  const eyebrow = `${year} ANNUAL LEAVE`;
  const headline =
    result.totalLeaveUsed > 0 ? `연차 ${result.totalLeaveUsed}일로` : '연차 없이';
  const headline2 =
    result.totalLeaveUsed > 0 ? `최장 ${result.longestStreak}일 연휴` : `최장 ${result.longestStreak}일 연휴`;
  const subline =
    result.totalLeaveUsed > 0
      ? `추천 연휴 ${result.recommendations.length}건 · 총 휴일 ${result.totalOffDays}일 · ${
          state.mode === 'longestStreak' ? '긴 연휴 우선' : '많은 휴일 우선'
        }`
      : `${result.longestStreakLabel} ${
          result.longestStreakRange ? fmtRangeShort(result.longestStreakRange.start, result.longestStreakRange.end) : ''
        }`;
  const footer = `연차 최적화 캘린더 · 공휴일 데이터 기준 ${result.dataUpdatedAt}`;
  const emptyText = '연차를 입력하면 추천 연휴가 표시됩니다';

  const allText = [eyebrow, headline, headline2, subline, footer, emptyText, '연차 계산기']
    .concat(cards.flatMap((c) => [c.label, c.streak, c.range, c.leave]))
    .join('');
  const uniqueText = Array.from(new Set(allText)).join('');
  const [regular, bold] = await Promise.all([
    loadGoogleFont('Noto+Sans+KR', 400, uniqueText),
    loadGoogleFont('Noto+Sans+KR', 800, uniqueText),
  ]);
  const fonts = [
    regular ? { name: 'Noto Sans KR', data: regular, weight: 400 as const, style: 'normal' as const } : null,
    bold ? { name: 'Noto Sans KR', data: bold, weight: 700 as const, style: 'normal' as const } : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null);

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          padding: 80,
          background: C.forest950,
          backgroundImage: `radial-gradient(1000px 520px at 50% -8%, ${C.forest700} 0%, transparent 62%)`,
          color: '#ffffff',
          fontFamily: 'Noto Sans KR, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 34, height: 3, background: C.forest300 }} />
          <div style={{ fontSize: 24, fontWeight: 700, color: C.forest300, letterSpacing: 4 }}>{eyebrow}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.14, letterSpacing: -3, color: C.forest200 }}>
            {headline}
          </div>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.12, letterSpacing: -4 }}>{headline2}</div>
          <div style={{ fontSize: 28, color: 'rgba(214,242,230,0.62)', marginTop: 24 }}>{subline}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 60, flexGrow: 1 }}>
          {cards.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexGrow: 1,
                borderRadius: 28,
                border: `2px dashed ${C.line}`,
                color: 'rgba(214,242,230,0.5)',
                fontSize: 30,
              }}
            >
              {emptyText}
            </div>
          ) : (
            cards.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '30px 36px',
                  borderRadius: 26,
                  background: i === 0 ? C.ivory : 'rgba(255,255,255,0.06)',
                  border: i === 0 ? 'none' : `2px solid ${C.line}`,
                  color: i === 0 ? C.forest950 : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, opacity: i === 0 ? 0.55 : 0.65 }}>{c.label}</div>
                  <div style={{ fontSize: 30, opacity: i === 0 ? 0.75 : 0.7 }}>{c.leave}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ fontSize: 62, fontWeight: 700, letterSpacing: -2 }}>{c.streak}</div>
                  <div style={{ fontSize: 24, opacity: 0.6 }}>{c.range}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 44,
            paddingTop: 28,
            borderTop: `2px solid ${C.line}`,
            fontSize: 22,
            color: 'rgba(214,242,230,0.5)',
          }}
        >
          <div>{footer}</div>
          <div style={{ color: C.forest300, fontWeight: 700, letterSpacing: 1 }}>연차 계산기</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
