# fraud-rule-backtest checks

| Check | Name | Level | Kind | What it looks at |
| --- | --- | --- | --- | --- |
| FRB001 | file-unreadable | error | file | a file cannot be followed by the reader \(a syntax error in the JSON or the CSV, a header with a field written twice, a rules file with no rules, or a file past a limit\); no other check ran on that file |
| FRB002 | field-invalid | error | file | a value is not what the format says: an action that is not flag, hold or block, an operator the tool does not know, a condition with no field or value, an in list that is not a list, a limit out of range, a rule with no id or no condition, or a transaction row with the wrong number of cells |
| FRB003 | field-unknown | warning | file | a key of the rules file, of a rule, of the limits or of a condition that the tool does not read, often a misspelt name such as max\_alert\_rat or onwer; what is under it is not used |
| FRB004 | rule-duplicate-id | error | rules | two rules with the same id \(compared without case and without extra spaces\) |
| FRB005 | rule-no-owner | warning | rules | a rule with no owner |
| FRB006 | rule-no-action | error | rules | a rule with no action: nothing says whether a match is flagged, held or blocked |
| FRB007 | range-reversed | error | rules | a between condition whose low end is above its high end, so no value can be inside it |
| FRB008 | field-not-in-data | error | rules | a condition that uses a field that is not a column of the transactions file \(with the nearest column\) |
| FRB009 | operator-type-mismatch | error | rules | an operator that is not valid for the type of the field, or a value that does not fit the field: gt on text, contains on a number, a text where a number is needed \(a column of digits is a number, the timestamp column is a time, every other column is text\) |
| FRB010 | duplicate-condition | warning | rules | the same condition written twice in one group, or two rules with the same condition \(the parts of a group compared in any order\) |
| FRB011 | block-no-precision-floor | warning | rules | a rule that blocks and has no min\_precision of its own |
| FRB012 | label-column-missing | error | data | the transactions file has no label column \(is\_fraud, fraud or label\), so no rule can be judged |
| FRB013 | label-single-valued | error | data | the labelled transactions are all fraud or all not fraud, so precision or recall cannot be worked out |
| FRB014 | label-unrecognised | warning | data | rows whose label is empty or is a value the tool does not recognise \(it reads 1, true, yes, y, t, fraud and confirmed as fraud, and 0, false, no, n, f, legit, legitimate, genuine and ok as not fraud\); they are left out of every count |
| FRB015 | amount-invalid | error | data | a transaction whose amount is negative or is not a plain number \(a currency sign, a thousands separator or text\); the amount counts as zero in the sums |
| FRB016 | currency-mixed | warning | data | the transactions hold more than one currency and the rules file has no currency\_note that says how the amounts are made comparable |
| FRB017 | transaction-id-duplicate | error | data | two transactions with the same id \(compared as written\) |
| FRB018 | timestamp-unreadable | warning | data | a transaction whose timestamp is empty or is not a time the tool reads \(seconds or milliseconds since the epoch, or an ISO 8601 text\); a time-based rule is false on it |
| FRB019 | timestamp-in-future | warning | data | a transaction dated after the time given with --as-of; the tool reads no clock, so the check runs only when the time is given |
| FRB020 | too-few-fraud-cases | info | data | the file holds fewer fraud cases than the min\_fraud\_cases limit \(default 20\); recall and precision on so few cases move a lot with one case |
| FRB021 | rule-never-fires | warning | results | a rule that fires on none of the labelled transactions |
| FRB022 | rule-catches-no-fraud | warning | results | a rule that fires and catches none of the fraud cases in the file: every alert is a false alarm |
| FRB023 | alert-rate-over-limit | error | results | a rule that fires on more transactions for each thousand than its max\_alert\_rate |
| FRB024 | precision-under-floor | error | results | a rule whose precision \(the share of its alerts that were fraud\) is under its min\_precision |
| FRB025 | rule-redundant | warning | results | a rule that catches fraud and every case it catches is also caught by another rule of the set |
| FRB026 | block-low-precision | error | results | a rule that blocks and has a precision under block\_min\_precision \(default 0.9\) |
| FRB027 | hold-queue-over-limit | error | results | the transactions whose strongest action is hold are more, for each thousand, than max\_hold\_per\_thousand of the rules file; the check runs only when the limit is set |
| FRB028 | rule-low-evidence | info | results | a rule that fired but caught fewer fraud cases than the min\_true\_positives limit \(default 5\): its precision rests on a few cases \(the count is in the message\) |
| FRB029 | candidate-loses-fraud | error | compare | fraud that the current set catches and the candidate set does not, more cases than max\_lost\_fraud \(default 0\) |
| FRB030 | candidate-adds-false-alarms | error | compare | good transactions that the candidate set alerts on and the current set does not, more than max\_new\_false\_alarms of the candidate rules file; the check runs only when the limit is set |
