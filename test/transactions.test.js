import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, columnOf, detectTransactionsFormat, labelOf, rawOf, readTransactions } from '../src/index.js';
import { csvOf, datasetOf, row } from './helpers.js';

// Reads a text and gives the table and the findings added on the way.
function read(text, format = 'csv') {
  const found = [];
  const table = readTransactions(text, (id, where, message) => found.push({ id, ...where, message }), { format });
  return { table, found };
}

test('detectTransactionsFormat: the name of the file decides when it ends in a known extension', () => {
  assert.equal(detectTransactionsFormat('{"a":1}', 'x.csv'), 'csv');
  assert.equal(detectTransactionsFormat('[{"a":1}]', 'x.TSV'), 'csv');
  assert.equal(detectTransactionsFormat('a,b', 'x.jsonl'), 'jsonl');
  assert.equal(detectTransactionsFormat('a,b', 'x.ndjson'), 'jsonl');
});

test('detectTransactionsFormat: otherwise the first character decides', () => {
  assert.equal(detectTransactionsFormat('[{"a":1}]'), 'json');
  assert.equal(detectTransactionsFormat('  \n\t[1]'), 'json');
  assert.equal(detectTransactionsFormat('{"a":1}\n{"a":2}'), 'jsonl');
  assert.equal(detectTransactionsFormat('id,amount\nT1,5'), 'csv');
  assert.equal(detectTransactionsFormat(''), 'csv');
  assert.equal(detectTransactionsFormat(`${String.fromCharCode(0xfeff)}[1]`), 'json');
});

test('readTransactions: CSV gives the fields, and the rows with their own lines', () => {
  const { table, found } = read('id,amount\nT1,5\nT2,6\n');
  assert.deepEqual(table.fields, ['id', 'amount']);
  assert.deepEqual(table.rows.map((r) => r.cells), [['T1', '5'], ['T2', '6']]);
  assert.deepEqual(table.rows.map((r) => r.line), [2, 3]);
  assert.equal(table.headerLine, 1);
  assert.equal(table.skipped, 0);
  assert.deepEqual(found, []);
});

test('readTransactions: cells and field names are trimmed', () => {
  const { table } = read(' id , amount \n T1 , 5 \n');
  assert.deepEqual(table.fields, ['id', 'amount']);
  assert.deepEqual(table.rows[0].cells, ['T1', '5']);
});

test('readTransactions: a tab-separated file is read', () => {
  const { table } = read('id\tamount\nT1\t5\n');
  assert.deepEqual(table.fields, ['id', 'amount']);
  assert.deepEqual(table.rows[0].cells, ['T1', '5']);
});

test('readTransactions: a row with the wrong number of cells is a FRB002 finding at its line and is left out', () => {
  const { table, found } = read('id,amount\nT1,5\nT2\nT3,7,8\nT4,9\n');
  assert.deepEqual(table.rows.map((r) => r.cells[0]), ['T1', 'T4']);
  assert.equal(table.skipped, 2);
  assert.deepEqual(found.map((f) => [f.id, f.line]), [['FRB002', 3], ['FRB002', 4]]);
  assert.match(found[0].message, /The row has 1 cells and the header has 2/);
});

test('readTransactions: a quote that is never closed is a FRB001 finding with the line and the column', () => {
  const { table, found } = read('id,amount\nT1,"5\n');
  assert.equal(table, null);
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'FRB001');
  assert.equal(found[0].line, 2);
  assert.match(found[0].message, /cannot be read as CSV: The quote that opens the cell was never closed/);
});

test('readTransactions: semicolons are refused, not read as one column', () => {
  const { table, found } = read('id;amount\nT1;5\n');
  assert.equal(table, null);
  assert.match(found[0].message, /semicolons/);
});

test('readTransactions: an empty file is refused', () => {
  const { table, found } = read('');
  assert.equal(table, null);
  assert.equal(found[0].id, 'FRB001');
});

test('readTransactions: more columns than the limit are refused whole', () => {
  const header = Array.from({ length: 101 }, (_, i) => `c${i}`).join(',');
  const { table, found } = read(`${header}\n${Array.from({ length: 101 }, () => '1').join(',')}\n`);
  assert.equal(table, null);
  assert.match(found[0].message, /more than 100 cells/);
});

test('readTransactions: JSON lines give the fields in the order they are first seen, and an empty cell for a missing one', () => {
  const { table, found } = read('{"id":"T1","amount":5}\n{"id":"T2","country":"DE"}\n', 'jsonl');
  assert.deepEqual(table.fields, ['id', 'amount', 'country']);
  assert.deepEqual(table.rows.map((r) => r.cells), [['T1', '5', ''], ['T2', '', 'DE']]);
  assert.deepEqual(table.rows.map((r) => r.line), [1, 2]);
  assert.deepEqual(found, []);
});

