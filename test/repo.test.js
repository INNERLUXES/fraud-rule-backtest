import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS, COLUMNS, LIMIT_KEYS, NOT_A, NOTICE, OPERATORS, RULES, RULESET_KEYS, RULE_KEYS, checkText, readOptions } from '../src/index.js';
import { scenarioText } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const DECISIONS = [
  'docs/decisions/0001-replay-rules-on-a-file-and-never-touch-a-live-system.md',
  'docs/decisions/0002-read-csv-and-json-with-readers-of-our-own.md',
  'docs/decisions/0003-read-the-files-on-disk-and-contact-nothing.md',
  'docs/decisions/0004-count-and-never-claim-the-rules-work.md'
];
// The pattern of tools/check.mjs, kept unchanged: a word of four digits that starts with 19 or 20 reads like a year, unless it
// is the number of a standard after EIP or ERC.
const YEAR = /(?<!(?:EIP|ERC)[- ]?)\b(?:19|20)\d{2}\b/i;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const norm = (t) => t.replace(/\s+/g, ' ');

// Every file below a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

// Every file of the repository that is committed.
async function allFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel || '.'), { withFileTypes: true })) {
      if (['.git', 'coverage'].includes(e.name) || (!rel && ['dist', 'node_modules'].includes(e.name))) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('');
  return out.sort();
}

const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...(await filesOf('docs')).filter((f) => f.endsWith('.md'))];

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author, the repository and the page', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'fraud-rule-backtest');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/fraud-rule-backtest.git');
  assert.equal(pkg.homepage, 'https://innerluxes.dev/finance/fraud-detection');
  assert.deepEqual(pkg.bin, { 'fraud-rule-backtest': 'bin/fraud-rule-backtest.js' });
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.scripts.test, 'node --test "test/*.test.js"');
  assert.equal(pkg.scripts.check, 'node tools/check.mjs');
  assert.equal(pkg.scripts.example, 'node tools/example.mjs');
  assert.equal(pkg.scripts['make-examples'], 'node tools/make-examples.mjs');
  assert.ok(pkg.scripts['test:coverage'].includes('--experimental-test-coverage'));
  assert.deepEqual(pkg.files, ['bin', 'src', 'docs', 'examples', 'README.md', 'LICENSE']);
  assert.equal(pkg.version, '1.0.0');
  for (const k of ['fraud-detection', 'fraud-rules', 'backtesting', 'shadow-mode', 'precision-recall', 'cli']) assert.ok(pkg.keywords.includes(k), k);
  assert.match(pkg.description, /does not predict/);
  assert.match(pkg.description, /not a fraud detection system and not an audit/);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.equal(lock.name, 'fraud-rule-backtest');
  assert.equal(Object.keys(lock.packages).length, 1);
});

test('bin: a script with a shebang that runs main and sets the exit code', async () => {
  const bin = await read('bin/fraud-rule-backtest.js');
  assert.ok(bin.startsWith('#!/usr/bin/env node\n'));
  assert.match(bin, /process\.exitCode = await main\(process\.argv\.slice\(2\)\);/);
});

test('every file is made of text this project allows: ASCII, LF line ends, no control byte', async () => {
  for (const file of await allFiles()) {
    if (file.startsWith('examples/output/') || file === 'package-lock.json') continue;
    const text = await read(file);
    assert.doesNotMatch(text, /[\x01-\x08]/, file);
    assert.doesNotMatch(text, /[^\x00-\x7f]/, `${file} holds a character that is not ASCII`);
    assert.ok(!text.includes('\r'), `${file} holds a carriage return`);
  }
});

test('README: it says plainly that the tool counts, never connects to a payment system, does not predict, is not a fraud detection system or an audit, before the quick start', async () => {
  const readme = await read('README.md');
  const head = norm(readme.slice(0, readme.indexOf('## Quick start')));
  for (const part of ['never connects to a payment system or a database', 'does not predict', 'not how they will behave on transactions that have not happened yet', 'not a fraud detection system, not a model validation and not an audit', 'a best practice of this tool', 'contacts nothing over the network', 'reads no clock']) {
    assert.ok(head.includes(part), part);
  }
});

