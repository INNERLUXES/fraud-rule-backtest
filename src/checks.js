// The checks. Each function takes the model it looks at and `add(id, where, message, subject)` and reports what it finds; it reads
// the model and nothing else. The checks visit each rule and each row a bounded number of times and never compare every pair, and
// none calls itself.

import { canonical, leafProblem, leafText } from './condition.js';
import { columnOf, rawOf } from './dataset.js';
import { nearest } from './fields.js';
import { list, show } from './collect.js';
import { childrenOf } from './ruleset.js';
import { cell, fixed, plural } from './size.js';
import { nodesOf } from './tree.js';
import { parseTime } from './time.js';

const rl = (rule) => `The rule "${show(rule.id)}"`;
const grouped = (n) => Number(n).toLocaleString('en-US');

// The two ends of a between condition as numbers, or null when they cannot be compared.
function rangeOf(leaf) {
  const [lo, hi] = leaf.value;
  if (typeof lo === 'number' && typeof hi === 'number') return [lo, hi];
  if (typeof lo === 'string' && typeof hi === 'string') {
    const a = parseTime(lo);
    const b = parseTime(hi);
    if (a !== null && b !== null) return [a, b];
  }
  return null;
}

// Checks of the rules as written, and, when the dataset is there, against its fields.
export function checkRules(model, dataset, add) {
  const file = model.file;
  const firstId = new Map();
  const firstCondition = new Map();
  const names = dataset === null ? [] : dataset.fields.map((f) => f.trim().toLowerCase());
  for (const rule of model.rules) {
    const id = rule.id.trim().toLowerCase();
    if (!rule.noId) {
      if (firstId.has(id)) {
        const first = firstId.get(id);
        add('FRB004', { file, line: rule.idLine, column: rule.idColumn }, `The rule id "${show(rule.id)}" is used by two rules: at line ${first.idLine} and at line ${rule.idLine}.`, rule.id);
      } else firstId.set(id, rule);
    }
    if (rule.owner === '') add('FRB005', { file, line: rule.line, column: rule.column }, `${rl(rule)} has no owner.`, rule.id);
    if (rule.action === '' && !rule.actionInvalid) add('FRB006', { file, line: rule.actionLine ?? rule.line, column: rule.actionColumn ?? rule.column }, `${rl(rule)} has no action; it needs flag, hold or block.`, rule.id);
    if (rule.action === 'block' && rule.minPrecision === null) add('FRB011', { file, line: rule.actionLine ?? rule.line, column: rule.actionColumn ?? rule.column }, `${rl(rule)} blocks and sets no min_precision.`, rule.id);
    for (const leaf of rule.leaves) {
      const at = { file, line: leaf.line, column: leaf.col };
      if (leaf.op === 'between') {
        const range = rangeOf(leaf);
        if (range !== null && range[0] > range[1]) add('FRB007', at, `${rl(rule)} has a between range on "${show(leaf.field)}" with the low end ${leaf.value[0]} above the high end ${leaf.value[1]}; no value can be inside it.`, rule.id);
      }
      if (dataset === null) continue;
      const column = columnOf(dataset, leaf.field);
      if (column === undefined) {
        const near = nearest(leaf.field, names);
        const shown = near === null ? null : dataset.fields[names.indexOf(near)];
        add('FRB008', at, `${rl(rule)} uses the field "${show(leaf.field)}", which is not a column of the transactions file${shown ? `; the nearest column is "${show(shown)}"` : ''}.`, rule.id);
        continue;
      }
      const problem = leafProblem(leaf, column);
      if (problem !== null) add('FRB009', at, `${rl(rule)}: ${show(problem, 220)}.`, rule.id);
    }
    if (rule.condition === null) continue;
    for (const node of nodesOf(rule.condition, childrenOf)) {
      if (node.kind !== 'all' && node.kind !== 'any') continue;
      const seen = new Set();
      for (const child of node.items) {
        const text = canonical(child);
        if (seen.has(text)) add('FRB010', { file, line: child.line, column: child.col }, `${rl(rule)} repeats the condition '${show(child.kind === 'leaf' ? leafText(child) : text, 100)}' in one ${node.kind} group.`, rule.id);
        else seen.add(text);
      }
    }
    if (!rule.broken) {
      const text = canonical(rule.condition);
      const first = firstCondition.get(text);
      if (first !== undefined && first.id.trim().toLowerCase() !== id) {
        add('FRB010', { file, line: rule.conditionLine ?? rule.line, column: rule.column }, `${rl(rule)} has the same condition as the rule "${show(first.id)}" at line ${first.line}.`, rule.id);
      } else if (first === undefined) firstCondition.set(text, rule);
    }
  }
}

