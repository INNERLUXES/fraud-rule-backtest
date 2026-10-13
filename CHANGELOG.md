# Changes

## 1.0.0

First release.

- Replays a set of fraud rules on a file of past transactions that carry a confirmed fraud label, and reports how each rule and the
  whole set would have behaved. It reads the text of the files and nothing else: it never connects to a payment system or a
  database, never changes a rule and does not predict how a rule will behave on future transactions. It is not a fraud detection
  system, not a model validation and not an audit. It contacts nothing over the network, runs nothing, needs no key, follows no
  symbolic link, reads no clock and writes nothing to disk.
- For each rule: alerts, true positives, false positives, precision, recall, false positive rate, alerts for each thousand
  transactions, the amount of fraud caught, the amount of good transactions affected, and the fraud only this rule catches. For the
  rule set: the transactions with an alert, the fraud caught, the false alarms, the fraud missed by every rule, the fraud caught by
  more than one rule, and the rows by strongest action (flag, hold, block).
- Three commands: the back-test of one rule set (`--rules`), `compare` for a current and a candidate rule set on the same
  transactions (shadow mode: fraud lost and gained, false alarms added and cleared, rules added, removed and changed), and `sweep`
  for precision and recall at cut-offs of a numeric `score` column.
- The transactions file as CSV or TSV, JSON lines or a JSON array, with the columns `is_fraud` (or `fraud`, `label`), `id`,
  `timestamp`, `amount`, `currency` and `score` read under their roles and every other column usable by a rule. The rules file as
  JSON: a name, a currency note, limits and rules with an id, a name, an owner, an action, a condition (a field, an operator and a
  value, or all, any and not groups) and optional `max_alert_rate` and `min_precision`. Operators `eq`, `ne`, `gt`, `gte`, `lt`,
  `lte`, `in`, `not_in`, `contains` and `between`, documented in docs/rule-format.md.
- Readers of its own with the line and column of every key or cell, no dependency and no recursion: JSON, JSON lines and a strict CSV
  reader. A key written twice, a field written twice in a header, a stray quote and a semicolon as the delimiter are refused with the
  line and column. A file past a limit is refused whole.
- An evaluator of conditions of its own: a condition is compiled once into a function of the row number by a walk that never calls
  itself, and nothing in a file is evaluated as code.
- Thirty checks with stable ids, FRB001 to FRB030, each with a level, a kind, what it looks at, what to change, why it exists and what
  it cannot see: of the files (FRB001 to FRB003), of the rules (FRB004 to FRB011), of the transactions (FRB012 to FRB020), of the
  results (FRB021 to FRB028) and of the comparison (FRB029 and FRB030). Each is a best practice of the tool and says so; `--disable`
  leaves checks out and the report names them.
- Reports as text, markdown, JSON, SARIF 2.1.0 (with line and column) and JUnit XML (one test case for each check);
  `--min-severity`, `--fail-on`, `--as-of`, `--thresholds`, `--list-checks` and `--explain <id>`. Exit code `0` when no finding is at
  or above the fail-on level, `1` when one is, `2` for a usage or input error, with no report.
- Made-up examples: a shop with four hundred transactions written by a script with a seeded random generator, a current and a
  candidate rule set that pass every check at every level, and rules and transactions with a mistake of every check; with their real
  output in all formats, the list of checks and the explanation of a check.
- Documents: a usage guide, the rules file format, the list of checks, how to read precision and recall for fraud rules in plain
  words, the method, the limits, the decisions, the threat model and the secure defaults.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of the
  repository.
