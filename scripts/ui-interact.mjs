// UI 인터랙션 점검 — 카드 연차 조정, 자동 복귀, 달력 필터, URL 동기화가 실제로 동작하는지 확인
// 사용: node scripts/ui-interact.mjs [baseUrl]
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9223;
const PROFILE = String.raw`C:\Users\Public\shots\pptr-interact`;
const base = process.argv[2] ?? 'http://localhost:3000';

await rm(PROFILE, { recursive: true, force: true });
const edge = spawn(
  EDGE,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'],
  { detached: true, stdio: 'ignore' },
);
edge.unref();

for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
  } catch {
    /* 대기 */
  }
  await new Promise((r) => setTimeout(r, 300));
}

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const settle = () => new Promise((r) => setTimeout(r, 450));

/** 추천 카드의 제목·연휴 길이·사용 연차 (클래스명이 아니라 텍스트 형태로 찾는다) */
const readCards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('ul > li')]
      .filter((li) => li.querySelector('h3'))
      .map((li) => ({
        label: li.querySelector('h3')?.textContent?.trim() ?? '',
        streak:
          [...li.querySelectorAll('p')]
            .map((p) => p.textContent?.replace(/\s+/g, '') ?? '')
            .find((t) => /^\d+일$/.test(t)) ?? '',
        leave:
          [...li.querySelectorAll('span')]
            .map((s) => s.textContent?.trim() ?? '')
            .find((t) => /^연차 \d+일$/.test(t)) ?? '',
        fixed: li.textContent?.includes('직접 조정') ?? false,
      })),
  );

const summary = () => page.evaluate(() => document.querySelector('[aria-label="요약"] p')?.textContent?.trim() ?? '');

await page.goto(`${base}/2027?leave=15&mode=total`, { waitUntil: 'networkidle0' });
await settle();

const before = await readCards();
check('추천 카드 렌더', before.length > 0, `${before.length}건, 첫 카드 ${before[0]?.label} ${before[0]?.streak} ${before[0]?.leave}`);

// 1) "+"(연차 더 쓰기)가 활성인 첫 카드를 조정
const plusTarget = await page.evaluate(() => {
  for (const li of document.querySelectorAll('ul > li')) {
    const h3 = li.querySelector('h3');
    if (!h3) continue;
    const btn = [...li.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes('더 쓰기'));
    if (btn && !btn.disabled) {
      btn.click();
      return h3.textContent?.trim() ?? '';
    }
  }
  return null;
});
await settle();
const afterPlus = await readCards();
if (plusTarget) {
  const prev = before.find((c) => c.label === plusTarget);
  const target = afterPlus.find((c) => c.label === plusTarget);
  check(
    '카드 + 로 연차 추가',
    target?.fixed === true && target?.leave !== prev?.leave,
    `${plusTarget}: ${prev?.leave} ${prev?.streak} → ${target?.leave} ${target?.streak}`,
  );
  const url = page.url();
  check('조정 내용이 URL 에 반영', url.includes('fix='), url.slice(url.indexOf('?')));
} else {
  check('카드 + 로 연차 추가', false, '조정 가능한 카드 없음');
  check('조정 내용이 URL 에 반영', false, '건너뜀');
}

// 1-1) 다른 카드가 자동으로 재배분되었는지 (총 사용 연차는 예산 안에서 유지)
const rebalanced = await summary();
check('나머지 연차 자동 재배분', /연차\s*\d+일/.test(rebalanced), rebalanced);

// 2) "자동" 버튼으로 복귀
const autoClicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '자동');
  if (!btn) return false;
  btn.click();
  return true;
});
await settle();
if (autoClicked) {
  const back = await readCards();
  check('자동 배분으로 복귀', !back.some((c) => c.fixed) && !page.url().includes('fix='), `카드 ${back.length}건, URL ${page.url().includes('fix=') ? 'fix 남음' : 'fix 제거됨'}`);
} else {
  check('자동 배분으로 복귀', false, '"자동" 버튼 없음');
}

// 3) 총 연차 증감이 요약에 반영
const sumBefore = await summary();
await page.evaluate(() => document.querySelector('button[aria-label="연차 1개 늘리기"]')?.click());
await settle();
const sumAfter = await summary();
check('연차 +1 이 요약에 반영', sumBefore !== sumAfter, `${sumBefore} → ${sumAfter}`);

// 4) 달력 월 필터 토글
const filterText = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /연차 있는 달만|12개월 전체 보기/.test(b.textContent ?? ''));
  if (!btn) return null;
  const beforeCount = document.querySelectorAll('section[id^="month-"]').length;
  btn.click();
  return beforeCount;
});
await settle();
if (filterText !== null) {
  const afterCount = await page.evaluate(() => document.querySelectorAll('section[id^="month-"]').length);
  check('달력 월 필터 토글', afterCount !== filterText, `${filterText}개월 → ${afterCount}개월`);
} else {
  check('달력 월 필터 토글', false, '토글 버튼 없음');
}

// 5) "달력에서 보기" → 해당 월 강조
const focused = await page.evaluate(() => {
  const li = [...document.querySelectorAll('ul > li')].find((x) => x.querySelector('h3'));
  const btn = [...(li?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('달력에서 보기'));
  if (!btn) return false;
  btn.click();
  return true;
});
await settle();
if (focused) {
  const hasRing = await page.evaluate(() => document.querySelectorAll('[class*="outline-gold"]').length);
  check('달력에서 보기 → 구간 강조', hasRing > 0, `강조된 날짜 ${hasRing}칸`);
} else {
  check('달력에서 보기 → 구간 강조', false, '버튼 없음');
}

// 6) 공유 이미지가 조정 상태를 반영하는지
await page.goto(`${base}/2027?leave=2&mode=longest`, { waitUntil: 'networkidle0' });
await settle();
const ogStatus = await page.evaluate(async () => {
  const a = document.querySelector('a[href^="/api/og"]');
  if (!a) return { ok: false, msg: 'OG 링크 없음' };
  const res = await fetch(a.getAttribute('href'));
  return { ok: res.ok, msg: `${res.status} ${res.headers.get('content-type')}`, href: a.getAttribute('href') };
});
check('공유 이미지 생성', ogStatus.ok, `${ogStatus.msg} ${ogStatus.href ?? ''}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
await browser.close();
process.exit(failed.length > 0 ? 1 : 0);
