import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { applyIssue, serializeEvents } from './event-update.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

function readBody() {
  const file = arg('--body-file');
  if (file) return fs.readFileSync(file, 'utf8');
  if (process.env.ISSUE_BODY != null) return process.env.ISSUE_BODY;
  return '';
}

function writeAux({ commentPath, resultPath, commitPath, comment, ok, action, id, commitMessage }) {
  if (commentPath && comment) fs.writeFileSync(commentPath, comment);
  if (resultPath) {
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify({ ok: Boolean(ok), action: action ?? null, id: id ?? null }, null, 2)}\n`,
    );
  }
  if (commitPath && ok && commitMessage) fs.writeFileSync(commitPath, commitMessage);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `ok=${ok ? 'true' : 'false'}\n`);
  }
}

function atomicWrite(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function reject(message, paths, code = 1) {
  const comment = `反映できませんでした。Issue は開いたままです。\n\n- ${message}\n`;
  writeAux({ ...paths, comment, ok: false });
  console.log(JSON.stringify({ ok: false, error: message }));
  process.exit(code);
}

function main() {
  const eventsPath = arg('--events');
  const paths = {
    commentPath: arg('--comment'),
    resultPath: arg('--result'),
    commitPath: arg('--commit-message'),
  };
  if (!eventsPath) {
    console.error(
      'usage: node scripts/apply-event.mjs --events events.json [--body-file file] [--comment file] [--result file] [--commit-message file]',
    );
    process.exit(2);
  }

  let events;
  try {
    events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  } catch {
    reject('events.json を読めません。', paths);
    return;
  }
  if (!Array.isArray(events)) reject('events.json は配列である必要があります。', paths);

  let result;
  try {
    result = applyIssue(events, readBody());
  } catch (error) {
    console.error(error);
    reject('処理中に失敗しました。', paths, 2);
    return;
  }

  if (!result.ok) {
    writeAux({ ...paths, ...result });
    console.log(JSON.stringify({ ok: false, errors: result.errors }));
    process.exit(1);
  }

  if (result.changed) {
    try {
      atomicWrite(eventsPath, serializeEvents(result.events));
    } catch (error) {
      console.error(error);
      reject('events.json を書き出せませんでした。', paths);
      return;
    }
  }

  writeAux({ ...paths, ...result });
  console.log(JSON.stringify({ ok: true, action: result.action, id: result.id, changed: result.changed }));
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) main();
