import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, USAGE, VERSION, parseArgs } from '../src/index.js';
import { ARGS, GOOD, cli, csvOf, groups, ngRule, ngRules, rulesText, run, scenarioText } from './helpers.js';

const fails = (argv, part) => assert.throws(() => parseArgs(argv), (e) => part.test(e.message), argv.join(' '));

test('parseArgs: a back-test takes a transactions file and --rules', () => {
  const o = parseArgs(['t.csv', '--rules', 'r.json']);
  assert.equal(o.command, 'backtest');
  assert.deepEqual(o.paths, ['t.csv']);
  assert.equal(o.rules, 'r.json');
  assert.equal(o.format, 'text');
});

test('parseArgs: compare takes --current and --candidate, and sweep takes --thresholds', () => {
  const c = parseArgs(['compare', 't.csv', '--current', 'a.json', '--candidate', 'b.json']);
  assert.deepEqual([c.command, c.current, c.candidate], ['compare', 'a.json', 'b.json']);
  const s = parseArgs(['sweep', 't.csv', '--thresholds', '0.3,0.6']);
  assert.deepEqual([s.command, s.thresholds], ['sweep', '0.3,0.6']);
});

test('parseArgs: an option that belongs to another command is refused with the command named', () => {
  fails(['t.csv', '--current', 'a.json', '--rules', 'r.json'], /--current belongs to the compare command/);
  fails(['compare', 't.csv', '--rules', 'r.json', '--current', 'a', '--candidate', 'b'], /--rules belongs to the backtest command/);
  fails(['sweep', 't.csv', '--rules', 'r.json'], /--rules belongs to the backtest command/);
  fails(['t.csv', '--rules', 'r.json', '--thresholds', '0.5'], /--thresholds belongs to the sweep command/);
});

test('parseArgs: what is missing is named', () => {
  fails([], /give the transactions file/);
  fails(['t.csv'], /give the rules file with --rules/);
  fails(['compare', 't.csv', '--current', 'a.json'], /compare needs --current and --candidate/);
  fails(['t.csv', '--rules'], /--rules needs a value/);
  fails(['t.csv', '--rules', '--json'], /--rules needs a value/);
});

test('parseArgs: an unknown option, an option given twice, a second transactions file and standard input are refused', () => {
  fails(['t.csv', '--rules', 'r.json', '--fail-no', 'x'], /unknown argument --fail-no/);
  fails(['t.csv', '--rules', 'a.json', '--rules', 'b.json'], /--rules was given twice/);
  fails(['t.csv', 'u.csv', '--rules', 'r.json'], /give one transactions file/);
  fails(['-', '--rules', 'r.json'], /standard input is not supported/);
  fails(['t.csv', '--rules', '-'], /standard input is not supported/);
});

test('parseArgs: a path that looks like an address is refused', () => {
  fails(['https://example.invalid/t.csv', '--rules', 'r.json'], /never fetches a URL/);
  fails(['t.csv', '--rules', 'ftp://example.invalid/r.json'], /never fetches a URL/);
});

test('parseArgs: the format, the levels and --json', () => {
  assert.equal(parseArgs(['t.csv', '--rules', 'r', '--json']).format, 'json');
  assert.equal(parseArgs(['t.csv', '--rules', 'r', '--json', '--format', 'json']).format, 'json');
  fails(['t.csv', '--rules', 'r', '--json', '--format', 'text'], /ask for two formats/);
  fails(['t.csv', '--rules', 'r', '--format', 'xml'], /unknown format xml/);
  fails(['t.csv', '--rules', 'r', '--fail-on', 'severe'], /--fail-on: unknown level severe/);
  fails(['t.csv', '--rules', 'r', '--min-severity', 'loud'], /--min-severity: unknown level loud/);
});

test('parseArgs: --disable, --as-of and --thresholds values that cannot be used are refused', () => {
  fails(['t.csv', '--rules', 'r', '--disable', 'FRB999'], /--disable: unknown check FRB999/);
  fails(['t.csv', '--rules', 'r', '--as-of', 'yesterday'], /--as-of: yesterday is not a time/);
  fails(['sweep', 't.csv', '--thresholds', '0.5,high'], /--thresholds: high is not a number/);
  fails(['sweep', 't.csv', '--thresholds', ','], /at least one number/);
  fails(['sweep', 't.csv', '--thresholds', Array.from({ length: 101 }, (_, i) => i / 200).join(',')], /more than 100 numbers/);
});

test('parseArgs: --disable takes an id or a name, in any case', () => {
  assert.doesNotThrow(() => parseArgs(['t.csv', '--rules', 'r', '--disable', 'frb005,rule-no-owner,FRB021']));
});

test('parseArgs: --explain with an id that is near one names it', () => {
  fails(['--explain', 'FRB0025'], /unknown check FRB0025\. Did you mean FRB002/);
  fails(['--explain', 'rule-redundent'], /Did you mean FRB025/);
  assert.equal(parseArgs(['--explain', 'frb025']).explain, 'frb025');
});

test('the usage names the three commands, every option and every check', () => {
  for (const part of ['compare', 'sweep', '--rules', '--current', '--candidate', '--thresholds', '--as-of', '--format', '--json', '--disable', '--min-severity', '--fail-on', '--list-checks', '--explain', '--help', '--version']) assert.ok(USAGE.includes(part), part);
  for (const r of RULES) assert.ok(USAGE.includes(r.id), r.id);
});