test('README: it lists every check, the three commands, the options, real example output, the limits and the page it belongs to', async () => {
  const readme = await read('README.md');
  for (const r of RULES) assert.ok(readme.includes(`| ${r.id} | ${r.name} | ${r.severity} |`), r.id);
  for (const part of ['npx --yes github:INNERLUXES/fraud-rule-backtest', 'node bin/fraud-rule-backtest.js', ' compare ', ' sweep ', '--rules', '--current', '--candidate', '--thresholds', '--as-of', '--disable', '--fail-on', '--min-severity', '--format', '--explain', '--list-checks', '## Exit codes', '## Limits', '## What is not checked', '## License', 'https://innerluxes.dev/finance/fraud-detection']) {
    assert.ok(readme.includes(part), part);
  }
  assert.ok(!readme.includes('{{'), 'a placeholder is left in the README');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /npm test\n```\n\n```\n([\s\S]*?)\n```/.exec(readme);
  assert.ok(block, 'the test block');
  const n = Object.fromEntries([...block[1].matchAll(/^(tests|pass|fail|skipped) (\d+)$/gm)].map((m) => [m[1], Number(m[2])]));
  assert.equal(n.tests, n.pass + n.fail + n.skipped);
  assert.equal(n.fail, 0);
  assert.ok(n.tests >= 150);
});

test('README and documents: every relative link goes to a file of the repository', async () => {
  const files = new Set(await allFiles());
  for (const doc of await docFiles()) {
    const text = await read(doc);
    for (const m of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
      if (/^[a-z]+:/.test(m[1])) continue;
      const dir = doc.includes('/') ? doc.slice(0, doc.lastIndexOf('/') + 1) : '';
      const target = resolve('/', dir, m[1]).replaceAll('\\', '/').replace(/^[A-Za-z]:/, '').slice(1);
      assert.ok(files.has(target), `${doc} links to ${m[1]}`);
    }
  }
});

test('README and documents: they never claim that the rules work, are right, approved or audited, and never promise a result', async () => {
  for (const file of await docFiles()) {
    const text = norm(await read(file));
    assert.doesNotMatch(text, /\b(?:we|I) recommend\b/i, file);
    assert.doesNotMatch(text, /(?<!not )\b(?:certifies|certified|guarantees?)\b/i, file);
    assert.doesNotMatch(text, /(?<!not )\b(?:ensures?|proves?|confirms?) (?:that )?(?:the )?(?:rules?|labels?|numbers?|results?|fraud)\b/i, file);
    assert.doesNotMatch(text, /\b(?:is|are) (?:fully )?(?:correct|right|accurate|audited|approved|verified|validated) (?:and|by|with)\b/i, file);
    assert.doesNotMatch(text, /\b(?:will catch|always catches|never misses|stops all)\b/i, file);
  }
  const everything = [NOTICE, NOT_A, ...RULES.map((r) => `${r.summary} ${r.fix} ${r.own} ${r.cannot}`)].join(' ');
  assert.doesNotMatch(everything, /\b(?:is|are) (?:safe|secure|trusted|approved|verified|accepted|the best|audited)\b/i);
});

test('docs: the limits, the method and the reading guide say that it replays and does not predict, and is neither a fraud system nor an audit', async () => {
  for (const file of ['docs/method.md', 'docs/limits.md']) {
    const text = norm(await read(file));
    assert.ok(/not an audit/i.test(text), `${file}: audit`);
    assert.ok(/not a (?:fraud detection system|forecast)/i.test(text), `${file}: forecast`);
    assert.ok(/never connect|does not connect|connects to/i.test(text), `${file}: no live system`);
  }
  const reading = norm(await read('docs/reading-precision-and-recall.md'));
  for (const part of ['Precision', 'Recall', 'false positive rate', 'made up', 'The past is not the future', 'low evidence']) assert.ok(reading.includes(part), part);
});

test('docs/rule-format.md: the short rule set passes every check on the example transactions, and every key, operator and action is described', async () => {
  const format = await read('docs/rule-format.md');
  const code = /## A short rule set\n\n[^\n]*\n\n```json\n([\s\S]*?)\n```/.exec(format);
  assert.ok(code, 'the short rule set');
  const transactions = await read('examples/good/transactions.csv');
  const found = checkText({ transactions, rules: `${code[1]}\n`, current: null, candidate: null }, { command: 'backtest', options: readOptions(), transactionsPath: 't.csv' }).findings;
  assert.deepEqual(found, []);
  for (const key of [...RULESET_KEYS, ...RULE_KEYS, ...LIMIT_KEYS]) assert.ok(format.includes(`\`${key}\``), key);
  for (const name of [...OPERATORS, ...ACTIONS]) assert.ok(format.includes(`\`${name}\``), name);
  const usage = await read('docs/usage.md');
  for (const names of Object.values(COLUMNS)) assert.ok(usage.includes(`\`${names[0]}\``), names[0]);
  assert.ok(scenarioText().length > 0);
});