// What a transaction is called in a message: its id, or its line.
function nameOf(dataset, ids, i) {
  const id = ids === null ? '' : ids[i];
  return id === '' || id === undefined ? `on line ${dataset.lines[i]}` : `"${show(id)}"`;
}

// Checks of the transactions. ctx is { asOf, currencyNote, minFraud }.
export function checkData(dataset, add, ctx) {
  const at = (i) => ({ file: 'transactions', line: dataset.lines[i], column: 1 });
  const head = { file: 'transactions', line: dataset.headerLine, column: 1 };
  const ids = rawOf(dataset, 'id');
  if (dataset.roles.label === null) {
    add('FRB012', head, 'The transactions file has no label column; it needs one of is_fraud, fraud or label.');
  } else {
    let fraud = 0;
    let legit = 0;
    const empty = [];
    const odd = new Map();
    const labels = rawOf(dataset, 'label');
    for (let i = 0; i < dataset.rows; i += 1) {
      const l = dataset.labels[i];
      if (l === 1) fraud += 1;
      else if (l === 0) legit += 1;
      else if (l === -2) empty.push(i);
      else {
        const t = labels[i].toLowerCase();
        const e = odd.get(t);
        if (e === undefined) odd.set(t, { first: i, text: labels[i], count: 1 });
        else e.count += 1;
      }
    }
    if (fraud === 0 || legit === 0) {
      const what = fraud + legit === 0 ? 'no row has a label the tool reads' : fraud === 0 ? `none of the ${grouped(legit)} labelled transactions is fraud` : `all ${grouped(fraud)} labelled transactions are fraud`;
      add('FRB013', head, `The labels cannot be used: ${what}, so precision and recall cannot be worked out.`);
    } else if (fraud < ctx.minFraud) {
      add('FRB020', head, `Only ${grouped(fraud)} of ${grouped(fraud + legit)} labelled transactions are fraud (the limit is ${grouped(ctx.minFraud)}); a rate on so few cases moves a lot with one case.`);
    }
    if (empty.length > 0) add('FRB014', at(empty[0]), `${grouped(empty.length)} ${empty.length === 1 ? 'transaction has' : 'transactions have'} no label, the first ${nameOf(dataset, ids, empty[0])}; they are left out of every count.`);
    for (const e of odd.values()) add('FRB014', at(e.first), `The label "${show(e.text)}" is not recognised on ${grouped(e.count)} ${e.count === 1 ? 'transaction' : 'transactions'}, the first ${nameOf(dataset, ids, e.first)}; they are left out of every count.`);
  }
  const amounts = rawOf(dataset, 'amount');
  if (amounts !== null) {
    const values = columnOf(dataset, dataset.roles.amount).values;
    for (let i = 0; i < dataset.rows; i += 1) {
      if (values[i] === null) add('FRB015', at(i), `The transaction ${nameOf(dataset, ids, i)} has ${amounts[i] === '' ? 'no amount' : `the amount "${show(amounts[i])}", which is not a plain number`}; it counts as zero in the sums.`);
      else if (values[i] < 0) add('FRB015', at(i), `The transaction ${nameOf(dataset, ids, i)} has the amount ${show(amounts[i])}, which is negative; it counts as zero in the sums.`);
    }
  }
  const currencies = rawOf(dataset, 'currency');
  if (currencies !== null) {
    const seen = [...new Set(currencies.filter((c) => c !== '').map((c) => c.toUpperCase()))].sort();
    if (seen.length > 1 && !ctx.currencyNote) add('FRB016', head, `The transactions hold ${seen.length} currencies (${list(seen.map((c) => show(c, 12)), 6)}) and the rules file has no currency_note that says how the amounts are made comparable.`);
  }
  if (ids !== null) {
    const first = new Map();
    for (let i = 0; i < dataset.rows; i += 1) {
      if (ids[i] === '') continue;
      if (first.has(ids[i])) add('FRB017', at(i), `The transaction id "${show(ids[i])}" is used on line ${dataset.lines[first.get(ids[i])]} and on line ${dataset.lines[i]}.`);
      else first.set(ids[i], i);
    }
  }
  const stamps = rawOf(dataset, 'timestamp');
  if (stamps !== null) {
    for (let i = 0; i < dataset.rows; i += 1) {
      const t = dataset.times[i];
      if (Number.isNaN(t)) add('FRB018', at(i), `The transaction ${nameOf(dataset, ids, i)} has ${stamps[i] === '' ? 'no timestamp' : `the timestamp "${show(stamps[i])}", which is not a time the tool reads`}.`);
      else if (ctx.asOf !== null && t > ctx.asOf) add('FRB019', at(i), `The transaction ${nameOf(dataset, ids, i)} is dated after the --as-of time (timestamp "${show(stamps[i])}").`);
    }
  }
}

