# The checks

There are 30 checks. Each has an id that stays the same once released, a name, a level and a kind, and says what it looks at, what to change, why it exists and what it cannot see. `--explain <id>` prints the same, and `--list-checks` lists them. Every check is a best practice of this tool: no standard sets any of them, and the reports say so.

A finding at the level `error` fails the run by default; `--fail-on` changes that. A check that did not run is shown as skipped with the reason, and a check that could not run because a file could not be read is shown as not evaluated, so a run never passes on what it did not read.

| Check | Name | Level | Kind |
| --- | --- | --- | --- |
| FRB001 | file-unreadable | error | file |
| FRB002 | field-invalid | error | file |
| FRB003 | field-unknown | warning | file |
| FRB004 | rule-duplicate-id | error | rules |
| FRB005 | rule-no-owner | warning | rules |
| FRB006 | rule-no-action | error | rules |
| FRB007 | range-reversed | error | rules |
| FRB008 | field-not-in-data | error | rules |
| FRB009 | operator-type-mismatch | error | rules |
| FRB010 | duplicate-condition | warning | rules |
| FRB011 | block-no-precision-floor | warning | rules |
| FRB012 | label-column-missing | error | data |
| FRB013 | label-single-valued | error | data |
| FRB014 | label-unrecognised | warning | data |
| FRB015 | amount-invalid | error | data |
| FRB016 | currency-mixed | warning | data |
| FRB017 | transaction-id-duplicate | error | data |
| FRB018 | timestamp-unreadable | warning | data |
| FRB019 | timestamp-in-future | warning | data |
| FRB020 | too-few-fraud-cases | info | data |
| FRB021 | rule-never-fires | warning | results |
| FRB022 | rule-catches-no-fraud | warning | results |
| FRB023 | alert-rate-over-limit | error | results |
| FRB024 | precision-under-floor | error | results |
| FRB025 | rule-redundant | warning | results |
| FRB026 | block-low-precision | error | results |
| FRB027 | hold-queue-over-limit | error | results |
| FRB028 | rule-low-evidence | info | results |
| FRB029 | candidate-loses-fraud | error | compare |
| FRB030 | candidate-adds-false-alarms | error | compare |

## Checks of the files

Whether a file can be followed, and the keys in it.

### FRB001 file-unreadable

Level: error.

**What it looks at.** a file cannot be followed by the reader (a syntax error in the JSON or the CSV, a header with a field written twice, a rules file with no rules, or a file past a limit); no other check ran on that file.

**What to change.** Fix the line and column named; docs/rule-format.md and docs/usage.md describe the files.

**Why it exists.** Refusing a file that cannot be followed is a best practice of this tool; no standard sets it; a tool that guessed would report a clean back-test for text it did not read.

**What it cannot see.** It says where the reader stopped, not what another JSON or CSV reader would make of the file.

### FRB002 field-invalid

Level: error.

**What it looks at.** a value is not what the format says: an action that is not flag, hold or block, an operator the tool does not know, a condition with no field or value, an in list that is not a list, a limit out of range, a rule with no id or no condition, or a transaction row with the wrong number of cells.

**What to change.** Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first.

**Why it exists.** Reporting a value the tool cannot use is a best practice of this tool; no standard sets it; a misread value would turn into a wrong answer in a later check.

**What it cannot see.** It checks the shape of a value. It cannot tell a value that is allowed but wrong from one that is right.

### FRB003 field-unknown

Level: warning.

**What it looks at.** a key of the rules file, of a rule, of the limits or of a condition that the tool does not read, often a misspelt name such as max_alert_rat or onwer; what is under it is not used.

**What to change.** Correct the name to a key of docs/rule-format.md, or take it out of the file.

**Why it exists.** Reporting a key that is not read is a best practice of this tool; no standard sets it; a misspelt min_precision would otherwise look like a rule with no floor, and the floor would never be checked.

**What it cannot see.** It suggests the nearest name within two edits and cannot tell a misspelling from a key your own tools use on purpose.

## Checks of the rules

The rules as written, and the fields they use set against the columns of the transactions.

### FRB004 rule-duplicate-id

Level: error.

**What it looks at.** two rules with the same id (compared without case and without extra spaces).

**What to change.** Give each rule one id. If two entries are the same rule, merge them; if they differ, name the difference in the id.

**Why it exists.** Requiring a unique id is a best practice of this tool; no standard sets it; the report, the comparison of two sets and every person who talks about a rule point at it by its id.

**What it cannot see.** It compares the written ids. It cannot tell two ids for one rule from two rules.

### FRB005 rule-no-owner

