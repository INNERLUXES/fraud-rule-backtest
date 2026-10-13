// Reading a rules file (JSON) into a rule set: a name, a currency note, limits and a list of rules. A rule has an id, a name, an
// owner, an action (flag, hold or block), a condition tree and optional limits of its own. A condition is a field, an operator
// and a value, or an all, any or not group of conditions. The reader works through a stack and a loop, never through a call to
// itself, keeps the line and column of every key, and turns what it cannot use into findings instead of guessing. Names from the
// file are kept in maps, never set as properties.

import { ACTIONS, GROUPS, LEAF_KEYS, LIMITS, LIMIT_DEFAULTS, LIMIT_KEYS, LIST_OPERATORS, OPERATORS, RULESET_KEYS, RULE_KEYS } from './data.js';
import { nearest } from './fields.js';
import { describe } from './nodes.js';
import { safeText } from './text.js';

const show = (t, max = 60) => safeText(t, max);
const where = (entry, file) => ({ file, line: entry.line, column: entry.col });
const at = (node, file) => ({ file, line: node.line, column: node.col });

// The text of a scalar node that holds text or a number, or null.
function textOf(node) {
  if (node === undefined || node.t !== 's' || node.v === null) return null;
  if (typeof node.v === 'string') return node.v.trim();
  if (typeof node.v === 'number') return String(node.v);
  return null;
}

// Unknown keys of a mapping as FRB003 findings with the nearest known name.
function unknownKeys(map, known, what, add, file) {
  for (const [name, entry] of map.entries) {
    if (known.includes(name)) continue;
    const near = nearest(name, known);
    add('FRB003', where(entry, file), `${what} has the key "${show(name)}", which the tool does not read${near ? ` (did you mean "${near}"?)` : ''}. What is under it is not checked.`);
  }
}

// A number in a range from a scalar entry; the problem is reported as FRB002 and null is returned.
function numberOf(entry, what, { min, max, whole = false }, add, file) {
  const node = entry.node;
  if (node.t !== 's' || typeof node.v !== 'number' || !Number.isFinite(node.v) || node.v < min || node.v > max || (whole && !Number.isInteger(node.v))) {
    add('FRB002', where(entry, file), `${what} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}, but it is ${describe(node)}${node.t === 's' && typeof node.v === 'number' ? ` (${node.v})` : ''}.`);
    return null;
  }
  return node.v;
}

// The children of a condition node, for walks.
export const childrenOf = (n) => (n.kind === 'all' || n.kind === 'any' ? n.items : n.kind === 'not' && n.item !== null ? [n.item] : []);

// The leaves of a condition, in the order of the text.
export function leavesOf(tree) {
  const out = [];
  const stack = [tree];
  while (stack.length > 0) {
    const n = stack.pop();
    if (n.kind === 'leaf') out.push(n);
    else {
      const kids = childrenOf(n);
      for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
    }
  }
  return out;
}

