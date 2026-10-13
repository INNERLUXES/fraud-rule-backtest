import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, buildReport, readOptions } from '../src/index.js';
import { ARGS, GOOD, compareOf, csvOf, groups, leaf, ngRule, ngRules, rule, rulesText, run, runOf, scenarioText } from './helpers.js';

const json = async (files, args) => JSON.parse((await run(files, [...args, '--json'])).out);
const BAD = { 't.csv': scenarioText(), 'r.json': rulesText([ngRule({ owner: undefined, min_precision: 0.9 })]) };

test('json: the report object has the tool, the command, the inputs, the summary, the results, the checks, the totals and the result', async () => {
  const r = await json(GOOD, ARGS);
  assert.equal(r.tool, 'fraud-rule-backtest');
  assert.equal(r.command, 'backtest');
  assert.deepEqual(Object.keys(r), ['tool', 'version', 'command', 'input', 'evaluated', 'summary', 'results', 'checks', 'totals', 'rules', 'options', 'findings', 'notes', 'notice', 'result']);
  assert.equal(r.input.transactions.format, 'csv');
  assert.equal(r.input.rules.format, 'json');
  assert.equal(r.input.current, null);
  assert.deepEqual(r.evaluated, { transactions: true, rules: true, current: false, candidate: false });
  assert.equal(r.summary.transactions.fraud, 30);
  assert.equal(r.summary.transactions.rows, 140);
  assert.equal(r.checks.length, 30);
  assert.deepEqual(r.result, { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' });
});

test('json: rates are fractions rounded to six decimals and amounts to two', async () => {
  const m = (await json(GOOD, ARGS)).results.rules.rules[0];
  assert.equal(m.precision, 0.666667);
  assert.equal(m.recall, 0.666667);
  assert.equal(m.falsePositiveRate, 0.090909);
  assert.equal(m.alertsPerThousand, 214.285714);
  assert.equal(m.fraudAmountCaught, 10000);
  assert.equal(m.alerts, 30);
});

test('json: every check has a status, and a check that did not run says why', async () => {
  const r = await json(GOOD, ARGS);
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by.FRB019.status, 'skipped');
  assert.equal(by.FRB019.detail, 'no --as-of time was given');
  assert.equal(by.FRB027.status, 'skipped');
  assert.match(by.FRB027.detail, /no max_hold_per_thousand/);
  assert.equal(by.FRB030.status, 'skipped');
  assert.equal(by.FRB001.status, 'pass');
  assert.equal(r.checks.filter((c) => c.status === 'skipped').length, 4);
});

test('json: checks that need a file that could not be read are not evaluated, so a run never passes on what it did not read', async () => {
  const bad = await json({ 't.csv': 'id,amount\nT1,"5\n', 'r.json': ngRules() }, ARGS);
  const by = Object.fromEntries(bad.checks.map((c) => [c.id, c.status]));
  assert.equal(by.FRB001, 'fail');
  for (const id of ['FRB012', 'FRB015', 'FRB008', 'FRB021', 'FRB029']) assert.ok(['not-evaluated', 'skipped'].includes(by[id]), id);
  assert.equal(by.FRB012, 'not-evaluated');
  assert.equal(by.FRB021, 'not-evaluated');
  assert.equal(bad.result.pass, false);
  const noRules = await json({ 't.csv': scenarioText(), 'r.json': '{"rules": 5}' }, ARGS);
  const status = Object.fromEntries(noRules.checks.map((c) => [c.id, c.status]));
  assert.equal(status.FRB005, 'not-evaluated');
  assert.equal(status.FRB021, 'not-evaluated');
  assert.equal(status.FRB012, 'pass');
});

test('text: the head, the tables, the findings with a fix, the notice and the result line', async () => {
  const r = await run(BAD, [...ARGS, '--fail-on', 'warning']);
  assert.match(r.out, /^fraud-rule-backtest backtest: t\.csv \+ r\.json\ntransactions file: t\.csv \(csv, 141 lines, [\d,]+ bytes\)\n/);
  assert.match(r.out, /\nRule results\n/);
  assert.match(r.out, /\nThe whole rule set\n/);
  assert.match(r.out, /\nStrongest action of each alerted transaction\n/);
  assert.match(r.out, /\nChecks \(30\)\n/);
  assert.match(r.out, /\n {2}ERROR {4}FRB024 {2}r\.json:\d+\n {11}The rule "R1" has a precision of 0\.667 \(20 of 30 alerts\), under its min_precision of 0\.9\.\n {11}fix: /);
  assert.match(r.out, /\n {2}WARNING {2}FRB005 {2}r\.json:\d+\n/);
  assert.match(r.out, /\nThis report reads the transactions file and the rules file and nothing else\./);
  assert.match(r.out, /\nRESULT: FAIL - 2 findings at or above warning \(1 error, 1 warning\)\n$/);
});

test('markdown: a heading, tables, and what markdown gives a meaning to is escaped in names from the files', async () => {
  const files = { 't.csv': scenarioText(), 'r.json': rulesText([ngRule({ id: 'a|b*c_d`e<f>[g]', owner: undefined })]) };
  const r = await run(files, [...ARGS, '--format', 'markdown']);
  assert.ok(r.out.startsWith('# fraud-rule-backtest backtest: '));
  assert.match(r.out, /\n## Rule results\n\n\| rule \| action /);
  assert.ok(r.out.includes('a\\|b\\*c\\_d\\`e\\<f\\>\\[g\\]'));
  assert.doesNotMatch(r.out, /a\|b\*c/);
  assert.match(r.out, /\n\| warning \| FRB005 \| r\.json:\d+ \| /);
});

test('sarif: version 2.1.0, thirty rules, and a result for each finding with its line and column', async () => {
  const r = await run(BAD, [...ARGS, '--format', 'sarif']);
  const sarif = JSON.parse(r.out);
  assert.equal(sarif.version, '2.1.0');
  const run0 = sarif.runs[0];
  assert.equal(run0.tool.driver.name, 'fraud-rule-backtest');
  assert.equal(run0.tool.driver.rules.length, 30);
  assert.deepEqual(run0.tool.driver.rules.map((x) => x.id), RULES.map((x) => x.id));
  assert.equal(run0.results.length, 2);
  const res = run0.results.find((x) => x.ruleId === 'FRB024');
  assert.equal(res.level, 'error');
  assert.equal(res.ruleIndex, 23);
  assert.equal(res.locations[0].physicalLocation.artifactLocation.uri, 'r.json');
  assert.ok(res.locations[0].physicalLocation.region.startLine > 0);
  assert.equal(run0.results.find((x) => x.ruleId === 'FRB005').level, 'warning');
  assert.deepEqual(run0.artifacts.map((a) => a.location.uri), ['t.csv', 'r.json']);
});

test('junit: one test case for each check, a failure with the messages, a skip with the reason, an error when a file was not read', async () => {
  const r = await run(BAD, [...ARGS, '--format', 'junit']);
  assert.match(r.out, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<testsuites name="fraud-rule-backtest" tests="30" failures="2" errors="0" time="0">/);
  assert.equal((r.out.match(/<testcase /g) ?? []).length, 30);
  assert.match(r.out, /<testcase classname="fraud-rules" name="FRB024 precision-under-floor" time="0">\n {6}<failure type="FRB024" message="1 finding">r\.json:\d+: The rule &quot;R1&quot; has a precision/);
  assert.match(r.out, /<skipped message="no --as-of time was given"\/>/);
  const broken = await run({ 't.csv': 'id,amount\nT1,"5\n', 'r.json': ngRules() }, [...ARGS, '--format', 'junit']);
  assert.match(broken.out, /<error type="not-evaluated" message="the transactions file could not be read">/);
});

test('every format: control and direction characters in a rule id, an owner and a transaction id are cleaned', async () => {
  const esc = String.fromCharCode(27);
  const bidi = String.fromCharCode(0x202e);
  const files = { 't.csv': scenarioText((rows) => { rows[0].id = `T${esc}[31m1`; rows[1].id = rows[0].id; }), 'r.json': rulesText([ngRule({ id: `R${esc}1${bidi}`, owner: `x${esc}` , min_precision: 0.9 })]) };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const r = await run(files, [...ARGS, '--format', format]);
    assert.doesNotMatch(r.out, new RegExp(`${esc}|${bidi}`), format);
  }
});

test('more than a thousand findings of one check are capped, counted and said so', () => {
  const rows = groups([1200, { amount: '-1', is_fraud: '0', country: 'DE' }], [30, { is_fraud: '1', country: 'NG' }]);
  const checked = runOf(csvOf(rows), ngRules());
  assert.equal(checked.findings.filter((f) => f.id === 'FRB015').length, 1000);
  const report = buildReport({ files: { transactions: { file: 't.csv', bytes: 1, lines: 1 }, rules: { file: 'r.json', bytes: 1, lines: 1 }, current: null, candidate: null }, checked, version: '0.0.0', options: readOptions() });
  assert.equal(report.checks.find((c) => c.id === 'FRB015').findings, 1200);
  assert.ok(report.notes.includes('200 more findings of FRB015 are not listed; the first 1,000 are'));
  assert.equal(report.findings.filter((f) => f.id === 'FRB015').length, 1000);
});

test('the same input gives the same report every time, in every format', async () => {
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const a = await run(BAD, [...ARGS, '--format', format]);
    const b = await run(BAD, [...ARGS, '--format', format]);
    assert.equal(a.out, b.out, format);
  }
});

test('compare: the report holds both sets, the comparison and the rules between them', async () => {
  const candidate = rulesText([ngRule(), rule('R2', leaf('amount', 'between', [35, 45]))]);
  const checked = compareOf(scenarioText(), ngRules(), candidate);
  assert.deepEqual(Object.keys(checked.results), ['current', 'candidate', 'comparison']);
  const r = await json({ 't.csv': scenarioText(), 'a.json': ngRules(), 'b.json': candidate }, ['compare', 't.csv', '--current', 'a.json', '--candidate', 'b.json']);
  assert.equal(r.command, 'compare');
  assert.equal(r.results.comparison.summary.fraudGained, 10);
  assert.deepEqual(r.results.comparison.rules.added, ['R2']);
  assert.equal(r.results.candidate.rules.length, 2);
  assert.equal(r.results.current.rules.length, 1);
});

test('the notice says it is a replay and not a forecast, in every report', async () => {
  const text = (await run(GOOD, ARGS)).out;
  assert.match(text, /not a forecast of how they will behave on future transactions/);
  assert.match(text, /not a statement that the labels are complete or right/);
});
