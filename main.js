import { splitEvents, whenPieces } from './schedule.js';

const KIND_CLASS = {
  参加: 'attend',
  主催: 'host',
  紹介: 'recommend',
};

function isOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isImageSrc(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return false;
  if (isOfficialUrl(value)) return true;
  if (value.startsWith('//') || value.includes('\\') || value.includes('..')) return false;
  return /^\/?[A-Za-z0-9._/-]+$/.test(value);
}

function renderEvent(event, { hero = false, arrow = false } = {}) {
  const item = document.createElement('li');
  item.className = hero ? 'event is-hero' : 'event';
  if (arrow) item.classList.add('has-arrow');
  if (event.id) item.dataset.id = event.id;
  if (event.kind) item.dataset.kind = event.kind;

  const linked = isOfficialUrl(event.url);
  const tile = document.createElement(linked ? 'a' : 'div');
  tile.className = 'tile';
  if (linked) tile.href = event.url;

  const body = document.createElement('div');
  body.className = 'event-body';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const time = document.createElement('time');
  if (event.date) time.dateTime = event.date;
  const pieces = whenPieces(event);
  const day = document.createElement('span');
  day.className = 'day';
  day.textContent = pieces.day;
  time.append(day);
  if (pieces.clock) {
    const clock = document.createElement('span');
    clock.className = /[年月日]/.test(pieces.clock) ? 'clock' : 'clock tight';
    clock.textContent = pieces.clock;
    time.append(clock);
  }
  if (event.kind) {
    const tag = document.createElement('span');
    tag.className = `tag tag-${KIND_CLASS[event.kind] ?? 'other'}`;
    tag.textContent = event.kind;
    meta.append(tag);
  }
  meta.append(time);

  const heading = document.createElement('h3');
  heading.textContent = event.title ?? '';

  body.append(meta, heading);
  const bits = [event.place, event.organizer].filter((bit) => typeof bit === 'string' && bit);
  if (bits.length) {
    const where = document.createElement('p');
    where.className = 'where';
    where.textContent = bits.join(' · ');
    body.append(where);
  }
  if (typeof event.note === 'string' && event.note) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = event.note;
    body.append(note);
  }

  if (isImageSrc(event.image)) {
    const image = document.createElement('img');
    image.src = event.image;
    image.alt = '';
    image.width = 800;
    image.height = 560;
    image.addEventListener('error', () => {
      image.remove();
      item.classList.remove('has-image');
    });
    item.classList.add('has-image');
    tile.append(image);
  }
  tile.append(body);
  item.append(tile);
  return item;
}

function renderList(list, empty, events, { hero = false } = {}) {
  list.replaceChildren(...events.map((event, index) => renderEvent(event, {
    hero: hero && index === 0,
    arrow: hero,
  })));
  empty.hidden = events.length !== 0;
}

function showError() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('.error')) return;
  const message = document.createElement('p');
  message.className = 'error';
  message.textContent = 'イベントを読み込めませんでした。';
  main.prepend(message);
}

async function main() {
  try {
    const response = await fetch(new URL('events.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('events.json is not an array');
    const { upcoming, past } = splitEvents(data, new Date());
    renderList(document.querySelector('#upcoming'), document.querySelector('#upcoming-empty'), upcoming, { hero: true });
    renderList(document.querySelector('#past'), document.querySelector('#past-empty'), past);
  } catch (error) {
    console.error(error);
    showError();
  }
}

main();
