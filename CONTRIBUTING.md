# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows
and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the
repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!`
for a breaking change.

This tool reads a transactions file (CSV, JSON lines or a JSON array) and one or two rules files (JSON). It replays the rules on
the transactions that carry a label and counts. It never connects to a payment system or a database, it does not change a rule, and
it does not predict how a rule will behave on future transactions. It is not a fraud detection system and not an audit. A change
must keep it that way: a check reports what the files hold, and the tool never contacts anything over the network, never writes,
submits or signs anything, and never fetches, opens, runs or evaluates what it reads.

## Never a secret, never a real business, never personal data

The tool never asks for a key or a token, and never looks up a rule, an owner or a transaction. Do not add an option, a key or a
test that gives it one: the checks are about the files as written. Never paste data of a real business, the name of a real company,
card numbers, names, addresses, a key or a token into an issue, a pull request or an example; use made-up rules and made-up
transactions.

## Never a claim that the rules work, never a made-up rule

Every check is a best practice of this tool, and says so in `own` in src/rules.js. No standard sets any of them. Do not write a
message, a document or an example that reads as a statement that a rule catches fraud, that a number holds on future traffic, or
that a rule set has been through a review or an approval. The default limits (a block floor, a number of true positives, a number
of fraud cases) are the choice of this tool and are documented in docs/rule-format.md.

## Changing a check

1. Describe the change in docs/checks.md first: what the check looks at and what it can and cannot see, and add what it cannot see
   to docs/limits.md. Say in `own` in src/rules.js that it is a best practice of the tool, and why the tool asks for it.
2. Keep the checks to what is written and counted. A finding must point at something a reader can check in the files: a file, a line
   and a column. Never add a check that needs the network, a live system, a registry, a key or the clock.
3. A check says what to change, in `fix` in src/rules.js, what it cannot see, in `cannot`, and is marked as a check of a file, of the
   rules, of the data, of the results or of the comparison in `kind`.
4. A run must never pass because something could not be read: a file that is not a rules file is an error finding, a key that is
   unknown or written twice is a finding that names it, and a check that did not run is shown as skipped or not-evaluated with the
   reason.
5. Add a test with the rules and the transactions written inline (`tx()`, `rules()`, `rule()`, `leaf()`, `idsOf()`, `ofCheck()`,
   `run()` and `cli()` in test/helpers.js), small enough to work out by hand, with a near miss on each side: the input that is
   reported and the one next to it that is not.
6. A check id, once released, keeps its meaning: pipelines and other tools read it from the JSON, SARIF and markdown output.

## Changing the readers, the evaluator and the checks

1. The readers (src/json.js, src/csv.js, src/transactions.js, src/ruleset.js) keep their limits (`LIMITS` in src/data.js) and work
   through a stack and a loop; they have no recursion, and neither have the evaluator or the checks. A test fails when a function of
   src calls itself.
2. The evaluator (src/condition.js) compiles a condition into a function with a walk over a list (src/tree.js). The operators are a
   fixed list. A new operator goes in docs/rule-format.md with a test for each type of field, and the evaluator never builds code or
   a pattern from a value.
3. The CSV reader refuses what it cannot follow and never keeps the first rows of a long file and goes on.
4. Names from the files are kept in maps and sets, never set as properties of an object. A test builds rules and fields named
   `__proto__` and `constructor`.
5. No pattern is built from a file or an argument. A test fails when `new RegExp` appears in src outside src/text.js.
6. The checks visit each rule and each row a bounded number of times and never compare every pair. Hostile tests with hundreds of
   thousands of rows and thousands of rules check it.
7. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when coverage
   is on, and allow four times the time (`allowed()` in test/helpers.js). Run `npm run test:coverage` before you open the pull
   request.
8. Files written with LF, CRLF or CR line ends, as UTF-8 with or without a byte order mark or as UTF-16 with one, must give the same
   findings.
9. A number in a report is worked out the same way on every system. Rates show three decimals and amounts two, and the JSON report
   rounds them (src/size.js).

## The examples

The files under `examples/` are made-up input for the tool: a shop with a current and a candidate rule set that pass every check at
every level, and files that hold a mistake of every check, with made-up ids and no key, no date and no real company. The
transactions are written by `tools/make-examples.mjs` with a seeded random generator; run `npm run make-examples` and commit the
files if you change it, and the tests read the committed files. A change to the examples goes with the real output that
`npm run example` writes to `examples/output`.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device) is guarded with `process.platform` and says why in its
`skip`. A test never asserts a line number written by hand: a line is worked out with `lineOf()` of test/helpers.js or from the
text itself. Every other test builds its paths with `resolve()` from names with forward slashes, and a test never writes a
backslash, a bar, a star, a question mark or a quote into a file name, because Windows refuses them.

A test never reads the clock, the time zone of the machine or the locale. A test never asserts the hash or the version of a GitHub
Action: Dependabot changes them, and the test checks only that each action is pinned to a full commit with a version comment.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network connection,
  signs nothing, runs no program and evaluates nothing it reads.
- Text from the input, file names, rule ids, owners and transaction ids included, goes through `safeText` before it reaches the
  output or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No file carries a date in its prose, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0), counts,
  sizes and the number of a standard (SARIF 2.1.0, NIST SP 800-218) are fine. Timestamps in the examples are seconds since the
  epoch, and a test that needs an ISO text builds it from parts.
- Examples and tests use made-up rules, owners and transactions.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
