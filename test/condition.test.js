import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, columnOf, compile, leafProblem, leafText, literalOf, OPERATORS, OPERATORS_BY_TYPE } from '../src/index.js';
import { datasetOf, yr } from './helpers.js';

// Four rows: a small amount from DE, a mid amount from NG, a large amount from FR, and a row with no value in any field.
const D = datasetOf('id,amount,country,channel,timestamp,is_fraud\nT1,10,DE,web,1700000000,0\nT2,100,NG,app,1700003600,1\nT3,500,FR,web,1700007200,1\nT4,,,pos,,0\n');
const leaf = (field, op, value) => ({ kind: 'leaf', field, op, value, line: 1, col: 1 });
const group = (kind, ...items) => ({ kind, items, line: 1, col: 1 });
const neg = (item) => ({ kind: 'not', item, line: 1, col: 1 });
const rowsOf = (tree) => {
  const { fn } = compile(tree, D);
  return [0, 1, 2, 3].map((i) => fn(i));
};
const T = true;
const F = false;

// Each operator on a number field.
test('condition: every operator on a number field, with the empty cell false for all of them', () => {
  for (const [op, value, expected] of [
  ['eq', 100, [F, T, F, F]],
  ['ne', 100, [T, F, T, F]],
  ['gt', 100, [F, F, T, F]],
  ['gte', 100, [F, T, T, F]],
  ['lt', 100, [T, F, F, F]],
  ['lte', 100, [T, T, F, F]],
  ['in', [10, 500], [T, F, T, F]],
  ['not_in', [10, 500], [F, T, F, F]],
  ['between', [10, 100], [T, T, F, F]],
  ['between', [100, 100], [F, T, F, F]],
  ['between', [100, 10], [F, F, F, F]],
  ['eq', 0.5, [F, F, F, F]],
  ['gt', -1, [T, T, T, F]]
  ]) {
    assert.deepEqual(rowsOf(leaf('amount', op, value)), expected, `amount ${op} ${JSON.stringify(value)}`);
  }
});

// Each operator on a text field.
test('condition: every operator on a text field, exact and with case', () => {
  for (const [op, value, expected] of [
  ['eq', 'NG', [F, T, F, F]],
  ['eq', 'ng', [F, F, F, F]],
  ['ne', 'NG', [T, F, T, F]],
  ['in', ['DE', 'FR'], [T, F, T, F]],
  ['not_in', ['DE'], [F, T, T, F]],
  ['contains', 'N', [F, T, F, F]],
  ['contains', 'R', [F, F, T, F]],
  ['contains', 'Z', [F, F, F, F]],
  ['contains', 'G', [F, T, F, F]]
  ]) {
    assert.deepEqual(rowsOf(leaf('country', op, value)), expected, `country ${op} ${JSON.stringify(value)}`);
  }
});

// Each operator on a time field, written as a number and as an ISO text.
const FIRST = `${yr(23)}-11-14T22:13:20Z`;
const SECOND = `${yr(23)}-11-14T23:13:20Z`;
test('condition: every operator on a time field, written as a number and as an ISO text', () => {
  for (const [op, value, expected] of [
  ['eq', 1700000000, [T, F, F, F]],
  ['eq', FIRST, [T, F, F, F]],
  ['ne', FIRST, [F, T, T, F]],
  ['gt', FIRST, [F, T, T, F]],
  ['gte', SECOND, [F, T, T, F]],
  ['lt', SECOND, [T, F, F, F]],
  ['lte', SECOND, [T, T, F, F]],
  ['between', [FIRST, SECOND], [T, T, F, F]],
  ['between', [1700000001, 1700007200], [F, T, T, F]]
  ]) {
    assert.deepEqual(rowsOf(leaf('timestamp', op, value)), expected, `timestamp ${op} ${JSON.stringify(value).slice(0, 40)}`);
  }
});

