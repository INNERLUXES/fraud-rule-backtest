import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RUNS, compareRuns, diffRules, parseJson, ratio, readRuleSet, replay, runsOf, sweep } from '../src/index.js';
import { all, csvOf, datasetOf, groups, leaf, ngRule, rule, rulesText, scenarioText } from './helpers.js';

const modelOf = (rules, over) => readRuleSet(parseJson(rulesText(rules, over)), () => {});
const D = datasetOf(scenarioText());
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

test('ratio: a division, and null when the divisor is zero', () => {
  assert.equal(ratio(1, 4), 0.25);
  assert.equal(ratio(0, 4), 0);
  assert.equal(ratio(3, 0), null);
  assert.equal(ratio(0, 0), null);
});

test('replay: the counts of one rule on the scenario', () => {
  const m = replay(D, modelOf([ngRule()])).rules[0];
  assert.equal(m.alerts, 30);
  assert.equal(m.truePositives, 20);
  assert.equal(m.falsePositives, 10);
  near(m.precision, 20 / 30);
  near(m.recall, 20 / 30);
  near(m.falsePositiveRate, 10 / 110);
  near(m.alertsPerThousand, (30 * 1000) / 140);
  assert.equal(m.fraudAmountCaught, 10000);
  assert.equal(m.goodAmountAffected, 300);
  assert.equal(m.uniqueTruePositives, 20);
  assert.equal(m.sharedTruePositives, 0);
  assert.equal(m.unevaluable, 0);
});

test('replay: the metrics keep the id, the name, the owner and the action of the rule', () => {
  const m = replay(D, modelOf([ngRule({ action: 'hold' })])).rules[0];
  assert.deepEqual([m.id, m.name, m.owner, m.action], ['R1', 'Rule R1', 'Risk team', 'hold']);
  assert.equal(replay(D, modelOf([ngRule({ action: undefined })])).rules[0].action, null);
});

test('replay: the counts of the set on the scenario with one rule', () => {
  const s = replay(D, modelOf([ngRule()])).set;
  assert.equal(s.transactions, 140);
  assert.equal(s.fraud, 30);
  assert.equal(s.notFraud, 110);
  assert.equal(s.alerted, 30);
  assert.equal(s.fraudCaught, 20);
  assert.equal(s.falseAlarms, 10);
  assert.equal(s.fraudMissed, 10);
  assert.equal(s.fraudCaughtByMoreThanOne, 0);
  assert.equal(s.fraudCaughtByOne, 20);
  assert.equal(s.fraudAmountTotal, 10400);
  assert.equal(s.fraudAmountCaught, 10000);
  assert.equal(s.fraudAmountMissed, 400);
  assert.equal(s.goodAmountTotal, 2300);
  assert.equal(s.goodAmountAffected, 300);
});

test('replay: two rules that catch the same fraud share it, and no rule is the only one', () => {
  const run = replay(D, modelOf([ngRule(), rule('R2', leaf('amount', 'gte', 100))]));
  const [a, b] = run.rules;
  assert.equal(a.truePositives, 20);
  assert.equal(b.truePositives, 20);
  assert.equal(b.falsePositives, 0);
  assert.equal(a.uniqueTruePositives, 0);
  assert.equal(b.uniqueTruePositives, 0);
  assert.equal(a.sharedTruePositives, 20);
  assert.equal(run.set.fraudCaughtByMoreThanOne, 20);
  assert.equal(run.set.fraudCaughtByOne, 0);
  assert.equal(run.set.fraudCaught, 20, 'a fraud case counts once in the set');
  assert.equal(run.set.alerted, 30, 'a transaction counts once in the set');
});

test('replay: a rule that catches fraud nobody else catches has it as its own', () => {
  const run = replay(D, modelOf([ngRule(), rule('R3', all(leaf('country', 'eq', 'DE'), leaf('amount', 'between', [30, 50])))]));
  assert.equal(run.rules[1].truePositives, 10);
  assert.equal(run.rules[1].uniqueTruePositives, 10);
  assert.equal(run.set.fraudMissed, 0);
  assert.equal(run.set.fraudCaught, 30);
  near(run.set.recall, 1);
});

test('replay: the strongest action decides how the alerted rows are split', () => {
  const run = replay(D, modelOf([ngRule({ action: 'flag' }), rule('R2', leaf('amount', 'gte', 100), { action: 'block' })]));
  const by = Object.fromEntries(run.set.byAction.map((a) => [a.action, a]));
  assert.deepEqual([by.block.transactions, by.block.fraud, by.block.notFraud], [20, 20, 0]);
  assert.deepEqual([by.flag.transactions, by.flag.fraud, by.flag.notFraud], [10, 0, 10]);
  assert.deepEqual([by.hold.transactions, by.hold.fraud, by.hold.notFraud], [0, 0, 0]);
  near(by.flag.perThousand, (10 * 1000) / 140);
  assert.deepEqual(run.set.byAction.map((a) => a.action), ['flag', 'hold', 'block']);
});

