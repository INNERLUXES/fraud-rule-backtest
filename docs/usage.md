# Usage

This is the guide to running fraud-rule-backtest: what to give it, what the three commands do, what comes out and how to use the
exit code in a pipeline. The format of the rules file is in [rule-format.md](rule-format.md), the checks are in
[checks.md](checks.md), and [reading-precision-and-recall.md](reading-precision-and-recall.md) explains the numbers in plain words.

The tool replays rules on a file of past transactions. It never connects to a payment system or a database, it does not change a
rule, and it does not say how a rule will behave on transactions that have not happened yet.

## What to give it

Two kinds of file.

1. **The transactions.** Past transactions, each with a confirmed outcome: fraud, or not fraud. CSV, JSON lines or a JSON array.
2. **The rules.** A JSON file with the rules of one rule set. The compare command takes two of them.

### The transactions file

One row for each transaction. A CSV file has a header on the first line; a comma or a tab separates the cells, and a cell with a
comma, a quote or a line end is in double quotes. JSON lines has one record in braces on each line. A JSON array holds the records
in square brackets. The format is read from the first character of the file, or from the name when it ends in `.csv`, `.tsv`,
`.jsonl` or `.ndjson`. A value must be one text, number, true, false or null; a list or a mapping inside a record cannot be used.

These columns have a meaning for the tool. The first name that is present is used, compared without case.

| Role | Names it is read under | What the tool does with it |
| --- | --- | --- |
| label | `is_fraud`, `fraud`, `label` | The confirmed outcome. Fraud is `1`, `true`, `yes`, `y`, `t`, `fraud` or `confirmed`; not fraud is `0`, `false`, `no`, `n`, `f`, `legit`, `legitimate`, `genuine` or `ok`. A row with another label, or none, is left out of every count and reported. |
| id | `id`, `transaction_id`, `txn_id` | Names a transaction in a message and is checked for repeats. |
| timestamp | `timestamp`, `time`, `ts`, `created_at` | Seconds since the epoch (milliseconds when the number has twelve digits or more) or an ISO 8601 text such as `YYYY-MM-DDTHH:MM:SSZ`. A rule can compare it with a number or such a text. |
| amount | `amount`, `amt` | A plain decimal number, not negative. It is summed for the amount of fraud caught and the amount of good transactions affected. A bad amount counts as zero and is reported. |
| currency | `currency`, `ccy` | A code. More than one code with no `currency_note` in the rules file is reported. |
| score | `score` | A number. Used by the sweep command only. |

Every other column can be used by a rule under its own name. The tool types a column from what is in it: a column where every
cell that is not empty is a plain number is a **number** column, the timestamp column is a **time** column, and every other column
is **text**. An empty cell is no value, and a condition is false on it. Cells are trimmed. A column of digits that is an identifier
in your system is a number column to the tool; write its values in a rule as numbers.

A row with the wrong number of cells is reported and left out. A field written twice in the header is an error, and the file is not
read.

### The rules file

See [rule-format.md](rule-format.md). In short: a name, an optional `currency_note`, optional `limits`, and a list of rules, each with
an `id`, an `owner`, an `action` (`flag`, `hold` or `block`), a `when` condition, and optional `max_alert_rate` and
`min_precision`.

## The commands

### Back-test one rule set

```
fraud-rule-backtest transactions.csv --rules rules.json
```

Every rule is run on every labelled transaction. For each rule the report gives the alerts, the fraud cases caught (true
positives), the good transactions alerted (false positives), precision, recall, the false positive rate, the alerts for each
thousand transactions, the amount of fraud caught, the amount of good transactions affected, and how many of the fraud cases only
this rule catches. For the whole set it gives the transactions with an alert, the fraud caught, the false alarms, the fraud missed
by every rule, the fraud caught by more than one rule, and the rows by strongest action. A transaction that more than one rule
fires on is counted once in the set, under the strongest action (block over hold over flag).

