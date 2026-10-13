// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools, SARIF for code scanning and
// JUnit XML for the test view of a build system. Every text that comes from the input (a file name, a rule id, a name, an owner, a
// message) was cleaned by safeText before it reached the report object. The markdown format also escapes what markdown gives a
// meaning to, the XML format escapes what XML gives a meaning to and drops the characters XML 1.0 cannot hold, and the SARIF and
// JSON formats are built as objects and written by JSON.stringify.

import { BEST, NOT_A } from './data.js';
import { RULES } from './rules.js';
import { cell, fixed, grouped, plural } from './size.js';
import { xmlSafe } from './text.js';

const URI = 'https://github.com/INNERLUXES/fraud-rule-backtest';

const rate = (x) => (x === null || x === undefined ? '-' : fixed(x, 3));
const money = (x) => cell(x, 2);
const per = (x) => (x === null || x === undefined ? '-' : cell(x, 1));
const signed = (x, d = 3) => (x === null || x === undefined ? '-' : `${x > 0 ? '+' : ''}${fixed(x, d)}`);
const signedMoney = (x) => (x === null || x === undefined ? '-' : `${x > 0 ? '+' : ''}${money(x)}`);
const signedInt = (x) => `${x > 0 ? '+' : ''}${grouped(x)}`;

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (f) => `${f.file} (${f.format}, ${plural(f.lines, 'line')}, ${plural(f.bytes, 'byte')})`;

const FILES = [['transactions', 'transactions file'], ['rules', 'rules file'], ['current', 'current rules file'], ['candidate', 'candidate rules file']];
const filesOf = (r) => FILES.map(([k]) => r.input[k]?.file).filter(Boolean).join(' + ');

// The lines about the inputs, one for each fact.
function summaryLines(r) {
  const out = [];
  const t = r.summary.transactions;
  if (r.input.transactions) {
    if (!r.evaluated.transactions) out.push(['transactions', 'not read: the file could not be followed']);
    else {
      const left = t.unlabelled > 0 ? `; ${grouped(t.unlabelled)} left out for want of a label` : '';
      out.push(['transactions', `${plural(t.rows, 'row')}, ${grouped(t.labelled)} labelled (${grouped(t.fraud)} fraud, ${grouped(t.notFraud)} not fraud)${left}`]);
      out.push(['amounts', `fraud ${money(t.fraudAmount)}, not fraud ${money(t.goodAmount)}${t.currencies.length ? ` (currencies: ${t.currencies.join(', ')})` : ''}`]);
    }
  }
  for (const [key, label] of [['rules', 'rules'], ['current', 'current rules'], ['candidate', 'candidate rules']]) {
    if (!r.input[key]) continue;
    if (!r.evaluated[key]) out.push([label, 'not read: the file could not be followed']);
    else {
      const m = r.summary[key];
      out.push([label, `${m.name === null ? '' : `${m.name}: `}${plural(m.rules, 'rule')}`]);
    }
  }
  return out;
}

