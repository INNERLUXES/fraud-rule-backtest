// Shared test helpers: transactions and rules built inline as objects or as text, checked in memory or written into a temporary
// folder that is removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux,
// macOS and Windows. The line a test expects is found with lineOf(), which counts lines the way the readers do, so a test never
// holds a line number worked out by hand for one system only. No test reads the clock, the time zone or the locale. Every rule,
// owner and transaction in the tests is made up. A year is built from parts (yr()), so no file of this repository holds one.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { buildDataset, checkText, main, readOptions, readTransactions } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'fraud-rule-backtest-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

// A year written from parts, so that no number that reads like a year stands in a file of this repository.
export const yr = (n) => String(2 * 1000 + n);

// A transaction: the fields of a made-up payment, with the fields changed by `over`. An undefined value takes the field out.
export function row(over = {}) {
  const out = { id: 'T1', timestamp: '1700000000', amount: '10.00', currency: 'EUR', channel: 'web', country: 'DE', merchant_category: 'grocery', is_fraud: '0', ...over };
  for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k];
  return out;
}

// The CSV text of rows (objects), with the fields of the first row unless fields are given.
export function csvOf(rows, fields = Object.keys(rows[0])) {
  const quote = (v) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return `${[fields.join(','), ...rows.map((r) => fields.map((f) => quote(String(r[f] ?? ''))).join(','))].join('\n')}\n`;
}

// Rows from groups: each group is [count, over]. Ids run T1, T2, ... and times run on from 1700000000.
export function groups(...specs) {
  const rows = [];
  for (const [count, over] of specs) {
    for (let i = 0; i < count; i += 1) rows.push(row({ id: `T${rows.length + 1}`, timestamp: String(1700000000 + rows.length * 60), ...over }));
  }
  return rows;
}

// The made-up scenario most tests use: 140 labelled transactions, 30 of them fraud.
//   20 fraud from NG (amount 500), 10 fraud from DE (amount 40), 100 good from DE (amount 20), 10 good from NG (amount 30).
export function scenario() {
  return groups(
    [20, { is_fraud: '1', country: 'NG', amount: '500.00' }],
    [10, { is_fraud: '1', country: 'DE', amount: '40.00' }],
    [100, { is_fraud: '0', country: 'DE', amount: '20.00' }],
    [10, { is_fraud: '0', country: 'NG', amount: '30.00' }]
  );
}

// The text of the scenario after change(rows) has edited a copy of it.
export function scenarioText(change = () => {}) {
  const rows = scenario();
  change(rows);
  return csvOf(rows);
}

// Conditions.
export const leaf = (field, op, value) => ({ field, op, value });
export const all = (...items) => ({ all: items });
export const any = (...items) => ({ any: items });
export const not = (item) => ({ not: item });

// A rule that passes every check on the scenario, with the fields changed by `over`.
export function rule(id, when, over = {}) {
  const out = { id, name: `Rule ${id}`, owner: 'Risk team', action: 'flag', when, ...over };
  for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k];
  return out;
}

// The text (JSON) of a rule set.
export function rulesText(rules, over = {}) {
  const out = { name: 'Test rules', rules, ...over };
  for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k];
  return JSON.stringify(out, null, 2);
}

// A rule set with one rule, on the country NG, that passes every check on the scenario.
export const ngRule = (over = {}) => rule('R1', leaf('country', 'eq', 'NG'), over);
export const ngRules = (over) => rulesText([ngRule()], over);

// The dataset of a transactions text; throws when it cannot be read.
export function datasetOf(text, format = 'csv') {
  const add = () => {};
  const raw = readTransactions(text, add, { format });
  if (raw === null) throw new Error('the transactions cannot be read');
  const built = buildDataset(raw);
  if (built.problems) throw new Error(built.problems[0].message);
  return built;
}

// The whole back-test in memory.
export const runOf = (transactions, rules, options = {}, extra = {}) => checkText({ transactions, rules, current: null, candidate: null }, { command: 'backtest', options: readOptions(options), transactionsPath: 't.csv', ...extra });

// The whole comparison in memory.
export const compareOf = (transactions, current, candidate, options = {}) => checkText({ transactions, rules: null, current, candidate }, { command: 'compare', options: readOptions(options), transactionsPath: 't.csv' });

// The whole sweep in memory.
export const sweepOf = (transactions, options = {}) => checkText({ transactions, rules: null, current: null, candidate: null }, { command: 'sweep', options: readOptions(options), transactionsPath: 't.csv' });

// The findings of a run.
export const findingsOf = (transactions, rules, options) => runOf(transactions, rules, options).findings;

// The ids of the findings of a run, once each and in order.
export const idsOf = (transactions, rules, options) => [...new Set(findingsOf(transactions, rules, options).map((f) => f.id))].sort();

// The findings of one check.
export const ofCheck = (transactions, rules, id, options) => findingsOf(transactions, rules, options).filter((f) => f.id === id);

// The ids of the findings on the scenario after a change to the rules (a list of rules) and to the rule set.
export const idsAfterRules = (rules, over, options) => idsOf(scenarioText(), rulesText(rules, over), options);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

export const GOOD = { 't.csv': scenarioText(), 'r.json': ngRules() };
export const ARGS = ['t.csv', '--rules', 'r.json'];

// A tree as plain data, for tests of the readers.
export function dump(node) {
  const done = [];
  const todo = [[node, (v) => done.push(v)]];
  while (todo.length) {
    const [n, set] = todo.pop();
    if (n.t === 's') set(n.v);
    else if (n.t === 'q') {
      const arr = [];
      set(arr);
      [...n.items.entries()].reverse().forEach(([i, item]) => todo.push([item, (v) => { arr[i] = v; }]));
    } else {
      const obj = Object.create(null);
      set(obj);
      for (const [k, e] of [...n.entries].reverse()) todo.push([e.node, (v) => { obj[k] = v; }]);
    }
  }
  return done[0];
}

// A tree as a plain object, for deepStrictEqual.
export const plain = (node) => JSON.parse(JSON.stringify(dump(node)));

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
