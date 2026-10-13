// Runs the README examples, checks that they report what the README shows, and writes the reports of the made-up files to
// examples/output. CI runs it and then fails if those files changed, so the example output in the repository is always the real
// output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Every path is relative to the root of the repository.
const TX = 'examples/good/transactions.csv';
const TX_LINES = 'examples/good/transactions.jsonl';
const CURRENT = 'examples/good/rules-current.json';
const CANDIDATE = 'examples/good/rules-candidate.json';
export const GOOD = [TX, '--rules', CURRENT];
export const GOOD_LINES = [TX_LINES, '--rules', CANDIDATE];
export const GOOD_COMPARE = ['compare', TX, '--current', CURRENT, '--candidate', CANDIDATE];
export const GOOD_SWEEP = ['sweep', TX];
export const BAD = ['examples/bad/transactions.csv', '--rules', 'examples/bad/rules.json', '--as-of', '1800000000'];
export const BAD_RESULTS = [TX, '--rules', 'examples/bad/rules-results.json'];
export const BAD_COMPARE = ['compare', TX, '--current', CURRENT, '--candidate', 'examples/bad/rules-candidate.json'];
export const BAD_SYNTAX = [TX, '--rules', 'examples/bad/rules-syntax-error.json'];
export const BAD_SMALL = ['examples/bad/transactions-small.csv', '--rules', CURRENT];
export const BAD_NO_LABEL = ['examples/bad/transactions-no-label.csv', '--rules', CURRENT];
export const BAD_ONE_SIDED = ['examples/bad/transactions-one-sided.csv', '--rules', CURRENT];
export const EXPLAIN = ['--explain', 'FRB025'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the good rules on the good transactions: the counts, the table of the rules and the result.
export const GOOD_EXPECTED = [
  'transactions: 405 rows, 405 labelled (47 fraud, 358 not fraud)',
  'rules: Current rule set (made up): 4 rules',
  'findings: 0',
  'R004  block        9      9          0      1.000   0.191    0.000       22.2     10,211.06         0.00  5',
  'fraud missed by every rule          14',
  'RESULT: PASS - no finding at or above error'
];

// What the README says of the rules with mistakes in them, set against the transactions with mistakes in them.
export const BAD_EXPECTED = [
  'The rule id "r001" is used by two rules: at line 6 and at line 20.',
  'The rule "R003" has no action; it needs flag, hold or block.',
  'The rule "R004" uses the field "amout", which is not a column of the transactions file; the nearest column is "amount".',
  'The transaction "T0011" has the amount -25.00, which is negative; it counts as zero in the sums.',
  'The transaction id "T0070" is used on line 71 and on line 72.',
  'The transactions hold 2 currencies (EUR and GBP) and the rules file has no currency_note',
  'The label "maybe" is not recognised on 1 transaction',
  'is dated after the --as-of time',
  'RESULT: FAIL'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const good = await run(GOOD);
  process.stdout.write(good.out);
  expect('good rules on good transactions', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  expect('good candidate on JSON lines', await run(GOOD_LINES), 0, ['transactions: 405 rows, 405 labelled (47 fraud, 358 not fraud)', 'findings: 0'], ['ERROR    ', 'RESULT: FAIL']);
  expect('good comparison', await run(GOOD_COMPARE), 0, [
    'fraud the candidate loses                     0',
    'false alarms the candidate adds               6',
    'added: R005',
    'findings: 0'
  ], ['ERROR    ']);
  expect('good sweep', await run(GOOD_SWEEP), 0, ['Threshold sweep on 405 scored transactions (47 fraud)', '0.5      37         37          0      1.000   0.787'], ['ERROR    ']);
  // The good files also pass when warnings and notes fail the run.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // The rules and the transactions with mistakes.
  expect('bad rules and bad transactions', await run(BAD), 1, BAD_EXPECTED, ['PASS']);
  expect('rules that behave badly', await run(BAD_RESULTS), 1, [
    'The rule "B001" never fires on the 405 labelled transactions.',
    'The rule "B002" fires on 17 transactions and catches none of the 47 fraud cases.',
    'The rule "B003" fires on 348.1 of every 1,000 transactions, above its max_alert_rate of 100.',
    'The rule "B003" has a precision of 0.156 (22 of 141 alerts), under its min_precision of 0.5.',
    'The rule "B005" catches 7 fraud cases and every one is also caught by another rule.',
    'The rule "B006" blocks and has a precision of 0.261 (18 of 69 alerts), under the block floor of 0.9.',
    'The hold queue takes 271.6 of every 1,000 transactions',
    'The rule "B007" caught only 1 fraud case in 3 alerts; low evidence'
  ], ['PASS']);
  expect('candidate that loses fraud', await run(BAD_COMPARE), 1, [
    'The candidate set loses 5 fraud cases that the current set catches',
    'The candidate set adds 28 false alarms that the current set does not raise'
  ], ['PASS']);
  expect('rules that cannot be read', await run(BAD_SYNTAX), 1, ['The rules file cannot be read as JSON: a comma or a closing } was expected.', 'examples/bad/rules-syntax-error.json:8'], []);
  expect('too few fraud cases', await run(BAD_SMALL), 1, ['Only 3 of 70 labelled transactions are fraud (the limit is 20)'], []);
  expect('no label column', await run(BAD_NO_LABEL), 1, ['The transactions file has no label column'], ['PASS']);
  expect('one-sided labels', await run(BAD_ONE_SIDED), 1, ['none of the 40 labelled transactions is fraud'], ['PASS']);
  // A file that is not there stops the run with no report, and so does an option that cannot be used.
  expect('missing file', await run(['examples/none/transactions.csv', '--rules', CURRENT]), 2, ['examples/none/transactions.csv: does not exist'], [], 'err');
  expect('check that does not exist', await run([...GOOD, '--disable', 'no-such-check']), 2, ['--disable: unknown check no-such-check'], [], 'err');

  // The README shows the head of the report of the good run, one table, the tail, and two findings of the bad run.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = good.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l === 'Rule results')).join('\n').trimEnd();
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the good run differs from a real run');
  const start = lines.findIndex((l) => l === 'Rule results') + 2;
  const tableText = lines.slice(start, lines.findIndex((l) => l === 'The whole rule set') - 3).join('\n');
  if (!readme.includes(tableText)) problems.push('README: the table of rule results in the sample output differs from a real run');
  const tail = lines.slice(-4).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the good run differs from a real run');
  const bad = await run(BAD_RESULTS);
  const badLines = bad.out.split('\n');
  for (const id of ['FRB023', 'FRB026']) {
    const i = badLines.findIndex((l) => l.includes(id) && l.includes('examples/bad/rules-results.json'));
    const sample = badLines.slice(i, i + 3).join('\n');
    if (i < 0 || !readme.includes(sample)) problems.push(`README: the sample finding of ${id} differs from a real run`);
  }
  const badTail = badLines.slice(-4).join('\n');
  if (!readme.includes(badTail)) problems.push('README: the tail of the sample output of the bad run differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  const outputs = [
    ['good.txt', GOOD, 0],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['good.junit.xml', [...GOOD, '--format', 'junit'], 0],
    ['good-json-lines.txt', GOOD_LINES, 0],
    ['good-compare.txt', GOOD_COMPARE, 0],
    ['good-compare.md', [...GOOD_COMPARE, '--format', 'markdown'], 0],
    ['good-compare.json', [...GOOD_COMPARE, '--json'], 0],
    ['good-sweep.txt', GOOD_SWEEP, 0],
    ['good-sweep.json', [...GOOD_SWEEP, '--json'], 0],
    ['bad.txt', BAD, 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad.json', [...BAD, '--json'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['bad.junit.xml', [...BAD, '--format', 'junit'], 1],
    ['bad-results.txt', BAD_RESULTS, 1],
    ['bad-compare.txt', BAD_COMPARE, 1],
    ['bad-syntax-error.txt', BAD_SYNTAX, 1],
    ['bad-few-fraud-cases.txt', BAD_SMALL, 1],
    ['bad-no-label.txt', BAD_NO_LABEL, 1],
    ['bad-one-sided.txt', BAD_ONE_SIDED, 1],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.md', ['--list-checks', '--format', 'markdown'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0],
    ['explain-FRB025.txt', EXPLAIN, 0],
    ['explain-FRB025.md', [...EXPLAIN, '--format', 'markdown'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
