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
    '달력에서 연차를 직접 놓아 가며 가장 긴 연휴를 만들어 보세요. 한 칸 더 쓰면 며칠이 늘어나는지 바로 보여 줍니다. 징검다리 연휴, 연차 쓰는 법, 연차 계산기.',
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1f1ef' },
    { media: '(prefers-color-scheme: dark)', color: '#101211' },
  ],
};

// 첫 페인트 전에 테마를 확정해 다크 사용자에게 흰 화면이 번쩍이지 않게 한다.
// 저장값이 없으면 OS 설정을 따르고, 저장이 막힌 브라우저에서는 라이트로 둔다.
const THEME_SCRIPT = `try{var t=localStorage.getItem('mfd-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
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