Level: warning.

**What it looks at.** a rule with no owner.

**What to change.** Write the person, role or team that answers for the rule in "owner".

**Why it exists.** Asking for an owner on every rule is a best practice of this tool; no standard sets it; when a rule holds a customer payment, someone has to be named who can change or retire it.

**What it cannot see.** It looks for text. It does not know whether the owner exists or agrees.

### FRB006 rule-no-action

Level: error.

**What it looks at.** a rule with no action: nothing says whether a match is flagged, held or blocked.

**What to change.** Write the action in "action": flag, hold or block.

**Why it exists.** Requiring an action on every rule is a best practice of this tool; no standard sets it; the cost of a false alarm depends on what happens to the payment, so a rule without an action cannot be judged.

**What it cannot see.** It looks for the word. It does not know what your system does with a flag, a hold or a block.

### FRB007 range-reversed

Level: error.

**What it looks at.** a between condition whose low end is above its high end, so no value can be inside it.

**What to change.** Swap the two values so the low end comes first.

**Why it exists.** Reporting a reversed range is a best practice of this tool; no standard sets it; a reversed range matches nothing, and the rule looks active while it never fires.

**What it cannot see.** It compares the two numbers or times as written. It cannot tell a reversed range from a range that was meant to wrap around.

### FRB008 field-not-in-data

Level: error.

**What it looks at.** a condition that uses a field that is not a column of the transactions file (with the nearest column).

**What to change.** Correct the field name to a column of the transactions file, or add the column to the data.

**Why it exists.** Reporting a field the data does not have is a best practice of this tool; no standard sets it; a rule on a missing field never fires, and a back-test would call it harmless.

**What it cannot see.** It compares the field with the header of the file without case and extra spaces. It cannot see a field that the live system has and the file lacks for another reason.

### FRB009 operator-type-mismatch

Level: error.

**What it looks at.** an operator that is not valid for the type of the field, or a value that does not fit the field: gt on text, contains on a number, a text where a number is needed (a column of digits is a number, the timestamp column is a time, every other column is text).

**What to change.** Use an operator that fits the field (docs/rule-format.md lists them for numbers, times and text), and write the value as a number or as text to match.

**Why it exists.** Reporting an operator the field cannot use is a best practice of this tool; no standard sets it; a comparison of the wrong kind is false on every row, so the rule never fires.

**What it cannot see.** It types a column from the cells in the file. A column of digits that is an identifier in the live system is a number to the tool.

### FRB010 duplicate-condition

Level: warning.

**What it looks at.** the same condition written twice in one group, or two rules with the same condition (the parts of a group compared in any order).

**What to change.** Take out the repeated part, or merge the two rules and keep the stricter limits.

**Why it exists.** Reporting a repeated condition is a best practice of this tool; no standard sets it; it is how two rules grow apart over time, and how one of them goes on firing after the other was changed.

**What it cannot see.** It compares the conditions as written. Two conditions that mean the same in other words, such as gt 99 and gte 100 on whole numbers, count as two.

### FRB011 block-no-precision-floor

Level: warning.

**What it looks at.** a rule that blocks and has no min_precision of its own.

**What to change.** Write the lowest precision the rule may have in "min_precision", so that a drop is found by this check.

**Why it exists.** Asking a blocking rule for a floor is a best practice of this tool; no standard sets it; a block stops a payment with no human in between, so the tool wants the level written down.

**What it cannot see.** It looks for the key. It does not know whether the number you write is a good floor.

## Checks of the transactions

Labels, amounts, ids, times, currencies, and how many fraud cases there are.

### FRB012 label-column-missing

Level: error.

**What it looks at.** the transactions file has no label column (is_fraud, fraud or label), so no rule can be judged.

**What to change.** Add a column with the confirmed outcome of each transaction: 1 or 0, true or false, fraud or legit.

**Why it exists.** Requiring a label is a best practice of this tool; no standard sets it; a replay without outcomes can count alerts and nothing else.

**What it cannot see.** It looks for the column by name. It does not know how the labels were confirmed.

### FRB013 label-single-valued

Level: error.

**What it looks at.** the labelled transactions are all fraud or all not fraud, so precision or recall cannot be worked out.

**What to change.** Use a file that holds both: confirmed fraud and confirmed good transactions from the same period and the same source.

**Why it exists.** Refusing a one-sided file is a best practice of this tool; no standard sets it; with no fraud there is no recall and every alert is false, and with no good transactions every alert is right.

**What it cannot see.** It counts the labels. It does not know whether the file was cut so as to leave one kind out.

### FRB014 label-unrecognised

