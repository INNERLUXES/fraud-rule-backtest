# fraud-rule-backtest backtest: examples/bad/transactions.csv \+ examples/bad/rules.json

- Transactions file: examples/bad/transactions.csv \(csv, 406 lines, 24,661 bytes\)
- Rules file: examples/bad/rules.json \(json, 120 lines, 3,247 bytes\)
- Transactions: 405 rows, 403 labelled \(46 fraud, 357 not fraud\); 2 left out for want of a label
- Amounts: fraud 22,329.09, not fraud 26,240.79 \(currencies: EUR, GBP\)
- Rules: Rule set with mistakes in the rules \(made up\): 12 rules
- Findings: 34 \(17 error, 17 warning\)
- Result: **FAIL - 17 findings at or above error \(17 error, 17 warning\)**

## Rule results

| rule | action | alerts | fraud | not fraud | precision | recall | fp rate | per 1,000 | fraud amount | good amount | only rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R001 | hold | 10 | 8 | 2 | 0.800 | 0.174 | 0.006 | 24.8 | 4,658.90 | 953.45 | 0 |
| r001 | hold | 10 | 8 | 2 | 0.800 | 0.174 | 0.006 | 24.8 | 4,658.90 | 953.45 | 0 |
| R002 | hold | 20 | 14 | 6 | 0.700 | 0.304 | 0.017 | 49.6 | 7,467.98 | 1,201.35 | 0 |
| R003 | - | 0 | 0 | 0 | - | 0.000 | 0.000 | 0.0 | 0.00 | 0.00 | 0 |
| R004 | block | 0 | 0 | 0 | - | 0.000 | 0.000 | 0.0 | 0.00 | 0.00 | 0 |
| R005 | flag | 0 | 0 | 0 | - | 0.000 | 0.000 | 0.0 | 0.00 | 0.00 | 0 |
| R006 | flag | 0 | 0 | 0 | - | 0.000 | 0.000 | 0.0 | 0.00 | 0.00 | 0 |
| R007 | - | 140 | 21 | 119 | 0.150 | 0.457 | 0.333 | 347.4 | 8,914.99 | 9,235.58 | 5 |
| R008 | flag | 0 | 0 | 0 | - | 0.000 | 0.000 | 0.0 | 0.00 | 0.00 | 0 |
| R009 | flag | 0 | 0 | 0 | - | 0.000 | 0.000 | 0.0 | 0.00 | 0.00 | 0 |
| R010 | hold | 20 | 14 | 6 | 0.700 | 0.304 | 0.017 | 49.6 | 7,467.98 | 1,201.35 | 0 |
| \(rule 12\) | flag | 0 | 0 | 0 | - | 0.000 | 0.000 | 0.0 | 0.00 | 0.00 | 0 |

fraud = fraud cases caught \(true positives\), not fraud = good transactions alerted \(false positives\), per 1,000 = alerts for each thousand transactions, fraud amount = amount of the fraud caught, good amount = amount of the good transactions affected, only rule = fraud that no other rule catches.

## The whole rule set

| measure | value |
| --- | --- |
| labelled transactions | 403 |
| fraud cases | 46 |
| transactions with an alert | 147 |
| fraud caught | 27 |
| false alarms | 120 |
| fraud missed by every rule | 19 |
| precision | 0.184 |
| recall | 0.587 |
| false positive rate | 0.336 |
| alerts per 1,000 transactions | 364.8 |
| fraud caught by more than one rule | 22 |
| fraud caught by one rule only | 5 |
| fraud amount caught | 12,400.42 |
| fraud amount missed | 9,928.67 |
| good amount affected | 9,614.95 |

## Strongest action of each alerted transaction

| strongest action | transactions | fraud | not fraud | per 1,000 |
| --- | --- | --- | --- | --- |
| flag | 117 | 5 | 112 | 290.3 |
| hold | 30 | 22 | 8 | 74.4 |
| block | 0 | 0 | 0 | 0.0 |

## Checks

