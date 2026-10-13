# fraud-rule-backtest

Back-test a set of fraud rules on past transactions before a rule goes live or changes. Give it a file of transactions that carry a
confirmed outcome, fraud or not fraud, and a rules file, and it replays every rule on every transaction and reports how each rule
and the whole set would have behaved: the alerts, the fraud caught, the false alarms, precision, recall, the false positive rate,
the alerts for each thousand transactions, the amount of fraud caught, the amount of good transactions affected, the fraud that
more than one rule catches and the fraud that no rule catches. It compares a current and a candidate rule set on the same data
("shadow mode"), sweeps the cut-offs of a numeric score, and checks the rules and the data for the mistakes that make a back-test
mislead: a rule that never fires, a rule that fires on too many transactions or is not precise enough, a rule that catches nothing
another rule does not already catch, a rule with no owner or no action, two rules with one id, a condition on a field the data does
not have, an operator that does not fit the field, labels that are missing or all one value, amounts that are negative or not
numbers, repeated transaction ids, a mixed currency with no note, and too few fraud cases to judge a rule. It fails the run on the
level you set, so a rule change can be checked on every pull request.

**The tool reads the text of the files and counts. It never connects to a payment system or a database, it does not change a rule,
and it does not predict: a result says how the rules would have behaved on that file, not how they will behave on transactions that
have not happened yet, and not that the labels are complete or right. It is not a fraud detection system, not a model validation
and not an audit.** A clean result means only that none of the problems of its checks were found in the files. Every check is a best
practice of this tool: no standard sets any of them, and the reports say so. It reads the files you give it and nothing else: it
contacts nothing over the network, runs nothing, needs no key, reads no clock and writes nothing.

The mistakes that spoil a back-test tend to be the same: a rule written on a field the file does not have, so it never fires and
looks harmless; a block rule with a precision nobody looked at; a candidate that tidies two rules and quietly stops catching a
pattern; a file with a handful of fraud cases that gives a rate to three decimals; the same transaction twice; a label column where
half the rows say "pending". They get past a read of the files by eye and are cheap to find in a file. This tool reads them on every
build and points at the line.

- **The numbers of each rule.** Alerts, true positives, false positives, precision, recall, false positive rate, alerts for each
  thousand transactions, the amount of fraud caught, the amount of good transactions affected, and how much fraud only this rule
  catches.
- **The numbers of the set.** The transactions with an alert, the fraud caught, the false alarms, the fraud missed by every rule, the
  fraud caught by more than one rule, and the rows by strongest action (flag, hold or block), so the size of the hold queue is
  visible.
- **Shadow mode.** The `compare` command replays the current and the candidate set on the same transactions and gives the fraud the
  candidate loses, the fraud it adds, the false alarms it adds and the false alarms it clears, and the rules added, removed and
  changed.
- **A score sweep.** The `sweep` command gives precision and recall at the cut-offs of a numeric `score` column.
- **Checks with ids.** Thirty checks, FRB001 to FRB030, each marked as a check of a file, of the rules, of the data, of the results or
  of the comparison, each with what it looks at, what to change, why it is a check at all and what it cannot see. Each message says
  what was found and where, as file:line.
- **Readers and an evaluator of its own.** A strict CSV reader, JSON lines and JSON, all with the line and column of every key or
  cell, and a small evaluator of conditions. They refuse what they do not read (a key written twice, a stray quote) instead of
  guessing, and a condition is data that is compared with a column, never code.
- **Bounded work.** Hundreds of thousands of rows, thousands of rules and brackets nested a hundred thousand deep all end in good
  time, and no function calls itself.
- Reports as text, markdown, JSON, SARIF and JUnit XML (one test case for each check), with an exit code for a pipeline: `0` no
  finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 313