Level: warning.

**What it looks at.** rows whose label is empty or is a value the tool does not recognise (it reads 1, true, yes, y, t, fraud and confirmed as fraud, and 0, false, no, n, f, legit, legitimate, genuine and ok as not fraud); they are left out of every count.

**What to change.** Write the label with one of the values the tool reads, or take the unlabelled rows out of the file.

**Why it exists.** Reporting rows that are left out is a best practice of this tool; no standard sets it; a quiet drop of rows would change every rate without anyone seeing it.

**What it cannot see.** It reads the label as written. A label such as pending is left out because it is not an outcome, not because it is wrong.

### FRB015 amount-invalid

Level: error.

**What it looks at.** a transaction whose amount is negative or is not a plain number (a currency sign, a thousands separator or text); the amount counts as zero in the sums.

**What to change.** Write the amount as a plain decimal number, without a sign for the currency, and as a positive number (a refund is a different record).

**Why it exists.** Reporting an amount the sums cannot use is a best practice of this tool; no standard sets it; the amount of fraud caught and the amount of good transactions affected are sums, and one bad cell moves them.

**What it cannot see.** It checks that the cell is a plain number that is not negative. It cannot tell an amount that is wrong from one that is right.

### FRB016 currency-mixed

Level: warning.

**What it looks at.** the transactions hold more than one currency and the rules file has no currency_note that says how the amounts are made comparable.

**What to change.** Write in "currency_note" of the rules file how the amounts were brought to one currency, or give the tool a file of one currency.

**Why it exists.** Asking for a conversion note is a best practice of this tool; no standard sets it; a sum over two currencies and a rule that tests amount gt 500 both mean something different in each currency.

**What it cannot see.** It reads the codes in the currency column and looks for text in the note. It does not know whether a conversion was really done.

### FRB017 transaction-id-duplicate

Level: error.

**What it looks at.** two transactions with the same id (compared as written).

**What to change.** Give each transaction one id; if a transaction appears twice, keep one row, so that it is counted once.

**Why it exists.** Reporting a transaction counted twice is a best practice of this tool; no standard sets it; a repeated row doubles its alert and its label, and every rate changes.

**What it cannot see.** It compares the id column. A file with no id column is not checked, and two different payments with one id are not told from one payment twice.

### FRB018 timestamp-unreadable

Level: warning.

**What it looks at.** a transaction whose timestamp is empty or is not a time the tool reads (seconds or milliseconds since the epoch, or an ISO 8601 text); a time-based rule is false on it.

**What to change.** Write the timestamp as an ISO 8601 text such as the ones in docs/usage.md, or as seconds since the epoch.

**Why it exists.** Reporting a time the tool cannot read is a best practice of this tool; no standard sets it; a rule on time is false on such a row, and the file looks fine while the rule is blind.

**What it cannot see.** It reads the text as a time and cannot tell a time in the wrong zone from a right one.

### FRB019 timestamp-in-future

Level: warning.

**What it looks at.** a transaction dated after the time given with --as-of; the tool reads no clock, so the check runs only when the time is given.

**What to change.** Check how the file was built: a time in the future often means a wrong unit (milliseconds read as seconds) or a wrong zone.

**Why it exists.** Reporting a transaction from the future is a best practice of this tool; no standard sets it; it is a sign that the timestamps are wrong, and then every rule on time is wrong too.

**What it cannot see.** It compares with the time you give. It does not know what time it is.

### FRB020 too-few-fraud-cases

Level: info.

**What it looks at.** the file holds fewer fraud cases than the min_fraud_cases limit (default 20); recall and precision on so few cases move a lot with one case.

**What to change.** Use a longer period or more sources, or read the results as a first look.

**Why it exists.** Saying how few the fraud cases are is a best practice of this tool; no standard sets it; a rate on a handful of cases looks exact and is not.

**What it cannot see.** It counts the cases. It cannot say how many are enough for your rules.

## Checks of the results

What the rules did when they were replayed. They run when both files are read and the labels hold fraud and good transactions.

### FRB021 rule-never-fires

Level: warning.

**What it looks at.** a rule that fires on none of the labelled transactions.

**What to change.** Check the condition and the data; if the rule is not needed, retire it, and if it guards a rare case, say so in "note".

**Why it exists.** Reporting a rule that never fires is a best practice of this tool; no standard sets it; it costs a place in the rule list and gives a false sense of cover.

**What it cannot see.** It sees one file. A rule for a case that is not in the file looks the same as a rule that is broken.

### FRB022 rule-catches-no-fraud

Level: warning.