test('docs: every check is in docs/checks.md and in the method, and each decision exists with a status', async () => {
  const checks = await read('docs/checks.md');
  const method = await read('docs/method.md');
  for (const r of RULES) {
    assert.ok(checks.includes(`### ${r.id} ${r.name}`), r.id);
    assert.ok(method.includes(r.id) || method.includes('FRB0'), r.id);
  }
  assert.ok(checks.includes(`There are ${RULES.length} checks`));
  const files = await filesOf('docs/decisions');
  assert.deepEqual(files, [...DECISIONS].sort());
  for (const d of DECISIONS) {
    const text = await read(d);
    assert.match(text, /^# \d+\. /);
    assert.match(text, /\n## Status\n\nAccepted\n/);
    for (const part of ['## Context', '## Decision', '## Consequences']) assert.ok(text.includes(part), `${d} ${part}`);
  }
});

test('README and documents: no number that reads like a year and no date in words or in digits; the year pattern still catches a year', async () => {
  const months = /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b\d{1,2}\s+(?:January|February|March|April|June|July|August|September|October|November|December)\b/;
  for (const file of await allFiles()) {
    if (file === 'package-lock.json') continue;
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, DATE, file);
    assert.doesNotMatch(text, months, file);
  }
  for (const ok of ['1.0.0', 'Node 22', 'SARIF 2.1.0', '200,000 rows', '1700000000', '500000 rows', 'NIST SP 800-218', '20000 characters', '1,000 parts', '0.200']) assert.doesNotMatch(ok, YEAR, ok);
  for (const bad of [`in ${19}99`, `built ${20}31`, `${20}${24}`, `since ${20}00.`]) assert.match(bad, YEAR, bad);
});

test('every file: none of the words this project keeps out, no name of a tool that wrote it, no dash character and no token-shaped string', async () => {
  const written = new RegExp(['gene' + 'rated', 'cla' + 'ude', 'anthro' + 'pic', 'ses' + 'sion', 'co-' + 'authored', 'ope' + 'nai', 'chat' + 'g' + 'pt', 'g' + 'pt', 'l' + 'lm', 'assis' + 'tant', 'copi' + 'lot'].join('|'), 'i');
  const words = new RegExp(['\\bA' + 'I\\b', 'artif' + 'icial ' + 'intelligence', 'langu' + 'age ' + 'model', 'pro' + 'mpt'].join('|'), 'i');
  const dashes = new RegExp([0x2013, 0x2014].flatMap((n) => [String.fromCharCode(n), `u${n.toString(16)}`, `&#${n};`, `&#x${n.toString(16)};`]).concat(['&ndash;', '&mdash;']).join('|'), 'i');
  const shapes = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /(?:api[_-]?key|client[_-]?secret|password)\s*[:=]\s*['"][^'"\s]{12,}['"]/i];
  for (const file of await allFiles()) {
    if (['tools/check.mjs', 'test/repo.test.js', 'package-lock.json'].includes(file)) continue;
    const text = await read(file);
    assert.doesNotMatch(text, written, file);
    assert.doesNotMatch(text, words, file);
    assert.doesNotMatch(text, dashes, file);
    for (const s of shapes) assert.doesNotMatch(text, s, file);
  }
});

test('LICENSE and SECURITY.md: MIT with the copyright line of INNERLUXES and no year; private reporting and no promise about reply times', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n\nPermission is hereby granted'));
  assert.doesNotMatch(license, /\d{4}/);
  const text = await read('SECURITY.md');
  assert.match(text, /private vulnerability reporting/);
  assert.match(text, /never connects to a payment system/);
  assert.doesNotMatch(text, /within\s+\d|business days|within a (?:day|week)|\d+\s*(?:hours|days)\b|we will|we guarantee|guaranteed|respond within|reply within/i);
});

