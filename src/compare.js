// The comparison of two rule sets on the same transactions ("shadow mode"): the current set and the candidate set are replayed on
// the same labelled rows, and the report says which fraud the candidate loses, which it adds, which false alarms it adds and which
// it clears, and which rules were added, removed or changed. A rule is the same rule when its id is the same, compared without
// case and extra spaces.

import { canonical } from './condition.js';
import { ratio } from './backtest.js';

const key = (id) => String(id).trim().toLowerCase();

// How the rules of the two sets differ: added and removed ids, and the ids whose condition, action or limits changed.
export function diffRules(current, candidate) {
  const before = new Map();
  for (const r of current.rules) if (!before.has(key(r.id))) before.set(key(r.id), r);
  const after = new Map();
  for (const r of candidate.rules) if (!after.has(key(r.id))) after.set(key(r.id), r);
  const added = [];
  const removed = [];
  const changed = [];
  let same = 0;
  for (const [k, r] of after) {
    const old = before.get(k);
    if (old === undefined) {
      added.push(r.id);
      continue;
    }
    const parts = [];
    if (old.action !== r.action) parts.push('action');
    const a = old.condition === null ? '' : canonical(old.condition);
    const b = r.condition === null ? '' : canonical(r.condition);
    if (a !== b) parts.push('condition');
    if (old.maxAlertRate !== r.maxAlertRate || old.minPrecision !== r.minPrecision) parts.push('limits');
    if (parts.length > 0) changed.push({ id: r.id, what: parts });
    else same += 1;
  }
  for (const [k, r] of before) if (!after.has(k)) removed.push(r.id);
  return { added, removed, changed, same };
}

// The comparison of two replays of the same dataset. currentRun and candidateRun are the results of replay().
export function compareRuns(dataset, currentRun, candidateRun, diff) {
  const rows = dataset.labelled;
  const lost = [];
  const gained = [];
  const added = [];
  const cleared = [];
  let lostAmount = 0;
  let gainedAmount = 0;
  let addedAmount = 0;
  let clearedAmount = 0;
  for (let k = 0; k < rows.length; k += 1) {
    const before = currentRun.any[k];
    const after = candidateRun.any[k];
    if (before === after) continue;
    const i = rows[k];
    const a = Number.isNaN(dataset.amounts[i]) ? 0 : dataset.amounts[i];
    if (dataset.labels[i] === 1) {
      if (before === 1) {
        lost.push(i);
        lostAmount += a;
      } else {
        gained.push(i);
        gainedAmount += a;
      }
    } else if (after === 1) {
      added.push(i);
      addedAmount += a;
    } else {
      cleared.push(i);
      clearedAmount += a;
    }
  }
  const c = currentRun.set;
  const d = candidateRun.set;
  const summary = {
    fraudLost: lost.length,
    fraudGained: gained.length,
    falseAlarmsAdded: added.length,
    falseAlarmsCleared: cleared.length,
    fraudAmountLost: lostAmount,
    fraudAmountGained: gainedAmount,
    goodAmountAdded: addedAmount,
    goodAmountCleared: clearedAmount,
    recallChange: c.recall === null || d.recall === null ? null : d.recall - c.recall,
    precisionChange: c.precision === null || d.precision === null ? null : d.precision - c.precision,
    alertsChange: d.alerted - c.alerted,
    alertsPerThousandChange: c.alertsPerThousand === null || d.alertsPerThousand === null ? null : d.alertsPerThousand - c.alertsPerThousand,
    netFraudChange: gained.length - lost.length,
    netFalseAlarmChange: added.length - cleared.length,
    fraudShareLost: ratio(lost.length, c.fraudCaught)
  };
  return { summary, rules: diff, lostRows: lost, addedRows: added };
}
