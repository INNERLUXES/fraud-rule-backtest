import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/index.js';
import { all, compareOf, csvOf, groups, idsOf, leaf, lineOf, ngRule, ngRules, ofCheck, rule, rulesText, runOf, scenario, scenarioText, sweepOf } from './helpers.js';

const S = scenarioText();
const on = (rules, over, options) => idsOf(S, rulesText(rules, over), options);
const msg = (f) => f.map((x) => x.message);
const runOfNotes = (transactions) => runOf(transactions, ngRules());

test('the scenario and its one rule pass every check', () => {
  assert.deepEqual(idsOf(S, ngRules()), []);
});

test('there are thirty checks with ids FRB001 to FRB030, in order, each with a name, a level, a kind and four texts', () => {
  assert.equal(RULES.length, 30);
  assert.deepEqual(RULES.map((r) => r.id), Array.from({ length: 30 }, (_, i) => `FRB${String(i + 1).padStart(3, '0')}`));
  assert.equal(new Set(RULES.map((r) => r.name)).size, 30);
  for (const r of RULES) {
    assert.ok(['error', 'warning', 'info'].includes(r.severity), r.id);
    assert.ok(['file', 'rules', 'data', 'results', 'compare'].includes(r.kind), r.id);
    for (const key of ['summary', 'fix', 'own', 'cannot']) assert.ok(r[key].length > 10, `${r.id} ${key}`);
    assert.match(r.own, /a best practice of this tool; no standard sets it/, r.id);
  }
});

// FRB001 to FRB003: the files.
test('FRB001: a rules file with a syntax error, at its line', () => {
  const text = '{\n  "rules": [\n    {"id": "R1" "when": 1}\n  ]\n}';
  const f = ofCheck(S, text, 'FRB001');
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'rules');
  assert.equal(f[0].line, 3);
});

test('FRB001: a rules file with no rules, and one that is not a mapping', () => {
  assert.equal(ofCheck(S, '{"name": "x"}', 'FRB001').length, 1);
  assert.equal(ofCheck(S, '[1, 2]', 'FRB001').length, 1);
});

test('FRB001: a transactions file with a quote never closed, and a field written twice', () => {
  const quote = ofCheck('id,amount\nT1,"5\n', ngRules(), 'FRB001');
  assert.equal(quote.length, 1);
  assert.equal(quote[0].file, 'transactions');
  const twice = ofCheck('id,amount,AMOUNT,is_fraud\nT1,1,2,0\n', ngRules(), 'FRB001');
  assert.match(twice[0].message, /written twice/);
});

test('FRB001: nothing of the other files is checked when the transactions cannot be read', () => {
  assert.deepEqual(idsOf('id,amount\nT1,"5\n', ngRules()), ['FRB001']);
});

test('FRB001: a rules file that is fine next to it is not a finding', () => {
  assert.deepEqual(ofCheck(S, ngRules(), 'FRB001'), []);
});

test('FRB002: an action that is not known, an operator that is not known, an in that is not a list', () => {
  const rules = [
    rule('R1', leaf('country', 'eq', 'NG'), { action: 'stop' }),
    rule('R2', leaf('country', 'likes', 'NG')),
    rule('R3', leaf('country', 'in', 'NG'))
  ];
  assert.equal(ofCheck(S, rulesText(rules), 'FRB002').length, 3);
});

test('FRB002: a limit out of range', () => {
  assert.equal(ofCheck(S, rulesText([ngRule({ min_precision: 2 })]), 'FRB002').length, 1);
  assert.equal(ofCheck(S, rulesText([ngRule()], { limits: { max_hold_per_thousand: -5 } }), 'FRB002').length, 1);
});

test('FRB002: a transaction row with the wrong number of cells, at its line, and the rows around it are read', () => {
  const text = 'id,country,is_fraud\nT1,NG,1\nT2,NG\nT3,DE,0\n';
  const f = ofCheck(text, ngRules(), 'FRB002');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 3);
  assert.equal(f[0].file, 'transactions');
});

