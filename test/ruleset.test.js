import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS, childrenOf, leavesOf, parseJson, readCondition, readRuleSet } from '../src/index.js';
import { all, any, leaf, lineOf, not, rule, rulesText } from './helpers.js';

// Reads a rules text and gives the model and the findings added on the way.
function read(text, options = {}) {
  const found = [];
  const model = readRuleSet(parseJson(text), (id, where, message) => found.push({ id, ...where, message }), options);
  return { model, found };
}
const ids = (found) => found.map((f) => f.id);
const one = (r, over, extra) => read(rulesText([{ ...r, ...over }], extra));
const base = () => rule('R1', leaf('amount', 'gte', 100));

test('readRuleSet: a rule set is read with its name, its currency note, its limits and its rules', () => {
  const { model, found } = read(rulesText([base(), rule('R2', leaf('country', 'eq', 'NG'), { action: 'hold' })], { name: 'Mine', currency_note: 'All in EUR.', limits: { max_hold_per_thousand: 20, min_true_positives: 3 } }));
  assert.deepEqual(found, []);
  assert.equal(model.name, 'Mine');
  assert.equal(model.currencyNote, 'All in EUR.');
  assert.equal(model.rules.length, 2);
  assert.deepEqual(model.rules.map((r) => r.id), ['R1', 'R2']);
  assert.equal(model.limit('max_hold_per_thousand'), 20);
  assert.equal(model.limit('min_true_positives'), 3);
  assert.equal(model.limitSet('max_hold_per_thousand'), true);
});

test('readRuleSet: a limit with a default has it when the file does not set it, and one without has none', () => {
  const { model } = read(rulesText([base()]));
  assert.equal(model.limit('block_min_precision'), 0.9);
  assert.equal(model.limit('min_true_positives'), 5);
  assert.equal(model.limit('min_fraud_cases'), 20);
  assert.equal(model.limit('max_lost_fraud'), 0);
  assert.equal(model.limit('max_hold_per_thousand'), null);
  assert.equal(model.limit('max_new_false_alarms'), null);
  assert.equal(model.limitSet('block_min_precision'), false);
});

test('readRuleSet: a rule keeps its id, name, owner, action and limits, and the line of each', () => {
  const text = rulesText([rule('R1', leaf('amount', 'gte', 100), { action: 'Block', max_alert_rate: 25, min_precision: 0.8 })]);
  const { model } = read(text);
  const r = model.rules[0];
  assert.equal(r.id, 'R1');
  assert.equal(r.name, 'Rule R1');
  assert.equal(r.owner, 'Risk team');
  assert.equal(r.action, 'block', 'the action is read without case');
  assert.equal(r.maxAlertRate, 25);
  assert.equal(r.minPrecision, 0.8);
  assert.equal(r.idLine, lineOf(text, '"id"'));
  assert.equal(r.actionLine, lineOf(text, '"action"'));
  assert.equal(r.rateLine, lineOf(text, '"max_alert_rate"'));
  assert.equal(r.floorLine, lineOf(text, '"min_precision"'));
  assert.equal(r.broken, false);
});

test('readRuleSet: an id that is a number is read as text', () => {
  const { model, found } = read(rulesText([rule(7, leaf('amount', 'gt', 1))]));
  assert.equal(model.rules[0].id, '7');
  assert.deepEqual(found, []);
});

test('readRuleSet: the root must be a mapping with a rules list', () => {
  for (const text of ['[1]', '"x"', '{}', '{"rules": []}', '{"rules": {"a": 1}}']) {
    const { model, found } = read(text);
    assert.equal(model, null, text);
    assert.equal(found[0].id, 'FRB001', text);
  }
});

test('readRuleSet: more rules than the limit are refused whole', () => {
  const rules = Array.from({ length: 3 }, (_, i) => rule(`R${i}`, leaf('amount', 'gt', 1)));
  const { model, found } = read(rulesText(rules), { limits: { ...WORK_LIMITS, maxRules: 2 } });
  assert.equal(model, null);
  assert.match(found[0].message, /holds more than 2 rules/);
  assert.notEqual(read(rulesText(rules), { limits: { ...WORK_LIMITS, maxRules: 3 } }).model, null);
});

