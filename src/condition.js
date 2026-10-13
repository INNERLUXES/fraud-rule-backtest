// The evaluator of a condition. A condition is compiled once into a function of the row number, through a walk that never calls
// itself, and then run on each row. A leaf compares one column with a value; an empty cell is no value, and a leaf is false on it
// for every operator. A group is all, any or not of the conditions inside it. Nothing is evaluated from the text of the file: the
// operators are a fixed list and no pattern is built from a value.

import { OPERATORS_BY_TYPE } from './data.js';
import { columnOf } from './dataset.js';
import { childrenOf } from './ruleset.js';
import { fold } from './tree.js';
import { parseTime } from './time.js';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// A literal of a rule as a number for a number or time column, or null.
export function literalOf(value, type) {
  if (type === 'time') {
    if (isNumber(value)) return value;
    return typeof value === 'string' ? parseTime(value) : null;
  }
  return isNumber(value) ? value : null;
}

// What is wrong with a leaf set against its column: a message, or null when the operator and the value fit the type of the field.
export function leafProblem(leaf, column) {
  const { op, field, value } = leaf;
  const type = column.type;
  const word = type === 'text' ? 'text' : type === 'time' ? 'a time' : 'numbers';
  if (!OPERATORS_BY_TYPE[type].includes(op)) {
    return `the operator ${op} is not valid for the field "${field}", which holds ${word}; it can use ${OPERATORS_BY_TYPE[type].join(', ')}`;
  }
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    if (type === 'text') {
      if (typeof v !== 'string') return `the value ${v} of "${field}" is a number, but the field holds text; write it in quotes`;
    } else if (literalOf(v, type) === null) {
      return `the value ${typeof v === 'string' ? `"${v}"` : v} of "${field}" is not ${type === 'time' ? 'a time' : 'a number'}, but the field holds ${word}`;
    }
  }
  return null;
}

// The compiled function of a leaf, or null when the leaf cannot be evaluated (no such column, or a value that does not fit).
function compileLeaf(leaf, dataset) {
  const column = columnOf(dataset, leaf.field);
  if (column === undefined || leafProblem(leaf, column) !== null) return null;
  const v = column.values;
  const { op } = leaf;
  if (column.type === 'text') {
    if (op === 'eq') return (i) => v[i] !== null && v[i] === leaf.value;
    if (op === 'ne') return (i) => v[i] !== null && v[i] !== leaf.value;
    if (op === 'contains') return (i) => v[i] !== null && v[i].includes(leaf.value);
    const set = new Set(leaf.value);
    if (op === 'in') return (i) => v[i] !== null && set.has(v[i]);
    return (i) => v[i] !== null && !set.has(v[i]);
  }
  const lit = (x) => literalOf(x, column.type);
  if (op === 'in' || op === 'not_in') {
    const set = new Set(leaf.value.map(lit));
    return op === 'in' ? (i) => v[i] !== null && set.has(v[i]) : (i) => v[i] !== null && !set.has(v[i]);
  }
  if (op === 'between') {
    const lo = lit(leaf.value[0]);
    const hi = lit(leaf.value[1]);
    return (i) => v[i] !== null && v[i] >= lo && v[i] <= hi;
  }
  const c = lit(leaf.value);
  if (op === 'eq') return (i) => v[i] !== null && v[i] === c;
  if (op === 'ne') return (i) => v[i] !== null && v[i] !== c;
  if (op === 'gt') return (i) => v[i] !== null && v[i] > c;
  if (op === 'gte') return (i) => v[i] !== null && v[i] >= c;
  if (op === 'lt') return (i) => v[i] !== null && v[i] < c;
  return (i) => v[i] !== null && v[i] <= c;
}

// Compiles a condition tree into a function of the row number. A leaf that cannot be evaluated is false on every row, and the
// result says so in unevaluable (the number of such leaves).
export function compile(tree, dataset) {
  let unevaluable = 0;
  const fn = fold(tree, childrenOf, (node, kids) => {
    if (node.kind === 'leaf') {
      const f = compileLeaf(node, dataset);
      if (f === null) {
        unevaluable += 1;
        return () => false;
      }
      return f;
    }
    if (node.kind === 'all') return (i) => kids.length > 0 && kids.every((k) => k(i));
    if (node.kind === 'any') return (i) => kids.some((k) => k(i));
    return kids.length === 0 ? () => false : (i) => !kids[0](i);
  });
  return { fn, unevaluable };
}

// The text of a literal in a canonical form.
const lit = (v) => JSON.stringify(v);

// A text for a condition that is the same for conditions that mean the same: the parts of an all or an any group in order, with
// the same part written twice kept as written. Used to find rules and parts that repeat each other.
export function canonical(tree) {
  return fold(tree, childrenOf, (node, kids) => {
    if (node.kind === 'leaf') return `${node.field.trim().toLowerCase()} ${node.op} ${lit(node.value)}`;
    if (node.kind === 'not') return `not(${kids[0] ?? ''})`;
    return `${node.kind}(${[...kids].sort().join(' ; ')})`;
  });
}

// The text of one leaf, for a message.
export const leafText = (leaf) => `${leaf.field} ${leaf.op} ${Array.isArray(leaf.value) ? `[${leaf.value.map(lit).join(', ')}]` : lit(leaf.value)}`;