test('readTransactions: JSON lines skip blank lines and keep the true line of each record', () => {
  const { table } = read('{"id":"T1"}\n\n   \n{"id":"T2"}\n', 'jsonl');
  assert.deepEqual(table.rows.map((r) => r.line), [1, 4]);
});

test('readTransactions: JSON values become texts: numbers, true, false and null', () => {
  const { table } = read('{"a":1.5,"b":true,"c":false,"d":null,"e":" x "}\n', 'jsonl');
  assert.deepEqual(table.rows[0].cells, ['1.5', 'true', 'false', '', 'x']);
});

test('readTransactions: a bad line of JSON lines is a FRB001 finding with its line', () => {
  const { table, found } = read('{"id":"T1"}\n{"id":\n', 'jsonl');
  assert.equal(table, null);
  assert.equal(found[0].id, 'FRB001');
  assert.equal(found[0].line, 2);
  assert.match(found[0].message, /cannot be read as JSON lines/);
});

test('readTransactions: a file of JSON lines with no record is refused', () => {
  const { table, found } = read('\n\n', 'jsonl');
  assert.equal(table, null);
  assert.match(found[0].message, /holds no record/);
});

test('readTransactions: a JSON array of records is read with the line of each record', () => {
  const { table } = read('[\n  {"id":"T1","amount":5},\n  {"id":"T2","amount":6}\n]\n', 'json');
  assert.deepEqual(table.fields, ['id', 'amount']);
  assert.deepEqual(table.rows.map((r) => r.line), [2, 3]);
  assert.deepEqual(table.rows.map((r) => r.cells), [['T1', '5'], ['T2', '6']]);
});

test('readTransactions: a JSON file that is not a list is refused', () => {
  const { table, found } = read('{"id":"T1"}', 'json');
  assert.equal(table, null);
  assert.match(found[0].message, /list of records in square brackets/);
});

test('readTransactions: a record that is not a mapping is a FRB002 finding and is left out', () => {
  const { table, found } = read('[{"id":"T1"}, 5, {"id":"T3"}]', 'json');
  assert.deepEqual(table.rows.map((r) => r.cells[0]), ['T1', 'T3']);
  assert.equal(table.skipped, 1);
  assert.equal(found[0].id, 'FRB002');
});

test('readTransactions: a field that holds a list or a mapping is a FRB002 finding and counts as empty', () => {
  const { table, found } = read('{"id":"T1","tags":["a","b"],"geo":{"x":1}}\n', 'jsonl');
  assert.deepEqual(table.rows[0].cells, ['T1', '', '']);
  assert.equal(found.length, 2);
  assert.match(found[0].message, /holds a list or a mapping/);
});

test('readTransactions: a key written twice in a record is refused', () => {
  const { table, found } = read('{"id":"T1","id":"T2"}\n', 'jsonl');
  assert.equal(table, null);
  assert.match(found[0].message, /written twice/);
});

test('readTransactions: more records than the limit are refused', () => {
  const found = [];
  const limits = { maxRows: 2, maxColumns: 100, maxCells: 1000, maxCellLength: 100, maxDepth: 60 };
  const table = readTransactions('[{"a":1},{"a":2},{"a":3}]', (id, where, message) => found.push(message), { format: 'json', limits });
  assert.equal(table, null);
  assert.match(found[0], /more than 2 records/);
  const lines = readTransactions('{"a":1}\n{"a":2}\n{"a":3}\n', (id, where, message) => found.push(message), { format: 'jsonl', limits });
  assert.equal(lines, null);
  assert.match(found[1], /more than 2 records/);
});

test('labelOf: the values that mean fraud', () => {
  for (const v of ['1', 'true', 'TRUE', 'Yes', 'y', 't', 'fraud', 'Confirmed', ' 1 ']) assert.equal(labelOf(v), 1, v);
});

test('labelOf: the values that mean not fraud', () => {
  for (const v of ['0', 'false', 'False', 'NO', 'n', 'f', 'legit', 'Legitimate', 'genuine', 'ok']) assert.equal(labelOf(v), 0, v);
});

test('labelOf: an empty label is -2 and any other value is -1', () => {
  assert.equal(labelOf(''), -2);
  assert.equal(labelOf('   '), -2);
  for (const v of ['maybe', 'pending', '2', '-1', 'fraudulent', '1.0', 'n/a']) assert.equal(labelOf(v), -1, v);
});

test('buildDataset: the roles are the first name present, compared without case', () => {
  const d = datasetOf(csvOf([row({ ID: 'T1', id: undefined, Amount: '5', amount: undefined, FRAUD: '1', is_fraud: undefined })]));
  assert.equal(d.roles.id, 'ID');
  assert.equal(d.roles.amount, 'Amount');
  assert.equal(d.roles.label, 'FRAUD');
  assert.equal(d.roles.timestamp, 'timestamp');
  assert.equal(d.roles.score, null);
});