test('FRB002: a rule with no condition is replayed as a rule that never fires, and is not reported twice', () => {
  const run = idsOf(S, rulesText([ngRule(), rule('R2', undefined)]));
  assert.deepEqual(run, ['FRB002']);
});

test('FRB003: a key the tool does not read, with the nearest name; the keys it reads are not reported', () => {
  const f = ofCheck(S, rulesText([ngRule({ min_presicion: 0.5 })]), 'FRB003');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /did you mean "min_precision"/);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ min_precision: 0.5, max_alert_rate: 500, note: 'x' })], { description: 'y' }), 'FRB003'), []);
});

// FRB004 to FRB011: the rules.
test('FRB004: two rules with one id, compared without case, at the line of the second', () => {
  const text = rulesText([ngRule(), rule('r1', leaf('amount', 'gte', 100))]);
  const f = ofCheck(S, text, 'FRB004');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, lineOf(text, '"id": "r1"'));
  assert.match(f[0].message, /"r1" is used by two rules: at line \d+ and at line \d+/);
});

test('FRB004: ids that differ by more than case are two ids', () => {
  assert.deepEqual(on([ngRule(), rule('R2', leaf('amount', 'gte', 100))]), ['FRB025']);
});

test('FRB005: a rule with no owner, and one with an owner of spaces only', () => {
  assert.equal(ofCheck(S, rulesText([ngRule({ owner: undefined })]), 'FRB005').length, 1);
  assert.equal(ofCheck(S, rulesText([ngRule({ owner: '   ' })]), 'FRB005').length, 1);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ owner: 'Team' })]), 'FRB005'), []);
});

test('FRB006: a rule with no action is an error, and a rule with a wrong action is FRB002 only', () => {
  assert.equal(ofCheck(S, rulesText([ngRule({ action: undefined })]), 'FRB006').length, 1);
  assert.equal(ofCheck(S, rulesText([ngRule({ action: '' })]), 'FRB006').length, 1);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ action: 'stop' })]), 'FRB006'), []);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ action: 'hold' })]), 'FRB006'), []);
});

test('FRB007: a between range with the low end above the high end, for numbers and for times', () => {
  const f = ofCheck(S, rulesText([rule('R1', leaf('amount', 'between', [500, 100]))]), 'FRB007');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /low end 500 above the high end 100/);
  assert.equal(ofCheck(S, rulesText([rule('R1', leaf('timestamp', 'between', [1700000500, 1700000100]))]), 'FRB007').length, 1);
});

test('FRB007: equal ends and a right order are not reported', () => {
  assert.deepEqual(ofCheck(S, rulesText([rule('R1', leaf('amount', 'between', [100, 100]))]), 'FRB007'), []);
  assert.deepEqual(ofCheck(S, rulesText([rule('R1', leaf('amount', 'between', [100, 500]))]), 'FRB007'), []);
});

test('FRB008: a field that is not a column, with the nearest column; a field in other case is a column', () => {
  const f = ofCheck(S, rulesText([rule('R1', leaf('contry', 'eq', 'NG'))]), 'FRB008');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /the nearest column is "country"/);
  assert.deepEqual(ofCheck(S, rulesText([rule('R1', leaf('COUNTRY', 'eq', 'NG'))]), 'FRB008'), []);
  assert.doesNotMatch(ofCheck(S, rulesText([rule('R1', leaf('zzzzzzzz', 'eq', 'NG'))]), 'FRB008')[0].message, /nearest/);
});

test('FRB008: a rule on a missing field is not also reported as a rule that never fires', () => {
  assert.deepEqual(idsOf(S, rulesText([ngRule(), rule('R2', leaf('contry', 'eq', 'NG'))])), ['FRB008']);
});