// The condition tree of a node, read through a stack. Returns { tree, count, valid }: tree is null when the root cannot be read,
// count the nodes read and valid false when any part was left out.
export function readCondition(rootNode, ruleId, add, file, limits = LIMITS) {
  let valid = true;
  let count = 0;
  const bad = (node, message) => {
    valid = false;
    add('FRB002', at(node, file), `The rule "${show(ruleId)}": ${message}.`);
  };
  const holder = { tree: null };
  const stack = [{ node: rootNode, depth: 1, put: (v) => { holder.tree = v; } }];
  while (stack.length > 0) {
    const { node, depth, put } = stack.pop();
    count += 1;
    if (count > limits.maxConditionNodes) {
      if (count === limits.maxConditionNodes + 1) bad(node, `the condition has more than ${limits.maxConditionNodes} parts`);
      put(null);
      continue;
    }
    if (depth > limits.maxConditionDepth) {
      bad(node, `conditions are nested deeper than ${limits.maxConditionDepth}`);
      put(null);
      continue;
    }
    if (node.t !== 'm') {
      bad(node, `a condition must be a mapping with field, op and value, or an all, any or not group, but it is ${describe(node)}`);
      put(null);
      continue;
    }
    const groupKeys = GROUPS.filter((g) => node.entries.has(g));
    const leafKeys = LEAF_KEYS.filter((k) => node.entries.has(k));
    if (groupKeys.length + (leafKeys.length > 0 ? 1 : 0) > 1) {
      bad(node, 'a condition is either a group (all, any or not) or a field with op and value, not both, and a group has one key');
      put(null);
      continue;
    }
    if (groupKeys.length === 0 && leafKeys.length === 0) {
      const names = [...node.entries.keys()];
      const near = names.length > 0 ? nearest(names[0], [...GROUPS, ...LEAF_KEYS]) : null;
      bad(node, `a condition has none of the keys field, op, value, all, any or not${near ? ` (did you mean "${near}"?)` : ''}`);
      put(null);
      continue;
    }
    if (groupKeys.length === 1) {
      const kind = groupKeys[0];
      const entry = node.entries.get(kind);
      for (const [name, e] of node.entries) if (name !== kind) add('FRB003', where(e, file), `The rule "${show(ruleId)}": a ${kind} group has the key "${show(name)}", which the tool does not read.`);
      if (kind === 'not') {
        const out = { kind, item: null, line: node.line, col: node.col };
        put(out);
        stack.push({ node: entry.node, depth: depth + 1, put: (v) => { out.item = v; } });
        continue;
      }
      if (entry.node.t !== 'q' || entry.node.items.length === 0) {
        bad(entry.node, `"${kind}" needs a list with at least one condition, but it is ${entry.node.t === 'q' ? 'an empty list' : describe(entry.node)}`);
        put(null);
        continue;
      }
      const out = { kind, items: new Array(entry.node.items.length).fill(null), line: node.line, col: node.col };
      put(out);
      entry.node.items.forEach((child, i) => stack.push({ node: child, depth: depth + 1, put: (v) => { out.items[i] = v; } }));
      continue;
    }
    // A leaf: field, op and value.
    unknownKeys(node, LEAF_KEYS, `The rule "${show(ruleId)}": a condition`, add, file);
    const field = textOf(node.entries.get('field')?.node);
    const op = textOf(node.entries.get('op')?.node)?.toLowerCase() ?? null;
    const value = node.entries.get('value')?.node;
    if (field === null || field === '') {
      bad(node, 'a condition has no "field" (the name of a column of the transactions)');
      put(null);
      continue;
    }
    if (op === null || !OPERATORS.includes(op)) {
      const near = op === null ? null : nearest(op, OPERATORS);
      bad(node, `the condition on "${show(field)}" has ${op === null ? 'no operator' : `the operator "${show(op)}", which the tool does not know`}${near ? ` (did you mean "${near}"?)` : ''} (${OPERATORS.join(', ')})`);
      put(null);
      continue;
    }
    if (value === undefined) {
      bad(node, `the condition on "${show(field)}" has no "value"`);
      put(null);
      continue;
    }
    let shaped;
    if (LIST_OPERATORS.includes(op)) {
      if (value.t !== 'q' || value.items.length === 0 || value.items.length > limits.maxListItems || value.items.some((i) => i.t !== 's' || i.v === null || typeof i.v === 'boolean')) {
        bad(value, `the operator ${op} on "${show(field)}" needs a list of 1 to ${limits.maxListItems} texts or numbers`);
        put(null);
        continue;
      }
      shaped = value.items.map((i) => i.v);
    } else if (op === 'between') {
      if (value.t !== 'q' || value.items.length !== 2 || value.items.some((i) => i.t !== 's' || i.v === null || typeof i.v === 'boolean')) {
        bad(value, `the operator between on "${show(field)}" needs a list of two values, the low end and the high end`);
        put(null);
        continue;
      }
      shaped = value.items.map((i) => i.v);
    } else {
      if (value.t !== 's' || value.v === null || typeof value.v === 'boolean') {
        bad(value, `the operator ${op} on "${show(field)}" needs one text or one number, but the value is ${typeof value.v === 'boolean' ? 'true or false' : describe(value)}`);
        put(null);
        continue;
      }
      shaped = value.v;
    }
    put({ kind: 'leaf', field, op, value: shaped, line: node.line, col: node.col });
  }
  if (holder.tree === null) return { tree: null, count, valid: false };
  // Drop the places a part left out of a group.
  const order = [];
  const walk = [holder.tree];
  while (walk.length > 0) {
    const n = walk.pop();
    order.push(n);
    if (n.kind === 'all' || n.kind === 'any') {
      for (const c of n.items) if (c !== null) walk.push(c);
    } else if (n.kind === 'not' && n.item !== null) walk.push(n.item);
  }
  for (const n of order) {
    if (n.kind === 'all' || n.kind === 'any') {
      if (n.items.some((c) => c === null)) valid = false;
      n.items = n.items.filter((c) => c !== null);
    } else if (n.kind === 'not' && n.item === null) valid = false;
  }
  return { tree: holder.tree, count, valid };
}

