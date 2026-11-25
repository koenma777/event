import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { formatWhen, isPast, parseWhen, splitEvents } from '../schedule.js';

const events = JSON.parse(fs.readFileSync(new URL('../events.json', import.meta.url), 'utf8'));
const viewedOn = new Date('2026-11-25T12:00:00+09:00');

test('sample events split into upcoming then past at the viewing date', () => {
  const { upcoming, past } = splitEvents(events, viewedOn);
  assert.deepEqual(
    upcoming.map((event) => event.title),
    [
      '【サンプル】架空の海峡ウィークエンド',
      '【サンプル】存在しない朝のAI相談',
      '【サンプル】仮のまち食堂',
      '【サンプル】海峡まちのDX夜話',
    ],
  );
  assert.deepEqual(
    past.map((event) => event.title),
    [
      '【サンプル】消えた港の勉強会',
      '【サンプル】存在しない朝市サミット',
      '【サンプル】架空の主催ランチ',
    ],
  );
  for (const event of events) assert.match(event.title, /^【サンプル】/);
  assert.deepEqual(new Set(events.map((event) => event.kind)), new Set(['参加', '主催', '紹介']));
  assert.equal(formatWhen(upcoming[0]), '2026年12月6日(日) 11:00–13:00');
  assert.equal(formatWhen(upcoming[3]), '2027年6月6日(日) 14:00–16:00');
  assert.equal(formatWhen(past[1]), '2026年2月14日(土)');
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
