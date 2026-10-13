import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/index.js';
import { BAD, BAD_COMPARE, BAD_NO_LABEL, BAD_ONE_SIDED, BAD_RESULTS, BAD_SMALL, BAD_SYNTAX, GOOD, GOOD_COMPARE, GOOD_LINES, GOOD_SWEEP, run } from '../tools/example.mjs';
import { withFiles } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const ids = (report) => [...new Set(JSON.parse(report.out).findings.map((f) => f.id))].sort();

test('examples: the good files pass every check at every level, for every command', async () => {
  for (const args of [GOOD, GOOD_LINES, GOOD_COMPARE, GOOD_SWEEP]) {
    for (const level of ['error', 'warning', 'info']) {
      const r = await run([...args, '--fail-on', level]);
      assert.equal(r.code, 0, `${args[0]} at ${level}\n${r.out}`);
      assert.match(r.out, new RegExp(`RESULT: PASS - no finding at or above ${level}\\n$`));
      assert.match(r.out, /\nfindings: 0\n/);
    }
  }
});

test('examples: the good files count what the README says', async () => {
  const r = JSON.parse((await run([...GOOD, '--json'])).out);
  const t = r.summary.transactions;
  assert.deepEqual([t.rows, t.labelled, t.fraud, t.notFraud, t.unlabelled], [405, 405, 47, 358, 0]);
  assert.deepEqual(t.currencies, ['EUR']);
  assert.equal(r.results.rules.rules.length, 4);
  assert.deepEqual(r.results.rules.rules.map((m) => [m.id, m.alerts, m.truePositives]), [['R001', 11, 8], ['R002', 17, 13], ['R003', 15, 7], ['R004', 9, 9]]);
  assert.equal(r.results.rules.set.fraudCaught, 33);
  assert.equal(r.results.rules.set.fraudMissed, 14);
  assert.equal(r.results.rules.set.fraudCaughtByMoreThanOne, 4);
});

test('examples: the CSV and the JSON lines hold the same transactions', async () => {
  const csv = JSON.parse((await run(['examples/good/transactions.csv', '--rules', 'examples/good/rules-candidate.json', '--json'])).out);
  const lines = JSON.parse((await run([...GOOD_LINES, '--json'])).out);
  assert.deepEqual(lines.results, csv.results);
  assert.equal(lines.input.transactions.format, 'jsonl');
});

test('examples: the comparison of the good rule sets, and of the candidate that goes wrong', async () => {
  const good = JSON.parse((await run([...GOOD_COMPARE, '--json'])).out).results.comparison;
  assert.deepEqual([good.summary.fraudLost, good.summary.fraudGained, good.summary.falseAlarmsAdded, good.summary.falseAlarmsCleared], [0, 8, 6, 0]);
  assert.deepEqual(good.rules.added, ['R005']);
  assert.deepEqual(good.rules.changed.map((c) => c.id), ['R001', 'R002']);
  const bad = JSON.parse((await run([...BAD_COMPARE, '--json'])).out).results.comparison;
  assert.deepEqual([bad.summary.fraudLost, bad.summary.falseAlarmsAdded], [5, 28]);
  assert.deepEqual(bad.rules.removed, ['R004']);
});

test('examples: every check is shown by at least one bad example', async () => {
  const shown = new Set();
  for (const args of [BAD, BAD_RESULTS, BAD_COMPARE, BAD_SYNTAX, BAD_SMALL, BAD_NO_LABEL, BAD_ONE_SIDED]) {
    const r = await run([...args, '--json']);
    assert.equal(r.code, 1, args.join(' '));
    for (const id of ids(r)) shown.add(id);
  }
  assert.deepEqual(RULES.map((r) => r.id).filter((id) => !shown.has(id)), []);
});

test('examples: the sweep of the good transactions has a row for each default cut-off and no cut-off loses a row', async () => {
  const sweep = JSON.parse((await run([...GOOD_SWEEP, '--json'])).out).results.sweep;
  assert.equal(sweep.transactions, 405);
  assert.equal(sweep.points.length, 9);
  const alerts = sweep.points.map((p) => p.alerts);
  assert.deepEqual([...alerts].sort((a, b) => b - a), alerts, 'a higher cut-off never has more alerts');
  assert.equal(sweep.points[0].recall, 1);
});

test('examples: the generator writes the committed transactions again, byte for byte', async () => {
  await withFiles({}, async (dir) => {
    await mkdir(resolve(dir, 'tools'), { recursive: true });
    await cp(resolve(root, 'tools/make-examples.mjs'), resolve(dir, 'tools/make-examples.mjs'));
    const r = spawnSync(process.execPath, [resolve(dir, 'tools/make-examples.mjs')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    for (const file of ['examples/good/transactions.csv', 'examples/good/transactions.jsonl', 'examples/bad/transactions.csv', 'examples/bad/transactions-small.csv', 'examples/bad/transactions-no-label.csv', 'examples/bad/transactions-one-sided.csv']) {
      assert.equal(await readFile(resolve(dir, file), 'utf8'), await read(file), file);
    }
  });
});

test('examples: the files in examples/output are the output of the tool as it is', async () => {
  assert.equal(await read('examples/output/good.txt'), (await run(GOOD)).out);
  assert.equal(await read('examples/output/bad-results.txt'), (await run(BAD_RESULTS)).out);
  assert.equal(await read('examples/output/good-compare.json'), (await run([...GOOD_COMPARE, '--json'])).out);
  assert.equal(await read('examples/output/bad.sarif'), (await run([...BAD, '--format', 'sarif'])).out);
  assert.equal((await readdir(resolve(root, 'examples/output'))).length, 27);
});

test('examples: every example file is plain ASCII with LF line ends, and nothing in them reads like a date', async () => {
  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(resolve(root, dir), { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...await walk(`${dir}/${e.name}`));
      else out.push(`${dir}/${e.name}`);
    }
    return out;
  };
  const files = await walk('examples');
  assert.ok(files.length > 35);
  for (const f of files) {
    const text = await read(f);
    assert.doesNotMatch(text, /[^\x00-\x7f]/, f);
    assert.ok(!text.includes('\r'), f);
    assert.doesNotMatch(text, /\b\d{4}-\d{2}-\d{2}\b/, f);
  }
});