// The rules file as a model, from the tree of the reader, or null after a FRB001 finding. file is the name of the file for the
// findings: rules, current or candidate.
export function readRuleSet(root, add, { file = 'rules', limits = LIMITS } = {}) {
  if (root === null || root.t !== 'm') {
    add('FRB001', { file, line: root?.line ?? 1, column: root?.col ?? 1 }, 'The rules file cannot be read as a rule set: it must be a mapping with a "rules" list.');
    return null;
  }
  unknownKeys(root, RULESET_KEYS, 'The rules file', add, file);
  const rulesEntry = root.entries.get('rules');
  if (rulesEntry === undefined || rulesEntry.node.t !== 'q' || rulesEntry.node.items.length === 0) {
    add('FRB001', { file, line: rulesEntry?.line ?? root.line, column: rulesEntry?.col ?? root.col }, 'The rules file cannot be read as a rule set: it has no "rules" list with at least one rule.');
    return null;
  }
  if (rulesEntry.node.items.length > limits.maxRules) {
    add('FRB001', { file, line: rulesEntry.line, column: rulesEntry.col }, `The rules file cannot be read as a rule set: it holds more than ${limits.maxRules} rules.`);
    return null;
  }
  const textKey = (name) => {
    const e = root.entries.get(name);
    if (e === undefined) return '';
    const t = textOf(e.node);
    if (t === null) add('FRB002', where(e, file), `"${name}" must be text, but it is ${describe(e.node)}.`);
    return t ?? '';
  };
  const limitValues = new Map();
  const limitsEntry = root.entries.get('limits');
  if (limitsEntry !== undefined) {
    if (limitsEntry.node.t !== 'm') add('FRB002', where(limitsEntry, file), `"limits" must be a mapping, but it is ${describe(limitsEntry.node)}.`);
    else {
      unknownKeys(limitsEntry.node, LIMIT_KEYS, 'The limits', add, file);
      for (const name of LIMIT_KEYS) {
        const e = limitsEntry.node.entries.get(name);
        if (e === undefined) continue;
        const range = name === 'max_hold_per_thousand' ? { min: 0, max: 1000 } : name === 'block_min_precision' ? { min: 0, max: 1 } : { min: 0, max: 1000000000, whole: true };
        const v = numberOf(e, `The limit "${name}"`, range, add, file);
        if (v !== null) limitValues.set(name, { value: v, line: e.line, column: e.col });
      }
    }
  }
  const rules = [];
  rulesEntry.node.items.forEach((node, index) => {
    if (node.t !== 'm') {
      add('FRB002', at(node, file), `Rule ${index + 1} must be a mapping, but it is ${describe(node)}.`);
      return;
    }
    unknownKeys(node, RULE_KEYS, `Rule ${index + 1}`, add, file);
    const rule = { index, line: node.line, column: node.col, file, id: '', idLine: node.line, idColumn: node.col, noId: false, name: '', owner: '', action: '', actionInvalid: false, condition: null, broken: false, maxAlertRate: null, minPrecision: null, leaves: [] };
    const idEntry = node.entries.get('id');
    if (idEntry !== undefined) {
      rule.idLine = idEntry.line;
      rule.idColumn = idEntry.col;
      rule.id = textOf(idEntry.node) ?? '';
    }
    if (rule.id === '') {
      add('FRB002', idEntry === undefined ? at(node, file) : where(idEntry, file), `Rule ${index + 1} has no "id" (text or a number).`);
      rule.id = `(rule ${index + 1})`;
      rule.noId = true;
    }
    for (const name of ['name', 'owner']) {
      const e = node.entries.get(name);
      if (e === undefined) continue;
      const t = textOf(e.node);
      if (t === null) add('FRB002', where(e, file), `The rule "${show(rule.id)}": "${name}" must be text, but it is ${describe(e.node)}.`);
      else rule[name] = t;
    }
    const actionEntry = node.entries.get('action');
    if (actionEntry !== undefined) {
      const a = textOf(actionEntry.node);
      rule.actionLine = actionEntry.line;
      rule.actionColumn = actionEntry.col;
      if (a === null || (a !== '' && !ACTIONS.includes(a.toLowerCase()))) {
        const near = a === null ? null : nearest(a, ACTIONS);
        add('FRB002', where(actionEntry, file), `The rule "${show(rule.id)}": the action ${a === null ? `must be text, but it is ${describe(actionEntry.node)}` : `"${show(a)}" is not one of ${ACTIONS.join(', ')}`}${near ? ` (did you mean "${near}"?)` : ''}.`);
        rule.actionInvalid = true;
      } else rule.action = a.toLowerCase();
    }
    const whenEntry = node.entries.get('when');
    if (whenEntry === undefined) {
      add('FRB002', at(node, file), `The rule "${show(rule.id)}" has no "when" condition.`);
      rule.broken = true;
    } else {
      const read = readCondition(whenEntry.node, rule.id, add, file, limits);
      rule.condition = read.tree;
      rule.conditionLine = whenEntry.line;
      if (!read.valid || read.tree === null) rule.broken = true;
      if (read.tree !== null) rule.leaves = leavesOf(read.tree);
    }
    const rate = node.entries.get('max_alert_rate');
    if (rate !== undefined) {
      rule.maxAlertRate = numberOf(rate, `The rule "${show(rule.id)}": max_alert_rate`, { min: 0, max: 1000 }, add, file);
      rule.rateLine = rate.line;
    }
    const floor = node.entries.get('min_precision');
    if (floor !== undefined) {
      rule.minPrecision = numberOf(floor, `The rule "${show(rule.id)}": min_precision`, { min: 0, max: 1 }, add, file);
      rule.floorLine = floor.line;
    }
    rules.push(rule);
  });
  const limitOf = (name) => (limitValues.has(name) ? limitValues.get(name).value : (LIMIT_DEFAULTS[name] ?? null));
  return {
    file,
    name: show(textKey('name'), 120),
    currencyNote: textKey('currency_note'),
    limitsLine: limitsEntry?.line ?? root.line,
    limitValues,
    limit: limitOf,
    limitSet: (name) => limitValues.has(name),
    rules
  };
}