test('FRB009: gt on text, contains on a number, a text for a number, a number for text', () => {
  const rules = [
    rule('R1', leaf('country', 'gt', 'A')),
    rule('R2', leaf('amount', 'contains', '5')),
    rule('R3', leaf('amount', 'gt', 'high')),
    rule('R4', leaf('country', 'eq', 5))
  ];
  const f = ofCheck(S, rulesText(rules), 'FRB009');
  assert.equal(f.length, 4);
  assert.match(f[0].message, /operator gt is not valid for the field "country"/);
});

test('FRB009: the operators that fit are not reported', () => {
  const rules = [rule('R1', leaf('country', 'contains', 'N')), rule('R2', leaf('amount', 'between', [1, 2])), rule('R3', leaf('timestamp', 'gte', 1700000000))];
  assert.deepEqual(ofCheck(S, rulesText(rules), 'FRB009'), []);
});

test('FRB010: the same condition twice in one group, at the second', () => {
  const when = all(leaf('country', 'eq', 'NG'), leaf('amount', 'gte', 100), leaf('country', 'eq', 'NG'));
  const f = ofCheck(S, rulesText([rule('R1', when)]), 'FRB010');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /repeats the condition 'country eq "NG"' in one all group/);
});

test('FRB010: two rules with one condition, written in another order, at the second', () => {
  const a = rule('R1', all(leaf('country', 'eq', 'NG'), leaf('amount', 'gte', 100)));
  const b = rule('R2', all(leaf('amount', 'gte', 100), leaf('country', 'eq', 'NG')));
  const f = ofCheck(S, rulesText([a, b]), 'FRB010');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /same condition as the rule "R1"/);
});

test('FRB010: a different value is a different condition', () => {
  const a = rule('R1', all(leaf('country', 'eq', 'NG'), leaf('amount', 'gte', 100)));
  const b = rule('R2', all(leaf('country', 'eq', 'NG'), leaf('amount', 'gte', 101)));
  assert.deepEqual(ofCheck(S, rulesText([a, b]), 'FRB010'), []);
});

test('FRB011: a rule that blocks and has no min_precision; the same rule with one, and a hold rule without one, are not reported', () => {
  assert.equal(ofCheck(S, rulesText([ngRule({ action: 'block' })]), 'FRB011').length, 1);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ action: 'block', min_precision: 0.5 })]), 'FRB011'), []);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ action: 'hold' })]), 'FRB011'), []);
});

// FRB012 to FRB020: the transactions.
test('FRB012: no label column; the other names of the column are read', () => {
  const noLabel = scenarioText((rows) => rows.forEach((r) => { delete r.is_fraud; }));
  assert.deepEqual(idsOf(noLabel, ngRules()), ['FRB012']);
  for (const name of ['fraud', 'label', 'IS_FRAUD']) {
    const t = scenarioText((rows) => rows.forEach((r) => { r[name] = r.is_fraud; delete r.is_fraud; }));
    assert.deepEqual(ofCheck(t, ngRules(), 'FRB012'), [], name);
  }
});

test('FRB013: every labelled transaction is fraud, or none is; both kinds is fine', () => {
  const allFraud = csvOf(groups([30, { is_fraud: '1', country: 'NG' }]));
  const none = csvOf(groups([30, { is_fraud: '0', country: 'NG' }]));
  assert.match(ofCheck(allFraud, ngRules(), 'FRB013')[0].message, /all 30 labelled transactions are fraud/);
  assert.match(ofCheck(none, ngRules(), 'FRB013')[0].message, /none of the 30 labelled transactions is fraud/);
  assert.deepEqual(ofCheck(S, ngRules(), 'FRB013'), []);
});

test('FRB013: one fraud among good transactions is not a one-sided file', () => {
  const t = csvOf(groups([1, { is_fraud: '1', country: 'NG' }], [20, { is_fraud: '0', country: 'DE' }]));
  assert.deepEqual(ofCheck(t, ngRules(), 'FRB013'), []);
});