test('replay: a rule with no action counts as a flag, and one with an action not known as well', () => {
  const run = replay(D, modelOf([ngRule({ action: undefined })]));
  assert.equal(run.set.byAction[0].transactions, 30);
});

test('replay: a rule that never fires has no precision, a recall of zero and no unique catches', () => {
  const m = replay(D, modelOf([rule('R1', leaf('country', 'eq', 'XX'))])).rules[0];
  assert.equal(m.alerts, 0);
  assert.equal(m.precision, null);
  assert.equal(m.recall, 0);
  assert.equal(m.falsePositiveRate, 0);
  assert.equal(m.alertsPerThousand, 0);
  assert.equal(m.uniqueTruePositives, 0);
});

test('replay: a rule with a broken condition is replayed as a rule that never fires and says so', () => {
  const m = replay(D, modelOf([rule('R1', leaf('nothing', 'eq', 1)), rule('R2', undefined)])).rules;
  assert.equal(m[0].alerts, 0);
  assert.equal(m[0].unevaluable, 1);
  assert.equal(m[1].alerts, 0);
  assert.equal(m[1].unevaluable, 1);
});

test('replay: rows with no label are left out of every count', () => {
  const rows = groups([5, { is_fraud: '1', country: 'NG' }], [5, { is_fraud: '0', country: 'NG' }], [4, { is_fraud: 'maybe', country: 'NG' }], [3, { is_fraud: '', country: 'NG' }]);
  const run = replay(datasetOf(csvOf(rows)), modelOf([ngRule()]));
  assert.equal(run.set.transactions, 10);
  assert.equal(run.rules[0].alerts, 10);
});

test('replay: an amount that is empty or negative counts as zero in the sums', () => {
  const rows = groups([1, { is_fraud: '1', country: 'NG', amount: '100' }], [1, { is_fraud: '1', country: 'NG', amount: '' }], [1, { is_fraud: '1', country: 'NG', amount: '-50' }], [1, { is_fraud: '0', country: 'NG', amount: 'x' }]);
  const m = replay(datasetOf(csvOf(rows)), modelOf([ngRule()])).rules[0];
  assert.equal(m.fraudAmountCaught, 50, 'the negative amount is a number and is summed; only an amount that is no number is zero');
  assert.equal(m.goodAmountAffected, 0);
});

test('replay: the run is deterministic', () => {
  const a = JSON.stringify(replay(D, modelOf([ngRule(), rule('R2', leaf('amount', 'gte', 100))])));
  const b = JSON.stringify(replay(D, modelOf([ngRule(), rule('R2', leaf('amount', 'gte', 100))])));
  assert.equal(a, b);
});

test('runsOf: the rules times the labelled rows, and the limit is a large number', () => {
  assert.equal(runsOf(D, modelOf([ngRule(), rule('R2', leaf('amount', 'gte', 1))])), 280);
  assert.equal(MAX_RUNS, 200000000);
});

test('sweep: the counts at each cut-off, with the cut-off itself in', () => {
  const rows = groups([2, { is_fraud: '1', score: '0.9' }], [1, { is_fraud: '1', score: '0.5' }], [1, { is_fraud: '0', score: '0.5' }], [4, { is_fraud: '0', score: '0.1' }]);
  const s = sweep(datasetOf(csvOf(rows)), [0.1, 0.5, 0.9, 0.95]);
  assert.equal(s.transactions, 8);
  assert.equal(s.fraud, 3);
  assert.deepEqual(s.points.map((p) => [p.threshold, p.alerts, p.truePositives, p.falsePositives]), [[0.1, 8, 3, 5], [0.5, 4, 3, 1], [0.9, 2, 2, 0], [0.95, 0, 0, 0]]);
  near(s.points[1].precision, 0.75);
  near(s.points[1].recall, 1);
  near(s.points[2].recall, 2 / 3);
  assert.equal(s.points[3].precision, null);
  near(s.points[1].falsePositiveRate, 1 / 5);
  near(s.points[1].alertsPerThousand, 500);
});