function table(head, rows, rightFrom = 2, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const right = (i) => i >= rightFrom;
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : right(i) ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const CHECK_HEAD = ['check', 'name', 'level', 'kind', 'status', 'findings'];
const checkRows = (r) => r.checks.map((c) => [c.id, c.name, c.level, c.kind, c.status, c.status === 'skipped' || c.status === 'not-evaluated' ? `- (${c.detail})` : grouped(c.findings)]);

const RULE_HEAD = ['rule', 'action', 'alerts', 'fraud', 'not fraud', 'precision', 'recall', 'fp rate', 'per 1,000', 'fraud amount', 'good amount', 'only rule'];
const ruleRows = (run) => run.rules.map((m) => [m.id, m.action ?? '-', grouped(m.alerts), grouped(m.truePositives), grouped(m.falsePositives), rate(m.precision), rate(m.recall), rate(m.falsePositiveRate), per(m.alertsPerThousand), money(m.fraudAmountCaught), money(m.goodAmountAffected), grouped(m.uniqueTruePositives)]);
const RULE_NOTE = 'fraud = fraud cases caught (true positives), not fraud = good transactions alerted (false positives), per 1,000 = alerts for each thousand transactions, fraud amount = amount of the fraud caught, good amount = amount of the good transactions affected, only rule = fraud that no other rule catches.';

const SET_HEAD = ['measure', 'value'];
const setRows = (s) => [
  ['labelled transactions', grouped(s.transactions)],
  ['fraud cases', grouped(s.fraud)],
  ['transactions with an alert', grouped(s.alerted)],
  ['fraud caught', grouped(s.fraudCaught)],
  ['false alarms', grouped(s.falseAlarms)],
  ['fraud missed by every rule', grouped(s.fraudMissed)],
  ['precision', rate(s.precision)],
  ['recall', rate(s.recall)],
  ['false positive rate', rate(s.falsePositiveRate)],
  ['alerts per 1,000 transactions', per(s.alertsPerThousand)],
  ['fraud caught by more than one rule', grouped(s.fraudCaughtByMoreThanOne)],
  ['fraud caught by one rule only', grouped(s.fraudCaughtByOne)],
  ['fraud amount caught', money(s.fraudAmountCaught)],
  ['fraud amount missed', money(s.fraudAmountMissed)],
  ['good amount affected', money(s.goodAmountAffected)]
];
const ACTION_HEAD = ['strongest action', 'transactions', 'fraud', 'not fraud', 'per 1,000'];
const actionRows = (s) => s.byAction.map((a) => [a.action, grouped(a.transactions), grouped(a.fraud), grouped(a.notFraud), per(a.perThousand)]);

const SWEEP_HEAD = ['cut-off', 'alerts', 'fraud', 'not fraud', 'precision', 'recall', 'fp rate', 'per 1,000', 'fraud amount', 'good amount'];
const sweepRows = (s) => s.points.map((p) => [String(p.threshold), grouped(p.alerts), grouped(p.truePositives), grouped(p.falsePositives), rate(p.precision), rate(p.recall), rate(p.falsePositiveRate), per(p.alertsPerThousand), money(p.fraudAmountCaught), money(p.goodAmountAffected)]);

const COMPARE_HEAD = ['measure', 'current', 'candidate', 'change'];
function compareRows(r) {
  const c = r.results.current.set;
  const d = r.results.candidate.set;
  const s = r.results.comparison.summary;
  return [
    ['transactions with an alert', grouped(c.alerted), grouped(d.alerted), signedInt(s.alertsChange)],
    ['fraud caught', grouped(c.fraudCaught), grouped(d.fraudCaught), signedInt(d.fraudCaught - c.fraudCaught)],
    ['false alarms', grouped(c.falseAlarms), grouped(d.falseAlarms), signedInt(d.falseAlarms - c.falseAlarms)],
    ['fraud missed by every rule', grouped(c.fraudMissed), grouped(d.fraudMissed), signedInt(d.fraudMissed - c.fraudMissed)],
    ['precision', rate(c.precision), rate(d.precision), signed(s.precisionChange)],
    ['recall', rate(c.recall), rate(d.recall), signed(s.recallChange)],
    ['alerts per 1,000 transactions', per(c.alertsPerThousand), per(d.alertsPerThousand), signed(s.alertsPerThousandChange, 1)],
    ['fraud amount caught', money(c.fraudAmountCaught), money(d.fraudAmountCaught), signedMoney(d.fraudAmountCaught - c.fraudAmountCaught)],
    ['good amount affected', money(c.goodAmountAffected), money(d.goodAmountAffected), signedMoney(d.goodAmountAffected - c.goodAmountAffected)]
  ];
}
const MOVE_HEAD = ['movement', 'transactions', 'amount'];
const moveRows = (s) => [
  ['fraud the candidate loses', grouped(s.fraudLost), money(s.fraudAmountLost)],
  ['fraud the candidate adds', grouped(s.fraudGained), money(s.fraudAmountGained)],
  ['false alarms the candidate adds', grouped(s.falseAlarmsAdded), money(s.goodAmountAdded)],
  ['false alarms the candidate clears', grouped(s.falseAlarmsCleared), money(s.goodAmountCleared)]
];
const changesText = (d) => [
  `added: ${d.added.length ? d.added.join(', ') : 'none'}`,
  `removed: ${d.removed.length ? d.removed.join(', ') : 'none'}`,
  `changed: ${d.changed.length ? d.changed.map((c) => `${c.id} (${c.what.join(', ')})`).join(', ') : 'none'}`,
  `unchanged: ${grouped(d.same)}`
];

// The sections of the results of a report, as [title, head, rows, note]; the same for text and markdown.
function sections(r) {
  const out = [];
  if (r.results === null) return out;
  if (r.command === 'backtest') {
    out.push(['Rule results', RULE_HEAD, ruleRows(r.results.rules), RULE_NOTE]);
    out.push(['The whole rule set', SET_HEAD, setRows(r.results.rules.set), null]);
    out.push(['Strongest action of each alerted transaction', ACTION_HEAD, actionRows(r.results.rules.set), null]);
  } else if (r.command === 'compare') {
    out.push(['Candidate rule results', RULE_HEAD, ruleRows(r.results.candidate), RULE_NOTE]);
    out.push(['Current rule results', RULE_HEAD, ruleRows(r.results.current), null]);
    out.push(['Current set against candidate set', COMPARE_HEAD, compareRows(r), null]);
    out.push(['What moves between the two sets', MOVE_HEAD, moveRows(r.results.comparison.summary), null]);
  } else {
    const s = r.results.sweep;
    out.push([`Threshold sweep on ${grouped(s.transactions)} scored transactions (${grouped(s.fraud)} fraud)`, SWEEP_HEAD, sweepRows(s), 'An alert is a transaction whose score is at or above the cut-off.']);
  }
  return out;
}

const PAD = ' '.repeat(11);

export function toText(r) {
  const out = [];
  out.push(`fraud-rule-backtest ${r.command}: ${filesOf(r)}`);
  for (const [k, label] of FILES) if (r.input[k]) out.push(`${label}: ${fileLine(r.input[k])}`);
  for (const [k, v] of summaryLines(r)) out.push(`${k}: ${v}`);
  out.push(`findings: ${findingsLine(r)}`);
  for (const [title, head, rows, note] of sections(r)) {
    out.push('', title, '');
    out.push(...table(head, rows, head === SET_HEAD || head === COMPARE_HEAD || head === MOVE_HEAD ? 1 : 2));
    if (note) out.push('', `  ${note}`);
  }
  if (r.command === 'compare' && r.results) out.push('', 'Rules between the two sets', '', ...changesText(r.results.comparison.rules).map((l) => `  ${l}`));
  out.push('', `Checks (${grouped(r.checks.length)})`, '');
  out.push(...table(CHECK_HEAD, checkRows(r), 99), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

function mdTable(head, rows) {
  return [`| ${head.map(md).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(md).join(' | ')} |`), ''];
}

export function toMarkdown(r) {
  const out = [];
  out.push(`# fraud-rule-backtest ${r.command}: ${md(filesOf(r))}`, '');
  for (const [k, label] of FILES) if (r.input[k]) out.push(`- ${label[0].toUpperCase()}${label.slice(1)}: ${md(fileLine(r.input[k]))}`);
  for (const [k, v] of summaryLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  for (const [title, head, rows, note] of sections(r)) {
    out.push(`## ${md(title)}`, '', ...mdTable(head, rows));
    if (note) out.push(`${md(note)}`, '');
  }
  if (r.command === 'compare' && r.results) out.push('## Rules between the two sets', '', ...changesText(r.results.comparison.rules).map((l) => `- ${md(l)}`), '');
  out.push('## Checks', '', ...mdTable(CHECK_HEAD, checkRows(r)));
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r) {
  return `${JSON.stringify(r, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the files as the artifacts, and one result for each finding that has a place in a
// file, with its line and column. A finding about no place is left out.
export function toSarif(r) {
  const files = FILES.map(([k]) => r.input[k]?.file).filter(Boolean);
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'fraud-rule-backtest',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.name,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: files.map((uri) => ({ location: { uri } })),
        results: r.findings.filter((f) => f.file !== null).map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: files.indexOf(f.file) }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject }
        })),
        properties: { notice: r.notice, result: r.result.text, command: r.command }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// Text for XML: the five characters XML gives a meaning to are escaped, and the characters XML 1.0 cannot hold (a lone surrogate,
// U+FFFE and U+FFFF) are replaced by a question mark.
const xml = (t) => xmlSafe(t)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

// JUnit XML: one test suite, "fraud-rules", with one test case for each check. A check with a finding is a failure, with the
// messages of its findings; a check that did not run is skipped, and one that could not run because a file could not be read is
// an error. No time is recorded, because the tool reads no clock, so every time is 0.
export function toJunit(r) {
  const byCheck = new Map();
  for (const f of r.findings) {
    const l = byCheck.get(f.id);
    if (l === undefined) byCheck.set(f.id, [f]);
    else l.push(f);
  }
  const cases = r.checks.map((c) => {
    const head = `    <testcase classname="fraud-rules" name="${xml(c.id)} ${xml(c.name)}" time="0"`;
    if (c.status === 'pass') return { kind: 'pass', xml: `${head}/>` };
    if (c.status === 'skipped') return { kind: 'skipped', xml: `${head}>\n      <skipped message="${xml(c.detail)}"/>\n    </testcase>` };
    if (c.status === 'not-evaluated') return { kind: 'error', xml: `${head}>\n      <error type="not-evaluated" message="${xml(c.detail)}">${xml(c.detail)}</error>\n    </testcase>` };
    const found = byCheck.get(c.id) ?? [];
    const text = found.length ? found.map((f) => `${f.at}: ${f.message}`).join('\n') : c.detail;
    return { kind: 'failure', xml: `${head}>\n      <failure type="${xml(c.id)}" message="${xml(c.detail)}">${xml(text)}</failure>\n    </testcase>` };
  });
  const n = (kind) => cases.filter((c) => c.kind === kind).length;
  const attrs = `tests="${cases.length}" failures="${n('failure')}" errors="${n('error')}"`;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(`<testsuites name="fraud-rule-backtest" ${attrs} time="0">`);
  out.push(`  <testsuite name="fraud-rules" ${attrs} skipped="${n('skipped')}" time="0">`);
  out.push(...cases.map((c) => c.xml));
  out.push('  </testsuite>', '</testsuites>', '');
  return out.join('\n');
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.name.length));
  const out = ['fraud-rule-backtest checks', ''];
  for (const x of RULES) out.push(`  ${x.id}  ${x.name.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(7)}  ${x.summary}`);
  out.push('', `Every check is ${BEST}. A check of a file is about whether it can be read and which keys it holds, a check of the rules is about the rules as written, a check of the data is about the transactions, a check of the results is about what the rules did on them, and a check of the comparison is about the candidate set set against the current one. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# fraud-rule-backtest checks', '', '| Check | Name | Level | Kind | What it looks at |', '| --- | --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.name} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, name: x.name, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, own: x.own, cannot: x.cannot })), null, 2)}\n`;
}

export function explainText(rule) {
  const out = [`${rule.id} ${rule.name}`, ''];
  out.push(`level: ${rule.severity}`, `kind: ${rule.kind}`, '');
  out.push(`what it looks at: ${rule.summary}`, '', `why it exists: ${rule.own}`, '', `what to change: ${rule.fix}`, '', `what it cannot see: ${rule.cannot}`, '');
  out.push(`This check is ${BEST}. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function explainMarkdown(rule) {
  const out = [`# ${md(rule.id)} ${md(rule.name)}`, ''];
  out.push(`- Level: ${rule.severity}`, `- Kind: ${rule.kind}`, '');
  out.push(`**What it looks at.** ${md(rule.summary)}`, '', `**Why it exists.** ${md(rule.own)}`, '', `**What to change.** ${md(rule.fix)}`, '', `**What it cannot see.** ${md(rule.cannot)}`, '');
  out.push(`This check is ${md(BEST)}.`, '');
  return out.join('\n');
}

export function explainJson(rule) {
  return `${JSON.stringify({ id: rule.id, name: rule.name, severity: rule.severity, kind: rule.kind, summary: rule.summary, fix: rule.fix, own: rule.own, cannot: rule.cannot, note: `This check is ${BEST}.` }, null, 2)}\n`;
}