pass 311
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link
or a device (a link to a file and `/dev/null` named as a file); they are guarded with `process.platform`, run on Linux and macOS
where they apply, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits are
four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/fraud-rule-backtest.git
cd fraud-rule-backtest
node bin/fraud-rule-backtest.js examples/good/transactions.csv --rules examples/good/rules-current.json
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/fraud-rule-backtest data/labelled.csv --rules rules/live.json
```

To compare the rules in use with a candidate on the same transactions:

```
node bin/fraud-rule-backtest.js compare examples/good/transactions.csv --current examples/good/rules-current.json --candidate examples/good/rules-candidate.json
```

To see precision and recall at the cut-offs of a score column:

```
node bin/fraud-rule-backtest.js sweep examples/good/transactions.csv --thresholds 0.3,0.5,0.7
```

To see why a check exists, what it cannot see and what to change:

```
node bin/fraud-rule-backtest.js --explain FRB025
node bin/fraud-rule-backtest.js --list-checks
```

To show each check as a test in a build system:

```
node bin/fraud-rule-backtest.js compare data/labelled.csv --current rules/live.json --candidate rules/next.json --format junit > junit.xml
```

`examples/` holds a made-up shop. The good files, in `examples/good`, are about four hundred transactions as CSV and as JSON lines,
written by `tools/make-examples.mjs` with a seeded random generator (the same files come out every time, and the timestamps are
seconds since the epoch), a current rule set and a candidate rule set; they pass every check at error, warning and info level. The
bad ones, in `examples/bad`, are rules with a mistake of most checks (a repeated id, no action, a reversed range, a field that is not
a column, an operator that does not fit, a repeated condition, a block with no floor), the same transactions with a mistake of most
data checks (a negative amount, an amount that is text, an unknown label, a second currency, a repeated id, an unreadable time, a
time in the future), a rule set that behaves badly on the good data (a rule that never fires, one that catches nothing, one that
fires too often, one under its floor, a redundant one, a block that is not precise, a hold queue over its limit, a rule judged on few
cases), a candidate that loses fraud and adds false alarms, rules that cannot be read, and three transactions files that cannot be
used (few fraud cases, no label column, no fraud at all).

## Usage

```
fraud-rule-backtest <transactions file> --rules <rules file> [options]
fraud-rule-backtest compare <transactions file> --current <rules file> --candidate <rules file> [options]
fraud-rule-backtest sweep <transactions file> [--thresholds <numbers>] [options]
fraud-rule-backtest --list-checks
fraud-rule-backtest --explain <id>
```

```
--rules <file>          the rules file (backtest)
--current <file>        the rules file in use now (compare)
--candidate <file>      the rules file under test (compare)
--thresholds <numbers>  cut-offs of the score column, comma-separated (sweep)
--as-of <time>          the time that no transaction may be dated after: seconds since the epoch or an ISO 8601 text
--format <name>         text, markdown, json, sarif or junit (default: text)
--json                  the same as --format json
--disable <ids>         comma-separated ids of checks to leave out
--min-severity <level>  the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>       the lowest level of a finding that fails the run: info, warning, error (default: error)
--list-checks           list the checks with their level and kind, and exit
--explain <id>          explain one check: what it looks at, what to change, what it cannot see, and exit
--help                  show the usage
--version               show the version
```

[docs/usage.md](docs/usage.md) is the guide: the transactions file, the three commands and the output. [docs/rule-format.md](docs/rule-format.md)
is the format of the rules file, with a short rule set that passes every check. [docs/checks.md](docs/checks.md) lists the checks.
[docs/reading-precision-and-recall.md](docs/reading-precision-and-recall.md) explains the numbers in plain words. The path in the
report is relative to the folder you run the command in, with forward slashes on every system, followed by the line.

## A sample run

The current rule set of the shop on its transactions, as the tool reports it (the head, the table of the rules, and the end;
`examples/output` holds the whole report in every format):

```
fraud-rule-backtest backtest: examples/good/transactions.csv + examples/good/rules-current.json
transactions file: examples/good/transactions.csv (csv, 406 lines, 24,667 bytes)
rules file: examples/good/rules-current.json (json, 66 lines, 1,858 bytes)
transactions: 405 rows, 405 labelled (47 fraud, 358 not fraud)
amounts: fraud 22,382.38, not fraud 26,810.67 (currencies: EUR)
rules: Current rule set (made up): 4 rules
findings: 0
```

```
  rule  action  alerts  fraud  not fraud  precision  recall  fp rate  per 1,000  fraud amount  good amount  only rule
  R001  hold        11      8          3      0.727   0.170    0.008       27.2      4,658.90     1,376.04  8
  R002  hold        17     13          4      0.765   0.277    0.011       42.0      7,370.57     1,032.99  9
  R003  flag        15      7          8      0.467   0.149    0.022       37.0         13.56        13.90  7
  R004  block        9      9          0      1.000   0.191    0.000       22.2     10,211.06         0.00  5