test('readRuleSet: an unknown key is a FRB003 finding with the nearest name and the line', () => {
  const text = rulesText([rule('R1', leaf('amount', 'gt', 1), { onwer: 'x', max_alert_rat: 5 })], { limit: {} });
  const { found } = read(text);
  assert.deepEqual(ids(found), ['FRB003', 'FRB003', 'FRB003']);
  assert.match(found[0].message, /The rules file has the key "limit".*did you mean "limits"/);
  assert.match(found[1].message, /Rule 1 has the key "onwer".*did you mean "owner"/);
  assert.match(found[2].message, /"max_alert_rat".*did you mean "max_alert_rate"/);
  assert.equal(found[0].line, lineOf(text, '"limit"'));
});

test('readRuleSet: an unknown key far from every name has no suggestion', () => {
  const { found } = read(rulesText([rule('R1', leaf('amount', 'gt', 1), { zzzzzzzzzz: 1 })]));
  assert.equal(found.length, 1);
  assert.doesNotMatch(found[0].message, /did you mean/);
});

test('readRuleSet: a rule that is not a mapping is a FRB002 finding and is left out', () => {
  const { model, found } = read('{"rules": [5, {"id": "R1", "when": {"field": "amount", "op": "gt", "value": 1}}]}');
  assert.equal(model.rules.length, 1);
  assert.equal(found[0].id, 'FRB002');
  assert.match(found[0].message, /Rule 1 must be a mapping/);
});

test('readRuleSet: a rule with no id is named by its place, and the finding says so', () => {
  const { model, found } = one(base(), { id: undefined });
  assert.equal(model.rules[0].id, '(rule 1)');
  assert.equal(model.rules[0].noId, true);
  assert.match(found[0].message, /Rule 1 has no "id"/);
});

test('readRuleSet: a rule with no condition is broken and is a FRB002 finding', () => {
  const { model, found } = one(base(), { when: undefined });
  assert.equal(model.rules[0].broken, true);
  assert.equal(model.rules[0].condition, null);
  assert.match(found[0].message, /has no "when" condition/);
});

test('readRuleSet: an action that is not flag, hold or block is a FRB002 finding with the nearest word, and is not a missing action', () => {
  const { model, found } = one(base(), { action: 'blokc' });
  assert.equal(model.rules[0].action, '');
  assert.equal(model.rules[0].actionInvalid, true);
  assert.match(found[0].message, /the action "blokc" is not one of flag, hold, block \(did you mean "block"\?\)/);
});

test('readRuleSet: an action that is not text is a FRB002 finding', () => {
  const { found } = one(base(), { action: ['block'] });
  assert.equal(found.length, 1);
  assert.match(found[0].message, /the action must be text, but it is a list/);
});

test('readRuleSet: no action is no finding here; the check of the rules reports it', () => {
  const { model, found } = one(base(), { action: undefined });
  assert.equal(model.rules[0].action, '');
  assert.equal(model.rules[0].actionInvalid, false);
  assert.deepEqual(found, []);
});

test('readRuleSet: a name or an owner that is not text is a FRB002 finding', () => {
  const { found } = one(base(), { name: ['x'], owner: { a: 1 } });
  assert.deepEqual(ids(found), ['FRB002', 'FRB002']);
});

test('readRuleSet: max_alert_rate and min_precision out of range are FRB002 findings and are not kept', () => {
  for (const [key, value] of [['max_alert_rate', -1], ['max_alert_rate', 1001], ['max_alert_rate', 'many'], ['min_precision', 1.5], ['min_precision', -0.1], ['min_precision', '0.5']]) {
    const { model, found } = one(base(), { [key]: value });
    assert.equal(found.length, 1, `${key} ${value}`);
    assert.equal(found[0].id, 'FRB002');
    assert.equal(model.rules[0][key === 'max_alert_rate' ? 'maxAlertRate' : 'minPrecision'], null);
  }
});

test('readRuleSet: the ends of the range are allowed', () => {
  const { model, found } = one(base(), { max_alert_rate: 1000, min_precision: 0 });
  assert.deepEqual(found, []);
  assert.equal(model.rules[0].maxAlertRate, 1000);
  assert.equal(model.rules[0].minPrecision, 0);
});

