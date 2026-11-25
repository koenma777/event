import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyIssue, makeId, serializeEvents } from './event-update.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'scripts', 'fixtures');
const samples = fs.readFileSync(path.join(root, 'events.json'), 'utf8');

function fence(payload) {
  return `確認です。\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

const addPayload = {
  action: 'add',
  event: {
    title: '下関DX朝会',
    date: '2026-12-12T09:00:00+09:00',
    end: '2026-12-12T10:00',
    place: ' オンライン ',
    kind: 'host',
    organizer: '平野賢正',
    note: '短いメモ',
    url: 'https://example.com/events/example',
  },
};

test('add generates a stable id and canonical fields', () => {
  const first = applyIssue([], fence(addPayload));
  const second = applyIssue([], fence(addPayload));
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(first.id, second.id);
  assert.equal(first.id, makeId('2026-12-12T09:00', '下関DX朝会', new Set()));
  assert.match(first.id, /^2026-12-12-dx-[0-9a-f]{6}$/);
  assert.equal(first.events[0].kind, '主催');
  assert.equal(first.events[0].date, '2026-12-12T09:00');
  assert.equal(first.events[0].place, 'オンライン');
  assert.match(first.comment, new RegExp(`id: \`${first.id}\``));
  assert.match(first.comment, /追加/);
});

test('the same add returns the existing id', () => {
  const created = applyIssue([], fence(addPayload));
  const again = applyIssue(created.events, fence(addPayload));
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(again.id, created.id);
  assert.equal(again.events.length, 1);
  assert.match(again.comment, /新規追加はしていません/);
});

test('a Japanese-only title still gets a date id, and collisions gain a suffix', () => {
  const body = fence({
    action: 'add',
    event: {
      title: '朝会',
      date: '2026-12-12',
      place: 'オンライン',
      kind: '参加',
      organizer: '平野賢正',
      url: 'https://example.com/asa',
    },
  });
  const created = applyIssue([], body);
  assert.match(created.id, /^2026-12-12-[0-9a-f]{6}$/);
  const seeded = [{ ...created.events[0], title: '別件', url: 'https://example.com/other' }];
  const collided = applyIssue(seeded, body);
  assert.equal(collided.id, `${created.id}-2`);
});

test('update changes only the given fields and can clear a note', () => {
  const created = applyIssue([], fence(addPayload));
  const updated = applyIssue(
    created.events,
    fence({ action: 'update', id: created.id, event: { note: '差し替えたメモ', place: '下関駅前の仮設' } }),
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.events[0].note, '差し替えたメモ');
  assert.equal(updated.events[0].place, '下関駅前の仮設');
  assert.equal(updated.events[0].title, '下関DX朝会');
  assert.match(updated.comment, /note, place/);

  const cleared = applyIssue(updated.events, fence({ action: 'update', id: created.id, event: { note: null } }));
  assert.equal(cleared.ok, true);
  assert.equal(cleared.events[0].note, undefined);
  assert.match(cleared.comment, /更新した項目: note/);
});

test('delete removes the event and reports its id', () => {
  const created = applyIssue([], fence(addPayload));
  const removed = applyIssue(created.events, fence({ action: 'delete', id: created.id }));
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.events, []);
  assert.match(removed.comment, /削除/);
  assert.match(removed.comment, new RegExp(created.id));
});

test('invalid payloads do not change events', () => {
  const original = JSON.parse(samples);
  const cases = [
    ['fence', 'json がありません'],
    ['parse', '```json\n{]\n```'],
    ['action', fence({ action: 'noop' })],
    ['fields', fs.readFileSync(path.join(fixtures, 'invalid.md'), 'utf8')],
    ['range', fence({ ...addPayload, event: { ...addPayload.event, end: '2026-12-11' } })],
    ['url', fence({ ...addPayload, event: { ...addPayload.event, url: 'javascript:alert(1)' } })],
    ['image', fence({ ...addPayload, event: { ...addPayload.event, image: '../secret.svg' } })],
    ['missing', fence({ action: 'delete', id: 'missing-id' })],
    ['extra', fence({ action: 'add', id: 'nope', event: addPayload.event })],
  ];
  for (const [name, body] of cases) {
    const result = applyIssue(original, body);
    assert.equal(result.ok, false, name);
    assert.match(result.comment, /反映できませんでした/, name);
    assert.equal(result.events, undefined, name);
  }
});

test('zoned input is stored as Tokyo local time', () => {
  const result = applyIssue(
    [],
    fence({
      ...addPayload,
      event: { ...addPayload.event, date: '2026-12-12T00:00:00Z', end: '2026-12-12T01:30:00Z' },
    }),
  );
  assert.equal(result.events[0].date, '2026-12-12T09:00');
  assert.equal(result.events[0].end, '2026-12-12T10:30');
});

test('sample events.json is already in canonical form', () => {
  const parsed = JSON.parse(samples);
  const result = applyIssue(parsed, fence({ action: 'delete', id: 'missing-id' }));
  assert.equal(result.ok, false);
  const normalized = applyIssue(parsed, fs.readFileSync(path.join(fixtures, 'add.md'), 'utf8'));
  assert.equal(normalized.ok, true);
  const withoutAdded = normalized.events.filter((event) => event.id !== normalized.id);
  assert.equal(serializeEvents(withoutAdded), samples);
});

