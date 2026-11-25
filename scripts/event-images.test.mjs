import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { attachImage, resolveRemoteUrl, socialImageFromHtml } from './event-images.mjs';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

function response({ ok = true, status = 200, headers = {}, text = '', body = JPG } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok,
    status,
    headers: { get: (name) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => text,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    body: null,
  };
}

test('og:image wins and twitter:image is the fallback', () => {
  const both = `<meta property="og:image" content="https://cdn.example/og.jpg"><meta name="twitter:image" content="https://cdn.example/tw.jpg">`;
  assert.equal(socialImageFromHtml(both), 'https://cdn.example/og.jpg');
  const swapped = `<meta content="https://cdn.example/og.png" property="og:image">`;
  assert.equal(socialImageFromHtml(swapped), 'https://cdn.example/og.png');
  const twitter = `<meta name="twitter:image" content="https://cdn.example/only.jpg">`;
  assert.equal(socialImageFromHtml(twitter), 'https://cdn.example/only.jpg');
  assert.equal(socialImageFromHtml('<html></html>'), null);
  assert.equal(
    resolveRemoteUrl('/flyer.jpg', 'https://example.com/events/a'),
    'https://example.com/flyer.jpg',
  );
});

test('a missing image downloads the page og:image into images/<id>.jpg', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-img-'));
  const fetchImpl = async (url) => {
    if (url === 'https://example.com/event') {
      return response({ text: '<meta property="og:image" content="https://cdn.example/a.jpg">' });
    }
    assert.equal(url, 'https://cdn.example/a.jpg');
    return response({ headers: { 'content-type': 'image/jpeg' } });
  };
  const result = await attachImage(
    { id: '2026-12-03-sample', url: 'https://example.com/event' },
    { intent: 'missing', imagesDir: dir, fetchImpl },
  );
  assert.equal(result.image, 'images/2026-12-03-sample.jpg');
  assert.ok(fs.existsSync(path.join(dir, '2026-12-03-sample.jpg')));
});

test('twitter:image is used when og:image is absent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-img-'));
  const fetchImpl = async (url) => {
    if (String(url).includes('event')) {
      return response({ text: '<meta name="twitter:image" content="/banner.jpg">' });
    }
    return response({ headers: { 'content-type': 'image/jpeg' } });
  };
  const result = await attachImage(
    { id: '2026-12-08-sample', url: 'https://example.com/event' },
    { intent: 'missing', imagesDir: dir, fetchImpl },
  );
  assert.equal(result.image, 'images/2026-12-08-sample.jpg');
});

test('an explicit image URL is saved, and failures are skipped', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-img-'));
  const saved = await attachImage(
    { id: '2026-11-28-real', image: 'https://cdn.example/flyer.jpg', url: 'https://example.com/e' },
    {
      intent: 'remote',
      imagesDir: dir,
      fetchImpl: async () => response({ headers: { 'content-type': 'image/jpeg' } }),
    },
  );
  assert.equal(saved.image, 'images/2026-11-28-real.jpg');

  const huge = await attachImage(
    { id: '2026-11-28-huge', image: 'https://cdn.example/big.jpg' },
    {
      intent: 'remote',
      imagesDir: dir,
      fetchImpl: async () => response({ headers: { 'content-length': String(4 * 1024 * 1024), 'content-type': 'image/jpeg' } }),
    },
  );
  assert.equal(huge.skipped, true);
  assert.equal(huge.reason, 'size');

  const html = await attachImage(
    { id: '2026-11-28-html', image: 'https://cdn.example/nope' },
    {
      intent: 'remote',
      imagesDir: dir,
      fetchImpl: async () => response({ headers: { 'content-type': 'text/html' }, body: Buffer.from('<html></html>') }),
    },
  );
  assert.equal(html.skipped, true);
  assert.equal(html.reason, 'type');

  const down = await attachImage(
    { id: '2026-11-28-down', url: 'https://example.com/event' },
    { intent: 'missing', imagesDir: dir, fetchImpl: async () => { throw new Error('offline'); } },
  );
  assert.equal(down.skipped, true);
});
