// The transactions as the checks and the replay use them: one typed column for each field, the roles of the well-known columns (id,
// timestamp, amount, currency, label, score), and for each row its label, amount and time. A column of numbers is a number column,
// the timestamp column is a time column and every other column is text. An empty cell is no value. Field names are compared without
// case and extra spaces. Nothing here reads a clock.

import { COLUMNS, FRAUD_LABELS, LEGIT_LABELS } from './data.js';
import { parseNumber, parseTime } from './time.js';

const key = (name) => String(name).trim().toLowerCase();

// The role of each well-known column: the name of the first column that is read under one of its names, or null.
function rolesOf(names) {
  const lower = new Map(names.map((n) => [key(n), n]));
  const roles = {};
  for (const [role, aliases] of Object.entries(COLUMNS)) {
    const found = aliases.find((a) => lower.has(a));
    roles[role] = found === undefined ? null : lower.get(found);
  }
  return roles;
}

// Whether a label text is a fraud (1), not a fraud (0), empty (-2) or not recognised (-1).
export function labelOf(text) {
  const t = String(text).trim().toLowerCase();
  if (t === '') return -2;
  if (FRAUD_LABELS.includes(t)) return 1;
  if (LEGIT_LABELS.includes(t)) return 0;
  return -1;
}

// Builds the dataset from { fields, rows } of readTransactions. Returns { problems } when two fields have the same name.
export function buildDataset(raw) {
  const names = raw.fields;
  const seen = new Map();
  const problems = [];
  names.forEach((name, i) => {
    const k = key(name);
    if (k === '') problems.push({ line: raw.headerLine, message: `The column ${i + 1} has no name.` });
    else if (seen.has(k)) problems.push({ line: raw.headerLine, message: `The field "${name}" is written twice (as "${names[seen.get(k)]}" and "${name}", compared without case).` });
    else seen.set(k, i);
  });
  if (problems.length > 0) return { problems };
  const n = raw.rows.length;
  const roles = rolesOf(names);
  const columns = new Map();
  names.forEach((name, i) => {
    const cells = raw.rows.map((r) => r.cells[i]);
    let type = 'text';
    let values;
    if (name === roles.timestamp) {
      type = 'time';
      values = cells.map((c) => (c === '' ? null : parseTime(c)));
    } else if (name === roles.amount || name === roles.score) {
      type = 'number';
      values = cells.map((c) => (c === '' ? null : parseNumber(c)));
    } else {
      const parsed = cells.map((c) => (c === '' ? null : parseNumber(c)));
      const allNumbers = cells.some((c) => c !== '') && cells.every((c, j) => c === '' || parsed[j] !== null);
      type = allNumbers ? 'number' : 'text';
      values = allNumbers ? parsed : cells.map((c) => (c === '' ? null : c));
    }
    columns.set(key(name), { name, type, raw: cells, values });
  });
  const labels = new Int8Array(n).fill(-2);
  if (roles.label !== null) {
    const cells = columns.get(key(roles.label)).raw;
    for (let i = 0; i < n; i += 1) labels[i] = labelOf(cells[i]);
  }
  const numbers = (role) => {
    const out = new Float64Array(n).fill(Number.NaN);
    if (roles[role] !== null) {
      const values = columns.get(key(roles[role])).values;
      for (let i = 0; i < n; i += 1) if (values[i] !== null) out[i] = values[i];
    }
    return out;
  };
  const labelled = [];
  for (let i = 0; i < n; i += 1) if (labels[i] === 0 || labels[i] === 1) labelled.push(i);
  return {
    format: raw.format,
    fields: names,
    rows: n,
    lines: raw.rows.map((r) => r.line),
    headerLine: raw.headerLine,
    columns,
    roles,
    labels,
    labelled,
    amounts: numbers('amount'),
    scores: numbers('score'),
    times: numbers('timestamp')
  };
}

// The column of a field name as a rule writes it (compared without case), or undefined.
export const columnOf = (dataset, field) => dataset.columns.get(key(field));

// The cell texts of a role column, or null when the file has no such column.
export const rawOf = (dataset, role) => (dataset.roles[role] === null ? null : dataset.columns.get(key(dataset.roles[role])).raw);