test('README examples parse, and the add example is accepted', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const blocks = [...readme.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
  assert.deepEqual(
    blocks.map((block) => block.action),
    ['add', 'update', 'delete'],
  );
  const added = applyIssue([], `\`\`\`json\n${JSON.stringify(blocks[0])}\n\`\`\``);
  assert.equal(added.ok, true);
  assert.equal(added.events[0].kind, '主催');
  const updated = applyIssue(added.events, `\`\`\`json\n${JSON.stringify(blocks[1])}\n\`\`\``);
  assert.equal(updated.ok, false);
  assert.match(updated.comment, /ありません/);
});

function runCli(body, eventsText, { envBody = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'events-'));
  const eventsPath = path.join(dir, 'events.json');
  const bodyPath = path.join(dir, 'body.md');
  const commentPath = path.join(dir, 'comment.md');
  const resultPath = path.join(dir, 'result.json');
  const commitPath = path.join(dir, 'commit.txt');
  fs.writeFileSync(eventsPath, eventsText);
  fs.writeFileSync(bodyPath, body);
  const args = [
    path.join(root, 'scripts', 'apply-event.mjs'),
    '--events',
    eventsPath,
    '--comment',
    commentPath,
    '--result',
    resultPath,
    '--commit-message',
    commitPath,
  ];
  if (!envBody) args.push('--body-file', bodyPath);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, EVENT_SKIP_IMAGES: '1', ISSUE_BODY: envBody ? body : '' },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    events: fs.readFileSync(eventsPath, 'utf8'),
    comment: fs.readFileSync(commentPath, 'utf8'),
    commit: fs.existsSync(commitPath) ? fs.readFileSync(commitPath, 'utf8') : '',
  };
}

test('the workflow script applies add, update, delete, and rejects invalid input', () => {
  const addBody = fs.readFileSync(path.join(fixtures, 'add.md'), 'utf8');
  const added = runCli(addBody, samples);
  assert.equal(added.status, 0, added.stderr);
  const addedJson = JSON.parse(added.stdout);
  assert.equal(addedJson.action, 'add');
  assert.match(added.comment, new RegExp(addedJson.id));
  assert.match(added.commit, new RegExp(`^events: add ${addedJson.id}\\n$`));
  const afterAdd = JSON.parse(added.events);
  assert.equal(afterAdd.at(-1).id, addedJson.id);
  assert.equal(afterAdd.at(-1).kind, '主催');

  const updateBody = fs.readFileSync(path.join(fixtures, 'update.md'), 'utf8').replaceAll('__ID__', addedJson.id);
  const updated = runCli(updateBody, added.events);
  assert.equal(updated.status, 0, updated.stderr);
  const updatedEvent = JSON.parse(updated.events).find((event) => event.id === addedJson.id);
  assert.equal(updatedEvent.note, '差し替えたメモ');
  assert.equal(updatedEvent.place, '下関駅前の仮設');
  assert.match(updated.comment, /更新/);

  const deleteBody = fs.readFileSync(path.join(fixtures, 'delete.md'), 'utf8').replaceAll('__ID__', addedJson.id);
  const removed = runCli(deleteBody, updated.events);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(removed.events, samples);
  assert.match(removed.comment, /削除/);

  const invalidBody = fs.readFileSync(path.join(fixtures, 'invalid.md'), 'utf8');
  const invalid = runCli(invalidBody, samples);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.events, samples);
  assert.match(invalid.comment, /反映できませんでした/);
  assert.match(invalid.comment, /date が必要です/);
  assert.doesNotMatch(invalid.comment, /反映しました/);
  assert.equal(invalid.commit, '');

  const viaEnv = runCli(addBody, '[]\n', { envBody: true });
  assert.equal(viaEnv.status, 0, viaEnv.stderr);
  assert.equal(JSON.parse(viaEnv.events).length, 1);
});

test('the workflow is limited to the owner, the event label, and the two write permissions', () => {
  const yml = fs.readFileSync(path.join(root, '.github', 'workflows', 'update-events.yml'), 'utf8');
  assert.match(yml, /types:\s*\[opened,\s*labeled\]/);
  assert.match(yml, /github\.event\.issue\.user\.login == 'koenma777'/);
  assert.match(yml, /contains\(github\.event\.issue\.labels\.\*\.name, 'event'\)/);
  assert.match(yml, /github\.event\.label\.name == 'event'/);
  assert.match(yml, /github\.event\.issue\.state == 'open'/);
  const permissions = yml.match(/permissions:\n(?:  .+\n)+/)[0];
  assert.match(permissions, /contents: write/);
  assert.match(permissions, /issues: write/);
  assert.equal(permissions.trim().split('\n').length, 3);
  assert.equal(yml.split('gh issue close').length - 1, 1);
  assert.match(yml, /git add -- events\.json/);
  assert.doesNotMatch(yml, /pull-requests:/);
});