test('buildDataset: is_fraud is read before fraud and label', () => {
  const d = datasetOf('fraud,label,is_fraud\n0,0,1\n');
  assert.equal(d.roles.label, 'is_fraud');
  assert.equal(d.labels[0], 1);
});

test('buildDataset: a column of plain numbers is a number column, the timestamp column a time column, the rest text', () => {
  const d = datasetOf(csvOf([row({ id: 'T1', device: '77', code: 'A1' }), row({ id: 'T2', device: '', code: '5' })]));
  assert.equal(columnOf(d, 'amount').type, 'number');
  assert.equal(columnOf(d, 'timestamp').type, 'time');
  assert.equal(columnOf(d, 'device').type, 'number');
  assert.equal(columnOf(d, 'code').type, 'text');
  assert.equal(columnOf(d, 'country').type, 'text');
  assert.deepEqual(columnOf(d, 'device').values, [77, null]);
  assert.deepEqual(columnOf(d, 'code').values, ['A1', '5']);
});

test('buildDataset: a column with no value at all is text', () => {
  const d = datasetOf('id,note,is_fraud\nT1,,0\nT2,,1\n');
  assert.equal(columnOf(d, 'note').type, 'text');
  assert.deepEqual(columnOf(d, 'note').values, [null, null]);
});

test('buildDataset: a number column with one bad cell becomes text', () => {
  const d = datasetOf('id,qty,is_fraud\nT1,5,0\nT2,x,1\n');
  assert.equal(columnOf(d, 'qty').type, 'text');
});

test('buildDataset: the amount column is a number column even with a bad cell, and the bad cell has no value', () => {
  const d = datasetOf('id,amount,is_fraud\nT1,5,0\nT2,twelve,1\nT3,,0\nT4,-3,0\n');
  assert.equal(columnOf(d, 'amount').type, 'number');
  assert.deepEqual(columnOf(d, 'amount').values, [5, null, null, -3]);
  assert.ok(Number.isNaN(d.amounts[1]) && Number.isNaN(d.amounts[2]));
  assert.equal(d.amounts[3], -3);
});

test('buildDataset: labels, the labelled rows and the lines of the rows', () => {
  const d = datasetOf('id,is_fraud\nT1,1\nT2,0\nT3,maybe\nT4,\nT5,yes\n');
  assert.deepEqual([...d.labels], [1, 0, -1, -2, 1]);
  assert.deepEqual(d.labelled, [0, 1, 4]);
  assert.deepEqual(d.lines, [2, 3, 4, 5, 6]);
  assert.equal(d.rows, 5);
});

test('buildDataset: times are seconds since the epoch, and a bad time is NaN', () => {
  const d = datasetOf('id,timestamp,is_fraud\nT1,1700000000,0\nT2,soon,0\nT3,,1\n');
  assert.equal(d.times[0], 1700000000);
  assert.ok(Number.isNaN(d.times[1]));
  assert.ok(Number.isNaN(d.times[2]));
});

test('buildDataset: scores are numbers, and a score that is not a number is NaN', () => {
  const d = datasetOf('id,score,is_fraud\nT1,0.5,0\nT2,high,1\n');
  assert.equal(d.scores[0], 0.5);
  assert.ok(Number.isNaN(d.scores[1]));
});

test('buildDataset: with no label column every label is -2', () => {
  const d = datasetOf('id,amount\nT1,5\n');
  assert.equal(d.roles.label, null);
  assert.deepEqual([...d.labels], [-2]);
  assert.deepEqual(d.labelled, []);
});

test('buildDataset: a field written twice, even with another case, is a problem and no dataset', () => {
  const raw = readTransactions('id,Amount,amount\nT1,1,2\n', () => {}, { format: 'csv' });
  const built = buildDataset(raw);
  assert.equal(built.problems.length, 1);
  assert.match(built.problems[0].message, /written twice/);
  assert.equal(built.problems[0].line, 1);
});

test('buildDataset: a column with no name is a problem', () => {
  const raw = readTransactions('id,,amount\nT1,1,2\n', () => {}, { format: 'csv' });
  assert.match(buildDataset(raw).problems[0].message, /column 2 has no name/);
});

test('columnOf and rawOf: a column is found without case, and a missing role has no cells', () => {
  const d = datasetOf('ID,Country,is_fraud\nT1,de,0\n');
  assert.equal(columnOf(d, 'country').name, 'Country');
  assert.equal(columnOf(d, '  COUNTRY ').name, 'Country');
  assert.equal(columnOf(d, 'nothing'), undefined);
  assert.deepEqual(rawOf(d, 'id'), ['T1']);
  assert.equal(rawOf(d, 'amount'), null);
});