### Compare two rule sets

```
fraud-rule-backtest compare transactions.csv --current rules-now.json --candidate rules-next.json
```

Both sets are replayed on the same transactions ("shadow mode"). The report gives the results of each set, a table of the two
side by side, the fraud the candidate loses, the fraud it adds, the false alarms it adds and the false alarms it clears, and the
rules added, removed and changed (a rule is the same rule when its id is the same). The checks of the results (a rule that never
fires, a precision under its floor, and so on) are made on the candidate, the set that is about to go live. The limits for the
comparison are read from the candidate file: `max_lost_fraud` (default 0) and `max_new_false_alarms` (the check runs when it is
set).

### Sweep a score

```
fraud-rule-backtest sweep transactions.csv
fraud-rule-backtest sweep transactions.csv --thresholds 0.3,0.5,0.8
```

For a numeric `score` column, an alert is a transaction whose score is at or above a cut-off. The report gives, for each cut-off,
the alerts, the fraud caught, the good transactions alerted, precision, recall, the false positive rate, the alerts for each
thousand transactions and the two amounts. With no `--thresholds` the cut-offs are 0.1 to 0.9, when every score lies between 0 and
1; otherwise give them. The sweep takes no rules file, and only the checks of the file and of the data run.

## Options

```
--rules <file>          the rules file (backtest)
--current <file>        the rules file in use now (compare)
--candidate <file>      the rules file under test (compare)
--thresholds <numbers>  cut-offs of the score column, comma-separated (sweep)
--as-of <time>          the time that no transaction may be dated after: seconds since the epoch or an ISO 8601 text
--format <name>         text, markdown, json, sarif or junit (default: text)
--json                  the same as --format json
--disable <ids>         comma-separated ids (or names) of checks to leave out
--min-severity <level>  the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>       the lowest level of a finding that fails the run: info, warning, error (default: error)
--list-checks           list the checks with their level and kind, and exit
--explain <id>          explain one check: what it looks at, what to change, what it cannot see, and exit
--help                  show the usage
--version               show the version
```

The tool reads no clock. A transaction dated in the future can only be found against a time you give with `--as-of`; without it
FRB019 is shown as skipped.

## What comes out

A report in one of five formats.

- `text` for a terminal and `markdown` for a job summary or a pull request comment: the files, the counts, the tables of results,
  the table of the checks and each finding with where it is and what to change.
- `json` is the report object the other formats are built from. Rates are fractions from 0 to 1 rounded to six decimals, and
  amounts are rounded to two.
- `sarif` is SARIF 2.1.0, for code scanning: the checks are the rules and each finding with a place in a file is a result with its
  line and column.
- `junit` has one test case for each check, a failure for a check with findings, a skip with the reason for a check that did not run
  and an error when a file could not be read. Every time is 0.

The real output for the example files is in `examples/output`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No finding at or above the `--fail-on` level (default `error`). |
| `1` | At least one finding at or above it. |
| `2` | A usage error, or a file that cannot be read at all (missing, a link, a folder, too large, not text); no report. |

`--min-severity` hides findings from the listing and never changes the exit code.

## In a pipeline

Keep the transactions sample and the rules in the repository, and run the compare command on every change to the rules:

```
npx --yes github:INNERLUXES/fraud-rule-backtest compare data/labelled.csv --current rules/live.json --candidate rules/next.json --format junit > junit.xml
```

Give the job read access to the contents and nothing more. Do not hide the exit code with `|| true`. A report quotes rule ids,
owners and transaction ids, so keep it with the care you give the files.

## The example files

`examples/good` holds a made-up shop: about four hundred transactions as CSV and as JSON lines, written by `tools/make-examples.mjs`
with a seeded random generator (the same files come out every time), and two rule sets, a current one and a candidate, that pass
every check. `examples/bad` holds rules and transactions with a mistake of every check. Every name, id and number in them is made
up, and the timestamps are seconds since the epoch.
