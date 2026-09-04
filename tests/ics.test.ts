// .ics 내보내기 (lib/ics.ts)
import { describe, expect, it } from 'vitest';
import { buildIcs, foldLine, icsFileName } from '@/lib/ics';
import { autofillSelection, evaluate } from '@/lib/manual';

const NOW = new Date('2026-09-04T01:02:03Z');
const selected = autofillSelection({ year: 2027, blackoutRanges: [], selected: [], budget: 2, mode: 'longestStreak' });
const result = evaluate({ year: 2027, blackoutRanges: [], selected });
const ics = buildIcs(2027, result.runs, { now: NOW, sourceUrl: 'https://my-free-day.vercel.app/?leave=2' });
const lines = ics.split('\r\n');

describe('iCalendar 뼈대', () => {
  it('모든 줄이 CRLF 로 끝나고 VCALENDAR 로 감싼다', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.includes('\n\n')).toBe(false);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(lines.filter((l) => l === 'END:VEVENT').length);
    expect(lines.at(-2)).toBe('END:VCALENDAR');
  });

  it('추천 1건마다 연휴 구간 1개 + 연차 사용일만큼 이벤트가 생긴다', () => {
    const expected = result.runs.reduce((n, r) => n + 1 + r.leaveDays.length, 0);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('종일 일정의 DTEND 는 마지막 날 다음 날(미포함)이다', () => {
    // 추석 연휴 9/11~9/19 → DTEND 는 9/20
    expect(ics).toContain('DTSTART;VALUE=DATE:20270911');
    expect(ics).toContain('DTEND;VALUE=DATE:20270920');
    // 연차 하루짜리는 다음 날로 끝난다
    expect(ics).toContain('DTSTART;VALUE=DATE:20270913');
    expect(ics).toContain('DTEND;VALUE=DATE:20270914');
  });

  it('UID 는 겹치지 않고 DTSTAMP 는 주입한 시각을 쓴다', () => {
    const uids = lines.filter((l) => l.startsWith('UID:'));
    expect(new Set(uids).size).toBe(uids.length);
    expect(lines.filter((l) => l.startsWith('DTSTAMP:')).every((l) => l === 'DTSTAMP:20260904T010203Z')).toBe(true);
  });

  it('연휴 구간은 바쁨으로 잡지 않고, 연차 사용일은 바쁨으로 잡는다', () => {
    expect(ics).toContain('SUMMARY:추석 연휴 9일');
    expect(ics).toContain('TRANSP:TRANSPARENT');
    expect(ics).toContain('SUMMARY:연차 · 추석 연휴');
    expect(ics).toContain('TRANSP:OPAQUE');
  });
});

describe('텍스트 처리', () => {
  it('쉼표·세미콜론·역슬래시·줄바꿈을 이스케이프한다', () => {
    // 설명에 날짜를 쉼표로 나열하므로 반드시 이스케이프되어 있어야 한다
    const desc = ics.split('\r\n').find((l) => l.startsWith('DESCRIPTION:'))!;
    expect(desc).toContain('\\,');
    expect(desc).not.toMatch(/[^\\],/);
  });

  it('75옥텟이 넘는 줄은 접고, 한글을 쪼개지 않는다', () => {
    const long = `SUMMARY:${'가'.repeat(60)}`;
    const folded = foldLine(long);
    expect(folded).toContain('\r\n ');
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n ').join('')).toBe(long); // 접은 걸 되돌리면 원본
    expect(foldLine('SUMMARY:짧다')).toBe('SUMMARY:짧다');
  });

  it('파일 이름에 연도가 들어간다', () => {
    expect(icsFileName(2028)).toBe('연차계획-2028.ics');
  });
});
