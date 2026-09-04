const Y = 2027;
export const BASE_HOL = {
  '2027-01-01':'신정',
  '2027-02-05':'설날 연휴','2027-02-06':'설날','2027-02-07':'설날 연휴','2027-02-08':'대체공휴일',
  '2027-03-01':'삼일절',
  '2027-05-05':'어린이날','2027-05-13':'부처님오신날',
  '2027-06-06':'현충일','2027-06-07':'대체공휴일',
  '2027-08-15':'광복절','2027-08-16':'대체공휴일',
  '2027-09-14':'추석 연휴','2027-09-15':'추석','2027-09-16':'추석 연휴',
  '2027-10-03':'개천절','2027-10-04':'대체공휴일','2027-10-09':'한글날','2027-10-11':'대체공휴일',
  '2027-12-25':'성탄절','2027-12-27':'대체공휴일'
};
export const HOL = BASE_HOL;
const pad = n => (n < 10 ? '0' + n : '' + n);
export const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
export const dowKo = ['일','월','화','수','목','금','토'];
export const DIM = MONTHS.map((_, m) => new Date(Y, m + 1, 0).getDate());

function buildDays(extra, satWork) {
  const out = [];
  const d = new Date(Y, 0, 1);
  while (d.getFullYear() === Y) {
    const key = Y + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const dow = d.getDay();
    const hol = BASE_HOL[key] || (extra && extra[key]) || null;
    const weekend = dow === 0 || (dow === 6 && !satWork);
    out.push({ key, m: d.getMonth(), d: d.getDate(), dow, hol, weekend, custom: !!(extra && extra[key] && !BASE_HOL[key]) });
    d.setDate(d.getDate() + 1);
  }
  out.forEach((x, i) => { x.i = i; x.off = x.weekend || !!x.hol; });
  return out;
}

export const DAYS = buildDays(null, false);
export const fmt = i => (DAYS[i].m + 1) + '.' + DAYS[i].d;
export const fmtDow = i => fmt(i) + '(' + dowKo[DAYS[i].dow] + ')';

function candidates(days) {
  const n = days.length, out = [];
  for (let i = 0; i < n; i++) {
    if (days[i].off) continue;
    let cost = 0;
    for (let j = i; j < Math.min(n, i + 18); j++) {
      if (!days[j].off) cost++;
      if (cost > 12) break;
      if (days[j].off) continue;
      let s = i; while (s > 0 && days[s - 1].off) s--;
      let e = j; while (e < n - 1 && days[e + 1].off) e++;
      const leaveIdx = [];
      for (let k = i; k <= j; k++) if (!days[k].off) leaveIdx.push(k);
      out.push({ s, e, cost, total: e - s + 1, leaveIdx });
    }
  }
  const best = new Map();
  out.forEach(c => {
    const k = c.s + ':' + c.e;
    const p = best.get(k);
    if (!p || c.cost < p.cost) best.set(k, c);
  });
  return [...best.values()];
}

const cache = new Map();
export function model(extra, satWork) {
  const key = JSON.stringify(extra || {}) + '|' + !!satWork;
  if (!cache.has(key)) {
    const days = buildDays(extra, satWork);
    cache.set(key, { days, cands: candidates(days) });
  }
  return cache.get(key);
}

export function plan({ leave = 5, strategy = 'spread', minLen = 4, half = 'all', extra = null, satWork = false } = {}) {
  const M = model(extra, satWork);
  let pool = M.cands.filter(c => c.total >= minLen && c.cost <= leave);
  if (half === 'h1') pool = pool.filter(c => M.days[c.s].m <= 5);
  if (half === 'h2') pool = pool.filter(c => M.days[c.s].m >= 6);
  pool = pool.slice().sort((a, b) => {
    if (strategy === 'burst') return (b.total - a.total) || (a.cost - b.cost);
    return (b.total / b.cost - a.total / a.cost) || (b.total - a.total);
  });
  const chosen = [];
  let budget = leave;
  for (const c of pool) {
    if (c.cost > budget) continue;
    if (chosen.some(x => !(c.e < x.s - 1 || c.s > x.e + 1))) continue;
    chosen.push(c);
    budget -= c.cost;
    if (budget <= 0) break;
  }
  return { days: M.days, blocks: chosen.sort((a, b) => a.s - b.s).map(b => ({ ...b, leaveSet: new Set(b.leaveIdx) })) };
}

/* 근로기준법 기준 연차 발생일수: 1년 미만 월 1일(최대 11), 1년 이상 15일, 3년차부터 2년마다 +1 (상한 25) */
export function statutoryLeave(hireDateStr, asOf = Y + '-01-01') {
  if (!hireDateStr) return null;
  const h = new Date(hireDateStr), a = new Date(asOf);
  if (isNaN(h)) return null;
  const months = (a.getFullYear() - h.getFullYear()) * 12 + (a.getMonth() - h.getMonth()) - (a.getDate() < h.getDate() ? 1 : 0);
  if (months < 0) return { days: 0, note: '입사 전' };
  const years = Math.floor(months / 12);
  if (years < 1) return { days: Math.min(11, months), note: '1년 미만 · 월 1일 발생', years: 0 };
  const days = Math.min(25, 15 + Math.max(0, Math.floor((years - 1) / 2)));
  return { days, note: '근속 ' + years + '년차', years };
}

export function weekColumns(days = DAYS) {
  const cols = [];
  let col = new Array(7).fill(null);
  days.forEach(d => {
    if (d.dow === 0 && col.some(x => x !== null)) { cols.push(col); col = new Array(7).fill(null); }
    col[d.dow] = d.i;
  });
  cols.push(col);
  return cols;
}
