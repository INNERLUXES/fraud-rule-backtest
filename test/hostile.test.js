import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS } from '../src/index.js';
import { ARGS, allowed, all, any, cli, csvOf, leaf, ngRule, ngRules, not, rule, rulesText, run, runOf, scenarioText } from './helpers.js';

// The time of a run, in milliseconds.
function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

// A transactions text of n rows built with a loop: every tenth row is fraud from NG.
function bigText(n) {
  const out = ['id,timestamp,amount,country,channel,is_fraud'];
  for (let i = 0; i < n; i += 1) out.push(`T${i},${1700000000 + i},${(i % 500) + 1},${i % 10 === 0 ? 'NG' : 'DE'},web,${i % 10 === 0 ? 1 : 0}`);
  return `${out.join('\n')}\n`;
}

test('hostile: a transactions file of 200000 rows is replayed with several rules in good time', () => {
  const rules = rulesText([ngRule(), rule('R2', any(leaf('amount', 'gte', 400), not(leaf('channel', 'eq', 'web')))), rule('R3', all(leaf('country', 'in', ['NG', 'RU']), leaf('amount', 'between', [10, 300])))]);
  const { value, ms } = timed(() => runOf(bigText(200000), rules));
  assert.equal(value.summary.rows, 200000);
  assert.equal(value.results.rules.rules[0].truePositives, 20000);
  assert.ok(ms < allowed(20000), `${ms} ms`);
});

test('hostile: the most rows allowed are read; one more is refused whole', () => {
  const limits = { ...WORK_LIMITS, maxRows: 1000 };
  const ok = runOf(bigText(1000), ngRules(), {}, { limits });
  assert.equal(ok.state.transactions, 'read');
  const over = runOf(bigText(1001), ngRules(), {}, { limits });
  assert.equal(over.state.transactions, 'unreadable');
  assert.match(over.findings[0].message, /more than 1000 rows/);
});

test('hostile: the most rules allowed are read in good time; one more is refused whole', () => {
  const many = (n) => rulesText(Array.from({ length: n }, (_, i) => rule(`R${i}`, leaf('amount', 'gte', i % 400))));
  const { value, ms } = timed(() => runOf(bigText(5000), many(1000)));
  assert.equal(value.models.rules.rules.length, 1000);
  assert.ok(ms < allowed(20000), `${ms} ms`);
  const over = runOf(bigText(100), many(1001));
  assert.equal(over.state.rules, 'unreadable');
  assert.match(over.findings[0].message, /more than 1000 rules/);
});

test('hostile: brackets nested a hundred thousand deep, in the rules and in the transactions, are refused with a finding and no stack overflow', () => {
  const deep = `{"rules": [{"id": "R1", "when": ${'{"not": '.repeat(100000)}1${'}'.repeat(100000)}}]}`;
  const { value, ms } = timed(() => runOf(scenarioText(), deep));
  assert.equal(value.state.rules, 'unreadable');
  assert.match(value.findings.find((f) => f.id === 'FRB001').message, /nested deeper than 60/);
  assert.ok(ms < allowed(5000), `${ms} ms`);
  const array = runOf(`${'['.repeat(100000)}${']'.repeat(100000)}`, ngRules());
  assert.equal(array.state.transactions, 'unreadable');
});

test('hostile: a condition nested and a condition with many parts are findings and not a hang', () => {
  let c = leaf('amount', 'gt', 1);
  for (let i = 0; i < 25; i += 1) c = not(c);
  const nested = runOf(scenarioText(), rulesText([rule('R1', c)]));
  assert.ok(nested.findings.some((f) => f.id === 'FRB002' && /nested deeper than 20/.test(f.message)));
  const wide = runOf(scenarioText(), rulesText([rule('R1', any(...Array.from({ length: 5000 }, (_, i) => leaf('amount', 'eq', i))))]));
  assert.ok(wide.findings.some((f) => f.id === 'FRB002' && /more than 500 parts/.test(f.message)));
});

test('hostile: one id on every row and one bad amount on every row are capped at 1000 findings each and counted', () => {
  const rows = [];
  for (let i = 0; i < 20000; i += 1) rows.push(`SAME,${1700000000 + i},-5,${i % 4 === 0 ? 'NG' : 'DE'},${i % 4 === 0 ? 1 : 0}`);
  const text = `id,timestamp,amount,country,is_fraud\n${rows.join('\n')}\n`;
  const { value, ms } = timed(() => runOf(text, ngRules()));
  assert.equal(value.findings.filter((f) => f.id === 'FRB017').length, 1000);
  assert.equal(value.omitted.get('FRB017'), 18999);
  assert.equal(value.omitted.get('FRB015'), 19000);
  assert.ok(ms < allowed(10000), `${ms} ms`);
});

test('hostile: fields, rule ids and values named like object properties are only names', async () => {
  const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
  const text = `id,${names.join(',')},is_fraud\n${Array.from({ length: 40 }, (_, i) => `T${i},${names.map((n, k) => (k === 0 ? 'NG' : 'v')).join(',')},${i % 2}`).join('\n')}\n`;
  const rules = rulesText(names.map((n) => rule(n, leaf(n, 'eq', n === '__proto__' ? 'NG' : 'v'))));
  const r = await run({ 't.csv': text, 'r.json': rules }, [...ARGS, '--json']);
  const report = JSON.parse(r.out);
  assert.deepEqual(report.results.rules.rules.map((m) => m.id), names);
  assert.ok(report.results.rules.rules.every((m) => m.alerts === 40));
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys({}).length, 0);
});

test('hostile: a cell that is a spreadsheet formula is only text, and a cell of the longest length is read while one character more is refused', () => {
  const formula = scenarioText((rows) => { rows[0].note = '=HYPERLINK("http://example.invalid","x")'; rows[1].note = '+1+1'; rows[2].note = '@SUM(A1)'; });
  const read = runOf(formula, rulesText([rule('R1', leaf('note', 'contains', 'HYPERLINK'))]));
  assert.equal(read.results.rules.rules[0].alerts, 1);
  const long = (n) => `id,note,is_fraud\nT1,${'x'.repeat(n)},1\nT2,y,0\n`;
  assert.equal(runOf(long(WORK_LIMITS.maxCellLength), ngRules()).state.transactions, 'read');
  assert.equal(runOf(long(WORK_LIMITS.maxCellLength + 1), ngRules()).state.transactions, 'unreadable');
});

test('hostile: a line of many quotes and a quote inside a cell are refused with the line, not read as a shifted column', () => {
  const r = runOf(`id,note,is_fraud\nT1,${'"'.repeat(5001)},1\nT2,a"b,0\n`, ngRules());
  assert.equal(r.state.transactions, 'unreadable');
  assert.equal(r.findings[0].id, 'FRB001');
  assert.ok(r.findings[0].line >= 2);
  const inside = runOf('id,note,is_fraud\nT1,a"b,1\n', ngRules());
  assert.match(inside.findings[0].message, /quote inside a cell that does not start with one/);
  assert.equal(inside.findings[0].line, 2);
});

test('hostile: the command line with a very long argument is cleaned and cut, not echoed whole', async () => {
  const r = await cli([`--${'x'.repeat(100000)}`]);
  assert.equal(r.code, 2);
  assert.ok(r.err.length < 4000, `${r.err.length} characters`);
});
