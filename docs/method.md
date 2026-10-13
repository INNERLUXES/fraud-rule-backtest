# Method

fraud-rule-backtest reads the text of a transactions file and of one or two rules files, replays the rules on the transactions
that carry a label, and counts. This document says what it does, in order, and how each number is worked out. It does not connect
to any system, run anything it reads, or look anything up.

## Where this sits, and where it stops

The tool counts what a rule would have done on a file. It does not know whether a label is right, whether the file stands for
live traffic, or what a rule will do next month. It is not a fraud detection system, not a model validation and not an audit: a
clean report says that none of the problems of its checks were found in the files, nothing more. Every check is a best practice of
this tool, and no standard sets any of them.

## The order of the work

1. **Read the files.** Each file is opened once, as a regular file of bounded size, never through a link, and decoded as UTF-8 or
   as UTF-16 with a byte order mark. A file that holds a null byte or is not valid text is refused with exit code 2 and no report.
2. **Read the transactions** as CSV, JSON lines or a JSON array, to a list of fields and a list of rows. A syntax error is a FRB001
   finding with its line and column, and no check of the transactions runs.
3. **Type the columns.** A column of plain numbers is a number column, the timestamp column is a time column, and the rest are text.
   The label, the amount, the time and the score of each row are worked out once.
4. **Read the rules** as JSON, keeping the line and column of every key. A rule is read as far as it can be: a part that cannot be
   used is a FRB002 finding, and the rule is replayed as a rule that never fires.
5. **Check the file and the rules as written** (FRB002 to FRB011) and, against the columns, the fields and operators they use.
6. **Check the transactions** (FRB012 to FRB020).
7. **Compile each condition** into a function of the row number, through a walk that never calls itself, and **replay**: every rule
   on every labelled row. A row is labelled when its label is fraud or not fraud; the others are left out of every count.
8. **Count** for each rule and for the set, below.
9. **Check the results** (FRB021 to FRB028) on the set that is judged: the rules file in a back-test, the candidate in a comparison.
10. **Compare** (compare command): replay the current set too, count the movements row by row, and run FRB029 and FRB030.
11. **Write the report** in the format asked for.

## The counts

For a rule, over the labelled rows (N rows, F of them fraud):

- **alerts** is the rows the rule fires on.
- **true positives** is the alerts that are fraud, **false positives** the alerts that are not.
- **precision** is true positives divided by alerts, and has no value when the rule has no alerts.
- **recall** is true positives divided by F.
- **false positive rate** is false positives divided by N - F.
- **alerts for each thousand** is alerts times 1,000 divided by N.
- **fraud amount caught** is the sum of the amounts of the true positives, and **good amount affected** the sum of the amounts of
  the false positives. An amount that is empty, not a number or negative counts as zero.
- **only rule** is the fraud cases this rule catches that no other rule catches. A rule with true positives and no such case is
  redundant (FRB025).

For the set, a row counts once however many rules fire on it:

- **fraud caught** is the fraud rows some rule fires on, **false alarms** the other rows some rule fires on, **fraud missed** the
  fraud rows no rule fires on.
- **caught by more than one rule** is the fraud rows that two or more rules fire on.
- The set is also split by the strongest action of each alerted row: block over hold over flag. The hold queue (FRB027) is the rows
  whose strongest action is hold.

A rate is a fraction from 0 to 1. A division by zero has no value, shown as a dash.

## The sweep

For each cut-off, an alert is a labelled row with a score at or above it. The counts are those of a rule. A row with no numeric
score is left out of the sweep and counted in a note.

## The comparison

A rule is the same rule in both sets when the ids match, without case and extra spaces. The report lists the rules added, removed
and changed (the condition, the action or the limits). Row by row, with a row "alerted" when any rule of a set fires on it:

- **fraud lost** is fraud alerted by the current set and not by the candidate (FRB029 compares the count with `max_lost_fraud`);
- **fraud gained** is the other way round;
- **false alarms added** is good transactions alerted by the candidate and not by the current set (FRB030 compares the count with
  `max_new_false_alarms`);
- **false alarms cleared** is the other way round.

## What each group of checks can and cannot see

[checks.md](checks.md) has the text of every check with what it looks at and what it cannot see. [limits.md](limits.md) has the
general limits.

## Why the work is bounded

The readers work through loops and stacks. The evaluator compiles a condition once and runs it once for each row and rule, and
runs a rule a second time only to find the fraud that only it catches. The checks visit each rule and each row a bounded number of
times and never compare every pair of rules. A replay that would need more than the limit of rule runs is refused before it starts.