test('sweep: the amounts at a cut-off, and the rows with no numeric score left out', () => {
  const rows = groups([1, { is_fraud: '1', score: '0.8', amount: '100' }], [1, { is_fraud: '0', score: '0.8', amount: '30' }], [1, { is_fraud: '1', score: 'high', amount: '999' }], [1, { is_fraud: '0', score: '', amount: '5' }]);
  const s = sweep(datasetOf(csvOf(rows)), [0.5]);
  assert.equal(s.leftOut, 2);
  assert.equal(s.transactions, 2);
  assert.equal(s.points[0].fraudAmountCaught, 100);
  assert.equal(s.points[0].goodAmountAffected, 30);
});

test('diffRules: rules added, removed and changed, and the ones that are the same', () => {
  const a = modelOf([ngRule(), rule('R2', leaf('amount', 'gte', 100)), rule('R3', leaf('amount', 'gte', 5)), rule('R4', leaf('amount', 'gte', 7), { action: 'hold' })]);
  const b = modelOf([ngRule(), rule('r2', leaf('amount', 'gte', 90)), rule('R4', leaf('amount', 'gte', 7), { action: 'block', min_precision: 0.5 }), rule('R5', leaf('amount', 'gte', 1))]);
  const d = diffRules(a, b);
  assert.deepEqual(d.added, ['R5']);
  assert.deepEqual(d.removed, ['R3']);
  assert.deepEqual(d.changed, [{ id: 'r2', what: ['condition'] }, { id: 'R4', what: ['action', 'limits'] }]);
  assert.equal(d.same, 1);
});

test('diffRules: the parts of a group in another order are not a change', () => {
  const a = modelOf([rule('R1', all(leaf('a', 'eq', 1), leaf('b', 'eq', 2)))]);
  const b = modelOf([rule('R1', all(leaf('b', 'eq', 2), leaf('a', 'eq', 1)))]);
  assert.deepEqual(diffRules(a, b), { added: [], removed: [], changed: [], same: 1 });
});

test('compareRuns: fraud lost and gained, false alarms added and cleared, row by row', () => {
  const current = modelOf([ngRule()]);
  const candidate = modelOf([rule('R1', all(leaf('country', 'eq', 'NG'), leaf('amount', 'gte', 100))), rule('R9', leaf('amount', 'between', [35, 45]))]);
  const run = (m) => replay(D, m);
  const c = compareRuns(D, run(current), run(candidate), diffRules(current, candidate));
  assert.equal(c.summary.fraudLost, 0);
  assert.equal(c.summary.fraudGained, 10, 'the ten fraud cases of amount 40');
  assert.equal(c.summary.falseAlarmsCleared, 10, 'the ten good NG rows of amount 30');
  assert.equal(c.summary.falseAlarmsAdded, 0);
  assert.equal(c.summary.fraudAmountGained, 400);
  assert.equal(c.summary.goodAmountCleared, 300);
  near(c.summary.recallChange, 10 / 30);
  assert.equal(c.summary.alertsChange, 0);
  assert.equal(c.summary.netFraudChange, 10);
  assert.equal(c.summary.netFalseAlarmChange, -10);
});

test('compareRuns: a candidate that stops catching fraud loses it, with the amount and the rows', () => {
  const current = modelOf([ngRule()]);
  const candidate = modelOf([rule('R1', leaf('amount', 'gte', 600))]);
  const c = compareRuns(D, replay(D, current), replay(D, candidate), diffRules(current, candidate));
  assert.equal(c.summary.fraudLost, 20);
  assert.equal(c.summary.fraudAmountLost, 10000);
  assert.equal(c.summary.falseAlarmsCleared, 10);
  assert.equal(c.lostRows.length, 20);
  near(c.summary.fraudShareLost, 1);
  near(c.summary.recallChange, -20 / 30);
});

test('compareRuns: a candidate that is the current set moves nothing', () => {
  const m = modelOf([ngRule()]);
  const c = compareRuns(D, replay(D, m), replay(D, m), diffRules(m, m));
  assert.deepEqual([c.summary.fraudLost, c.summary.fraudGained, c.summary.falseAlarmsAdded, c.summary.falseAlarmsCleared], [0, 0, 0, 0]);
  assert.equal(c.summary.recallChange, 0);
});

test('compareRuns: false alarms the candidate adds are the good rows it alerts on and the current set does not', () => {
  const current = modelOf([ngRule()]);
  const candidate = modelOf([ngRule(), rule('R2', leaf('amount', 'eq', 20))]);
  const c = compareRuns(D, replay(D, current), replay(D, candidate), diffRules(current, candidate));
  assert.equal(c.summary.falseAlarmsAdded, 100);
  assert.equal(c.summary.goodAmountAdded, 100 * 20);
  assert.equal(c.addedRows.length, 100);
});