test('FRB013: the rules are not replayed on labels that cannot be used, and the report says so', () => {
  const none = csvOf(groups([30, { is_fraud: '0', country: 'NG' }]));
  const run = runOfNotes(none);
  assert.ok(run.notes.some((n) => /not replayed because the labels cannot be used/.test(n)));
  assert.equal(run.results, null);
});

test('FRB014: a label that is not recognised, once for each value with the count; an empty label once with the count', () => {
  const t = scenarioText((rows) => { rows[0].is_fraud = 'maybe'; rows[1].is_fraud = 'Maybe'; rows[2].is_fraud = 'pending'; rows[3].is_fraud = ''; rows[4].is_fraud = ''; });
  const f = ofCheck(t, ngRules(), 'FRB014');
  assert.equal(f.length, 3);
  assert.ok(msg(f).some((m) => /The label "maybe" is not recognised on 2 transactions/.test(m)));
  assert.ok(msg(f).some((m) => /The label "pending" is not recognised on 1 transaction,/.test(m)));
  assert.ok(msg(f).some((m) => /2 transactions have no label, the first "T4"/.test(m)));
});

test('FRB014: the values the tool reads, in any case, are not reported', () => {
  const t = scenarioText((rows) => { rows[0].is_fraud = 'YES'; rows[1].is_fraud = 'Legit'; rows[2].is_fraud = 'true'; rows[3].is_fraud = 'No'; });
  assert.deepEqual(ofCheck(t, ngRules(), 'FRB014'), []);
});

test('FRB015: an amount that is negative, one that is text, and one that is empty', () => {
  const t = scenarioText((rows) => { rows[0].amount = '-5'; rows[1].amount = '12 EUR'; rows[2].amount = ''; });
  const f = ofCheck(t, ngRules(), 'FRB015');
  assert.equal(f.length, 3);
  assert.match(f[0].message, /"T1" has the amount -5, which is negative/);
  assert.match(f[1].message, /the amount "12 EUR", which is not a plain number/);
  assert.match(f[2].message, /has no amount/);
});

test('FRB015: zero is an amount, and a file with no amount column is not reported', () => {
  assert.deepEqual(ofCheck(scenarioText((rows) => { rows[0].amount = '0'; rows[1].amount = '0.00'; }), ngRules(), 'FRB015'), []);
  const none = scenarioText((rows) => rows.forEach((r) => { delete r.amount; }));
  assert.deepEqual(ofCheck(none, ngRules(), 'FRB015'), []);
  assert.ok(runOfNotes(none).notes.some((n) => /no amount column/.test(n)));
});

test('FRB016: two currencies and no note; the same with a note, and one currency in two cases, are not reported', () => {
  const two = scenarioText((rows) => { rows[0].currency = 'GBP'; });
  const f = ofCheck(two, ngRules(), 'FRB016');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /2 currencies \(EUR and GBP\)/);
  assert.deepEqual(ofCheck(two, ngRules({ currency_note: 'Converted at ingest.' }), 'FRB016'), []);
  assert.deepEqual(ofCheck(scenarioText((rows) => { rows[0].currency = 'eur'; }), ngRules(), 'FRB016'), []);
});

test('FRB017: a transaction id used twice, at the second, with both lines', () => {
  const t = scenarioText((rows) => { rows[9].id = rows[2].id; });
  const f = ofCheck(t, ngRules(), 'FRB017');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 11);
  assert.match(f[0].message, /"T3" is used on line 4 and on line 11/);
});

test('FRB017: empty ids and a file with no id column are not reported', () => {
  assert.deepEqual(ofCheck(scenarioText((rows) => { rows[0].id = ''; rows[1].id = ''; }), ngRules(), 'FRB017'), []);
  assert.deepEqual(ofCheck(scenarioText((rows) => rows.forEach((r) => { delete r.id; })), ngRules(), 'FRB017'), []);
});

