import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, InputError, decode, displayPath, locateInput, main, readInputText } from '../src/index.js';
import { ARGS, GOOD, cli, ngRules, run, scenario, scenarioText, withFiles } from './helpers.js';

test('files: a folder and a file that is not there are refused with the path as given', async () => {
  await withFiles({ 'dir/x.txt': 'x' }, async (dir) => {
    await assert.rejects(locateInput('dir', dir), (e) => e instanceof InputError && /dir: is a folder/.test(e.message));
    await assert.rejects(locateInput('nope.json', dir), (e) => e instanceof InputError && /nope\.json: does not exist/.test(e.message));
    await assert.rejects(locateInput('dir/x.txt/more', dir), (e) => e instanceof InputError && /does not exist/.test(e.message));
  });
});

test('files: a symbolic link is refused', { skip: process.platform === 'win32' ? 'creating a link needs a privilege on Windows' : false }, async () => {
  await withFiles(GOOD, async (dir) => {
    await symlink(resolve(dir, 't.csv'), resolve(dir, 'link.csv'));
    await assert.rejects(locateInput('link.csv', dir), (e) => e instanceof InputError && /symbolic link/.test(e.message));
    const r = await cli(['link.csv', '--rules', 'r.json'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /symbolic link/);
  });
});

test('files: a device is refused', { skip: process.platform === 'win32' ? 'there is no /dev/null on Windows' : false }, async () => {
  const r = await cli(['/dev/null', '--rules', '/dev/null'], '/');
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('files: a file past the size limit is refused whole, not read in part', async () => {
  await withFiles({ 'big.csv': 'x'.repeat(50), 'r.json': '{}' }, async (dir) => {
    await assert.rejects(readInputText(resolve(dir, 'big.csv'), dir, { maxBytes: 10 }), (e) => e instanceof InputError && /larger than 10 bytes/.test(e.message));
    let err = '';
    const code = await main(['big.csv', '--rules', 'r.json'], { out: () => {}, err: (t) => { err += t; } }, { maxBytes: 10 }, dir);
    assert.equal(code, 2);
    assert.match(err, /big\.csv: is larger than 10 bytes/);
  });
  assert.ok(FILE_LIMITS.maxBytes >= 16 * 1024 * 1024);
});

test('files: every file is checked for problems, and a run that cannot read two says so for both', async () => {
  const r = await run({ 'dir/x.txt': 'x' }, ['dir', '--rules', 'gone.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /the input has problems/);
  assert.match(r.err, /dir: is a folder/);
  assert.match(r.err, /gone\.json: does not exist/);
});

test('files: a null byte means it is not a text file, and invalid UTF-8 is refused', async () => {
  const nul = await run({ 't.csv': Buffer.from('id,x\0\n'), 'r.json': ngRules() }, ARGS);
  assert.equal(nul.code, 2);
  assert.match(nul.err, /t\.csv: holds a null byte/);
  const bad = await run({ 't.csv': scenarioText(), 'r.json': Buffer.from([0x7b, 0xc3, 0x28, 0x7d]) }, ARGS);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /r\.json: is not valid UTF-8/);
});

test('files: a byte order mark is dropped; UTF-8 and UTF-16 read the same files', async () => {
  const text = scenarioText();
  const asJson = async (t, r) => JSON.parse((await run({ 't.csv': t, 'r.json': r }, [...ARGS, '--json'])).out);
  const plain = await asJson(text, ngRules());
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const be = Buffer.from(le);
  be.subarray(2).swap16();
  be[0] = 0xfe;
  be[1] = 0xff;
  for (const t of [bom, le, be]) {
    const r = await asJson(t, ngRules());
    assert.deepEqual(r.findings, plain.findings);
    assert.deepEqual(r.results, plain.results);
    assert.equal(r.summary.transactions.rows, 140);
  }
});

test('files: UTF-16 with an odd number of bytes is refused, and so is UTF-16 that is not valid', () => {
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x41])), /odd number of bytes/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x00, 0xd8])), /not valid UTF-16/);
  assert.equal(decode(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
});

test('files: LF, CRLF and CR line ends of the transactions and of the rules give the same findings', async () => {
  const rules = ngRules({ onwer: 'x' });
  const csv = scenarioText((rows) => { rows[3].amount = '-1'; rows[5].is_fraud = 'maybe'; });
  const get = async (t, r) => JSON.parse((await run({ 't.csv': t, 'r.json': r }, [...ARGS, '--json'])).out).findings;
  const lf = await get(csv, rules);
  assert.ok(lf.length >= 3);
  assert.deepEqual(await get(csv.replaceAll('\n', '\r\n'), rules.replaceAll('\n', '\r\n')), lf);
  assert.deepEqual(await get(csv.replaceAll('\n', '\r'), rules.replaceAll('\n', '\r')), lf);
});

test('files: the transactions as CSV, as JSON lines and as a JSON array give the same results', async () => {
  const rows = scenario();
  const lines = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const array = JSON.stringify(rows);
  const get = async (name, content) => JSON.parse((await run({ [name]: content, 'r.json': ngRules() }, [name, '--rules', 'r.json', '--json'])).out);
  const csv = await get('t.csv', scenarioText());
  const jsonl = await get('t.jsonl', lines);
  const json = await get('t.json', array);
  const noName = await get('data', array);
  assert.equal(jsonl.input.transactions.format, 'jsonl');
  assert.equal(json.input.transactions.format, 'json');
  assert.equal(noName.input.transactions.format, 'json', 'the first character decides when the name says nothing');
  for (const other of [jsonl, json, noName]) {
    assert.deepEqual(other.results.rules.rules, csv.results.rules.rules);
    assert.deepEqual(other.results.rules.set, csv.results.rules.set);
  }
});

test('files: the path in a report is relative to the folder, with forward slashes', async () => {
  const r = await run({ 'data/sub/t.csv': scenarioText(), 'data/r.json': ngRules({ onwer: 'x' }) }, ['data/sub/t.csv', '--rules', 'data/r.json']);
  assert.match(r.out, /data\/r\.json:\d+/);
  assert.equal(displayPath(resolve('/tmp/x/a/b.json'), resolve('/tmp/x')), 'a/b.json');
  assert.ok(displayPath(resolve('/tmp/other/a.json'), resolve('/tmp/x')).endsWith('other/a.json'));
});

test('files: nothing is written: the tool leaves the folder as it found it', async () => {
  await withFiles({ ...GOOD, 'sub/.keep': '' }, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    await cli([...ARGS, '--format', 'junit'], dir);
    await mkdir(resolve(dir, 'again'), { recursive: true });
    await writeFile(resolve(dir, 'again/a.txt'), 'a');
    const after = (await readdir(dir, { recursive: true })).sort().filter((f) => !f.startsWith('again'));
    assert.deepEqual(after, before);
  });
});

test('files: a rules file given as the transactions and the other way round is not read as the other kind', async () => {
  const r = await run({ 't.csv': scenarioText(), 'r.json': ngRules() }, ['r.json', '--rules', 't.csv']);
  assert.equal(r.code, 1);
  assert.match(r.out, /FRB001/);
});
