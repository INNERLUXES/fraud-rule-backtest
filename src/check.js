// A run: read the transactions file and the rules file (or the two rules files of a comparison), replay the rules, check everything,
// and build the report object that the formats write.

import { MAX_RUNS, replay, runsOf, sweep } from './backtest.js';
import { checkCompare, checkData, checkResults, checkRules } from './checks.js';
import { createCollector, show } from './collect.js';
import { compareRuns, diffRules } from './compare.js';
import { buildDataset, columnOf } from './dataset.js';
import { COMMANDS, DEFAULT_THRESHOLDS, LEVELS, LIMITS as WORK_LIMITS, NOTICE } from './data.js';
import { nearest } from './fields.js';
import { InputError, displayPath, locateInput, readInputText } from './files.js';
import { parseJson } from './json.js';
import { ParseError } from './nodes.js';
import { RULES, decide, ruleById } from './rules.js';
import { readRuleSet } from './ruleset.js';
import { plural, tidy } from './size.js';
import { parseNumber, parseTime } from './time.js';
import { detectTransactionsFormat, readTransactions } from './transactions.js';

export { InputError };

export const LIMITS = { ...WORK_LIMITS };

const clean = (t, max = 900) => show(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };
const KIND_ORDER = { file: 0, rules: 1, data: 2, results: 3, compare: 4 };
const FILE_ORDER = { transactions: 0, rules: 1, current: 2, candidate: 3 };
const ids = (kind) => RULES.filter((r) => r.kind === kind).map((r) => r.id);
const RULE_CHECKS = ids('rules');
const DATA_CHECKS = ids('data');
const RESULT_CHECKS = ids('results');
const COMPARE_CHECKS = ids('compare');
const NEEDS_DATA = ['FRB008', 'FRB009'];

