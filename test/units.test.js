import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FULL_WIDTH_QUESTION, buildReport, cell, checkCompare, checkData, checkResults, checkRules, createCollector, depthOf, editDistance, explainJson, explainMarkdown, explainText, fixed, flat, fold, grouped, listChecksJson, listChecksMarkdown, listChecksText, listText, nearest, nodesOf, plural, readOptions, round, ruleById, safeText, tidy, toJson, toJunit, toMarkdown, toSarif, toText, xmlSafe } from '../src/index.js';
import { datasetOf, ngRule, ngRules, rulesText, runOf, scenarioText } from './helpers.js';

const tree = { name: 'a', kids: [{ name: 'b', kids: [{ name: 'd', kids: [] }] }, { name: 'c', kids: [] }] };
const kidsOf = (n) => n.kids;

test('tree: nodesOf lists parents before children in the order of the text, depthOf counts levels, and fold combines from the leaves up', () => {
  assert.deepEqual(nodesOf(tree, kidsOf).map((n) => n.name), ['a', 'b', 'd', 'c']);
  assert.equal(depthOf(tree, kidsOf), 3);
  assert.equal(depthOf({ name: 'x', kids: [] }, kidsOf), 1);
  assert.equal(fold(tree, kidsOf, (n, results) => `${n.name}${results.length ? `(${results.join(',')})` : ''}`), 'a(b(d),c)');
  assert.equal(fold(tree, kidsOf, (n, results) => 1 + results.reduce((a, b) => a + b, 0)), 4);
});

test('tree: a chain of a hundred thousand nodes is walked without a stack overflow', () => {
  let node = { name: 'leaf', kids: [] };
  for (let i = 0; i < 100000; i += 1) node = { name: 'n', kids: [node] };
  assert.equal(depthOf(node, kidsOf), 100001);
  assert.equal(fold(node, kidsOf, (n, results) => 1 + (results[0] ?? 0)), 100001);
});

test('text: safeText replaces control, line separator and direction characters, and cuts a long text', () => {
  const esc = String.fromCharCode(27);
  assert.equal(safeText(`a${esc}b${String.fromCharCode(0x202e)}c${String.fromCharCode(0x2028)}d`), 'a b c d');
  assert.equal(safeText('x'.repeat(50), 10), 'xxxxxxx...');
  assert.equal(safeText(null), 'null');
  assert.equal(flat('  a \n\t b  '), 'a b');
  assert.equal(xmlSafe(`a${String.fromCharCode(0xd800)}b${String.fromCharCode(0xffff)}`), 'a?b?');
  assert.equal(xmlSafe('ok'), 'ok');
  assert.equal(FULL_WIDTH_QUESTION.charCodeAt(0), 0xff1f);
});

test('size: fixed, cell, round, tidy, grouped, plural and listText show numbers the same way on every system', () => {
  assert.equal(fixed(0.66666, 3), '0.667');
  assert.equal(fixed(-0.0001, 2), '0.00', 'a value that rounds to zero has no sign');
  assert.equal(cell(1234567.891, 2), '1,234,567.89');
  assert.equal(cell(-4321.5, 1), '-4,321.5');
  assert.equal(cell(null), '-');
  assert.equal(cell(Number.NaN), '-');
  assert.equal(round(0.12345678, 6), 0.123457);
  assert.deepEqual(tidy({ precision: 2 / 3, fraudAmountCaught: 10.005, alerts: 3, id: 'x' }), { precision: 0.666667, fraudAmountCaught: 10.01, alerts: 3, id: 'x' });
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'rule'), '1 rule');
  assert.equal(plural(2, 'rule'), '2 rules');
  assert.equal(plural(1, 'metric shown', 'metrics shown'), '1 metric shown');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e']), 'a, b, c and 2 more');
  assert.equal(listText(['a', 'b']), 'a and b');
});

test('fields: editDistance counts single-character edits and nearest finds a name within two edits', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(nearest('contry', ['country', 'channel']), 'country');
  assert.equal(nearest('zzzzzz', ['country', 'channel']), null);
  assert.equal(nearest('Country', ['country']), 'country');
});

test('collect: the collector keeps the first thousand findings of a check and counts the rest', () => {
  const c = createCollector();
  for (let i = 0; i < 1005; i += 1) c.add('FRB015', { file: 'transactions', line: i + 1 }, `m${i}`);
  c.add('FRB017', {}, 'x');
  assert.equal(c.findings.filter((f) => f.id === 'FRB015').length, 1000);
  assert.equal(c.omitted.get('FRB015'), 5);
  assert.deepEqual(c.findings.at(-1), { id: 'FRB017', file: null, line: null, column: null, message: 'x', subject: null });
});

test('checks: the check functions report to the function they are given and read nothing else', () => {
  const run = runOf(scenarioText(), rulesText([ngRule({ owner: undefined })]));
  const found = [];
  const add = (id, where, message) => found.push([id, message]);
  checkRules(run.models.rules, run.dataset, add);
  assert.deepEqual(found.map((f) => f[0]), ['FRB005']);
  const data = datasetOf('id,amount,is_fraud\nT1,-5,1\nT2,5,0\n');
  const dataFound = [];
  checkData(data, (id) => dataFound.push(id), { asOf: null, currencyNote: false, minFraud: 20 });
  assert.deepEqual(dataFound, ['FRB020', 'FRB015']);
  const results = [];
  checkResults(run.models.rules, { set: run.results.rules.set, rules: run.results.rules.rules }, (id) => results.push(id));
  assert.deepEqual(results, []);
  const compared = [];
  checkCompare(run.models.rules, { summary: { fraudLost: 3, fraudAmountLost: 10, falseAlarmsAdded: 0, goodAmountAdded: 0 } }, (id) => compared.push(id));
  assert.deepEqual(compared, ['FRB029']);
});

test('report: every writer takes the report object, and the lists and explanations are written in text, markdown and JSON', () => {
  const options = readOptions();
  const checked = runOf(scenarioText(), ngRules());
  const report = buildReport({ files: { transactions: { file: 't.csv', bytes: 1, lines: 1 }, rules: { file: 'r.json', bytes: 1, lines: 1 }, current: null, candidate: null }, checked, version: '1.0.0', options });
  assert.match(toText(report), /^fraud-rule-backtest backtest: t\.csv \+ r\.json\n/);
  assert.match(toMarkdown(report), /^# fraud-rule-backtest backtest: t\.csv/);
  assert.equal(JSON.parse(toJson(report)).tool, 'fraud-rule-backtest');
  assert.equal(JSON.parse(toSarif(report)).version, '2.1.0');
  assert.match(toJunit(report), /<testsuite name="fraud-rules" tests="30"/);
  assert.match(listChecksText(), /FRB001 {2}file-unreadable/);
  assert.match(listChecksMarkdown(), /\| FRB030 \| candidate-adds-false-alarms \| error \| compare \|/);
  assert.equal(JSON.parse(listChecksJson()).length, 30);
  const rule = ruleById('rule-redundant');
  assert.equal(rule.id, 'FRB025');
  assert.equal(ruleById('frb025'), rule);
  assert.equal(ruleById('FRB999'), undefined);
  assert.match(explainText(rule), /^FRB025 rule-redundant\n\nlevel: warning\nkind: results\n/);
  assert.match(explainMarkdown(rule), /^# FRB025 rule-redundant\n/);
  assert.equal(JSON.parse(explainJson(rule)).id, 'FRB025');
});
