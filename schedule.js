const WEEKDAYS = '日月火水木金土';

const WHEN_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function isRealDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function offsetMinutes(zone) {
  if (!zone || zone === '+09:00') return 9 * 60;
  if (zone === 'Z' || zone === '+00:00') return 0;
  const sign = zone[0] === '-' ? -1 : 1;
  return sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
}

function instantMs(spec) {
  const hh = spec.hh ?? 0;
  const mm = spec.mm ?? 0;
  const ss = spec.ss ?? 0;
  return Date.UTC(spec.y, spec.mo - 1, spec.d, hh, mm, ss) - offsetMinutes(spec.zone) * 60 * 1000;
}

function ymd(spec) {
  return `${spec.y}-${pad(spec.mo)}-${pad(spec.d)}`;
}

export function parseWhen(value) {
  if (typeof value !== 'string') return null;
  const match = WHEN_RE.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const hasTime = match[4] != null;
  const hh = hasTime ? Number(match[4]) : null;
  const mm = hasTime ? Number(match[5]) : null;
  const ss = match[6] != null ? Number(match[6]) : 0;
  const zone = match[7] ?? null;
  if (!isRealDate(y, mo, d)) return null;
  if (hasTime && (hh > 23 || mm > 59 || ss > 59)) return null;
  return { y, mo, d, hh, mm, ss, zone };
}

export function toTokyo(spec) {
  if (spec.hh == null) {
    return { y: spec.y, mo: spec.mo, d: spec.d, hh: null, mm: null };
  }
  if (!spec.zone || spec.zone === '+09:00') {
    return { y: spec.y, mo: spec.mo, d: spec.d, hh: spec.hh, mm: spec.mm };
  }
  const shifted = new Date(instantMs(spec) + 9 * 60 * 60 * 1000);
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    mm: shifted.getUTCMinutes(),
  };
}

export function canonicalizeWhen(value) {
  const spec = parseWhen(value);
  if (!spec) return null;
  const tokyo = toTokyo(spec);
  if (tokyo.hh == null) return ymd(tokyo);
  return `${ymd(tokyo)}T${pad(tokyo.hh)}:${pad(tokyo.mm)}`;
}

function tokyoStartMs(tokyo) {
  return Date.UTC(tokyo.y, tokyo.mo - 1, tokyo.d, (tokyo.hh ?? 0) - 9, tokyo.mm ?? 0, 0);
}

function nextTokyoMidnightMs(tokyo) {
  return Date.UTC(tokyo.y, tokyo.mo - 1, tokyo.d + 1, -9, 0, 0);
}

export function startMs(event) {
  const spec = parseWhen(event?.date);
  if (!spec) return Number.POSITIVE_INFINITY;
  return tokyoStartMs(toTokyo(spec));
}

export function pastThresholdMs(event) {
  const endSpec = event?.end ? parseWhen(event.end) : null;
  if (endSpec) {
    const end = toTokyo(endSpec);
    if (end.hh != null) return tokyoStartMs(end);
    return nextTokyoMidnightMs(end);
  }
  const startSpec = parseWhen(event?.date);
  if (!startSpec) return Number.NaN;
  return nextTokyoMidnightMs(toTokyo(startSpec));
}

export function isPast(event, now) {
  const threshold = pastThresholdMs(event);
  if (Number.isNaN(threshold)) return false;
  const time = now instanceof Date ? now.getTime() : Number(now);
  return time >= threshold;
}

export function rangesOk(date, end) {
  const startSpec = parseWhen(date);
  if (!startSpec) return false;
  if (end == null || end === '') return true;
  const endSpec = parseWhen(end);
  if (!endSpec) return false;
  const start = toTokyo(startSpec);
  const endTokyo = toTokyo(endSpec);
  const startAt = tokyoStartMs(start);
  const endAt = endTokyo.hh == null ? nextTokyoMidnightMs(endTokyo) - 1 : tokyoStartMs(endTokyo);
  return endAt >= startAt;
}

