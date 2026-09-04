import type { Metadata } from 'next';
import LeavePlanner from '@/components/LeavePlanner';
import { DEFAULT_YEAR } from '@/lib/holidays';
import { optimize } from '@/lib/optimize';
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
  const state = parsePlannerState(toParams(await searchParams));
  const query = plannerQueryString(state); // 유효한 값만 남긴 정규화 결과
  const ogUrl = `/api/og?year=${DEFAULT_YEAR}${query.replace('?', '&')}`;
  const images = [{ url: ogUrl, width: 1080, height: 1350 }];

  if (query === '') {
    return { alternates: { canonical: '/' }, openGraph: { url: '/', images } };
  }

  const result = optimize({
    year: DEFAULT_YEAR,
    annualLeaveCount: state.leave,
    blackoutRanges: state.blackout,
    workSaturday: false,
    mode: state.mode,
    fixedAllocations: state.fixed,
  });
  const title =
    result.totalLeaveUsed > 0
      ? `연차 ${result.totalLeaveUsed}일로 최장 ${result.longestStreak}일 연휴`
      : `연차 없이 최장 ${result.longestStreak}일 연휴`;
  const description =
    result.recommendations.length > 0
      ? `${DEFAULT_YEAR}년 추천 연휴 ${result.recommendations.length}건 · 총 휴일 ${result.totalOffDays}일. 보유 연차로 최대 연휴를 만드는 날짜 조합입니다.`
      : `${DEFAULT_YEAR}년 공휴일 기준 계산 결과입니다. 연차 개수를 입력하면 최소 연차로 최대 연휴를 만드는 조합을 추천합니다.`;

  return {
    title,
    description,
    alternates: { canonical: '/' }, // 쿼리별 URL이 따로 색인되지 않도록
    openGraph: { title, description, url: '/', images },
  };
}

export default function HomePage() {
  return <LeavePlanner year={DEFAULT_YEAR} />;
}