test('condition: a field is found without case and extra spaces', () => {
  assert.deepEqual(rowsOf(leaf('  AMOUNT ', 'eq', 100)), [F, T, F, F]);
});

test('condition: an empty cell is no value, and every operator is false on it, ne and not_in included', () => {
  for (const [field, op, value] of [['amount', 'ne', 5], ['amount', 'not_in', [5]], ['country', 'ne', 'XX'], ['country', 'not_in', ['XX']]]) {
    assert.equal(compile(leaf(field, op, value), D).fn(3), false, `${field} ${op}`);
  }
});

test('condition: all is true when every part is, any when one is, not when the part is false', () => {
  const a = leaf('amount', 'gte', 100);
  const c = leaf('country', 'eq', 'NG');
  assert.deepEqual(rowsOf(group('all', a, c)), [F, T, F, F]);
  assert.deepEqual(rowsOf(group('any', a, c)), [F, T, T, F]);
  assert.deepEqual(rowsOf(neg(c)), [T, F, T, T]);
  assert.deepEqual(rowsOf(neg(group('any', a, c))), [T, F, F, T]);
});

test('condition: groups nest', () => {
  const tree = group('any', group('all', leaf('channel', 'eq', 'web'), leaf('amount', 'gt', 50)), neg(leaf('country', 'in', ['DE', 'NG', 'FR'])));
  assert.deepEqual(rowsOf(tree), [F, F, T, T]);
});

test('condition: not around a leaf matches the empty row, which is how to say "no value or not this"', () => {
  assert.deepEqual(rowsOf(neg(leaf('country', 'eq', 'DE'))), [F, T, T, T]);
});

test('condition: an empty all is false, so a group with its parts left out never fires', () => {
  assert.deepEqual(rowsOf(group('all')), [F, F, F, F]);
  assert.deepEqual(rowsOf(group('any')), [F, F, F, F]);
});

test('compile: a not group whose part was left out is false on every row, so a rule with a broken part never fires', () => {
  assert.deepEqual(rowsOf(neg(null)), [F, F, F, F]);
});

test('compile: a field that is not a column cannot be evaluated; the leaf is false and is counted', () => {
  const c = compile(leaf('nothing', 'eq', 1), D);
  assert.equal(c.unevaluable, 1);
  assert.equal(c.fn(0), false);
});

test('compile: an operator that does not fit the type cannot be evaluated', () => {
  assert.equal(compile(leaf('country', 'gt', 'A'), D).unevaluable, 1);
  assert.equal(compile(leaf('amount', 'contains', '1'), D).unevaluable, 1);
  assert.equal(compile(leaf('timestamp', 'in', [1]), D).unevaluable, 1);
});

test('compile: a value that does not fit the type cannot be evaluated', () => {
  assert.equal(compile(leaf('amount', 'gt', 'high'), D).unevaluable, 1);
  assert.equal(compile(leaf('country', 'eq', 5), D).unevaluable, 1);
  assert.equal(compile(leaf('country', 'in', ['DE', 5]), D).unevaluable, 1);
  assert.equal(compile(leaf('timestamp', 'gt', 'soon'), D).unevaluable, 1);
});

test('compile: the leaves that cannot be evaluated are counted one by one, inside groups too', () => {
  const tree = group('all', leaf('nothing', 'eq', 1), group('any', leaf('country', 'gt', 'A'), leaf('amount', 'gt', 1)));
  const c = compile(tree, D);
  assert.equal(c.unevaluable, 2);
  assert.equal(c.fn(2), false);
});

test('compile: a valid condition counts no leaf as unevaluable', () => {
  assert.equal(compile(group('all', leaf('amount', 'gt', 1), leaf('country', 'eq', 'DE')), D).unevaluable, 0);
});

