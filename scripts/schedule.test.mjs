import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { formatWhen, isPast, parseWhen, splitEvents } from '../schedule.js';

const events = JSON.parse(fs.readFileSync(new URL('../events.json', import.meta.url), 'utf8'));
const viewedOn = new Date('2026-11-25T12:00:00+09:00');

test('events split into upcoming then past at the viewing date', () => {
  const { upcoming, past } = splitEvents(events, viewedOn);
  assert.deepEqual(
    upcoming.map((event) => event.title),
    [
      'YAMAGUCHEERS!! MEET&MERRY!（つながるフェス＠山口）',
      'FU九州ビジネスプランコンテスト2026',
      'Re:Framing Program YAMAGUCHI（リフプロやまぐち＠福岡）',
    ],
  );
  assert.deepEqual(past, []);
  assert.deepEqual(new Set(events.map((event) => event.kind)), new Set(['参加', '主催', '紹介']));
  assert.equal(formatWhen(upcoming[0]), '2026年11月28日(土) 12:00–17:00');
  assert.equal(formatWhen(upcoming[1]), '2026年12月12日(土) 13:00–18:00');
});

test('a date-only event stays upcoming through that Tokyo day', () => {
  const event = { date: '2026-11-25' };
  assert.equal(isPast(event, new Date('2026-11-25T23:59:00+09:00')), false);
  assert.equal(isPast(event, new Date('2026-11-26T00:00:00+09:00')), true);
});

test('an event with an end time becomes past at that Tokyo time', () => {
  const event = { date: '2026-11-25T14:00', end: '2026-11-25T15:00' };
  assert.equal(isPast(event, new Date('2026-11-25T14:59:00+09:00')), false);
  assert.equal(isPast(event, new Date('2026-11-25T15:00:00+09:00')), true);
});

test('zoned instants are judged and shown in Tokyo', () => {
  const event = { date: '2026-12-12T00:00:00Z' };
  assert.equal(formatWhen(event), '2026年12月12日(土) 09:00');
  assert.equal(isPast(event, new Date('2026-12-12T23:00:00+09:00')), false);
  assert.equal(isPast(event, new Date('2026-12-13T00:00:00+09:00')), true);
});

test('upcoming is soonest first and past is newest first', () => {
  const now = new Date('2026-12-10T10:00:00+09:00');
  const { upcoming, past } = splitEvents(
    [
      { title: '遅い', date: '2026-12-20T09:00' },
      { title: '古い', date: '2026-10-02' },
      { title: '近い', date: '2026-12-12' },
      { title: '間', date: '2026-11-20' },
    ],
    now,
  );
  assert.deepEqual(
    upcoming.map((event) => event.title),
    ['近い', '遅い'],
  );
  assert.deepEqual(
    past.map((event) => event.title),
    ['間', '古い'],
  );
});

test('multi-day ranges keep the end date', () => {
  assert.equal(
    formatWhen({ date: '2027-06-06T14:00', end: '2027-06-07T10:00' }),
    '2027年6月6日(日) 14:00 – 6月7日(月) 10:00',
  );
});

test('invalid calendar dates are rejected', () => {
  assert.equal(parseWhen('2026-02-29'), null);
  assert.ok(parseWhen('2028-02-29'));
  assert.equal(parseWhen('2026-12-12T24:00'), null);
});

test('countdown shows from two weeks before until the event ends', async () => {
  const { countdownLabel } = await import('../schedule.js');
  const event = { date: '2026-12-12T13:00', end: '2026-12-12T18:00' };
  const at = (iso) => countdownLabel(event, new Date(iso));
  assert.equal(at('2026-11-27T12:00:00+09:00'), '');
  assert.equal(at('2026-11-28T00:00:00+09:00'), 'あと14日');
  assert.equal(at('2026-12-10T23:59:00+09:00'), 'あと2日');
  assert.equal(at('2026-12-11T00:00:00+09:00'), '明日');
  assert.equal(at('2026-12-12T12:59:00+09:00'), '今日');
  assert.equal(at('2026-12-12T13:00:00+09:00'), '開催中');
  assert.equal(at('2026-12-12T18:00:00+09:00'), '');
});

test('countdown counts Tokyo calendar days, not 24-hour spans', async () => {
  const { countdownLabel } = await import('../schedule.js');
  const event = { date: '2026-11-28T12:00' };
  assert.equal(countdownLabel(event, new Date('2026-11-27T23:30:00+09:00')), '明日');
  assert.equal(countdownLabel(event, new Date('2026-11-27T15:00:00Z')), '今日');
});

test('a date-only or multi-day event reads 今日 then 開催中', async () => {
  const { countdownLabel } = await import('../schedule.js');
  assert.equal(countdownLabel({ date: '2026-11-25' }, new Date('2026-11-25T10:00:00+09:00')), '今日');
  const multi = { date: '2026-11-25', end: '2026-11-27' };
  assert.equal(countdownLabel(multi, new Date('2026-11-26T10:00:00+09:00')), '開催中');
});

test('deadline reads 申込 M/Dまで until the Tokyo day ends, then 受付終了', async () => {
  const { deadlineLabel } = await import('../schedule.js');
  const event = { date: '2026-12-12T13:00', deadline: '2026-12-10' };
  assert.deepEqual(deadlineLabel(event, new Date('2026-12-10T23:59:00+09:00')), { text: '申込 12/10まで', closed: false });
  assert.deepEqual(deadlineLabel(event, new Date('2026-12-11T00:00:00+09:00')), { text: '受付終了', closed: true });
  assert.deepEqual(deadlineLabel({ deadline: '2026-12-10T18:00' }, new Date('2026-12-10T12:00:00+09:00')), { text: '申込 12/10 18:00まで', closed: false });
  assert.equal(deadlineLabel({ date: '2026-12-12' }, new Date()), null);
});

test('calendar links use Tokyo times in UTC, and all-day events span whole days', async () => {
  const { calendarRange, googleCalendarUrl, icsText } = await import('../schedule.js');
  const timed = { id: 'a', title: '朝会, 第1回', date: '2026-12-12T13:00', end: '2026-12-12T16:00', place: '会場', url: 'https://example.com/e' };
  assert.deepEqual(calendarRange(timed), { allDay: false, start: '20261212T040000Z', end: '20261212T070000Z' });
  assert.deepEqual(calendarRange({ date: '2026-12-12T13:00' }), { allDay: false, start: '20261212T040000Z', end: '20261212T050000Z' });
  assert.deepEqual(calendarRange({ date: '2026-11-25', end: '2026-11-27' }), { allDay: true, start: '20261125', end: '20261128' });
  const url = new URL(googleCalendarUrl(timed));
  assert.equal(url.searchParams.get('dates'), '20261212T040000Z/20261212T070000Z');
  assert.equal(url.searchParams.get('text'), '朝会, 第1回');
  const ics = icsText(timed, new Date('2026-11-25T00:00:00Z'));
  assert.match(ics, /\r\nDTSTART:20261212T040000Z\r\n/);
  assert.match(ics, /\r\nSUMMARY:朝会\\, 第1回\r\n/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('map links skip online-only places and use the first physical place', async () => {
  const { mapUrl } = await import('../schedule.js');
  assert.equal(mapUrl('オンライン'), '');
  assert.equal(mapUrl('福岡大学8号館831教室'), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('福岡大学8号館831教室'));
  assert.ok(mapUrl('Zero-Ten Park HALL／オンライン').endsWith(encodeURIComponent('Zero-Ten Park HALL')));
});