| check | name | level | kind | status | findings |
| --- | --- | --- | --- | --- | --- |
| FRB001 | file-unreadable | error | file | pass | 0 |
| FRB002 | field-invalid | error | file | fail | 6 |
| FRB003 | field-unknown | warning | file | fail | 3 |
| FRB004 | rule-duplicate-id | error | rules | fail | 1 |
| FRB005 | rule-no-owner | warning | rules | fail | 1 |
| FRB006 | rule-no-action | error | rules | fail | 1 |
| FRB007 | range-reversed | error | rules | fail | 1 |
| FRB008 | field-not-in-data | error | rules | fail | 1 |
| FRB009 | operator-type-mismatch | error | rules | fail | 3 |
| FRB010 | duplicate-condition | warning | rules | fail | 2 |
| FRB011 | block-no-precision-floor | warning | rules | fail | 1 |
| FRB012 | label-column-missing | error | data | pass | 0 |
| FRB013 | label-single-valued | error | data | pass | 0 |
| FRB014 | label-unrecognised | warning | data | fail | 2 |
| FRB015 | amount-invalid | error | data | fail | 3 |
| FRB016 | currency-mixed | warning | data | fail | 1 |
| FRB017 | transaction-id-duplicate | error | data | fail | 1 |
| FRB018 | timestamp-unreadable | warning | data | fail | 1 |
| FRB019 | timestamp-in-future | warning | data | fail | 1 |
| FRB020 | too-few-fraud-cases | info | data | pass | 0 |
| FRB021 | rule-never-fires | warning | results | fail | 1 |
| FRB022 | rule-catches-no-fraud | warning | results | pass | 0 |
| FRB023 | alert-rate-over-limit | error | results | pass | 0 |
| FRB024 | precision-under-floor | error | results | pass | 0 |
| FRB025 | rule-redundant | warning | results | fail | 4 |
| FRB026 | block-low-precision | error | results | pass | 0 |
| FRB027 | hold-queue-over-limit | error | results | skipped | - \(the rules file sets no max\_hold\_per\_thousand\) |
| FRB028 | rule-low-evidence | info | results | pass | 0 |
| FRB029 | candidate-loses-fraud | error | compare | skipped | - \(only the compare command runs it\) |
| FRB030 | candidate-adds-false-alarms | error | compare | skipped | - \(only the compare command runs it\) |

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| error | FRB002 | examples/bad/rules.json:84 | The rule "R007": the action "blokc" is not one of flag, hold, block \(did you mean "block"?\). Fix: Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first. |
| error | FRB002 | examples/bad/rules.json:92 | The rule "R008": the condition on "amount" has the operator "gtee", which the tool does not know \(did you mean "gte"?\) \(eq, ne, gt, gte, lt, lte, in, not\_in, contains, between\). Fix: Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first. |
| error | FRB002 | examples/bad/rules.json:99 | The rule "R009": the operator in on "country" needs a list of 1 to 500 texts or numbers. Fix: Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first. |
| error | FRB002 | examples/bad/rules.json:100 | The rule "R009": max\_alert\_rate must be a number from 0 to 1000, but it is a number \(5000\). Fix: Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first. |
| error | FRB002 | examples/bad/rules.json:114 | Rule 12 has no "id" \(text or a number\). Fix: Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first. |
| error | FRB002 | examples/bad/rules.json:114 | The rule "\(rule 12\)" has no "when" condition. Fix: Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first. |
| error | FRB004 | examples/bad/rules.json:20 | The rule id "r001" is used by two rules: at line 6 and at line 20. Fix: Give each rule one id. If two entries are the same rule, merge them; if they differ, name the difference in the id. |
| error | FRB006 | examples/bad/rules.json:42 | The rule "R003" has no action; it needs flag, hold or block. Fix: Write the action in "action": flag, hold or block. |
| error | FRB007 | examples/bad/rules.json:49 | The rule "R003" has a between range on "amount" with the low end 3 above the high end 0.5; no value can be inside it. Fix: Swap the two values so the low end comes first. |
| error | FRB008 | examples/bad/rules.json:59 | The rule "R004" uses the field "amout", which is not a column of the transactions file; the nearest column is "amount". Fix: Correct the field name to a column of the transactions file, or add the column to the data. |
| error | FRB009 | examples/bad/rules.json:66 | The rule "R005": the operator gt is not valid for the field "country", which holds text; it can use eq, ne, in, not\_in, contains. Fix: Use an operator that fits the field \(docs/rule-format.md lists them for numbers, times and text\), and write the value as a number or as text to match. |
| error | FRB009 | examples/bad/rules.json:75 | The rule "R006": the operator contains is not valid for the field "amount", which holds numbers; it can use eq, ne, gt, gte, lt, lte, in, not\_in, between. Fix: Use an operator that fits the field \(docs/rule-format.md lists them for numbers, times and text\), and write the value as a number or as text to match. |
| error | FRB009 | examples/bad/rules.json:76 | The rule "R006": the value "high" of "amount" is not a number, but the field holds numbers. Fix: Use an operator that fits the field \(docs/rule-format.md lists them for numbers, times and text\), and write the value as a number or as text to match. |
| error | FRB015 | examples/bad/transactions.csv:12 | The transaction "T0011" has the amount -25.00, which is negative; it counts as zero in the sums. Fix: Write the amount as a plain decimal number, without a sign for the currency, and as a positive number \(a refund is a different record\). |
| error | FRB015 | examples/bad/transactions.csv:22 | The transaction "T0021" has the amount "12 EUR", which is not a plain number; it counts as zero in the sums. Fix: Write the amount as a plain decimal number, without a sign for the currency, and as a positive number \(a refund is a different record\). |
| error | FRB017 | examples/bad/transactions.csv:72 | The transaction id "T0070" is used on line 71 and on line 72. Fix: Give each transaction one id; if a transaction appears twice, keep one row, so that it is counted once. |
| error | FRB015 | examples/bad/transactions.csv:92 | The transaction "T0091" has no amount; it counts as zero in the sums. Fix: Write the amount as a plain decimal number, without a sign for the currency, and as a positive number \(a refund is a different record\). |
| warning | FRB003 | examples/bad/rules.json:3 | The rules file has the key "limit", which the tool does not read \(did you mean "limits"?\). What is under it is not checked. Fix: Correct the name to a key of docs/rule-format.md, or take it out of the file. |
| warning | FRB003 | examples/bad/rules.json:17 | Rule 1 has the key "max\_alert\_rat", which the tool does not read \(did you mean "max\_alert\_rate"?\). What is under it is not checked. Fix: Correct the name to a key of docs/rule-format.md, or take it out of the file. |
| warning | FRB003 | examples/bad/rules.json:56 | Rule 5 has the key "onwer", which the tool does not read \(did you mean "owner"?\). What is under it is not checked. Fix: Correct the name to a key of docs/rule-format.md, or take it out of the file. |
| warning | FRB010 | examples/bad/rules.json:14 | The rule "R001" repeats the condition 'amount gte 300' in one all group. Fix: Take out the repeated part, or merge the two rules and keep the stricter limits. |
| warning | FRB005 | examples/bad/rules.json:31 | The rule "R002" has no owner. Fix: Write the person, role or team that answers for the rule in "owner". |
| warning | FRB011 | examples/bad/rules.json:58 | The rule "R004" blocks and sets no min\_precision. Fix: Write the lowest precision the rule may have in "min\_precision", so that a drop is found by this check. |
| warning | FRB010 | examples/bad/rules.json:107 | The rule "R010" has the same condition as the rule "R002" at line 31. Fix: Take out the repeated part, or merge the two rules and keep the stricter limits. |
| warning | FRB016 | examples/bad/transactions.csv:1 | The transactions hold 2 currencies \(EUR and GBP\) and the rules file has no currency\_note that says how the amounts are made comparable. Fix: Write in "currency\_note" of the rules file how the amounts were brought to one currency, or give the tool a file of one currency. |
| warning | FRB014 | examples/bad/transactions.csv:32 | The label "maybe" is not recognised on 1 transaction, the first "T0031"; they are left out of every count. Fix: Write the label with one of the values the tool reads, or take the unlabelled rows out of the file. |
| warning | FRB014 | examples/bad/transactions.csv:42 | 1 transaction has no label, the first "T0041"; they are left out of every count. Fix: Write the label with one of the values the tool reads, or take the unlabelled rows out of the file. |
| warning | FRB018 | examples/bad/transactions.csv:62 | The transaction "T0061" has the timestamp "soon", which is not a time the tool reads. Fix: Write the timestamp as an ISO 8601 text such as the ones in docs/usage.md, or as seconds since the epoch. |
| warning | FRB019 | examples/bad/transactions.csv:82 | The transaction "T0081" is dated after the --as-of time \(timestamp "4102444800"\). Fix: Check how the file was built: a time in the future often means a wrong unit \(milliseconds read as seconds\) or a wrong zone. |
| warning | FRB025 | examples/bad/rules.json:5 | The rule "R001" catches 8 fraud cases and every one is also caught by another rule. Fix: Retire the rule or merge it into the one that already catches the same cases, unless it is there on purpose. |
| warning | FRB025 | examples/bad/rules.json:19 | The rule "r001" catches 8 fraud cases and every one is also caught by another rule. Fix: Retire the rule or merge it into the one that already catches the same cases, unless it is there on purpose. |
| warning | FRB025 | examples/bad/rules.json:31 | The rule "R002" catches 14 fraud cases and every one is also caught by another rule. Fix: Retire the rule or merge it into the one that already catches the same cases, unless it is there on purpose. |
| warning | FRB021 | examples/bad/rules.json:42 | The rule "R003" never fires on the 403 labelled transactions. Fix: Check the condition and the data; if the rule is not needed, retire it, and if it guards a rare case, say so in "note". |
| warning | FRB025 | examples/bad/rules.json:102 | The rule "R010" catches 14 fraud cases and every one is also caught by another rule. Fix: Retire the rule or merge it into the one that already catches the same cases, unless it is there on purpose. |

Note: 6 rules of the rules file could not be fully evaluated and are replayed as rules that never fire: R004, R005, R006, R008, R009 and more

This report reads the transactions file and the rules file and nothing else. It replays the rules on past transactions that carry a label. A result describes how the rules would have behaved on that file; it is not a forecast of how they will behave on future transactions, and it is not a statement that the labels are complete or right. A clean result means that none of the problems of its checks were found.
