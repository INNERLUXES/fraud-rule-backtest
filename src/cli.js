// Command line:
//   fraud-rule-backtest <transactions file> --rules <rules file> [options]
//   fraud-rule-backtest compare <transactions file> --current <rules file> --candidate <rules file> [options]
//   fraud-rule-backtest sweep <transactions file> [--thresholds <numbers>] [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFiles, readOptions } from './check.js';
import { LEVELS } from './data.js';
import { editDistance } from './fields.js';
import { explainJson, explainMarkdown, explainText, listChecksJson, listChecksMarkdown, listChecksText, toJson, toJunit, toMarkdown, toSarif, toText } from './report.js';
import { RULES, ruleById } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif, junit: toJunit };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };
const EXPLAINS = { text: explainText, markdown: explainMarkdown, json: explainJson };

export const USAGE = `Usage: fraud-rule-backtest <transactions file> --rules <rules file> [options]
       fraud-rule-backtest compare <transactions file> --current <rules file> --candidate <rules file> [options]
       fraud-rule-backtest sweep <transactions file> [--thresholds <numbers>] [options]

Replays a set of fraud rules on a file of past transactions that carry a confirmed fraud label, and reports how each rule and the
whole set would have behaved: alerts, fraud caught, false alarms, precision, recall, false positive rate, alerts for each thousand
transactions, the amount of fraud caught and the amount of good transactions affected, the overlap between rules and the fraud that
no rule catches. The compare command replays a current and a candidate rule set on the same transactions ("shadow mode") and says
what moves. The sweep command works out precision and recall at cut-offs of a numeric score column. The transactions are CSV, JSON
lines or a JSON array; the rules are JSON (docs/usage.md, docs/rule-format.md). It never connects to a payment system or a
database, never changes a rule, contacts nothing over the network, reads no clock and writes nothing to disk.

Options:
  --rules <file>          the rules file (the backtest command)
  --current <file>        the rules file in use now (the compare command)
  --candidate <file>      the rules file under test (the compare command)
  --thresholds <numbers>  comma-separated cut-offs of the score column (the sweep command; default 0.1 to 0.9 when the scores
                          lie between 0 and 1)
  --as-of <time>          the time that a transaction must not be dated after: seconds since the epoch or an ISO 8601 text; the
                          tool reads no clock, so the check of future dates runs only when this is given
  --format <name>         text, markdown, json, sarif or junit (default: text)
  --json                  the same as --format json
  --disable <ids>         comma-separated ids of checks to leave out
  --min-severity <level>  the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>       the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --list-checks           list the checks with their level and kind, and exit
  --explain <id>          explain one check: what it looks at, what to change, what it cannot see, and exit
  --help                  show this text
  --version               show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

// The check whose id or name is nearest to the text, for a message about a misspelt id.
function nearestId(text) {
  let best = null;
  let bestDistance = Infinity;
  for (const r of RULES) {
    for (const name of [r.id.toLowerCase(), r.name]) {
      const d = editDistance(text.toLowerCase().slice(0, 80), name);
      if (d < bestDistance) {
        best = r.id;
        bestDistance = d;
      }
    }
  }
  return bestDistance <= 6 ? best : null;
}

const VALUE_OPTIONS = new Map([
  ['--rules', 'rules'],
  ['--current', 'current'],
  ['--candidate', 'candidate'],
  ['--thresholds', 'thresholds'],
  ['--as-of', 'asOf'],
  ['--format', 'format'],
  ['--disable', 'disable'],
  ['--min-severity', 'minSeverity'],
  ['--fail-on', 'failOn'],
  ['--explain', 'explain']
]);

export function parseArgs(argv) {
  const o = { command: 'backtest', paths: [], rules: null, current: null, candidate: null, thresholds: null, asOf: null, format: null, json: false, disable: null, minSeverity: null, failOn: null, listChecks: false, explain: null, help: false, version: false };
  let args = argv;
  if (argv[0] === 'compare' || argv[0] === 'sweep') {
    o.command = argv[0];
    args = argv.slice(1);
  }
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = () => {
      const v = args[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (VALUE_OPTIONS.has(a)) {
      const key = VALUE_OPTIONS.get(a);
      if (o[key] !== null) throw new Error(`${a} was given twice`);
      o[key] = next();
    } else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${safeText(a, 60)}`);
    else {
      if (o.paths.length === 1) throw new Error('give one transactions file; check another file in another run');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${safeText(o.format, 40)} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${safeText(o.format, 40)} (text, markdown, json, sarif or junit)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${safeText(v, 40)} (${LEVELS.join(', ')})`);
  if (o.explain !== null && ruleById(o.explain) === undefined) {
    const near = nearestId(o.explain);
    throw new Error(`--explain: unknown check ${safeText(o.explain, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
  }
  if ((o.listChecks || o.explain !== null) && (o.format === 'sarif' || o.format === 'junit')) throw new Error(`${o.listChecks ? '--list-checks' : '--explain'} has no ${o.format.toUpperCase()} form; use text, markdown or json`);
  if (!o.help && !o.version && !o.listChecks && o.explain === null) {
    if (o.paths.length === 0) throw new Error('give the transactions file, such as fraud-rule-backtest transactions.csv --rules rules.json');
    const wrong = (flags, command) => {
      for (const [flag, key] of flags) if (o[key] !== null && o.command !== command) throw new Error(`${flag} belongs to the ${command} command`);
    };
    wrong([['--rules', 'rules']], 'backtest');
    wrong([['--current', 'current'], ['--candidate', 'candidate']], 'compare');
    wrong([['--thresholds', 'thresholds']], 'sweep');
    if (o.command === 'backtest' && o.rules === null) throw new Error('give the rules file with --rules, such as fraud-rule-backtest transactions.csv --rules rules.json');
    if (o.command === 'compare' && (o.current === null || o.candidate === null)) throw new Error('compare needs --current and --candidate, each a rules file');
    for (const p of [...o.paths, ...[o.rules, o.current, o.candidate].filter((x) => x !== null)]) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    optionsOf(o);
  }
  return o;
}

// The options of a run from the parsed arguments; throws an Error that names the option that cannot be used.
function optionsOf(o) {
  return readOptions({ disable: o.disable, asOf: o.asOf, thresholds: o.thresholds });
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`fraud-rule-backtest: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  if (o.explain !== null) {
    io.out(EXPLAINS[o.format](ruleById(o.explain)));
    return 0;
  }
  const merged = { ...LIMITS, ...(limits ?? {}) };
  try {
    const report = await checkFiles({
      command: o.command,
      transactionsPath: o.paths[0],
      rulesPath: o.rules,
      currentPath: o.current,
      candidatePath: o.candidate,
      minSeverity: o.minSeverity ?? 'info',
      failOn: o.failOn ?? 'error',
      options: optionsOf(o),
      version: VERSION,
      limits: merged,
      base
    });
    io.out(FORMATS[o.format](report));
    return report.result.pass ? 0 : 1;
  } catch (error) {
    if (error instanceof InputError) io.err(`fraud-rule-backtest: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`fraud-rule-backtest: ${clean(error.message)}\n`);
    return 2;
  }
}
