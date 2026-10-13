// Reading the transactions file: CSV or TSV (a name ending in .csv or .tsv, or text that does not open with a bracket), JSON lines
// (a record in braces on each line) or a JSON array of records. All three give the same thing: the names of the fields, and the
// rows as lists of texts with the line each row starts on. A cell is trimmed. A record value that is a list or a mapping cannot
// be used and is a finding. The readers are the tool's own, work through loops and refuse what they cannot follow.

import { CSV_LIMITS, CsvError, readTable } from './csv.js';
import { LIMITS } from './data.js';
import { parseJson } from './json.js';
import { ParseError } from './nodes.js';
import { safeText } from './text.js';

const show = (t, max = 60) => safeText(t, max);

// The format of a transactions file: csv, jsonl or json.
export function detectTransactionsFormat(text, path = '') {
  if (/\.(?:csv|tsv)$/i.test(path)) return 'csv';
  if (/\.(?:jsonl|ndjson)$/i.test(path)) return 'jsonl';
  for (const c of text) {
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === String.fromCharCode(0xfeff)) continue;
    if (c === '[') return 'json';
    if (c === '{') return 'jsonl';
    return 'csv';
  }
  return 'csv';
}

// The text of a scalar node as the table holds it.
function cellOf(node) {
  const v = node.v;
  if (v === null) return '';
  return typeof v === 'string' ? v.trim() : String(v);
}

// The records of a list of mapping nodes as { line, values: Map(field -> text) }; a value that is not a scalar is a finding.
function recordsOf(entries, add, skipped) {
  const out = [];
  for (const { node, line } of entries) {
    if (node.t !== 'm') {
      add('FRB002', { file: 'transactions', line, column: 1 }, 'A record of the transactions must be a mapping of fields to values.');
      skipped.count += 1;
      continue;
    }
    const values = new Map();
    for (const [key, entry] of node.entries) {
      if (entry.node.t !== 's') {
        add('FRB002', { file: 'transactions', line: entry.line, column: entry.col }, `The field "${show(key)}" holds a list or a mapping; a field must hold one value.`);
        values.set(key, '');
      } else values.set(key, cellOf(entry.node));
    }
    out.push({ line, values });
  }
  return out;
}

// { fields, rows } from records: the fields in the order they are first seen, the rows as lists of texts.
function tableOfRecords(records, limits) {
  const fields = new Map();
  for (const r of records) {
    for (const key of r.values.keys()) {
      if (!fields.has(key)) {
        fields.set(key, fields.size);
        if (fields.size > limits.maxColumns) throw new CsvError(`The records hold more than ${limits.maxColumns} different fields`, r.line, 1);
      }
    }
  }
  const names = [...fields.keys()];
  const rows = records.map((r) => ({ line: r.line, cells: names.map((k) => r.values.get(k) ?? '') }));
  return { fields: names, rows };
}

// Reads the text into { format, fields, rows } or returns null after a FRB001 finding. rows are { line, cells }.
export function readTransactions(text, add, { format = 'csv', limits = LIMITS } = {}) {
  const fail = (message, line = 1, column = 1) => {
    add('FRB001', { file: 'transactions', line, column }, `The transactions file cannot be read as ${format === 'csv' ? 'CSV' : format === 'json' ? 'a JSON array' : 'JSON lines'}: ${message}.`);
    return null;
  };
  const skipped = { count: 0 };
  try {
    if (format === 'csv') {
      const table = readTable(text, { limits: { maxRows: limits.maxRows, maxColumns: limits.maxColumns, maxCells: limits.maxCells, maxCellLength: limits.maxCellLength } });
      const fields = table.header.cells.map((c) => c.trim());
      const rows = [];
      for (const row of table.rows) {
        if (row.cells.length !== fields.length) {
          add('FRB002', { file: 'transactions', line: row.line, column: 1 }, `The row has ${row.cells.length} cells and the header has ${fields.length}.`);
          skipped.count += 1;
          continue;
        }
        rows.push({ line: row.line, cells: row.cells.map((c) => c.trim()) });
      }
      return { format, fields, rows, headerLine: table.header.line, skipped: skipped.count };
    }
    if (format === 'json') {
      const root = parseJson(text, limits);
      if (root.t !== 'q') return fail('the file must hold a list of records in square brackets');
      if (root.items.length > limits.maxRows) return fail(`the file holds more than ${limits.maxRows} records`, root.line, root.col);
      const records = recordsOf(root.items.map((node) => ({ node, line: node.line })), add, skipped);
      const t = tableOfRecords(records, limits);
      return { format, fields: t.fields, rows: t.rows, headerLine: root.line, skipped: skipped.count };
    }
    const entries = [];
    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim() === '') continue;
      if (entries.length >= limits.maxRows) return fail(`the file holds more than ${limits.maxRows} records`, i + 1, 1);
      let node;
      try {
        node = parseJson(lines[i], limits);
      } catch (error) {
        if (!(error instanceof ParseError)) throw error;
        return fail(`${error.message} (line ${i + 1}, column ${error.column})`, i + 1, error.column);
      }
      entries.push({ node, line: i + 1 });
    }
    if (entries.length === 0) return fail('the file holds no record');
    const t = tableOfRecords(recordsOf(entries, add, skipped), limits);
    return { format, fields: t.fields, rows: t.rows, headerLine: 1, skipped: skipped.count };
  } catch (error) {
    if (error instanceof CsvError || error instanceof ParseError) return fail(error.message, error.line, error.column);
    throw error;
  }
}

