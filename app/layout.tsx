import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '연차 최적화 캘린더 — 연차 계산기',
    template: '%s | 연차 최적화 캘린더',
  },
  description:
    '보유 연차 개수를 입력하면 최소 연차로 최대 연휴를 만드는 날짜 조합을 자동 추천합니다. 징검다리 연휴, 연차 쓰는 법, 연차 계산기.',
  keywords: ['연차 최적화', '연차 계산기', '2027 연차 쓰는 법', '징검다리 연휴', '2027 연휴'],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '연차 최적화 캘린더',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#06251c',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard 가변 폰트 (동적 서브셋). 로드 실패 시 시스템 폰트로 폴백 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