test('FRB018: a timestamp that is not a time, and one that is empty; no timestamp column is not reported', () => {
  const t = scenarioText((rows) => { rows[0].timestamp = 'soon'; rows[1].timestamp = ''; });
  const f = ofCheck(t, ngRules(), 'FRB018');
  assert.equal(f.length, 2);
  assert.match(f[0].message, /the timestamp "soon", which is not a time/);
  assert.match(f[1].message, /has no timestamp/);
  assert.deepEqual(ofCheck(scenarioText((rows) => rows.forEach((r) => { delete r.timestamp; })), ngRules(), 'FRB018'), []);
});

test('FRB019: a transaction dated after --as-of; one at the time itself is not', () => {
  const f = ofCheck(S, ngRules(), 'FRB019', { asOf: '1700000060' });
  assert.equal(f.length, 138, 'rows 3 to 140 are after the time; the first two are at or before it');
  assert.match(f[0].message, /is dated after the --as-of time/);
  assert.deepEqual(ofCheck(S, ngRules(), 'FRB019', { asOf: String(1700000000 + 139 * 60) }), []);
});

test('FRB019: without --as-of the check does not run, and no transaction is in the future', () => {
  assert.deepEqual(ofCheck(scenarioText((rows) => { rows[0].timestamp = '4102444800'; }), ngRules(), 'FRB019'), []);
});

test('FRB019: --as-of can be an ISO text', () => {
  const f = ofCheck(S, ngRules(), 'FRB019', { asOf: `${String(1000 + 970)}-01-01T00:00:00Z` });
  assert.equal(f.length, 140);
});

test('FRB020: fewer fraud cases than the limit, with the count; exactly the limit is not reported', () => {
  const few = csvOf(groups([5, { is_fraud: '1', country: 'NG' }], [50, { is_fraud: '0', country: 'DE' }]));
  assert.match(ofCheck(few, ngRules(), 'FRB020')[0].message, /Only 5 of 55 labelled transactions are fraud \(the limit is 20\)/);
  const exact = csvOf(groups([20, { is_fraud: '1', country: 'NG' }], [50, { is_fraud: '0', country: 'DE' }]));
  assert.deepEqual(ofCheck(exact, ngRules(), 'FRB020'), []);
  assert.deepEqual(ofCheck(few, ngRules({ limits: { min_fraud_cases: 5 } }), 'FRB020'), []);
});

// FRB021 to FRB028: the results.
test('FRB021: a rule that never fires; one that fires once is not reported', () => {
  assert.equal(ofCheck(S, rulesText([ngRule(), rule('R2', leaf('country', 'eq', 'XX'))]), 'FRB021').length, 1);
  assert.deepEqual(ofCheck(S, rulesText([ngRule(), rule('R2', all(leaf('country', 'eq', 'NG'), leaf('amount', 'eq', 30)))]), 'FRB021'), []);
});

test('FRB022: a rule that fires and catches no fraud; the message has the counts', () => {
  const f = ofCheck(S, rulesText([ngRule(), rule('R2', leaf('amount', 'eq', 20))]), 'FRB022');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /"R2" fires on 100 transactions and catches none of the 30 fraud cases/);
});

test('FRB023: a rule over its alert limit; one at the limit is not', () => {
  const rate = (30 * 1000) / 140;
  assert.equal(ofCheck(S, rulesText([ngRule({ max_alert_rate: 200 })]), 'FRB023').length, 1);
  assert.match(ofCheck(S, rulesText([ngRule({ max_alert_rate: 200 })]), 'FRB023')[0].message, /fires on 214\.3 of every 1,000 transactions, above its max_alert_rate of 200/);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ max_alert_rate: rate })]), 'FRB023'), []);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ max_alert_rate: 300 })]), 'FRB023'), []);
});