test('readRuleSet: a limit out of range or of the wrong kind is a FRB002 finding', () => {
  for (const limits of [{ max_hold_per_thousand: 5000 }, { block_min_precision: 2 }, { min_true_positives: 2.5 }, { min_fraud_cases: -1 }, { max_new_false_alarms: 'ten' }, { max_lost_fraud: 1.5 }]) {
    const { found, model } = read(rulesText([base()], { limits }));
    assert.equal(found.length, 1, JSON.stringify(limits));
    assert.equal(found[0].id, 'FRB002');
    assert.equal(model.limitValues.size, 0);
  }
});

test('readRuleSet: limits that is not a mapping is a FRB002 finding', () => {
  const { found } = read(rulesText([base()], { limits: [1] }));
  assert.match(found[0].message, /"limits" must be a mapping/);
});

test('readRuleSet: a name or a currency note that is not text is a FRB002 finding', () => {
  const { found } = read(rulesText([base()], { name: ['a'], currency_note: { a: 1 } }));
  assert.equal(found.filter((f) => f.id === 'FRB002').length, 2);
});

test('readRuleSet: the name is cleaned of control characters', () => {
  const { model } = read(rulesText([base()], { name: 'a\u0007b\u202ec' }));
  assert.equal(model.name, 'a b c');
});

test('readRuleSet: findings carry the name of the file given', () => {
  const { found } = read(rulesText([base()], { limit: {} }), { file: 'candidate' });
  assert.equal(found[0].file, 'candidate');
});

test('readCondition: a leaf is read with its field, operator and value', () => {
  const text = JSON.stringify(leaf('amount', 'gte', 5));
  const found = [];
  const r = readCondition(parseJson(text), 'R1', (id, w, m) => found.push(m), 'rules');
  assert.deepEqual(found, []);
  assert.equal(r.valid, true);
  assert.equal(r.count, 1);
  assert.deepEqual({ kind: r.tree.kind, field: r.tree.field, op: r.tree.op, value: r.tree.value }, { kind: 'leaf', field: 'amount', op: 'gte', value: 5 });
});

test('readCondition: the operator is read without case', () => {
  const r = readCondition(parseJson('{"field":"a","op":"GTE","value":1}'), 'R1', () => {}, 'rules');
  assert.equal(r.tree.op, 'gte');
});

test('readCondition: groups keep the order of their parts', () => {
  const tree = readCondition(parseJson(JSON.stringify(all(leaf('a', 'eq', 1), any(leaf('b', 'eq', 2), not(leaf('c', 'eq', 3)))))), 'R1', () => {}, 'rules').tree;
  assert.equal(tree.kind, 'all');
  assert.deepEqual(tree.items.map((i) => i.kind), ['leaf', 'any']);
  assert.deepEqual(tree.items[1].items.map((i) => i.kind), ['leaf', 'not']);
  assert.equal(tree.items[1].items[1].item.field, 'c');
  assert.deepEqual(leavesOf(tree).map((l) => l.field), ['a', 'b', 'c']);
  assert.equal(childrenOf(tree).length, 2);
});

// Conditions that cannot be read: the text, and the part of the message.
const BAD_CONDITIONS = [
  ['a number', 5, /a condition must be a mapping/],
  ['a list', [], /a condition must be a mapping/],
  ['no key at all', {}, /none of the keys field, op, value, all, any or not/],
  ['a group and a leaf together', { all: [], field: 'a' }, /either a group.*or a field with op and value, not both/],
  ['two groups', { all: [], any: [] }, /either a group/],
  ['a leaf with no field', { op: 'eq', value: 1 }, /has no "field"/],
  ['a leaf with an empty field', { field: ' ', op: 'eq', value: 1 }, /has no "field"/],
  ['a leaf with no operator', { field: 'a', value: 1 }, /no operator/],
  ['an operator that is not known', { field: 'a', op: 'gtee', value: 1 }, /the operator "gtee", which the tool does not know \(did you mean "gte"\?\)/],
  ['a leaf with no value', { field: 'a', op: 'eq' }, /has no "value"/],
  ['a value that is null', { field: 'a', op: 'eq', value: null }, /needs one text or one number/],
  ['a value that is true', { field: 'a', op: 'eq', value: true }, /true or false/],
  ['a value that is a list for eq', { field: 'a', op: 'eq', value: [1] }, /needs one text or one number/],
  ['in with a text', { field: 'a', op: 'in', value: 'NG' }, /needs a list of 1 to 500/],
  ['in with an empty list', { field: 'a', op: 'in', value: [] }, /needs a list of 1 to 500/],
  ['not_in with a mapping inside', { field: 'a', op: 'not_in', value: [{ a: 1 }] }, /needs a list/],
  ['between with one value', { field: 'a', op: 'between', value: [1] }, /needs a list of two values/],
  ['between with three values', { field: 'a', op: 'between', value: [1, 2, 3] }, /needs a list of two values/],
  ['between with a text', { field: 'a', op: 'between', value: '1,2' }, /needs a list of two values/],
  ['an all with an empty list', { all: [] }, /needs a list with at least one condition, but it is an empty list/],
  ['an any that is not a list', { any: { field: 'a', op: 'eq', value: 1 } }, /needs a list with at least one condition, but it is a mapping/]
];

