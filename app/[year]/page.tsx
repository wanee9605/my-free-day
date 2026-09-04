import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Planner from '@/components/Planner';
import { SUPPORTED_YEARS, isSupportedYear } from '@/lib/holidays';

interface Props {
  params: Promise<{ year: string }>;
}

export function generateStaticParams(): { year: string }[] {
  return SUPPORTED_YEARS.map((y) => ({ year: String(y) }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const title = `${year}년 연차 최적화 캘린더 — ${year} 연차 쓰는 법`;
  const description = `${year}년 공휴일 기준으로 연차 몇 개로 며칠 연휴를 만들 수 있는지 계산합니다. 징검다리 연휴 추천, 블랙아웃 기간 제외, 결과 이미지 공유.`;
  return {
    title,
    description,
    alternates: { canonical: `/${year}` },
    openGraph: {
      title,
      description,
      url: `/${year}`,
      images: [{ url: `/api/og?year=${year}`, width: 1080, height: 1350 }],
    },
  };
}

export default async function YearPage({ params }: Props) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isSupportedYear(year)) notFound();

  return <Planner year={year} />;
}
