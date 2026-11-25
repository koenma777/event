import { dateMark, splitEvents } from './schedule.js';

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

function renderDate(event) {
  const mark = dateMark(event);
  const time = document.createElement('time');
  time.className = 'datemark';
  if (event.date) time.dateTime = event.date;
  if (!mark) return time;
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = mark.day;
  const sub = document.createElement('span');
  sub.className = 'sub';
  const when = document.createElement('span');
  when.textContent = `${mark.year}年${mark.month}月(${mark.weekday})`;
  sub.append(when);
  if (mark.clock) {
    const clock = document.createElement('span');
    clock.className = 'clock';
    clock.textContent = mark.clock;
    sub.append(clock);
  }
  time.append(num, sub);
  return time;
}

let flyerOpener = null;

function openFlyer(src, label, opener) {
  const dialog = document.querySelector('#flyer');
  const image = dialog.querySelector('img');
  image.src = src;
  image.alt = label;
  flyerOpener = opener;
  dialog.showModal();
}

function setupFlyer() {
  const dialog = document.querySelector('#flyer');
  dialog.querySelector('.flyer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    flyerOpener?.focus();
    flyerOpener = null;
  });
}

function renderFrame(src, label) {
  const frame = document.createElement('button');
  frame.type = 'button';
  frame.className = 'frame';
  frame.setAttribute('aria-label', label);
  const photo = document.createElement('img');
  photo.className = 'photo';
  photo.alt = '';
  photo.src = src;
  photo.addEventListener('error', () => frame.remove());
  frame.addEventListener('click', () => openFlyer(src, label, frame));
  frame.append(photo);
  return frame;
}

function renderEvent(event, { hero = false, arrow = false, index = 0 } = {}) {
  const item = document.createElement('li');
  item.className = hero ? 'event is-hero' : 'event';
  if (arrow) item.classList.add('has-arrow');
  item.style.setProperty('--i', String(index));
  if (event.id) item.dataset.id = event.id;
  if (event.kind) item.dataset.kind = event.kind;

  const linked = isOfficialUrl(event.url);
  const hasImage = isImageSrc(event.image);
  const tile = document.createElement('div');
  tile.className = 'tile';

  if (hasImage) {
    item.classList.add('has-image');
    const frame = renderFrame(event.image, event.title || '');
    frame.querySelector('.photo').addEventListener('error', () => item.classList.remove('has-image'));
    tile.append(frame);
  }

  const body = document.createElement(linked ? 'a' : 'div');
  body.className = 'event-body';
  if (linked) body.href = event.url;
  const meta = document.createElement('div');
  meta.className = 'meta';
  if (event.kind) {
    const tag = document.createElement('span');
    tag.className = `tag tag-${KIND_CLASS[event.kind] ?? 'other'}`;
    tag.textContent = event.kind;
    meta.append(tag);
  }
  meta.append(renderDate(event));

  const heading = document.createElement('h3');
  heading.textContent = event.title ?? '';
  body.append(meta, heading);
  if (!hasImage) {
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
  }
  tile.append(body);
  item.append(tile);
  return item;
}

function renderList(list, empty, events, { hero = false } = {}) {
  list.replaceChildren(...events.map((event, index) => renderEvent(event, {
    hero: hero && index === 0,
    arrow: hero,
    index,
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

setupFlyer();

async function main() {
  try {
    const response = await fetch(new URL('events.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('events.json is not an array');
    const { upcoming, past } = splitEvents(data, new Date());
    const count = document.querySelector('#upcoming-count');
    if (count) count.textContent = String(upcoming.length);
    renderList(document.querySelector('#upcoming'), document.querySelector('#upcoming-empty'), upcoming, { hero: true });
    renderList(document.querySelector('#past'), document.querySelector('#past-empty'), past);
  } catch (error) {
    console.error(error);
    showError();
  }
}

main();