test('FRB024: a rule under its precision floor; one at the floor is not', () => {
  const f = ofCheck(S, rulesText([ngRule({ min_precision: 0.8 })]), 'FRB024');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /precision of 0\.667 \(20 of 30 alerts\), under its min_precision of 0\.8/);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ min_precision: 20 / 30 })]), 'FRB024'), []);
});

test('FRB024: a rule that never fires has no precision and is FRB021 only', () => {
  assert.deepEqual(on([ngRule(), rule('R2', leaf('country', 'eq', 'XX'), { min_precision: 0.9 })]), ['FRB021']);
});

test('FRB025: a rule whose every catch another rule makes; a single rule and a rule with a catch of its own are not', () => {
  const f = ofCheck(S, rulesText([ngRule(), rule('R2', leaf('amount', 'gte', 100))]), 'FRB025');
  assert.equal(f.length, 2, 'each of the two catches only what the other catches');
  assert.deepEqual(ofCheck(S, ngRules(), 'FRB025'), []);
  const own = rule('R2', all(leaf('country', 'eq', 'DE'), leaf('amount', 'between', [30, 50])));
  assert.deepEqual(ofCheck(S, rulesText([ngRule(), own]), 'FRB025'), []);
});

test('FRB026: a rule that blocks with a precision under 0.9; a hold rule with the same precision is not reported', () => {
  const f = ofCheck(S, rulesText([ngRule({ action: 'block', min_precision: 0.5 })]), 'FRB026');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /blocks and has a precision of 0\.667 \(20 of 30 alerts\), under the block floor of 0\.9/);
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ action: 'hold' })]), 'FRB026'), []);
});

test('FRB026: the floor can be set in the rules file', () => {
  assert.deepEqual(ofCheck(S, rulesText([ngRule({ action: 'block', min_precision: 0.5 })], { limits: { block_min_precision: 0.6 } }), 'FRB026'), []);
  assert.equal(ofCheck(S, rulesText([ngRule({ action: 'block', min_precision: 0.5 })], { limits: { block_min_precision: 0.7 } }), 'FRB026').length, 1);
});

test('FRB027: a hold queue over the limit; under it, and no limit at all, are not reported', () => {
  const hold = ngRule({ action: 'hold' });
  const f = ofCheck(S, rulesText([hold], { limits: { max_hold_per_thousand: 100 } }), 'FRB027');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /takes 214\.3 of every 1,000 transactions \(30 of 140\), above max_hold_per_thousand of 100/);
  assert.deepEqual(ofCheck(S, rulesText([hold], { limits: { max_hold_per_thousand: 300 } }), 'FRB027'), []);
  assert.deepEqual(ofCheck(S, rulesText([hold]), 'FRB027'), []);
});

test('FRB027: only the rows whose strongest action is hold count', () => {
  const rules = [ngRule({ action: 'hold' }), rule('R2', leaf('amount', 'gte', 100), { action: 'block', min_precision: 0.9 })];
  assert.deepEqual(ofCheck(S, rulesText(rules, { limits: { max_hold_per_thousand: 80 } }), 'FRB027'), [], '10 held rows in 140 are 71.4 for each thousand');
  assert.equal(ofCheck(S, rulesText(rules, { limits: { max_hold_per_thousand: 70 } }), 'FRB027').length, 1);
});

test('FRB028: a rule that caught a few fraud cases is low evidence, with the count; five is enough', () => {
  const few = csvOf(groups([4, { is_fraud: '1', country: 'NG' }], [20, { is_fraud: '1', country: 'DE' }], [40, { is_fraud: '0', country: 'DE' }]));
  const f = ofCheck(few, ngRules(), 'FRB028');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /caught only 4 fraud cases in 4 alerts; low evidence, its precision rests on fewer than 5 cases/);
  const five = csvOf(groups([5, { is_fraud: '1', country: 'NG' }], [20, { is_fraud: '1', country: 'DE' }], [40, { is_fraud: '0', country: 'DE' }]));
  assert.deepEqual(ofCheck(five, ngRules(), 'FRB028'), []);
  assert.deepEqual(ofCheck(few, ngRules({ limits: { min_true_positives: 4 } }), 'FRB028'), []);
});