const pct = (x) => fixed(x, 3);

// Checks of what the rules did. run is the result of replay() for the rule set; the rules that cannot be evaluated are left out.
export function checkResults(model, run, add) {
  const file = model.file;
  const set = run.set;
  const minTp = model.limit('min_true_positives');
  const blockMin = model.limit('block_min_precision');
  model.rules.forEach((rule, index) => {
    const m = run.rules[index];
    if (rule.broken || m.unevaluable > 0) return;
    const at = { file, line: rule.line, column: rule.column };
    const alertsWord = `${grouped(m.alerts)} ${m.alerts === 1 ? 'alert' : 'alerts'}`;
    if (m.alerts === 0) add('FRB021', at, `${rl(rule)} never fires on the ${grouped(set.transactions)} labelled transactions.`, rule.id);
    else if (m.truePositives === 0) add('FRB022', at, `${rl(rule)} fires on ${plural(m.alerts, 'transaction')} and catches none of the ${grouped(set.fraud)} fraud cases.`, rule.id);
    if (rule.maxAlertRate !== null && m.alertsPerThousand > rule.maxAlertRate) {
      add('FRB023', { file, line: rule.rateLine ?? rule.line, column: rule.column }, `${rl(rule)} fires on ${fixed(m.alertsPerThousand, 1)} of every 1,000 transactions, above its max_alert_rate of ${rule.maxAlertRate}.`, rule.id);
    }
    if (rule.minPrecision !== null && m.alerts > 0 && m.precision < rule.minPrecision) {
      add('FRB024', { file, line: rule.floorLine ?? rule.line, column: rule.column }, `${rl(rule)} has a precision of ${pct(m.precision)} (${grouped(m.truePositives)} of ${alertsWord}), under its min_precision of ${rule.minPrecision}.`, rule.id);
    }
    if (model.rules.length > 1 && m.truePositives > 0 && m.uniqueTruePositives === 0) {
      add('FRB025', at, `${rl(rule)} catches ${grouped(m.truePositives)} fraud ${m.truePositives === 1 ? 'case' : 'cases'} and every one is also caught by another rule.`, rule.id);
    }
    if (rule.action === 'block' && m.alerts > 0 && m.precision < blockMin) {
      add('FRB026', at, `${rl(rule)} blocks and has a precision of ${pct(m.precision)} (${grouped(m.truePositives)} of ${alertsWord}), under the block floor of ${blockMin}.`, rule.id);
    }
    if (m.truePositives > 0 && m.truePositives < minTp) {
      add('FRB028', at, `${rl(rule)} caught only ${grouped(m.truePositives)} fraud ${m.truePositives === 1 ? 'case' : 'cases'} in ${alertsWord}; low evidence, its precision rests on fewer than ${grouped(minTp)} cases.`, rule.id);
    }
  });
  if (model.limitSet('max_hold_per_thousand')) {
    const hold = set.byAction.find((a) => a.action === 'hold');
    const limit = model.limit('max_hold_per_thousand');
    if (hold.perThousand !== null && hold.perThousand > limit) {
      const entry = model.limitValues.get('max_hold_per_thousand');
      add('FRB027', { file, line: entry.line, column: entry.column }, `The hold queue takes ${fixed(hold.perThousand, 1)} of every 1,000 transactions (${grouped(hold.transactions)} of ${grouped(set.transactions)}), above max_hold_per_thousand of ${limit}.`);
    }
  }
}

// Checks of the candidate set against the current one. cmp is the result of compareRuns().
export function checkCompare(model, cmp, add) {
  const file = model.file;
  const s = cmp.summary;
  const maxLost = model.limit('max_lost_fraud');
  const entry = (name) => model.limitValues.get(name) ?? { line: model.limitsLine, column: 1 };
  if (s.fraudLost > maxLost) {
    add('FRB029', { file, line: entry('max_lost_fraud').line, column: 1 }, `The candidate set loses ${grouped(s.fraudLost)} fraud ${s.fraudLost === 1 ? 'case' : 'cases'} that the current set catches (amount ${cell(s.fraudAmountLost, 2)}), above max_lost_fraud of ${maxLost}.`);
  }
  if (model.limitSet('max_new_false_alarms')) {
    const limit = model.limit('max_new_false_alarms');
    if (s.falseAlarmsAdded > limit) {
      add('FRB030', { file, line: entry('max_new_false_alarms').line, column: 1 }, `The candidate set adds ${grouped(s.falseAlarmsAdded)} false ${s.falseAlarmsAdded === 1 ? 'alarm' : 'alarms'} that the current set does not raise (amount ${cell(s.goodAmountAdded, 2)}), above max_new_false_alarms of ${limit}.`);
    }
  }
}
