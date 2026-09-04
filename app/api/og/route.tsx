// 공유 이미지 생성 — 1080×1350, 쿼리 파라미터로 입력 상태를 전달받아 동일 결과를 재계산
import { ImageResponse } from 'next/og';
import { currentYearToday } from '@/lib/calendar';
import { fmtRangeShort, fmtSelectedDays } from '@/lib/format';
import { DEFAULT_YEAR, isSupportedYear } from '@/lib/holidays';
import { evaluate } from '@/lib/manual';
import { parsePlannerState } from '@/lib/urlState';

// Next 16부터 Edge Runtime은 deprecated → 기본(Node.js) 런타임 사용. next/og 는 두 런타임 모두 지원.
export const dynamic = 'force-dynamic';

const WIDTH = 1080;
const HEIGHT = 1350;

// globals.css 의 라이트 테마 토큰과 같은 값 (여기서는 CSS 변수를 쓸 수 없어 복제한다)
const C = {
  canvas: '#F1F1EF',
  surface: '#FCFCFB',
  line: '#D9D9D4',
  lineSoft: '#E6E6E1',
  ink: '#1E1F1E',
  ink2: '#484A48',
  ink3: '#75776F',
  ink4: '#A0A29A',
  acc: '#1F6F5C',
  accInk: '#14503F',
  accSoft: 'rgba(31,111,92,0.14)',
  accMid: 'rgba(31,111,92,0.38)',
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

  const state = parsePlannerState(searchParams, year);
  const result = evaluate({
    year,
    blackoutRanges: state.blackout,
    workPattern: state.work,
    notBefore: currentYearToday(year),
    selected: state.selected,
  });

  const cards = result.runs.slice(0, 3).map((r) => ({
    label: r.label,
    streak: `${r.total}일`,
    range: fmtRangeShort(r.start, r.end),
    leave: `연차 ${r.cost}일 · ${fmtSelectedDays(r.leaveDays, 4)}`,
  }));

  const eyebrow = `${year} ANNUAL LEAVE`;
  // 이어진 연휴가 없으면 "최장 1일 연휴" 대신 사실대로 적는다
  const headline = result.usedCount > 0 ? `연차 ${result.usedCount}일로` : '연차를 놓아 보면';
  const headline2 =
    result.runs.length > 0
      ? `최장 ${result.longestStreak}일 연휴`
      : result.usedCount > 0
        ? '아직 이어진 연휴 없음'
        : `${year}년 연휴 만들기`;
  const subline =
    result.runs.length === 0 && result.usedCount > 0
      ? `붙지 않은 연차 ${result.stranded.length}일 · 옆 날짜로 옮기면 연휴가 됩니다`
      : result.usedCount > 0
      ? `연휴 ${result.runs.length}건 · 총 휴식 ${result.restDays}일 · 연차 1일당 ${result.perLeave.toFixed(1)}일${
          result.stranded.length > 0 ? ` · 붙지 않은 연차 ${result.stranded.length}일` : ''
        }`
      : '달력의 평일을 눌러 연차를 직접 배치합니다';
  const footer = `연차 최적화 캘린더 · 공휴일 데이터 기준 ${result.dataUpdatedAt}`;
  const emptyText = result.usedCount === 0 ? '아직 배치한 연차가 없습니다' : '아직 이어지는 연휴가 없습니다';

  const allText = [eyebrow, headline, headline2, subline, footer, emptyText, '연차 계산기']
    .concat(cards.flatMap((c) => [c.label, c.streak, c.range, c.leave]))
    .join('');
  const uniqueText = Array.from(new Set(allText)).join('');
  const [regular, bold] = await Promise.all([
    loadGoogleFont('Noto+Sans+KR', 400, uniqueText),
    loadGoogleFont('Noto+Sans+KR', 700, uniqueText),
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
          padding: 76,
          background: C.canvas,
          color: C.ink,
          fontFamily: 'Noto Sans KR, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 34, height: 3, background: C.acc }} />
          <div style={{ fontSize: 24, fontWeight: 700, color: C.acc, letterSpacing: 4 }}>{eyebrow}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
          <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.14, letterSpacing: -3, color: C.acc }}>
            {headline}
          </div>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.12, letterSpacing: -4 }}>{headline2}</div>
          <div style={{ fontSize: 27, color: C.ink3, marginTop: 22 }}>{subline}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 54, flexGrow: 1 }}>
          {cards.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexGrow: 1,
                borderRadius: 20,
                border: `2px dashed ${C.line}`,
                color: C.ink4,
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
                  padding: '30px 34px',
                  borderRadius: 18,
                  background: i === 0 ? C.accSoft : C.surface,
                  border: `2px solid ${i === 0 ? C.accMid : C.lineSoft}`,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: i === 0 ? C.accInk : C.ink2 }}>{c.label}</div>
                  <div style={{ fontSize: 28, color: C.ink3 }}>{c.leave}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: -2 }}>{c.streak}</div>
                  <div style={{ fontSize: 23, color: C.ink3 }}>{c.range}</div>
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
            marginTop: 40,
            paddingTop: 26,
            borderTop: `2px solid ${C.line}`,
            fontSize: 22,
            color: C.ink4,
          }}
        >
          <div>{footer}</div>
          <div style={{ color: C.acc, fontWeight: 700, letterSpacing: 1 }}>연차 계산기</div>
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