// FRB029 and FRB030: the comparison.
const cmp = (current, candidate, id, candidateOver, options) => compareOf(S, rulesText(current), rulesText(candidate, candidateOver), options).findings.filter((f) => f.id === id);

test('FRB029: a candidate that loses fraud the current set catches, with the count and the amount', () => {
  const f = cmp([ngRule()], [rule('R1', leaf('amount', 'gte', 600))], 'FRB029');
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'candidate');
  assert.match(f[0].message, /loses 20 fraud cases that the current set catches \(amount 10,000\.00\), above max_lost_fraud of 0/);
});

test('FRB029: no fraud lost is no finding, and max_lost_fraud lets a few go', () => {
  assert.deepEqual(cmp([ngRule()], [ngRule()], 'FRB029'), []);
  assert.deepEqual(cmp([ngRule()], [rule('R1', leaf('amount', 'gte', 600))], 'FRB029', { limits: { max_lost_fraud: 20 } }), []);
  assert.equal(cmp([ngRule()], [rule('R1', leaf('amount', 'gte', 600))], 'FRB029', { limits: { max_lost_fraud: 19 } }).length, 1);
});

test('FRB030: a candidate that adds false alarms over the limit; the limit is read from the candidate file', () => {
  const candidate = [ngRule(), rule('R2', leaf('amount', 'eq', 20))];
  const f = cmp([ngRule()], candidate, 'FRB030', { limits: { max_new_false_alarms: 50 } });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /adds 100 false alarms that the current set does not raise \(amount 2,000\.00\), above max_new_false_alarms of 50/);
  assert.deepEqual(cmp([ngRule()], candidate, 'FRB030', { limits: { max_new_false_alarms: 100 } }), []);
});

test('FRB030: with no limit set the check does not run', () => {
  assert.deepEqual(cmp([ngRule()], [ngRule(), rule('R2', leaf('amount', 'eq', 20))], 'FRB030'), []);
});

test('compare: the checks of the results are made on the candidate and not on the current set', () => {
  const current = [ngRule(), rule('R2', leaf('country', 'eq', 'XX'))];
  const candidate = [ngRule()];
  const r = compareOf(S, rulesText(current), rulesText(candidate));
  assert.deepEqual(r.findings.filter((f) => f.id === 'FRB021'), []);
  const r2 = compareOf(S, rulesText(candidate), rulesText(current));
  assert.equal(r2.findings.filter((f) => f.id === 'FRB021').length, 1);
  assert.equal(r2.findings.find((f) => f.id === 'FRB021').file, 'candidate');
});

test('compare: the checks of the rules are made on both files, each at its own place', () => {
  const r = compareOf(S, rulesText([ngRule({ owner: undefined })]), rulesText([ngRule({ owner: undefined })]));
  assert.deepEqual(r.findings.filter((f) => f.id === 'FRB005').map((f) => f.file).sort(), ['candidate', 'current']);
});

test('sweep: only the checks of the files and of the data run', () => {
  const t = scenarioText((rows) => { rows[0].amount = '-1'; });
  const r = sweepOf(t.replace('is_fraud', 'score,is_fraud').split('\n').map((l, i) => (i === 0 ? l : l.replace(/,([01])$/, ',0.5,$1'))).join('\n'));
  assert.deepEqual([...new Set(r.findings.map((f) => f.id))], ['FRB015']);
});

test('the scenario rows are what the tests count on', () => {
  const rows = scenario();
  assert.equal(rows.length, 140);
  assert.equal(rows.filter((r) => r.is_fraud === '1').length, 30);
});
