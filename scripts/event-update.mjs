import { createHash } from 'node:crypto';
import { KINDS, canonicalizeWhen, rangesOk } from '../schedule.js';

const KIND_MAP = Object.fromEntries(
  Object.entries(KINDS).flatMap(([name, kind]) => [[name, name], ...kind.aliases.map((alias) => [alias, name])]),
);
const KIND_NAMES = Object.keys(KINDS).join('、');

const EVENT_KEYS = ['title', 'date', 'end', 'deadline', 'place', 'kind', 'organizer', 'tags', 'comment', 'note', 'url', 'image'];
const REQUIRED = ['title', 'date', 'place', 'kind', 'organizer', 'url'];
const OPTIONAL = ['end', 'deadline', 'tags', 'comment', 'note', 'image'];
const MAX_TAGS = 3;
const TAG_LIMIT = 20;
const STORE_KEYS = ['id', ...EVENT_KEYS];
const LIMITS = { title: 120, place: 120, organizer: 80, comment: 200, note: 400, url: 500, image: 500 };
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;
const ACTION_LABEL = { add: '追加', update: '更新', delete: '削除' };

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isImageRef(value) {
  if (isHttpUrl(value)) return true;
  if (value.startsWith('//') || value.includes('\\') || value.includes('..')) return false;
  return /^\/?[A-Za-z0-9._/-]+$/.test(value);
}

export function extractJson(body) {
  if (typeof body !== 'string' || !body.trim()) return { error: '本文が空です。' };
  const match = /```json\s*([\s\S]*?)```/i.exec(body);
  if (!match) return { error: '本文に ```json の囲みが見つかりません。' };
  const text = match[1].replace(/^\uFEFF/, '').trim();
  if (text.length > 20000) return { error: 'json が長すぎます。' };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: 'json を解析できません。' };
  }
}

function validateTags(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,、，]+/) : null;
  if (!list) return { error: 'tags は文字列の配列です。' };
  const tags = [];
  for (const item of list) {
    if (typeof item !== 'string') return { error: 'tags は文字列の配列です。' };
    const tag = oneLine(item).replace(/^[#＃]+/, '').trim();
    if (!tag) continue;
    if (tag.length > TAG_LIMIT) return { error: `タグ「${tag}」が長すぎます（${TAG_LIMIT}文字まで）。` };
    if (/[\s#＃]/.test(tag)) return { error: `タグ「${tag}」に空白や # は使えません。` };
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS) return { error: `tags は${MAX_TAGS}つまでです。` };
  if (!tags.length) return { omit: true };
  return { value: tags };
}

function validateField(key, value) {
  if (key === 'tags' && value != null) return validateTags(value);
  if (value == null) {
    if (OPTIONAL.includes(key)) return { omit: true };
    return { error: `${key} は空にできません。` };
  }
  if (typeof value !== 'string') return { error: `${key} は文字列です。` };
  const text = oneLine(value);
  if (!text) {
    if (OPTIONAL.includes(key)) return { omit: true };
    return { error: `${key} が空です。` };
  }
  if (key === 'date' || key === 'end' || key === 'deadline') {
    const canonical = canonicalizeWhen(text);
    if (!canonical) {
      return { error: `${key} の形式が正しくありません。YYYY-MM-DD または YYYY-MM-DDTHH:mm で書いてください。` };
    }
    return { value: canonical };
  }
  if (key === 'kind') {
    const kindText = text.normalize('NFKC');
    const kind = KIND_MAP[kindText] ?? KIND_MAP[kindText.toLowerCase()];
    if (!kind) return { error: `kind は ${KIND_NAMES} のいずれかです。` };
    return { value: kind };
  }
  if (key === 'url') {
    if (text.length > LIMITS.url) return { error: 'url が長すぎます。' };
    if (!isHttpUrl(text)) return { error: 'url は http または https のURLです。' };
    return { value: text };
  }
  if (key === 'image') {
    if (text.length > LIMITS.image) return { error: 'image が長すぎます。' };
    if (!isImageRef(text)) return { error: 'image は画像のURLか、リポジトリ内のパスです。' };
    return { value: text };
  }
  if (LIMITS[key] && text.length > LIMITS[key]) return { error: `${key} が長すぎます。` };
  return { value: text };
}

function normalizeInputEvent(input, { partial }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['event はオブジェクトです。'] };
  }
  const errors = [];
  const value = {};
  const keys = Object.keys(input);
  for (const key of keys) {
    if (!EVENT_KEYS.includes(key)) {
      errors.push(`event に未知の項目 ${key} があります。`);
      continue;
    }
    const result = validateField(key, input[key]);
    if (result.error) errors.push(result.error);
    else if (result.omit) value[key] = null;
    else value[key] = result.value;
  }
  if (!partial) {
    for (const key of REQUIRED) {
      if (!Object.hasOwn(input, key)) errors.push(`${key} が必要です。`);
    }
  } else if (keys.length === 0) {
    errors.push('更新する項目がありません。');
  }
  return { errors, value };
}

function clean(value) {
  const out = {};
  for (const key of EVENT_KEYS) {
    if (value[key] != null && value[key] !== '') out[key] = value[key];
  }
  return out;
}

function orderEvent(event) {
  const out = {};
  for (const key of STORE_KEYS) {
    if (event[key] != null && event[key] !== '') out[key] = event[key];
  }
  return out;
}

export function serializeEvents(events) {
  return `${JSON.stringify(events, null, 2)}\n`;
}

export function normalizeStoredEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'イベントがオブジェクトではありません。' };
  }
  const unknown = Object.keys(raw).filter((key) => !STORE_KEYS.includes(key));
  if (unknown.length) return { error: `未知の項目 ${unknown.join(', ')} があります。` };
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return { error: 'id の形式が正しくありません。' };
  const rest = { ...raw };
  delete rest.id;
  const { errors, value } = normalizeInputEvent(rest, { partial: false });
  if (errors.length) return { error: errors.join(' ') };
  if (value.end && !rangesOk(value.date, value.end)) return { error: 'end が date より前です。' };
  return { event: orderEvent({ id: raw.id, ...clean(value) }) };
}

