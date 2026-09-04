// 공공데이터포털 「한국천문연구원_특일 정보」 → /lib/holidays/{year}.json
// 실행: npm run fetch:holidays -- --year=2027
// 서비스키: .env.local 의 DATA_GO_KR_SERVICE_KEY (커밋 금지)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type HolidayType = 'public' | 'substitute' | 'temporary';

interface ApiItem {
  locdate: number | string; // YYYYMMDD
  dateName: string;
  isHoliday: 'Y' | 'N';
}

const ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

function loadEnvLocal(): void {
  const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (typeof loader !== 'function') return;
  try {
    loader.call(process, path.resolve(process.cwd(), '.env.local'));
  } catch {
    // .env.local 이 없으면 환경변수만 사용
  }
}

function parseYearArg(): number {
  const arg = process.argv.find((a) => a.startsWith('--year='));
  const year = arg ? Number(arg.slice('--year='.length)) : new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`--year 값이 올바르지 않습니다: ${arg}`);
  }
  return year;
}

function classify(name: string): HolidayType {
  if (name.includes('대체')) return 'substitute';
  if (name.includes('선거') || name.includes('임시')) return 'temporary';
  return 'public';
}

function toISO(locdate: number | string): string {
  const s = String(locdate);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function fetchMonth(serviceKey: string, year: number, month: number): Promise<ApiItem[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('solYear', String(year));
  url.searchParams.set('solMonth', String(month).padStart(2, '0'));
  url.searchParams.set('_type', 'json');
  url.searchParams.set('numOfRows', '50');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${year}-${month}: HTTP ${res.status}`);
  const json = (await res.json()) as {
    response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: ApiItem | ApiItem[] } | '' } };
  };
  const header = json.response?.header;
  if (header?.resultCode && header.resultCode !== '00') {
    throw new Error(`${year}-${month}: ${header.resultCode} ${header.resultMsg ?? ''}`);
  }
  const items = json.response?.body?.items;
  if (!items || typeof items === 'string' || !items.item) return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

async function main(): Promise<void> {
  loadEnvLocal();
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) throw new Error('DATA_GO_KR_SERVICE_KEY 가 없습니다 (.env.local 확인)');
  const year = parseYearArg();

  const merged = new Map<string, { date: string; name: string; type: HolidayType }>();
  for (let month = 1; month <= 12; month++) {
    const items = await fetchMonth(serviceKey, year, month);
    for (const it of items) {
      if (it.isHoliday !== 'Y') continue;
      const date = toISO(it.locdate);
      const name = it.dateName.trim();
      merged.set(date, { date, name, type: classify(name) });
    }
    process.stdout.write(`  ${year}-${String(month).padStart(2, '0')}: ${items.length}건\n`);
  }

  const holidays = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  const out = {
    year,
    updatedAt: new Date().toISOString().slice(0, 10),
    source: '공공데이터포털 한국천문연구원_특일 정보 (getRestDeInfo)',
    holidays,
  };

  const dir = path.resolve(process.cwd(), 'lib', 'holidays');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${year}.json`);
  await writeFile(file, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  process.stdout.write(`✔ ${file} (${holidays.length}건)\n`);
  process.stdout.write('  → lib/holidays/index.ts 의 HOLIDAY_DATA 에 연도를 등록하세요.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
