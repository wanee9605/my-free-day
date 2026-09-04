// /lib/ics.ts — 추천 결과를 iCalendar(.ics)로. 구글·애플·아웃룩이 모두 읽는 형식이라
// OAuth 연동 없이 브라우저에서 파일 하나만 만들면 된다.
import { addDays } from './calendar';
import type { OffRun } from './manual';

const PRODID = '-//my-free-day//연차 최적화 캘린더//KO';
const CRLF = '\r\n';

/** RFC 5545 의 TEXT 이스케이프 */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** 한 줄은 75 옥텟까지. 한글이 잘리지 않도록 문자 경계에서 끊고 이어지는 줄은 공백으로 시작한다 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = ch;
      bytes = size + 1; // 이어지는 줄 앞의 공백 1옥텟
      limit = 75;
    } else {
      current += ch;
      bytes += size;
    }
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

function dateValue(iso: string): string {
  return iso.replace(/-/g, '');
}

interface IcsEvent {
  uid: string;
  start: string; // YYYY-MM-DD
  endInclusive: string; // YYYY-MM-DD (VEVENT 에는 다음 날짜로 나간다)
  summary: string;
  description?: string;
  /** 종일 일정이 바쁨으로 잡히지 않게 할지 */
  transparent?: boolean;
}

function renderEvent(e: IcsEvent, stamp: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateValue(e.start)}`,
    `DTEND;VALUE=DATE:${dateValue(addDays(e.endInclusive, 1))}`, // DTEND 는 미포함이라 하루 더한다
    `SUMMARY:${escapeText(e.summary)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  lines.push(`TRANSP:${e.transparent ? 'TRANSPARENT' : 'OPAQUE'}`);
  lines.push('END:VEVENT');
  return lines;
}

export interface BuildIcsOptions {
  /** 테스트에서 고정하기 위한 주입 지점 */
  now?: Date;
  /** 공유 링크. 캘린더 일정 설명에 남겨 어떤 조건으로 뽑은 결과인지 되짚을 수 있게 한다 */
  sourceUrl?: string;
}

/**
 * 추천 연휴마다 두 종류를 넣는다.
 * - 연휴 전체 구간: 며칠을 쉬는지 한눈에 (바쁨으로 잡지 않음)
 * - 연차 사용일: 실제로 휴가를 신청해야 하는 날
 */
export function buildIcs(year: number, runs: OffRun[], options: BuildIcsOptions = {}): string {
  const stamp = `${(options.now ?? new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`${year}년 연차 계획`)}`,
  ];

  for (const rec of runs) {
    const days = rec.leaveDays;
    const detail = [`연차 ${rec.cost}일: ${days.join(', ')}`, options.sourceUrl].filter(Boolean).join('\n');

    lines.push(
      ...renderEvent(
        {
          uid: `${year}-${rec.start}-streak@my-free-day`,
          start: rec.start,
          endInclusive: rec.end,
          summary: `${rec.label} ${rec.total}일`,
          description: detail,
          transparent: true,
        },
        stamp,
      ),
    );

    for (const date of days) {
      lines.push(
        ...renderEvent(
          { uid: `${year}-${date}-leave@my-free-day`, start: date, endInclusive: date, summary: `연차 · ${rec.label}` },
          stamp,
        ),
      );
    }
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

export function icsFileName(year: number): string {
  return `연차계획-${year}.ics`;
}