**What it looks at.** a rule that fires and catches none of the fraud cases in the file: every alert is a false alarm.

**What to change.** Tighten or retire the rule; look at the fields it uses against the fraud cases it should have caught.

**Why it exists.** Reporting a rule that only adds false alarms is a best practice of this tool; no standard sets it; every alert of such a rule costs a review or a lost sale and finds nothing.

**What it cannot see.** It sees the labels in one file. A rule may guard a fraud type that the file does not hold.

### FRB023 alert-rate-over-limit

Level: error.

**What it looks at.** a rule that fires on more transactions for each thousand than its max_alert_rate.

**What to change.** Tighten the condition, or raise max_alert_rate if the queue can take the volume.

**Why it exists.** Holding a rule to its volume limit is a best practice of this tool; no standard sets it; the people who review alerts have a fixed capacity, and a rule that floods them hides the rest.

**What it cannot see.** It uses the volume of the file. The volume on live traffic can differ.

### FRB024 precision-under-floor

Level: error.

**What it looks at.** a rule whose precision (the share of its alerts that were fraud) is under its min_precision.

**What to change.** Tighten the condition so more of the alerts are fraud, or lower min_precision if you accept the lower precision.

**Why it exists.** Holding a rule to its precision floor is a best practice of this tool; no standard sets it; a floor that nobody checks is only a number in a file.

**What it cannot see.** It uses the labels of the file. A rule with few alerts has a precision that moves a lot (see FRB028).

### FRB025 rule-redundant

Level: warning.

**What it looks at.** a rule that catches fraud and every case it catches is also caught by another rule of the set.

**What to change.** Retire the rule or merge it into the one that already catches the same cases, unless it is there on purpose.

**Why it exists.** Reporting a rule that adds no catch is a best practice of this tool; no standard sets it; the rule adds false alarms and review work and no fraud that the set would not catch without it.

**What it cannot see.** It sees one file. A rule that is redundant here may catch cases on other days, and two rules may be kept so that one still works if the other is turned off.

### FRB026 block-low-precision

Level: error.

**What it looks at.** a rule that blocks and has a precision under block_min_precision (default 0.9).

**What to change.** Change the action to hold or flag, or tighten the condition until almost every block is fraud.

**Why it exists.** Asking a blocking rule to be precise is a best practice of this tool; no standard sets it; a block stops a good customer with no human in between.

**What it cannot see.** It uses the labels of the file and a floor that is the choice of this tool unless the rules file sets block_min_precision.

### FRB027 hold-queue-over-limit

Level: error.

**What it looks at.** the transactions whose strongest action is hold are more, for each thousand, than max_hold_per_thousand of the rules file; the check runs only when the limit is set.

**What to change.** Tighten the rules that hold, or give the review team more capacity and raise the limit.

**Why it exists.** Holding the queue to a limit is a best practice of this tool; no standard sets it; held payments wait for a person, and a queue that grows is a queue that is not read.

**What it cannot see.** It counts the rows of the file. It does not know how fast a person reviews.

### FRB028 rule-low-evidence

Level: info.

**What it looks at.** a rule that fired but caught fewer fraud cases than the min_true_positives limit (default 5): its precision rests on a few cases (the count is in the message).

**What to change.** Read the precision of this rule as a first look, or replay a longer period.

**Why it exists.** Marking a rule judged on few cases is a best practice of this tool; no standard sets it; a precision of one half on two cases is not the same as one half on two hundred.

**What it cannot see.** It counts the cases that were caught. It cannot say how many are enough.

## Checks of the comparison

The candidate set set against the current one. They run in the compare command only.

### FRB029 candidate-loses-fraud

Level: error.

**What it looks at.** fraud that the current set catches and the candidate set does not, more cases than max_lost_fraud (default 0).

**What to change.** Look at the cases named, and restore the rule or the part of it that caught them.

**Why it exists.** Counting the fraud a change would let through is a best practice of this tool; no standard sets it; a change that looks like a tidy-up can quietly stop catching a pattern.

**What it cannot see.** It compares the two sets on one file. Fraud that the file does not hold is not seen.

### FRB030 candidate-adds-false-alarms

Level: error.

**What it looks at.** good transactions that the candidate set alerts on and the current set does not, more than max_new_false_alarms of the candidate rules file; the check runs only when the limit is set.

**What to change.** Tighten the new or changed rules, or raise the limit if you accept the added volume.

**Why it exists.** Holding a change to its cost is a best practice of this tool; no standard sets it; new false alarms are new reviews and new declined customers.

**What it cannot see.** It compares the two sets on one file. It does not know what a false alarm costs your business.