test('literalOf: a number column takes a number, a time column a number or a time text', () => {
  assert.equal(literalOf(5, 'number'), 5);
  assert.equal(literalOf('5', 'number'), null);
  assert.equal(literalOf(true, 'number'), null);
  assert.equal(literalOf(1700000000, 'time'), 1700000000);
  assert.equal(literalOf(FIRST, 'time'), 1700000000);
  assert.equal(literalOf('soon', 'time'), null);
  assert.equal(literalOf(null, 'time'), null);
});

test('leafProblem: every operator that a type does not take is named, and the ones it takes are not', () => {
  for (const type of ['number', 'time', 'text']) {
    const column = { type };
    for (const op of OPERATORS) {
      const value = op === 'in' || op === 'not_in' ? [type === 'text' ? 'a' : 1] : op === 'between' ? [type === 'text' ? 'a' : 1, type === 'text' ? 'b' : 2] : type === 'text' ? 'a' : 1;
      const problem = leafProblem({ field: 'f', op, value }, column);
      if (OPERATORS_BY_TYPE[type].includes(op)) assert.equal(problem, null, `${type} ${op}`);
      else assert.match(problem, new RegExp(`the operator ${op} is not valid for the field "f"`), `${type} ${op}`);
    }
  }
});

test('leafProblem: the message says what the field holds and what it can use', () => {
  assert.match(leafProblem(leaf('c', 'gt', 'A'), { type: 'text' }), /which holds text; it can use eq, ne, in, not_in, contains/);
  assert.match(leafProblem(leaf('a', 'contains', 'A'), { type: 'number' }), /which holds numbers/);
  assert.match(leafProblem(leaf('t', 'in', [1]), { type: 'time' }), /which holds a time/);
});

test('leafProblem: a value of the wrong kind is named', () => {
  assert.match(leafProblem(leaf('c', 'eq', 5), { type: 'text' }), /the value 5 of "c" is a number, but the field holds text/);
  assert.match(leafProblem(leaf('a', 'gt', 'high'), { type: 'number' }), /the value "high" of "a" is not a number/);
  assert.match(leafProblem(leaf('t', 'gt', 'soon'), { type: 'time' }), /is not a time/);
  assert.equal(leafProblem(leaf('t', 'gt', 5), { type: 'time' }), null);
});

test('canonical: the parts of a group in another order give the same text', () => {
  const a = leaf('amount', 'gt', 1);
  const b = leaf('country', 'eq', 'DE');
  assert.equal(canonical(group('all', a, b)), canonical(group('all', b, a)));
  assert.equal(canonical(group('any', a, b)), canonical(group('any', b, a)));
});

test('canonical: all and any, different values, different operators and different fields give different texts', () => {
  const a = leaf('amount', 'gt', 1);
  const b = leaf('country', 'eq', 'DE');
  const texts = new Set([canonical(group('all', a, b)), canonical(group('any', a, b)), canonical(a), canonical(leaf('amount', 'gt', 2)), canonical(leaf('amount', 'gte', 1)), canonical(leaf('amounts', 'gt', 1)), canonical(neg(a))]);
  assert.equal(texts.size, 7);
});

test('canonical: a field is compared without case, and a number is not a text', () => {
  assert.equal(canonical(leaf('Amount', 'gt', 1)), canonical(leaf(' amount ', 'gt', 1)));
  assert.notEqual(canonical(leaf('a', 'eq', 1)), canonical(leaf('a', 'eq', '1')));
});

test('canonical: a group that holds the same part twice keeps both', () => {
  const a = leaf('amount', 'gt', 1);
  assert.notEqual(canonical(group('all', a, a)), canonical(group('all', a)));
});

test('leafText: the field, the operator and the value', () => {
  assert.equal(leafText(leaf('amount', 'gte', 300)), 'amount gte 300');
  assert.equal(leafText(leaf('country', 'in', ['NG', 'RU'])), 'country in ["NG", "RU"]');
  assert.equal(leafText(leaf('country', 'eq', 'NG')), 'country eq "NG"');
});

test('condition: columnOf finds the column the leaf runs on', () => {
  assert.equal(columnOf(D, 'amount').type, 'number');
});