export function makeId(date, title, taken) {
  const day = date.slice(0, 10);
  let ascii = title.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  ascii = ascii.slice(0, 32).replace(/-+$/g, '');
  const hash = createHash('sha256').update(title.normalize('NFKC')).digest('hex').slice(0, 6);
  const base = ascii ? `${day}-${ascii}-${hash}` : `${day}-${hash}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function fail(errors) {
  const list = Array.isArray(errors) ? errors : [errors];
  return {
    ok: false,
    changed: false,
    errors: list,
    comment: `反映できませんでした。Issue は開いたままです。\n\n${list.map((error) => `- ${error}`).join('\n')}\n`,
  };
}

function ok({ action, id, events, note, changed, imageIntent = 'unchanged' }) {
  const lines = ['反映しました。'];
  if (note) lines.push('', note);
  lines.push('', `- 操作: ${ACTION_LABEL[action]}`, `- id: \`${id}\``);
  return {
    ok: true,
    changed,
    action,
    id,
    events,
    imageIntent,
    comment: `${lines.join('\n')}\n`,
    commitMessage: `events: ${action} ${id}\n`,
  };
}

function loadStored(events) {
  if (!Array.isArray(events)) return { error: 'events.json は配列である必要があります。' };
  const stored = [];
  const seen = new Set();
  for (const raw of events) {
    const normalized = normalizeStoredEvent(raw);
    if (normalized.error) return { error: `events.json を読めません。${normalized.error}` };
    if (seen.has(normalized.event.id)) {
      return { error: `events.json の id ${normalized.event.id} が重複しています。` };
    }
    seen.add(normalized.event.id);
    stored.push(normalized.event);
  }
  return { stored, seen };
}

export function applyIssue(events, body) {
  const loaded = loadStored(events);
  if (loaded.error) return fail(loaded.error);
  const { stored, seen } = loaded;

  const extracted = extractJson(body);
  if (extracted.error) return fail(extracted.error);
  const payload = extracted.value;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail('json はオブジェクトである必要があります。');
  }

  const action = payload.action;
  if (action !== 'add' && action !== 'update' && action !== 'delete') {
    return fail('action は add、update、delete のいずれかです。');
  }
  const allowedTop = action === 'add' ? ['action', 'event'] : action === 'update' ? ['action', 'id', 'event'] : ['action', 'id'];
  const extra = Object.keys(payload).filter((key) => !allowedTop.includes(key));
  if (extra.length) return fail(`未知の項目 ${extra.join(', ')} があります。`);

  if (action === 'add') return addEvent(stored, seen, payload.event);
  if (!Object.hasOwn(payload, 'id')) return fail('id が必要です。');
  if (typeof payload.id !== 'string' || !ID_RE.test(payload.id)) return fail('id の形式が正しくありません。');
  const index = stored.findIndex((item) => item.id === payload.id);
  if (index === -1) return fail(`id「${payload.id}」のイベントはありません。`);
  if (action === 'delete') {
    return ok({
      action,
      id: payload.id,
      events: stored.filter((item) => item.id !== payload.id),
      changed: true,
    });
  }
  return updateEvent(stored, index, payload.event);
}

function addEvent(stored, seen, input) {
  const { errors, value } = normalizeInputEvent(input, { partial: false });
  if (errors.length) return fail(errors);
  if (value.end && !rangesOk(value.date, value.end)) return fail('end が date より前です。');
  const event = clean(value);
  const existing = stored.find(
    (item) => item.title === event.title && item.date === event.date && item.url === event.url,
  );
  if (existing) {
    return ok({
      action: 'add',
      id: existing.id,
      events: stored,
      note: '同じ title・date・url が既にあるため、新規追加はしていません。',
      changed: false,
      imageIntent: 'unchanged',
    });
  }
  const id = makeId(event.date, event.title, seen);
  return ok({
    action: 'add',
    id,
    events: [...stored, orderEvent({ id, ...event })],
    changed: true,
    imageIntent: event.image && isHttpUrl(event.image) ? 'remote' : event.image ? 'local' : 'missing',
  });
}

function updateEvent(stored, index, input) {
  const { errors, value } = normalizeInputEvent(input, { partial: true });
  if (errors.length) return fail(errors);
  const merged = { ...stored[index] };
  const changedKeys = [];
  for (const key of Object.keys(value)) {
    if (value[key] == null) {
      if (merged[key] != null) changedKeys.push(key);
      delete merged[key];
    } else if (JSON.stringify(merged[key]) !== JSON.stringify(value[key])) {
      changedKeys.push(key);
      merged[key] = value[key];
    }
  }
  if (merged.end && !rangesOk(merged.date, merged.end)) return fail('end が date より前です。');
  const events = stored.slice();
  events[index] = orderEvent(merged);
  const note = changedKeys.length ? `更新した項目: ${changedKeys.join(', ')}` : '変更はありませんでした。';
  let imageIntent = 'unchanged';
  if (Object.hasOwn(input, 'image')) {
    if (value.image == null) imageIntent = 'cleared';
    else imageIntent = isHttpUrl(value.image) ? 'remote' : 'local';
  }
  return ok({
    action: 'update',
    id: stored[index].id,
    events,
    note,
    changed: changedKeys.length > 0,
    imageIntent,
  });
}
