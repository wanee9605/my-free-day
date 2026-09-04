import type { Metadata } from 'next';
import Planner from '@/components/Planner';
import { currentYearToday } from '@/lib/calendar';
import { DEFAULT_YEAR } from '@/lib/holidays';
import { evaluate } from '@/lib/manual';
import { parsePlannerState, plannerQueryString } from '@/lib/urlState';

type SearchParams = Record<string, string | string[] | undefined>;

interface Props {
  searchParams: Promise<SearchParams>;
}

function toParams(searchParams: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value.length > 0) params.set(key, value[0]);
  }
  return params;
}

/**
 * 공유 버튼이 복사하는 링크는 쿼리를 단 `/` 이므로, 미리보기도 그 쿼리의 결과를 보여줘야 한다.
 * 쿼리가 기본 상태와 같으면(= 일반 방문) 사이트 기본 문구를 유지해 검색 노출을 해치지 않는다.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const state = parsePlannerState(toParams(await searchParams), DEFAULT_YEAR);
  const query = plannerQueryString(state, DEFAULT_YEAR); // 유효한 값만 남긴 정규화 결과
  const ogUrl = `/api/og?year=${DEFAULT_YEAR}${query.replace('?', '&')}`;
  const images = [{ url: ogUrl, width: 1080, height: 1350 }];

  if (query === '') {
    return { alternates: { canonical: '/' }, openGraph: { url: '/', images } };
  }

  const result = evaluate({
    year: DEFAULT_YEAR,
    blackoutRanges: state.blackout,
    workPattern: state.work,
    notBefore: currentYearToday(DEFAULT_YEAR),
    selected: state.selected,
  });
  const title =
    result.usedCount > 0
      ? `연차 ${result.usedCount}일로 최장 ${result.longestStreak}일 연휴`
      : `${DEFAULT_YEAR}년 연차 계획 세우기`;
  const description =
    result.runs.length > 0
      ? `${DEFAULT_YEAR}년 연휴 ${result.runs.length}건 · 총 휴식 ${result.restDays}일. 달력에서 직접 배치한 연차 계획입니다.`
      : `${DEFAULT_YEAR}년 공휴일 기준으로 연차를 달력에 직접 놓아 가며 연휴를 만들어 보세요.`;

  return {
    title,
    description,
    alternates: { canonical: '/' }, // 검색엔진: 쿼리별 URL이 따로 색인되지 않도록
    // 메신저·SNS 는 og:url 을 카드의 이동 대상으로 쓰므로 공유한 상태를 그대로 유지한다
    openGraph: { title, description, url: `/${query}`, images },
  };
}

export default function HomePage() {
  return <Planner year={DEFAULT_YEAR} />;
}