// A comma-separated list option: the entries, trimmed, without the empty ones.
function entries(flag, given) {
  const items = String(given ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (items.length > 200) throw new Error(`${flag}: more than 200 entries`);
  return items;
}

// The options of a run, each given as text or left to its default. A value that cannot be used throws an Error whose message says
// which.
export function readOptions({ disable = null, asOf = null, thresholds = null } = {}) {
  const off = entries('--disable', disable);
  const resolved = [];
  for (const id of off) {
    const rule = ruleById(id);
    if (rule === undefined) {
      const near = nearest(id, [...RULES.map((r) => r.id.toLowerCase()), ...RULES.map((r) => r.name)], 6);
      throw new Error(`--disable: unknown check ${show(id, 60)}${near ? `. Did you mean ${ruleById(near).id}?` : ''} (--list-checks lists them)`);
    }
    resolved.push(rule.id);
  }
  let time = null;
  if (asOf !== null) {
    time = parseTime(asOf);
    if (time === null) throw new Error(`--as-of: ${show(asOf, 60)} is not a time; give seconds since the epoch or an ISO 8601 text such as YYYY-MM-DDTHH:MM:SSZ`);
  }
  let cuts = null;
  if (thresholds !== null) {
    const parts = entries('--thresholds', thresholds);
    if (parts.length === 0) throw new Error('--thresholds needs at least one number');
    if (parts.length > WORK_LIMITS.maxThresholds) throw new Error(`--thresholds: more than ${WORK_LIMITS.maxThresholds} numbers`);
    cuts = parts.map((p) => {
      const n = parseNumber(p);
      if (n === null) throw new Error(`--thresholds: ${show(p, 40)} is not a number`);
      return n;
    });
    cuts = [...new Set(cuts)].sort((a, b) => a - b);
  }
  return { disable: new Set(resolved), disableList: resolved, asOf: time, asOfText: asOf, thresholds: cuts };
}

// The tree of a JSON text, or null after a FRB001 finding.
function treeOf(text, file, add) {
  try {
    return parseJson(text, WORK_LIMITS);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    add('FRB001', { file, line: error.line, column: error.column }, `The ${file === 'transactions' ? 'file' : 'rules file'} cannot be read as JSON: ${error.message}.`);
    return null;
  }
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// The summary of the transactions: the rows, the labels, the sums and the fields.
function summarize(dataset, skipped) {
  const n = dataset.rows;
  let fraud = 0;
  let good = 0;
  let fraudAmount = 0;
  let goodAmount = 0;
  for (const i of dataset.labelled) {
    const a = Number.isNaN(dataset.amounts[i]) ? 0 : dataset.amounts[i];
    if (dataset.labels[i] === 1) {
      fraud += 1;
      fraudAmount += a;
    } else {
      good += 1;
      goodAmount += a;
    }
  }
  const currency = dataset.roles.currency === null ? [] : [...new Set(columnOf(dataset, dataset.roles.currency).raw.filter((c) => c !== '').map((c) => c.toUpperCase()))].sort();
  return {
    rows: n,
    skippedRows: skipped,
    labelled: fraud + good,
    fraud,
    notFraud: good,
    unlabelled: n - fraud - good,
    fraudAmount,
    goodAmount,
    currencies: currency.map((c) => clean(c, 12)),
    columns: dataset.fields.map((f) => ({ name: clean(f, 80), type: columnOf(dataset, f).type })),
    roles: Object.fromEntries(Object.entries(dataset.roles).map(([k, v]) => [k, v === null ? null : clean(v, 80)]))
  };
}

// The thresholds of a sweep: the ones given, or the default ones when every score lies between 0 and 1.
function thresholdsOf(dataset, given) {
  if (given !== null) return given;
  let any = false;
  for (const i of dataset.labelled) {
    const s = dataset.scores[i];
    if (Number.isNaN(s)) continue;
    any = true;
    if (s < 0 || s > 1) throw new InputError(['the scores are not all between 0 and 1; give the cut-offs with --thresholds']);
  }
  if (!any) throw new InputError(['no labelled transaction has a numeric score; the sweep needs a score column']);
  return DEFAULT_THRESHOLDS;
}

// The findings and results for the text of the files. input is { transactions, rules, current, candidate }, each a text or null;
// paths names the transactions file for its format. Returns the pieces that buildReport and the formats use.
export function checkText(input, { command = 'backtest', options = readOptions(), transactionsPath = '', limits = WORK_LIMITS } = {}) {
  if (!COMMANDS.includes(command)) throw new Error(`unknown command ${show(command, 40)}`);
  const collector = createCollector();
  const { notes } = collector;
  const add = (id, where, message, subject = null) => {
    if (!options.disable.has(id)) collector.add(id, where, message, subject);
  };
  const state = { transactions: input.transactions === null ? 'absent' : 'unreadable' };
  let dataset = null;
  let format = null;
  let skipped = 0;
  if (input.transactions !== null) {
    format = detectTransactionsFormat(input.transactions, transactionsPath);
    const raw = readTransactions(input.transactions, add, { format, limits });
    if (raw !== null) {
      skipped = raw.skipped;
      const built = buildDataset(raw);
      if (built.problems) {
        for (const p of built.problems) add('FRB001', { file: 'transactions', line: p.line, column: 1 }, `The transactions file cannot be read as a table: ${p.message}`);
      } else {
        dataset = built;
        state.transactions = 'read';
      }
    }
  }
  const models = {};
  const files = command === 'compare' ? ['current', 'candidate'] : command === 'backtest' ? ['rules'] : [];
  for (const file of files) {
    state[file] = input[file] === null ? 'absent' : 'unreadable';
    if (input[file] === null) continue;
    const root = treeOf(input[file], file, add);
    if (root === null) continue;
    const model = readRuleSet(root, add, { file, limits });
    if (model !== null) {
      models[file] = model;
      state[file] = 'read';
    }
  }
  const modelList = Object.values(models);
  let summary = null;
  let results = null;
  let runs = null;
  if (dataset !== null) {
    summary = summarize(dataset, skipped);
    checkData(dataset, add, {
      asOf: options.asOf,
      currencyNote: modelList.some((m) => m.currencyNote !== ''),
      minFraud: (models.candidate ?? models.rules ?? models.current)?.limit('min_fraud_cases') ?? 20
    });
    if (dataset.roles.amount === null) notes.push('the transactions file has no amount column, so every amount shows as 0');
  } else notes.push('no check of the transactions ran because the transactions file could not be read');
  for (const model of modelList) checkRules(model, dataset, add);
  const usable = dataset !== null && summary.fraud > 0 && summary.notFraud > 0;
  if (command === 'sweep') {
    if (usable) {
      if (dataset.roles.score === null) throw new InputError(['the transactions file has no score column; the sweep needs one']);
      results = { sweep: sweep(dataset, thresholdsOf(dataset, options.thresholds)) };
      if (results.sweep.leftOut > 0) notes.push(`${results.sweep.leftOut.toLocaleString('en-US')} labelled transactions have no numeric score and are left out of the sweep`);
    }
  } else if (usable && files.every((f) => models[f] !== undefined)) {
    const need = files.map((f) => runsOf(dataset, models[f])).reduce((a, b) => a + b, 0);
    if (need > MAX_RUNS) throw new InputError([`the replay needs ${need.toLocaleString('en-US')} rule runs, more than the limit of ${MAX_RUNS.toLocaleString('en-US')}; use fewer rules or fewer transactions`]);
    runs = {};
    for (const f of files) runs[f] = replay(dataset, models[f]);
    const judged = command === 'compare' ? 'candidate' : 'rules';
    checkResults(models[judged], runs[judged], add);
    if (command === 'compare') {
      const diff = diffRules(models.current, models.candidate);
      const cmp = compareRuns(dataset, runs.current, runs.candidate, diff);
      checkCompare(models.candidate, cmp, add);
      results = { current: runs.current, candidate: runs.candidate, comparison: cmp };
    } else results = { rules: runs.rules };
    for (const f of files) {
      const broken = runs[f].rules.filter((m, i) => models[f].rules[i].broken || m.unevaluable > 0);
      if (broken.length > 0) notes.push(`${plural(broken.length, 'rule')} of the ${f === 'rules' ? 'rules' : f} file could not be fully evaluated and ${broken.length === 1 ? 'is' : 'are'} replayed as ${broken.length === 1 ? 'a rule' : 'rules'} that never ${broken.length === 1 ? 'fires' : 'fire'}: ${broken.slice(0, 5).map((m) => m.id).join(', ')}${broken.length > 5 ? ' and more' : ''}`);
    }
  } else if (dataset !== null && !usable && command !== 'sweep') notes.push('the rules were not replayed because the labels cannot be used (see FRB012 and FRB013)');
  if (options.disable.size > 0) notes.push(`checks turned off with --disable: ${options.disableList.join(', ')}`);
  return { format, command, dataset, models, summary, results, findings: collector.findings, notes, omitted: collector.omitted, state, usable };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// Why a check did not run, or null when it did.
function skipReason(id, rule, checked, options) {
  if (options.disable.has(id)) return 'turned off with --disable';
  const { command, models } = checked;
  if (command === 'sweep' && (rule.kind === 'rules' || rule.kind === 'results' || rule.kind === 'compare')) return 'the sweep command takes no rules file';
  if (rule.kind === 'compare' && command !== 'compare') return 'only the compare command runs it';
  if (id === 'FRB019' && options.asOf === null) return 'no --as-of time was given';
  if (id === 'FRB027') {
    const model = models.rules ?? models.candidate;
    if (model && !model.limitSet('max_hold_per_thousand')) return 'the rules file sets no max_hold_per_thousand';
  }
  if (id === 'FRB030' && models.candidate && !models.candidate.limitSet('max_new_false_alarms')) return 'the candidate rules file sets no max_new_false_alarms';
  return null;
}

// The state of a check that found nothing: pass, or not-evaluated with the reason.
function evaluation(rule, checked, command) {
  const noData = checked.state.transactions !== 'read';
  const wanted = command === 'compare' ? ['current', 'candidate'] : command === 'backtest' ? ['rules'] : [];
  const noRules = wanted.some((f) => checked.state[f] !== 'read');
  if (rule.kind === 'data' && noData) return 'the transactions file could not be read';
  if (rule.kind === 'rules' && noRules) return 'the rules file could not be read';
  if (NEEDS_DATA.includes(rule.id) && noData) return 'the transactions file could not be read';
  if (rule.kind === 'results' || rule.kind === 'compare') {
    if (noData) return 'the transactions file could not be read';
    if (noRules) return 'the rules file could not be read';
    if (!checked.usable) return 'the labels cannot be used';
  }
  return null;
}

// The report object for the findings. files is { transactions, rules, current, candidate }, each { file, bytes, lines } or null.
export function buildReport({ files, checked, version, minSeverity = 'info', failOn = 'error', options = readOptions() }) {
  const names = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v?.file ?? null]));
  const command = checked.command;
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    const file = f.file === null ? null : names[f.file];
    return {
      id: f.id,
      name: rule.name,
      severity: rule.severity,
      message: clean(f.message),
      file,
      line: f.line,
      column: f.column,
      at: file === null ? 'input' : `${file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      fix: rule.fix,
      kind: rule.kind,
      source: f.file
    };
  });
  const rank = (f) => (f.source === null ? 4 : FILE_ORDER[f.source]);
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || rank(a) - rank(b) || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  const omitted = checked.omitted;
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const extra = (rule) => omitted.get(rule.id) ?? 0;
  const byLevel = { error: 0, warning: 0, info: 0 };
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  for (const f of shown) byLevel[f.severity] += 1;
  for (const rule of RULES) {
    allByLevel[rule.severity] += extra(rule);
    if (LEVELS.indexOf(rule.severity) >= LEVELS.indexOf(minSeverity)) byLevel[rule.severity] += extra(rule);
  }
  const total = (o) => o.error + o.warning + o.info;
  const notes = [...checked.notes];
  for (const [id, n] of omitted) notes.push(`${n.toLocaleString('en-US')} more findings of ${id} are not listed; the first 1,000 are`);
  const counts = new Map();
  for (const f of all) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
  const shownCounts = new Map();
  for (const f of shown) shownCounts.set(f.id, (shownCounts.get(f.id) ?? 0) + 1);
  const checks = RULES.map((r) => {
    const count = (counts.get(r.id) ?? 0) + extra(r);
    const skipped = skipReason(r.id, r, checked, options);
    let status = count > 0 ? 'fail' : 'pass';
    let detail = count > 0 ? plural(count, 'finding') : 'no finding';
    if (skipped !== null) {
      status = 'skipped';
      detail = skipped;
    } else if (count === 0) {
      const why = evaluation(r, checked, command);
      if (why !== null) {
        status = 'not-evaluated';
        detail = why;
      }
    }
    return { id: r.id, name: r.name, level: r.severity, kind: r.kind, status, findings: count, detail };
  });
  const inputOf = (key) => (files[key] ? { file: files[key].file, format: key === 'transactions' ? checked.format : 'json', bytes: files[key].bytes, lines: files[key].lines } : null);
  const evaluated = Object.fromEntries(['transactions', 'rules', 'current', 'candidate'].map((k) => [k, checked.state[k] === 'read']));
  const modelInfo = (m) => (m === undefined ? null : { name: m.name === '' ? null : m.name, rules: m.rules.length, currencyNote: m.currencyNote !== '', limits: Object.fromEntries([...m.limitValues].map(([k, v]) => [k, v.value])) });
  const strip = (run) => (run === undefined ? undefined : { rules: run.rules.map((m) => tidy({ ...m, id: clean(m.id, 80), name: clean(m.name, 120), owner: clean(m.owner, 80) })), set: tidySet(run.set) });
  const tidySet = (s) => ({ ...tidy(s), byAction: s.byAction.map(tidy) });
  const diffOf = (d) => ({ added: d.added.map((i) => clean(i, 80)), removed: d.removed.map((i) => clean(i, 80)), changed: d.changed.map((c) => ({ id: clean(c.id, 80), what: c.what })), same: d.same });
  let results = null;
  if (checked.results) {
    if (checked.results.sweep) results = { sweep: { ...checked.results.sweep, points: checked.results.sweep.points.map(tidy) } };
    else if (checked.results.comparison) {
      const c = checked.results.comparison;
      results = { current: strip(checked.results.current), candidate: strip(checked.results.candidate), comparison: { summary: tidy(c.summary), rules: diffOf(c.rules) } };
    } else results = { rules: strip(checked.results.rules) };
  }
  return {
    tool: 'fraud-rule-backtest',
    version,
    command,
    input: { transactions: inputOf('transactions'), rules: inputOf('rules'), current: inputOf('current'), candidate: inputOf('candidate') },
    evaluated,
    summary: { transactions: checked.summary, rules: modelInfo(checked.models.rules), current: modelInfo(checked.models.current), candidate: modelInfo(checked.models.candidate) },
    results,
    checks,
    totals: { findings: total(byLevel), byLevel, hidden: total(allByLevel) - total(byLevel) },
    rules: RULES.map((r) => ({ id: r.id, name: r.name, level: r.severity, kind: r.kind, findings: (shownCounts.get(r.id) ?? 0) + (LEVELS.indexOf(r.severity) >= LEVELS.indexOf(minSeverity) ? extra(r) : 0) })),
    options: { minSeverity, failOn, disabled: options.disableList, asOf: options.asOfText, thresholds: options.thresholds },
    findings: shown.map(({ source, ...rest }) => rest),
    notes: notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

async function load({ path, limits, base }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  return { absolute, text, file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) } };
}

// Whether the transactions or a rules file is read as the file it names; paths of the same file are refused.
// Reads the files and builds the report. Problems with any file are collected, so a run that cannot read two says so for both.
export async function checkFiles({ command = 'backtest', transactionsPath, rulesPath = null, currentPath = null, candidatePath = null, minSeverity = 'info', failOn = 'error', options = null, optionValues = {}, version, limits = LIMITS, base = process.cwd() }) {
  const used = options ?? readOptions(optionValues);
  const problems = [];
  const loaded = { transactions: null, rules: null, current: null, candidate: null };
  const paths = { transactions: transactionsPath, rules: rulesPath, current: currentPath, candidate: candidatePath };
  for (const [name, path] of Object.entries(paths)) {
    if (path === null || path === undefined) continue;
    try {
      loaded[name] = await load({ path, limits, base });
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      problems.push(...error.problems);
    }
  }
  if (problems.length > 0) throw new InputError(problems);
  const seen = new Map();
  for (const [name, l] of Object.entries(loaded)) {
    if (l === null) continue;
    if (seen.has(l.absolute)) throw new InputError([`${l.file.file}: the ${seen.get(l.absolute)} file and the ${name} file are the same file`]);
    seen.set(l.absolute, name);
  }
  const text = (k) => loaded[k]?.text ?? null;
  const checked = checkText({ transactions: text('transactions'), rules: text('rules'), current: text('current'), candidate: text('candidate') }, { command, options: used, transactionsPath, limits });
  return buildReport({ files: Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k, v?.file ?? null])), checked, version, minSeverity, failOn, options: used });
}