function dayLabel(spec, withYear) {
  const weekday = WEEKDAYS[new Date(Date.UTC(spec.y, spec.mo - 1, spec.d)).getUTCDay()];
  const date = withYear
    ? `${spec.y}年${spec.mo}月${spec.d}日`
    : `${spec.mo}月${spec.d}日`;
  return `${date}(${weekday})`;
}

function clockLabel(spec) {
  if (spec.hh == null) return '';
  return `${pad(spec.hh)}:${pad(spec.mm)}`;
}

export function whenPieces(event) {
  const startSpec = parseWhen(event?.date);
  if (!startSpec) return { day: '', clock: '' };
  const start = toTokyo(startSpec);
  const day = dayLabel(start, true);
  const endSpec = event.end ? parseWhen(event.end) : null;
  if (!endSpec) return { day, clock: clockLabel(start) };
  const end = toTokyo(endSpec);
  const sameDay = start.y === end.y && start.mo === end.mo && start.d === end.d;
  if (sameDay && start.hh != null && end.hh != null) {
    return { day, clock: `${clockLabel(start)}–${clockLabel(end)}` };
  }
  if (sameDay) return { day, clock: clockLabel(start) };
  const endText = clockLabel(end) ? `${dayLabel(end, start.y !== end.y)} ${clockLabel(end)}` : dayLabel(end, start.y !== end.y);
  const startClock = clockLabel(start);
  return { day, clock: startClock ? `${startClock} – ${endText}` : `– ${endText}` };
}

export function dateMark(event) {
  const startSpec = parseWhen(event?.date);
  if (!startSpec) return null;
  const start = toTokyo(startSpec);
  const weekday = WEEKDAYS[new Date(Date.UTC(start.y, start.mo - 1, start.d)).getUTCDay()];
  const endSpec = event.end ? parseWhen(event.end) : null;
  const end = endSpec ? toTokyo(endSpec) : null;
  const sameDay = end && start.y === end.y && start.mo === end.mo && start.d === end.d;
  let clock = '';
  if (sameDay && start.hh != null && end.hh != null) clock = `${clockLabel(start)}–${clockLabel(end)}`;
  else if (start.hh != null) clock = clockLabel(start);
  return {
    year: String(start.y),
    month: String(start.mo),
    day: String(start.d),
    weekday,
    clock,
  };
}

export function formatWhen(event) {
  const { day, clock } = whenPieces(event);
  if (!day) return '';
  return clock ? `${day} ${clock}` : day;
}

export function splitEvents(events, now = new Date()) {
  const upcoming = [];
  const past = [];
  if (!Array.isArray(events)) return { upcoming, past };
  for (const event of events) {
    if (!event || !parseWhen(event.date)) continue;
    if (isPast(event, now)) past.push(event);
    else upcoming.push(event);
  }
  const tie = (a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), 'ja');
  upcoming.sort((a, b) => startMs(a) - startMs(b) || tie(a, b));
  past.sort((a, b) => startMs(b) - startMs(a) || tie(a, b));
  return { upcoming, past };
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const COUNTDOWN_DAYS = 14;

function tokyoDayNumber(ms) {
  return Math.floor((ms + 9 * 60 * 60 * 1000) / DAY_MS);
}

export function countdownLabel(event, now = new Date()) {
  const startSpec = parseWhen(event?.date);
  if (!startSpec || isPast(event, now)) return '';
  const time = now instanceof Date ? now.getTime() : Number(now);
  const start = toTokyo(startSpec);
  const days = Date.UTC(start.y, start.mo - 1, start.d) / DAY_MS - tokyoDayNumber(time);
  if (days < 0) return '開催中';
  if (days === 0) return start.hh != null && time >= tokyoStartMs(start) ? '開催中' : '今日';
  if (days === 1) return '明日';
  if (days <= COUNTDOWN_DAYS) return `あと${days}日`;
  return '';
}
