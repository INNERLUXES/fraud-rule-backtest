// The replay: each rule is run on each labelled transaction, and the counts, the rates and the amounts of each rule and of the whole
// set are worked out. A transaction is labelled when its label is recognised; the others are left out of every count. The work
// is a loop over the rules and a loop over the rows, and a rule is run twice at most, so memory does not grow with the number of
// alerts. Amounts are summed in the order of the file, so the same file gives the same sums.

import { ACTIONS } from './data.js';
import { compile } from './condition.js';

// The most rule runs (rules times labelled rows) one replay does; a bigger replay is refused.
export const MAX_RUNS = 200000000;

export const ratio = (a, b) => (b === 0 ? null : a / b);

const rank = (action) => {
  const i = ACTIONS.indexOf(action);
  return i < 0 ? 0 : i;
};

// The replay of a rule set on a dataset. Returns { rules, set, any } where any is a list with one entry for each labelled row,
// 1 when some rule fired on it. The rules that cannot be evaluated are replayed as rules that never fire and say so in
// unevaluable.
export function replay(dataset, ruleset) {
  const rows = dataset.labelled;
  const n = rows.length;
  const rules = ruleset.rules;
  const cover = new Uint16Array(n);
  const top = new Int8Array(n).fill(-1);
  const compiled = rules.map((r) => (r.condition === null ? { fn: () => false, unevaluable: 1 } : compile(r.condition, dataset)));
  let fraud = 0;
  let fraudAmount = 0;
  let goodAmount = 0;
  for (let k = 0; k < n; k += 1) {
    const i = rows[k];
    const a = Number.isNaN(dataset.amounts[i]) ? 0 : dataset.amounts[i];
    if (dataset.labels[i] === 1) {
      fraud += 1;
      fraudAmount += a;
    } else goodAmount += a;
  }
  const out = rules.map((r, index) => {
    const { fn } = compiled[index];
    const level = rank(r.action);
    let alerts = 0;
    let tp = 0;
    let fp = 0;
    let fraudCaught = 0;
    let goodAffected = 0;
    for (let k = 0; k < n; k += 1) {
      const i = rows[k];
      if (!fn(i)) continue;
      alerts += 1;
      if (cover[k] < 65535) cover[k] += 1;
      if (level > top[k]) top[k] = level;
      const a = Number.isNaN(dataset.amounts[i]) ? 0 : dataset.amounts[i];
      if (dataset.labels[i] === 1) {
        tp += 1;
        fraudCaught += a;
      } else {
        fp += 1;
        goodAffected += a;
      }
    }
    return {
      id: r.id,
      name: r.name,
      owner: r.owner,
      action: r.action === '' ? null : r.action,
      alerts,
      truePositives: tp,
      falsePositives: fp,
      precision: ratio(tp, alerts),
      recall: ratio(tp, fraud),
      falsePositiveRate: ratio(fp, n - fraud),
      alertsPerThousand: ratio(alerts * 1000, n),
      fraudAmountCaught: fraudCaught,
      goodAmountAffected: goodAffected,
      uniqueTruePositives: 0,
      sharedTruePositives: 0,
      unevaluable: compiled[index].unevaluable
    };
  });
  // The fraud that only one rule catches: a second run of the rules that caught something.
  rules.forEach((r, index) => {
    const m = out[index];
    if (m.truePositives === 0) return;
    const { fn } = compiled[index];
    let unique = 0;
    for (let k = 0; k < n; k += 1) {
      const i = rows[k];
      if (dataset.labels[i] === 1 && cover[k] === 1 && fn(i)) unique += 1;
    }
    m.uniqueTruePositives = unique;
    m.sharedTruePositives = m.truePositives - unique;
  });
  const any = new Uint8Array(n);
  let caught = 0;
  let falseAlarms = 0;
  let caughtMore = 0;
  let caughtAmount = 0;
  let affectedAmount = 0;
  const byAction = new Map(ACTIONS.map((a) => [a, { transactions: 0, fraud: 0, notFraud: 0 }]));
  for (let k = 0; k < n; k += 1) {
    if (cover[k] === 0) continue;
    any[k] = 1;
    const i = rows[k];
    const a = Number.isNaN(dataset.amounts[i]) ? 0 : dataset.amounts[i];
    const group = byAction.get(ACTIONS[top[k]]);
    group.transactions += 1;
    if (dataset.labels[i] === 1) {
      caught += 1;
      caughtAmount += a;
      group.fraud += 1;
      if (cover[k] > 1) caughtMore += 1;
    } else {
      falseAlarms += 1;
      affectedAmount += a;
      group.notFraud += 1;
    }
  }
  const alerted = caught + falseAlarms;
  const set = {
    transactions: n,
    fraud,
    notFraud: n - fraud,
    alerted,
    fraudCaught: caught,
    falseAlarms,
    fraudMissed: fraud - caught,
    precision: ratio(caught, alerted),
    recall: ratio(caught, fraud),
    falsePositiveRate: ratio(falseAlarms, n - fraud),
    alertsPerThousand: ratio(alerted * 1000, n),
    fraudCaughtByMoreThanOne: caughtMore,
    fraudCaughtByOne: caught - caughtMore,
    fraudAmountTotal: fraudAmount,
    goodAmountTotal: goodAmount,
    fraudAmountCaught: caughtAmount,
    fraudAmountMissed: fraudAmount - caughtAmount,
    goodAmountAffected: affectedAmount,
    byAction: ACTIONS.map((a) => ({ action: a, ...byAction.get(a), perThousand: ratio(byAction.get(a).transactions * 1000, n) }))
  };
  return { rules: out, set, any };
}

// The number of rule runs a replay needs, for the limit.
export const runsOf = (dataset, ruleset) => dataset.labelled.length * ruleset.rules.length;

// The threshold sweep: for each threshold the transactions with a score at or above it are the alerts. Rows with no score, or
// with a score that is not a number, are left out and counted.
export function sweep(dataset, thresholds) {
  const rows = dataset.labelled.filter((i) => !Number.isNaN(dataset.scores[i]));
  const left = dataset.labelled.length - rows.length;
  let fraud = 0;
  for (const i of rows) if (dataset.labels[i] === 1) fraud += 1;
  const n = rows.length;
  const points = thresholds.map((t) => {
    let tp = 0;
    let fp = 0;
    let fraudCaught = 0;
    let goodAffected = 0;
    for (const i of rows) {
      if (dataset.scores[i] < t) continue;
      const a = Number.isNaN(dataset.amounts[i]) ? 0 : dataset.amounts[i];
      if (dataset.labels[i] === 1) {
        tp += 1;
        fraudCaught += a;
      } else {
        fp += 1;
        goodAffected += a;
      }
    }
    return {
      threshold: t,
      alerts: tp + fp,
      truePositives: tp,
      falsePositives: fp,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, fraud),
      falsePositiveRate: ratio(fp, n - fraud),
      alertsPerThousand: ratio((tp + fp) * 1000, n),
      fraudAmountCaught: fraudCaught,
      goodAmountAffected: goodAffected
    };
  });
  return { transactions: n, fraud, notFraud: n - fraud, leftOut: left, points };
}
