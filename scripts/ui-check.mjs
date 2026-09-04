// UI 점검용 개발 스크립트 — 뷰포트별 스크린샷 + 가로 넘침 원인 진단
// 사용: node scripts/ui-check.mjs [url] [outDir]
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;
const PROFILE = String.raw`C:\Users\Public\shots\pptr-profile`;
const url = process.argv[2] ?? 'http://localhost:3000/2027?leave=15';
const outDir = process.argv[3] ?? 'C:\\Users\\Public\\shots';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  { name: 'tablet', width: 768, height: 1024, deviceScaleFactor: 1, isMobile: false },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
];

await mkdir(outDir, { recursive: true });
await rm(PROFILE, { recursive: true, force: true });

// Edge 는 실행 직후 백그라운드 프로세스로 넘기고 종료하므로 puppeteer.launch 가 실패한다.
// 직접 띄운 뒤 DevTools 엔드포인트로 connect 한다.
const edge = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { detached: true, stdio: 'ignore' },
);
edge.unref();

async function waitForDevTools(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* 아직 안 떴음 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Edge DevTools 엔드포인트에 연결하지 못했습니다');
}

await waitForDevTools();
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });

const consoleErrors = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${vp.name}] ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${vp.name}] pageerror: ${String(e).slice(0, 200)}`));
  await page.setViewport(vp);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 600));

  const report = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const scrollW = document.documentElement.scrollWidth;
    const offenders = [];
    if (scrollW > docW + 1) {
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > docW + 1 || r.left < -1) {
          // overflow 컨테이너 안에 있으면 정상 (가로 스크롤 의도)
          let p = el.parentElement;
          let inScroller = false;
          while (p) {
            const ov = getComputedStyle(p).overflowX;
            if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') {
              inScroller = true;
              break;
            }
            p = p.parentElement;
          }
          if (inScroller) continue;
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className?.toString?.() ?? '').slice(0, 90),
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
            text: (el.textContent ?? '').trim().slice(0, 40),
          });
        }
      }
    }
    // 최소 터치 타깃(44px) 미만인 조작 요소
    const smallTargets = [];
    for (const el of document.querySelectorAll('button, a, select, input')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 32) {
        smallTargets.push({
          tag: el.tagName.toLowerCase(),
          h: Math.round(r.height),
          w: Math.round(r.width),
          text: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30),
        });
      }
    }
    return { docW, scrollW, offenders: offenders.slice(0, 12), smallTargets: smallTargets.slice(0, 10), bodyH: document.body.scrollHeight };
  });

  console.log(`\n=== ${vp.name} (${vp.width}px) ===`);
  console.log(`clientWidth=${report.docW} scrollWidth=${report.scrollW} pageHeight=${report.bodyH}`);
  if (report.offenders.length) {
    console.log('가로 넘침 요소:');
    for (const o of report.offenders) console.log(`  <${o.tag}> ${o.left}~${o.right} w=${o.width} "${o.text}" .${o.cls}`);
  } else if (report.scrollW > report.docW + 1) {
    console.log('가로 넘침 있으나 원인 요소 미검출');
  } else {
    console.log('가로 넘침 없음 ✔');
  }
  if (report.smallTargets.length) {
    console.log('작은 터치 타깃(<32px):');
    for (const t of report.smallTargets) console.log(`  <${t.tag}> ${t.w}x${t.h} "${t.text}"`);
  }

  await page.screenshot({ path: `${outDir}\\${vp.name}.png`, fullPage: true });
  await page.close();
}

if (consoleErrors.length) {
  console.log('\n=== 콘솔 오류 ===');
  for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('  ' + e);
} else {
  console.log('\n콘솔 오류 없음 ✔');
}

console.log(`\n스크린샷: ${outDir}`);
await browser.close();