test('readCondition: every condition that cannot be read is a FRB002 finding with the reason, and the condition is not valid', () => {
  for (const [name, condition, part] of BAD_CONDITIONS) {
    const found = [];
    const r = readCondition(parseJson(JSON.stringify(condition)), 'R1', (id, w, m) => found.push({ id, message: m }), 'rules');
    assert.equal(r.valid, false, name);
    assert.ok(found.length >= 1, name);
    assert.equal(found[0].id, 'FRB002', name);
    assert.match(found[0].message, part, name);
  }
});

test('readCondition: a part that cannot be read is dropped from its group and the condition is marked not valid', () => {
  const r = readCondition(parseJson(JSON.stringify(all(leaf('a', 'eq', 1), { field: 'b' }, leaf('c', 'eq', 3)))), 'R1', () => {}, 'rules');
  assert.equal(r.valid, false);
  assert.deepEqual(r.tree.items.map((i) => i.field), ['a', 'c']);
});

test('readCondition: a not group with a part that cannot be read keeps no part', () => {
  const r = readCondition(parseJson('{"not": {"field": "b"}}'), 'R1', () => {}, 'rules');
  assert.equal(r.valid, false);
  assert.equal(r.tree.item, null);
  assert.deepEqual(childrenOf(r.tree), []);
});

test('readCondition: an unknown key inside a leaf or a group is a FRB003 finding', () => {
  const found = [];
  readCondition(parseJson('{"field":"a","op":"eq","value":1,"valu":2}'), 'R1', (id, w, m) => found.push({ id, m }), 'rules');
  readCondition(parseJson('{"all":[{"field":"a","op":"eq","value":1}],"extra":1}'), 'R1', (id, w, m) => found.push({ id, m }), 'rules');
  assert.deepEqual(found.map((f) => f.id), ['FRB003', 'FRB003']);
});

test('readCondition: nesting deeper than the limit is a finding, not a stack overflow', () => {
  let c = leaf('a', 'eq', 1);
  for (let i = 0; i < 30; i += 1) c = not(c);
  const found = [];
  const r = readCondition(parseJson(JSON.stringify(c)), 'R1', (id, w, m) => found.push(m), 'rules');
  assert.equal(r.valid, false);
  assert.match(found[0], /nested deeper than 20/);
});

test('readCondition: a condition of exactly the depth limit is read', () => {
  let c = leaf('a', 'eq', 1);
  for (let i = 0; i < 19; i += 1) c = not(c);
  const r = readCondition(parseJson(JSON.stringify(c)), 'R1', () => {}, 'rules');
  assert.equal(r.valid, true);
  assert.equal(r.count, 20);
});

test('readCondition: more parts than the limit are a finding', () => {
  const found = [];
  const many = all(...Array.from({ length: 600 }, () => leaf('a', 'eq', 1)));
  const r = readCondition(parseJson(JSON.stringify(many)), 'R1', (id, w, m) => found.push(m), 'rules');
  assert.equal(r.valid, false);
  assert.equal(found.length, 1);
  assert.match(found[0], /more than 500 parts/);
});

test('readCondition: a list of more values than the limit is a finding', () => {
  const r = readCondition(parseJson(JSON.stringify(leaf('a', 'in', Array.from({ length: 501 }, (_, i) => i)))), 'R1', () => {}, 'rules');
  assert.equal(r.valid, false);
});