test('workflows: every action is pinned to a full commit with a version comment, the CI runs three systems, two Node versions and coverage, and the gate is there; CodeQL leaves the examples out; the release packs a tgz, an SBOM, sums and provenance', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*(?:- )?uses: (\S+)(.*)$/gm)].map((m) => [m[1], m[2]]);
    assert.ok(uses.length > 0, name);
    for (const [action, comment] of uses) {
      assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/, `${name}: ${action}`);
      assert.match(comment, /^ # v\d+\.\d+\.\d+$/, `${name}: ${action}${comment}`);
    }
    assert.doesNotMatch(text, /metric-definition|defect-library|vision-qc|secrets\./i, name);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /run: npm run test:coverage/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
  const codeql = await read('.github/workflows/codeql.yml');
  assert.match(codeql, /languages: javascript-typescript/);
  assert.match(codeql, /security-extended/);
  assert.match(codeql, /paths-ignore:\n\s+- examples\n/);
  const release = await read('.github/workflows/release.yml');
  assert.ok(release.indexOf('ssdf-repo-check.js') < release.indexOf('npm pack'), 'the gate runs before the package is made');
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/fraud-rule-backtest\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CODEOWNERS for every module, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  const owners = await read('.github/CODEOWNERS');
  assert.match(owners, /^\* @innerluxesdev$/m);
  for (const f of await readdir(resolve(root, 'src'))) assert.ok(owners.includes(`/src/${f} @innerluxesdev`), f);
  assert.match(await read('.github/pull_request_template.md'), /Conventional Commits/);
  assert.match(await read('.gitattributes'), /^\* text=auto eol=lf$/m);
  assert.match(await read('.gitattributes'), /^examples\/output\/\*\* -text$/m);
  const ignore = await read('.gitignore');
  for (const part of ['/node_modules/', '.env', '*.pem', '*.key']) assert.ok(ignore.includes(part), part);
  const secure = await read('docs/secure-defaults.md');
  for (const practice of ['PO.1', 'PO.3', 'PS.1', 'PS.2', 'PW.1', 'PW.4', 'PW.5', 'PW.8', 'PW.9', 'RV.1', 'RV.2']) assert.ok(secure.includes(practice), practice);
});

test('src never reaches the network, runs a program, reads a clock or the environment, builds a pattern from input, connects to a system or writes to the disk', async () => {
  const banned = [/node:(?:net|http|https|http2|dgram|tls|dns|child_process|worker_threads|vm|cluster)/, /\bfetch\(/, /\bXMLHttpRequest\b/, /\beval\(/, /new Function\(/, /\bDate\b/, /Date\.now/, /Math\.random/, /process\.env/, /Intl\./, /parseFloat\(/, /performance\.now/, /hrtime/, /getTimezoneOffset/];
  for (const file of await filesOf('src')) {
    const text = (await read(file)).replace(/^\s*\/\/.*$/gm, '');
    for (const b of banned) assert.doesNotMatch(text, b, `${file}: ${b}`);
    if (file !== 'src/text.js') assert.ok(!/new RegExp/.test(text), `${file} builds a regular expression`);
    assert.doesNotMatch(text, /WebSocket|puppeteer|playwright|import\(|createReadStream|sqlite|postgres|mysql|mongodb|\bpg\b|\.query\(|\.execute\(/i, file);
    assert.doesNotMatch(text, /writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync|rename\(/, file);
  }
  assert.ok((await read('src/size.js')).includes('toLocaleString'), 'grouped() fixes the locale in the call');
});

test('no function of src calls itself: the readers, the evaluator, the walks and the checks work through loops, stacks and maps', async () => {
  for (const file of await filesOf('src')) {
    const text = await read(file);
    for (const m of text.matchAll(/^(?:export )?(?:async )?function\*? ([A-Za-z0-9_$]+)\(/gm)) {
      const start = m.index + m[0].length;
      const next = text.slice(start).search(/^(?:export )?(?:async )?(?:function|const|class) /m);
      const body = next < 0 ? text.slice(start) : text.slice(start, start + next);
      assert.ok(!new RegExp(`(?<![A-Za-z0-9_$.])${m[1]}\\(`).test(body), `${file}: ${m[1]} calls itself`);
    }
  }
});

test('the tests assert no hash or version of an action, build their paths with resolve(), and the tools exist with the year check and the list of plain words of the sibling tools', async () => {
  for (const file of (await filesOf('test')).filter((f) => f.endsWith('.test.js') || f.endsWith('helpers.js'))) {
    const text = await read(file);
    assert.doesNotMatch(text, /uses: [^\n]*@[0-9a-f]{40}[^\n]*assert|assert[^\n]*[0-9a-f]{40}/, file);
    assert.doesNotMatch(text, /(?:writeFile|mkdir)\([^)]*['"`][^'"`]*[\\|*?"][^'"`]*['"`]/, file);
  }
  const check = await read('tools/check.mjs');
  assert.ok(check.includes('const YEAR = /(?<!(?:EIP|ERC)[- ]?)\\b(?:19|20)\\d{2}\\b/i;'));
  assert.ok(check.includes("['har', 'ness'], ['del', 've'], ['lever', 'age']"));
  const example = await read('tools/example.mjs');
  assert.ok(example.includes("'examples/output'"));
  const generator = await read('tools/make-examples.mjs');
  assert.ok(generator.includes('mulberry32'));
  assert.doesNotMatch(generator, /Math\.random|Date/);
});
