import {
  KINDS,
  countdownLabel,
  dateMark,
  deadlineLabel,
  googleCalendarUrl,
  icsText,
  mapUrl,
  organizerParts,
  splitEvents,
} from './schedule.js';

const KIND_CLASS = Object.fromEntries(Object.entries(KINDS).map(([name, kind]) => [name, kind.slug]));

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
  num.textContent = `${mark.month}/${mark.day}`;
  const sub = document.createElement('span');
  sub.className = 'sub';
  const when = document.createElement('span');
  when.textContent = `${mark.year}年(${mark.weekday})`;
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

function renderEvent(event, { hero = false, arrow = false, index = 0, now = null } = {}) {
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
  const soon = now ? countdownLabel(event, now) : '';
  if (soon) {
    const badge = document.createElement('span');
    badge.className = 'soon';
    badge.textContent = soon;
    meta.append(badge);
  }
  const deadline = now ? deadlineLabel(event, now) : null;
  if (deadline) {
    const badge = document.createElement('span');
    badge.className = deadline.closed ? 'deadline is-closed' : 'deadline';
    badge.textContent = deadline.text;
    meta.append(badge);
  }
  meta.append(renderDate(event));

  const heading = document.createElement('h3');
  heading.textContent = event.title ?? '';
  body.append(meta, heading);
  const parts = organizerParts(event.organizer);
  if (parts.length) {
    const org = document.createElement('ul');
    org.className = 'org';
    for (const part of parts) {
      const row = document.createElement('li');
      if (part.role) {
        const role = document.createElement('span');
        role.className = 'role';
        role.textContent = part.role;
        row.append(role);
      }
      const name = document.createElement('span');
      name.className = 'org-name';
      name.textContent = part.name;
      row.append(name);
      org.append(row);
    }
    body.append(org);
  }
  if (!hasImage) {
    if (typeof event.place === 'string' && event.place) {
      const where = document.createElement('p');
      where.className = 'where';
      where.textContent = event.place;
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
  if (now) {
    const actions = renderActions(event);
    if (actions) tile.append(actions);
  }
  item.append(tile);
  return item;
}

const ICON = {
  calendar: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%231a1614' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2.5' y='3.5' width='11' height='10' rx='2'/%3E%3Cpath d='M2.5 7h11M5.5 2v3M10.5 2v3'/%3E%3C/svg%3E\")",
  map: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%231a1614' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 14.5s-4.5-4.2-4.5-7.7a4.5 4.5 0 0 1 9 0c0 3.5-4.5 7.7-4.5 7.7z'/%3E%3Ccircle cx='8' cy='6.8' r='1.6'/%3E%3C/svg%3E\")",
};

function iconButton(tag, label, icon) {
  const el = document.createElement(tag);
  el.className = 'act';
  el.setAttribute('aria-label', label);
  el.title = label;
  el.style.backgroundImage = ICON[icon];
  return el;
}

function downloadIcs(event) {
  const blob = new Blob([icsText(event)], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${event.id || 'event'}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

let openMenu = null;

function closeMenu() {
  if (!openMenu) return;
  openMenu.menu.hidden = true;
  openMenu.button.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

document.addEventListener('click', (e) => {
  if (openMenu && !openMenu.wrap.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

function renderActions(event) {
  const google = googleCalendarUrl(event);
  const map = mapUrl(event.place);
  if (!google && !map) return null;
  const actions = document.createElement('div');
  actions.className = 'actions';

  if (google) {
    const wrap = document.createElement('div');
    wrap.className = 'cal';
    const button = iconButton('button', 'カレンダーに追加', 'calendar');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'cal-menu';
    menu.hidden = true;
    const toGoogle = document.createElement('a');
    toGoogle.href = google;
    toGoogle.target = '_blank';
    toGoogle.rel = 'noopener';
    toGoogle.textContent = 'Google カレンダー';
    toGoogle.addEventListener('click', closeMenu);
    const toIcs = document.createElement('button');
    toIcs.type = 'button';
    toIcs.textContent = 'iPhone・Mac など';
    toIcs.addEventListener('click', () => {
      downloadIcs(event);
      closeMenu();
    });
    menu.append(toGoogle, toIcs);
    button.addEventListener('click', () => {
      const opening = menu.hidden;
      closeMenu();
      if (opening) {
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        openMenu = { wrap, menu, button };
      }
    });
    wrap.append(button, menu);
    actions.append(wrap);
  }

  if (map) {
    const link = iconButton('a', '地図を開く', 'map');
    link.href = map;
    link.target = '_blank';
    link.rel = 'noopener';
    actions.append(link);
  }
  return actions;
}

function renderList(list, empty, events, { hero = false, now = null } = {}) {
  list.replaceChildren(...events.map((event, index) => renderEvent(event, {
    hero: hero && index === 0,
    arrow: hero,
    index,
    now,
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
    const now = new Date();
    const { upcoming, past } = splitEvents(data, now);
    renderList(document.querySelector('#upcoming'), document.querySelector('#upcoming-empty'), upcoming, { hero: true, now });
    renderList(document.querySelector('#past'), document.querySelector('#past-empty'), past);
  } catch (error) {
    console.error(error);
    showError();
  }
}

main();
