import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const EXT_FROM_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function attr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i').exec(tag);
  return match ? decodeEntities(match[2]) : null;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function socialImageFromHtml(html) {
  if (typeof html !== 'string' || !html) return null;
  let og = null;
  let twitter = null;
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    const content = attr(tag, 'content');
    if (!content) continue;
    if (!og && (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url')) og = content;
    if (!twitter && (key === 'twitter:image' || key === 'twitter:image:src')) twitter = content;
  }
  return og || twitter || null;
}

export function resolveRemoteUrl(found, pageUrl) {
  if (!found) return null;
  try {
    const url = new URL(found, pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function sniffImage(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.length >= 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  const head = buf.subarray(0, 240).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
}

function extensionFor(contentType, sniffed) {
  if (sniffed) return sniffed;
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  return EXT_FROM_TYPE[type] || null;
}

async function readCapped(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buf = Buffer.from(await response.arrayBuffer());
    return buf.length > maxBytes ? { tooBig: true } : { buf };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { tooBig: true };
    }
    chunks.push(Buffer.from(value));
  }
  return { buf: Buffer.concat(chunks, total) };
}

export async function saveRemoteImage({ url, id, imagesDir, fetchImpl = fetch, maxBytes = MAX_IMAGE_BYTES }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/.test(id)) return { ok: false, reason: 'id' };
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'event-pages', accept: 'image/*,*/*' },
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!response?.ok) return { ok: false, reason: 'status' };
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (declared > maxBytes) return { ok: false, reason: 'size' };
  let body;
  try {
    body = await readCapped(response, maxBytes);
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (body.tooBig) return { ok: false, reason: 'size' };
  const sniffed = sniffImage(body.buf);
  const ext = extensionFor(response.headers?.get?.('content-type'), sniffed);
  if (!ext || !sniffed) return { ok: false, reason: 'type' };
  await fs.mkdir(imagesDir, { recursive: true });
  const filename = `${id}.${ext}`;
  const names = await fs.readdir(imagesDir);
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${id}.`) && name !== filename)
      .map((name) => fs.unlink(path.join(imagesDir, name))),
  );
  await fs.writeFile(path.join(imagesDir, filename), body.buf);
  return { ok: true, path: `images/${filename}` };
}

async function pageImage(pageUrl, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(pageUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'event-pages', accept: 'text/html' },
    });
  } catch {
    return null;
  }
  if (!response?.ok) return null;
  const html = (await response.text()).slice(0, 1_000_000);
  return resolveRemoteUrl(socialImageFromHtml(html), pageUrl);
}

export async function attachImage(event, { intent, imagesDir, fetchImpl = fetch }) {
  try {
    let remote = null;
    if (intent === 'remote') remote = resolveRemoteUrl(event.image, event.url || event.image);
    if (intent === 'missing' && event.url) remote = await pageImage(event.url, fetchImpl);
    if (!remote) return { skipped: true, reason: 'none' };
    const saved = await saveRemoteImage({ url: remote, id: event.id, imagesDir, fetchImpl });
    if (!saved.ok) return { skipped: true, reason: saved.reason };
    return { image: saved.path };
  } catch {
    return { skipped: true, reason: 'network' };
  }
}