```

```
This report reads the transactions file and the rules file and nothing else. It replays the rules on past transactions that carry a label. A result describes how the rules would have behaved on that file; it is not a forecast of how they will behave on future transactions, and it is not a statement that the labels are complete or right. A clean result means that none of the problems of its checks were found.

RESULT: PASS - no finding at or above error
```

The rule set in `examples/bad/rules-results.json`, which behaves badly on the same transactions (two of its findings, and the end):

```
  ERROR    FRB023  examples/bad/rules-results.json:31
           The rule "B003" fires on 348.1 of every 1,000 transactions, above its max_alert_rate of 100.
           fix: Tighten the condition, or raise max_alert_rate if the queue can take the volume.
```

```
  ERROR    FRB026  examples/bad/rules-results.json:49
           The rule "B006" blocks and has a precision of 0.261 (18 of 69 alerts), under the block floor of 0.9.
           fix: Change the action to hold or flag, or tighten the condition until almost every block is fraud.
```

```
This report reads the transactions file and the rules file and nothing else. It replays the rules on past transactions that carry a label. A result describes how the rules would have behaved on that file; it is not a forecast of how they will behave on future transactions, and it is not a statement that the labels are complete or right. A clean result means that none of the problems of its checks were found.

RESULT: FAIL - 4 findings at or above error (4 error, 4 warning, 1 info)
```

## How the files are read

- The transactions are read as CSV or TSV when the name ends in `.csv` or `.tsv` or the text does not open with a bracket, as JSON
  lines when the name ends in `.jsonl` or `.ndjson` or the text opens with a brace, and as a JSON array when it opens with a square
  bracket. A quote that is never closed, text after a closing quote, a field written twice in the header and a semicolon as the
  delimiter are refused with the line and column.
- The label is the confirmed outcome, in a column named `is_fraud`, `fraud` or `label`. A row whose label is empty or not recognised
  is left out of every count and reported (FRB014).
- A column of plain numbers is a number column, the timestamp column is a time column and every other column is text. A rule can use
  any column under its own name. An empty cell is no value, and a condition is false on it.
- The rules are read as JSON. A syntax error is a FRB001 finding with its line and column, and no other check of that file runs. The
  run fails; a file that cannot be read never passes.
- A rule is read as far as it can be: a part that is not valid is a FRB002 finding, and the rule is replayed as a rule that never
  fires, so one mistake is not reported twice.
- A file that is larger than 64 MiB, a link, a folder, a device, an address and text that is not UTF-8 or UTF-16 stop the run with
  exit code `2` and no report.

## What it checks

| Check | Name | Level | What it looks at |
| --- | --- | --- | --- |
| FRB001 | file-unreadable | error | a file cannot be followed by the reader (a syntax error in the JSON or the CSV, a header with a field written twice, a rules file with no rules, or a file past a limit); no other check ran on that file |
| FRB002 | field-invalid | error | a value is not what the format says: an action that is not flag, hold or block, an operator the tool does not know, a condition with no field or value, an in list that is not a list, a limit out of range, a rule with no id or no condition, or a row with the wrong number of cells |
| FRB003 | field-unknown | warning | a key of the rules file, of a rule, of the limits or of a condition that the tool does not read, often a misspelt name; what is under it is not used |
| FRB004 | rule-duplicate-id | error | two rules with the same id (compared without case and without extra spaces) |
| FRB005 | rule-no-owner | warning | a rule with no owner |
| FRB006 | rule-no-action | error | a rule with no action: nothing says whether a match is flagged, held or blocked |
| FRB007 | range-reversed | error | a between condition whose low end is above its high end, so no value can be inside it |
| FRB008 | field-not-in-data | error | a condition that uses a field that is not a column of the transactions file (with the nearest column) |
| FRB009 | operator-type-mismatch | error | an operator that is not valid for the type of the field, or a value that does not fit it: gt on text, contains on a number, a text where a number is needed |
| FRB010 | duplicate-condition | warning | the same condition written twice in one group, or two rules with the same condition (the parts of a group compared in any order) |
| FRB011 | block-no-precision-floor | warning | a rule that blocks and has no min_precision of its own |
| FRB012 | label-column-missing | error | the transactions file has no label column (is_fraud, fraud or label), so no rule can be judged |
| FRB013 | label-single-valued | error | the labelled transactions are all fraud or all not fraud, so precision or recall cannot be worked out |
| FRB014 | label-unrecognised | warning | rows whose label is empty or is a value the tool does not recognise; they are left out of every count |
| FRB015 | amount-invalid | error | a transaction whose amount is negative, empty or not a plain number; the amount counts as zero in the sums |
| FRB016 | currency-mixed | warning | the transactions hold more than one currency and the rules file has no currency_note that says how the amounts are made comparable |
| FRB017 | transaction-id-duplicate | error | two transactions with the same id |
| FRB018 | timestamp-unreadable | warning | a transaction whose timestamp is empty or is not a time the tool reads |
| FRB019 | timestamp-in-future | warning | a transaction dated after the time given with --as-of; the check runs only when the time is given |
| FRB020 | too-few-fraud-cases | info | the file holds fewer fraud cases than the min_fraud_cases limit (default 20) |
| FRB021 | rule-never-fires | warning | a rule that fires on none of the labelled transactions |
| FRB022 | rule-catches-no-fraud | warning | a rule that fires and catches none of the fraud cases in the file: every alert is a false alarm |
| FRB023 | alert-rate-over-limit | error | a rule that fires on more transactions for each thousand than its max_alert_rate |
| FRB024 | precision-under-floor | error | a rule whose precision is under its min_precision |
| FRB025 | rule-redundant | warning | a rule that catches fraud and every case it catches is also caught by another rule of the set |
| FRB026 | block-low-precision | error | a rule that blocks and has a precision under block_min_precision (default 0.9) |
| FRB027 | hold-queue-over-limit | error | the transactions whose strongest action is hold are more, for each thousand, than max_hold_per_thousand; runs only when the limit is set |
| FRB028 | rule-low-evidence | info | a rule that fired but caught fewer fraud cases than the min_true_positives limit (default 5); the count is in the message |
| FRB029 | candidate-loses-fraud | error | fraud that the current set catches and the candidate set does not, more cases than max_lost_fraud (default 0) |
| FRB030 | candidate-adds-false-alarms | error | good transactions that the candidate alerts on and the current set does not, more than max_new_false_alarms; runs only when the limit is set |

Every check is a best practice of this tool; `--explain <id>` says why it exists, what to change and what it cannot see.

## What is not checked

- Whether a rule will work on future transactions. The tool replays a file. People who commit fraud change what they do.
- Whether the labels are right or complete. A fraud case that was not yet found when the file was made is labelled as not fraud.
- Whether the file stands for live traffic. A file with all the fraud and a part of the good transactions gives a precision and a
  volume that are not those of live traffic.
- What your system does with a flag, a hold or a block, how long a review takes or what a false alarm costs.
- A rule written from the file itself. It will look good on that file.
- Two conditions that mean one thing in different words, such as `gt 99` and `gte 100`.
- Rules that need the history of a customer or a device. The history has to be a field in the file.
- Currency conversion. Amounts are added as written; the tool asks for a note when there is more than one currency.
- Whether the rule set has been reviewed by anybody. It is not an audit.

[docs/limits.md](docs/limits.md) has the full list.

## Formats

- `text` for a terminal, `markdown` for a job summary or a pull request comment.
- `json` is the report object the other formats are built from. Rates are fractions rounded to six decimals, amounts to two.
- `sarif` is SARIF 2.1.0, for code scanning: the checks are the rules and each finding with a place in a file is a result with its
  line and column.
- `junit` has one test case for each check, a failure for a check with findings, a skip with the reason for a check that did not run
  and an error when a file could not be read. Every time is 0.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No finding at or above the `--fail-on` level (default `error`). |
| `1` | At least one finding at or above it. |
| `2` | A usage error, or a file that cannot be read at all (missing, a link, a folder, too large, not text); no report. |

`--min-severity` hides findings from the listing and never changes the exit code.

## Limits

A file past 64 MiB, more than 500,000 rows, 100 columns, 5,000,000 cells or a cell of 20,000 characters, more than 1,000 rules, a
condition nested more than 20 levels or with more than 500 parts, a list of more than 500 values and a replay of more than
200,000,000 rule runs are refused whole. Up to 1,000 findings of one check are listed; the rest are counted. See docs/limits.md.

## Architecture

```
bin/fraud-rule-backtest.js   the command
src/cli.js                   arguments, the three commands and the exit code
src/check.js                 options, a run, the summary, the report object
src/json.js, src/csv.js      the readers, with line and column
src/nodes.js, src/tree.js    the tree the JSON reader builds, and a walk that never calls itself
src/transactions.js          reading the transactions as CSV, JSON lines or a JSON array
src/dataset.js               typed columns, the roles of the well-known columns, the labels
src/ruleset.js               reading the rules file and the conditions
src/condition.js             the evaluator: a condition compiled into a function of the row
src/backtest.js              the replay, the counts of each rule and of the set, the sweep
src/compare.js               the comparison of two rule sets
src/checks.js                the checks of the rules, the data, the results and the comparison
src/rules.js                 the 30 checks: id, name, level, kind, text
src/report.js                text, markdown, JSON, SARIF, JUnit
src/time.js                  numbers and times read by arithmetic, with no clock
src/files.js, text.js, size.js, collect.js, fields.js   reading a file, cleaning text, numbers, findings, nearest names
tools/check.mjs              the repository checks that run next to the tests
tools/example.mjs            runs the examples and writes examples/output
tools/make-examples.mjs      writes the made-up transactions with a seeded random generator
```

## Where the ideas come from

- Precision and recall are the two numbers anyone who has tuned an alerting rule ends up reading. The report gives both for each
  rule and for the set, with the counts under them, and docs/reading-precision-and-recall.md says how far to trust them.
- Replaying a changed rule set next to the one in use, before it takes effect, is the common practice that the compare command
  follows. The tool counts the movements row by row: what the candidate stops catching and what it starts alerting on.
- The default limits (a block floor of 0.9, five true positives for a rule, twenty fraud cases for a file) are the choice of this
  tool and can be set in the rules file.

This is the companion tool of the INNERLUXES page on [fraud detection software](https://innerluxes.dev/finance/fraud-detection).
docs/method.md has the method, docs/decisions has the decisions, docs/threat-model.md and docs/secure-defaults.md have the
security notes.

## License

MIT, see [LICENSE](LICENSE).