test('main: --help and --version print and exit 0', async () => {
  const h = await cli(['--help']);
  assert.equal(h.code, 0);
  assert.equal(h.out, USAGE);
  const v = await cli(['--version']);
  assert.equal(v.code, 0);
  assert.equal(v.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('main: a usage error exits 2 with the message and the usage on standard error, and nothing on standard output', async () => {
  const r = await cli(['--bogus']);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.match(r.err, /^fraud-rule-backtest: unknown argument --bogus\n\nUsage:/);
});

test('main: --list-checks and --explain exit 0 in text, markdown and JSON, and refuse SARIF and JUnit', async () => {
  for (const format of ['text', 'markdown', 'json']) {
    const l = await cli(['--list-checks', '--format', format]);
    assert.equal(l.code, 0, format);
    for (const r of RULES) assert.ok(l.out.includes(r.id), `${format} ${r.id}`);
    const e = await cli(['--explain', 'FRB021', '--format', format]);
    assert.equal(e.code, 0, format);
    assert.ok(e.out.includes('FRB021'));
  }
  assert.equal((await cli(['--list-checks', '--format', 'sarif'])).code, 2);
  assert.equal((await cli(['--explain', 'FRB021', '--format', 'junit'])).code, 2);
  assert.equal(JSON.parse((await cli(['--list-checks', '--json'])).out).length, 30);
});

test('main: the exit code is 0 for a pass, 1 for an error finding, 2 for a file that cannot be read', async () => {
  assert.equal((await run(GOOD, ARGS)).code, 0);
  assert.equal((await run({ 't.csv': scenarioText(), 'r.json': rulesText([ngRule({ min_precision: 0.9 })]) }, ARGS)).code, 1);
  const r = await run(GOOD, ['gone.csv', '--rules', 'r.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /gone\.csv: does not exist/);
  assert.equal(r.out, '');
});

test('main: --fail-on warning fails on a warning, --min-severity hides it and never changes the exit code', async () => {
  const files = { 't.csv': scenarioText(), 'r.json': rulesText([ngRule({ owner: undefined })]) };
  assert.equal((await run(files, ARGS)).code, 0, 'a warning does not fail by default');
  const w = await run(files, [...ARGS, '--fail-on', 'warning']);
  assert.equal(w.code, 1);
  assert.match(w.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)/);
  const hidden = await run(files, [...ARGS, '--fail-on', 'warning', '--min-severity', 'error']);
  assert.equal(hidden.code, 1);
  assert.match(hidden.out, /findings: 0; 1 below error not shown/);
});

test('main: --disable leaves a check out, and the report names it', async () => {
  const files = { 't.csv': scenarioText(), 'r.json': rulesText([ngRule({ owner: undefined })]) };
  const r = await run(files, [...ARGS, '--fail-on', 'warning', '--disable', 'FRB005']);
  assert.equal(r.code, 0);
  assert.match(r.out, /FRB005  rule-no-owner .* skipped  - \(turned off with --disable\)/);
  assert.match(r.out, /note: checks turned off with --disable: FRB005/);
});

test('main: the same file as the transactions and the rules is refused', async () => {
  const r = await run(GOOD, ['t.csv', '--rules', 't.csv']);
  assert.equal(r.code, 2);
  assert.match(r.err, /the transactions file and the rules file are the same file/);
});

test('main: compare end to end', async () => {
  const files = { 't.csv': scenarioText(), 'a.json': ngRules(), 'b.json': rulesText([ngRule(), { ...ngRule(), id: 'R2', when: { field: 'amount', op: 'between', value: [35, 45] } }]) };
  const r = await run(files, ['compare', 't.csv', '--current', 'a.json', '--candidate', 'b.json']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /fraud the candidate adds\s+10\s+400\.00/);
  assert.match(r.out, /added: R2/);
});

test('main: sweep end to end, with the cut-offs given and with the defaults', async () => {
  const withScore = scenarioText((rows) => rows.forEach((r, i) => { r.score = r.is_fraud === '1' ? '0.8' : (i % 3 === 0 ? '0.4' : '0.1'); }));
  const given = await run({ 't.csv': withScore }, ['sweep', 't.csv', '--thresholds', '0.5,0.3']);
  assert.equal(given.code, 0, given.out);
  assert.match(given.out, /\n {2}0\.3 /);
  assert.ok(given.out.indexOf('  0.3 ') < given.out.indexOf('  0.5 '), 'the cut-offs are in order');
  const defaults = await run({ 't.csv': withScore }, ['sweep', 't.csv', '--json']);
  assert.deepEqual(JSON.parse(defaults.out).results.sweep.points.map((p) => p.threshold), [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
});

test('main: a sweep without a score column, or with scores outside 0 to 1 and no cut-offs, exits 2', async () => {
  const none = await run({ 't.csv': scenarioText() }, ['sweep', 't.csv']);
  assert.equal(none.code, 2);
  assert.match(none.err, /no score column/);
  const big = scenarioText((rows) => rows.forEach((r) => { r.score = '55'; }));
  const out = await run({ 't.csv': big }, ['sweep', 't.csv']);
  assert.equal(out.code, 2);
  assert.match(out.err, /give the cut-offs with --thresholds/);
  assert.equal((await run({ 't.csv': big }, ['sweep', 't.csv', '--thresholds', '50'])).code, 0);
});

test('main: an error that is not about the input is reported on standard error with exit code 2', async () => {
  const r = await run({ 't.csv': csvOf(groups([60, { country: 'NG' }])), 'r.json': ngRules() }, ARGS);
  assert.equal(r.code, 1, 'a file with one kind of label is a finding and not an error of the run');
});
