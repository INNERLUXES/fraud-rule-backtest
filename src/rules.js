// The checks. Each has an id that stays the same once released (pipelines and other tools read it from the JSON, SARIF, JUnit and
// markdown output), a name, a level, a kind, what it looks at, what to change, why it is a check at all and what it cannot see.
//
// kind 'file'     a problem with a file as a transactions file or a rules file: whether it can be read, and the keys in it
// kind 'rules'    a problem with the rules as written: ids, owners, actions, conditions and the fields they use
// kind 'data'     a problem with the transactions: labels, amounts, ids, times, currencies and how many fraud cases there are
// kind 'results'  a problem with what the rules did on the transactions: a rule that never fires, fires too often, is not precise
//                 enough or adds nothing
// kind 'compare'  a problem with the candidate rule set set against the current one
//
// No standard sets how a fraud rule must behave, so every check is a best practice of this tool, and `own` says so and says why
// the tool asks for it. The tool replays rules on a file; it never connects to a payment system and never predicts.

import { BEST, LEVELS } from './data.js';

const ONLY = (what, why) => `${what} is ${BEST}; ${why}`;

export const RULES = [
  {
    id: 'FRB001',
    name: 'file-unreadable',
    severity: 'error',
    kind: 'file',
    summary: 'a file cannot be followed by the reader (a syntax error in the JSON or the CSV, a header with a field written twice, a rules file with no rules, or a file past a limit); no other check ran on that file',
    fix: 'Fix the line and column named; docs/rule-format.md and docs/usage.md describe the files.',
    own: ONLY('Refusing a file that cannot be followed', 'a tool that guessed would report a clean back-test for text it did not read'),
    cannot: 'It says where the reader stopped, not what another JSON or CSV reader would make of the file.'
  },
  {
    id: 'FRB002',
    name: 'field-invalid',
    severity: 'error',
    kind: 'file',
    summary: 'a value is not what the format says: an action that is not flag, hold or block, an operator the tool does not know, a condition with no field or value, an in list that is not a list, a limit out of range, a rule with no id or no condition, or a transaction row with the wrong number of cells',
    fix: 'Write the value as docs/rule-format.md says. A rule with a part the tool cannot use is replayed as a rule that never fires, so fix it first.',
    own: ONLY('Reporting a value the tool cannot use', 'a misread value would turn into a wrong answer in a later check'),
    cannot: 'It checks the shape of a value. It cannot tell a value that is allowed but wrong from one that is right.'
  },
  {
    id: 'FRB003',
    name: 'field-unknown',
    severity: 'warning',
    kind: 'file',
    summary: 'a key of the rules file, of a rule, of the limits or of a condition that the tool does not read, often a misspelt name such as max_alert_rat or onwer; what is under it is not used',
    fix: 'Correct the name to a key of docs/rule-format.md, or take it out of the file.',
    own: ONLY('Reporting a key that is not read', 'a misspelt min_precision would otherwise look like a rule with no floor, and the floor would never be checked'),
    cannot: 'It suggests the nearest name within two edits and cannot tell a misspelling from a key your own tools use on purpose.'
  },
  {
    id: 'FRB004',
    name: 'rule-duplicate-id',
    severity: 'error',
    kind: 'rules',
    summary: 'two rules with the same id (compared without case and without extra spaces)',
    fix: 'Give each rule one id. If two entries are the same rule, merge them; if they differ, name the difference in the id.',
    own: ONLY('Requiring a unique id', 'the report, the comparison of two sets and every person who talks about a rule point at it by its id'),
    cannot: 'It compares the written ids. It cannot tell two ids for one rule from two rules.'
  },
  {
    id: 'FRB005',
    name: 'rule-no-owner',
    severity: 'warning',
    kind: 'rules',
    summary: 'a rule with no owner',
    fix: 'Write the person, role or team that answers for the rule in "owner".',
    own: ONLY('Asking for an owner on every rule', 'when a rule holds a customer payment, someone has to be named who can change or retire it'),
    cannot: 'It looks for text. It does not know whether the owner exists or agrees.'
  },
  {
    id: 'FRB006',
    name: 'rule-no-action',
    severity: 'error',
    kind: 'rules',
    summary: 'a rule with no action: nothing says whether a match is flagged, held or blocked',
    fix: 'Write the action in "action": flag, hold or block.',
    own: ONLY('Requiring an action on every rule', 'the cost of a false alarm depends on what happens to the payment, so a rule without an action cannot be judged'),
    cannot: 'It looks for the word. It does not know what your system does with a flag, a hold or a block.'
  },
  {
    id: 'FRB007',
    name: 'range-reversed',
    severity: 'error',
    kind: 'rules',
    summary: 'a between condition whose low end is above its high end, so no value can be inside it',
    fix: 'Swap the two values so the low end comes first.',
    own: ONLY('Reporting a reversed range', 'a reversed range matches nothing, and the rule looks active while it never fires'),
    cannot: 'It compares the two numbers or times as written. It cannot tell a reversed range from a range that was meant to wrap around.'
  },
  {
    id: 'FRB008',
    name: 'field-not-in-data',
    severity: 'error',
    kind: 'rules',
    summary: 'a condition that uses a field that is not a column of the transactions file (with the nearest column)',
    fix: 'Correct the field name to a column of the transactions file, or add the column to the data.',
    own: ONLY('Reporting a field the data does not have', 'a rule on a missing field never fires, and a back-test would call it harmless'),
    cannot: 'It compares the field with the header of the file without case and extra spaces. It cannot see a field that the live system has and the file lacks for another reason.'
  },
  {
    id: 'FRB009',
    name: 'operator-type-mismatch',
    severity: 'error',
    kind: 'rules',
    summary: 'an operator that is not valid for the type of the field, or a value that does not fit the field: gt on text, contains on a number, a text where a number is needed (a column of digits is a number, the timestamp column is a time, every other column is text)',
    fix: 'Use an operator that fits the field (docs/rule-format.md lists them for numbers, times and text), and write the value as a number or as text to match.',
    own: ONLY('Reporting an operator the field cannot use', 'a comparison of the wrong kind is false on every row, so the rule never fires'),
    cannot: 'It types a column from the cells in the file. A column of digits that is an identifier in the live system is a number to the tool.'
  },
  {
    id: 'FRB010',
    name: 'duplicate-condition',
    severity: 'warning',
    kind: 'rules',
    summary: 'the same condition written twice in one group, or two rules with the same condition (the parts of a group compared in any order)',
    fix: 'Take out the repeated part, or merge the two rules and keep the stricter limits.',
    own: ONLY('Reporting a repeated condition', 'it is how two rules grow apart over time, and how one of them goes on firing after the other was changed'),
    cannot: 'It compares the conditions as written. Two conditions that mean the same in other words, such as gt 99 and gte 100 on whole numbers, count as two.'
  },
  {
    id: 'FRB011',
    name: 'block-no-precision-floor',
    severity: 'warning',
    kind: 'rules',
    summary: 'a rule that blocks and has no min_precision of its own',
    fix: 'Write the lowest precision the rule may have in "min_precision", so that a drop is found by this check.',
    own: ONLY('Asking a blocking rule for a floor', 'a block stops a payment with no human in between, so the tool wants the level written down'),
    cannot: 'It looks for the key. It does not know whether the number you write is a good floor.'
  },
  {
    id: 'FRB012',
    name: 'label-column-missing',
    severity: 'error',
    kind: 'data',
    summary: 'the transactions file has no label column (is_fraud, fraud or label), so no rule can be judged',
    fix: 'Add a column with the confirmed outcome of each transaction: 1 or 0, true or false, fraud or legit.',
    own: ONLY('Requiring a label', 'a replay without outcomes can count alerts and nothing else'),
    cannot: 'It looks for the column by name. It does not know how the labels were confirmed.'
  },
  {
    id: 'FRB013',
    name: 'label-single-valued',
    severity: 'error',
    kind: 'data',
    summary: 'the labelled transactions are all fraud or all not fraud, so precision or recall cannot be worked out',
    fix: 'Use a file that holds both: confirmed fraud and confirmed good transactions from the same period and the same source.',
    own: ONLY('Refusing a one-sided file', 'with no fraud there is no recall and every alert is false, and with no good transactions every alert is right'),
    cannot: 'It counts the labels. It does not know whether the file was cut so as to leave one kind out.'
  },
  {
    id: 'FRB014',
    name: 'label-unrecognised',
    severity: 'warning',
    kind: 'data',
    summary: 'rows whose label is empty or is a value the tool does not recognise (it reads 1, true, yes, y, t, fraud and confirmed as fraud, and 0, false, no, n, f, legit, legitimate, genuine and ok as not fraud); they are left out of every count',
    fix: 'Write the label with one of the values the tool reads, or take the unlabelled rows out of the file.',
    own: ONLY('Reporting rows that are left out', 'a quiet drop of rows would change every rate without anyone seeing it'),
    cannot: 'It reads the label as written. A label such as pending is left out because it is not an outcome, not because it is wrong.'
  },
  {
    id: 'FRB015',
    name: 'amount-invalid',
    severity: 'error',
    kind: 'data',
    summary: 'a transaction whose amount is negative or is not a plain number (a currency sign, a thousands separator or text); the amount counts as zero in the sums',
    fix: 'Write the amount as a plain decimal number, without a sign for the currency, and as a positive number (a refund is a different record).',
    own: ONLY('Reporting an amount the sums cannot use', 'the amount of fraud caught and the amount of good transactions affected are sums, and one bad cell moves them'),
    cannot: 'It checks that the cell is a plain number that is not negative. It cannot tell an amount that is wrong from one that is right.'
  },
  {
    id: 'FRB016',
    name: 'currency-mixed',
    severity: 'warning',
    kind: 'data',
    summary: 'the transactions hold more than one currency and the rules file has no currency_note that says how the amounts are made comparable',
    fix: 'Write in "currency_note" of the rules file how the amounts were brought to one currency, or give the tool a file of one currency.',
    own: ONLY('Asking for a conversion note', 'a sum over two currencies and a rule that tests amount gt 500 both mean something different in each currency'),
    cannot: 'It reads the codes in the currency column and looks for text in the note. It does not know whether a conversion was really done.'
  },
  {
    id: 'FRB017',
    name: 'transaction-id-duplicate',
    severity: 'error',
    kind: 'data',
    summary: 'two transactions with the same id (compared as written)',
    fix: 'Give each transaction one id; if a transaction appears twice, keep one row, so that it is counted once.',
    own: ONLY('Reporting a transaction counted twice', 'a repeated row doubles its alert and its label, and every rate changes'),
    cannot: 'It compares the id column. A file with no id column is not checked, and two different payments with one id are not told from one payment twice.'
  },
  {
    id: 'FRB018',
    name: 'timestamp-unreadable',
    severity: 'warning',
    kind: 'data',
    summary: 'a transaction whose timestamp is empty or is not a time the tool reads (seconds or milliseconds since the epoch, or an ISO 8601 text); a time-based rule is false on it',
    fix: 'Write the timestamp as an ISO 8601 text such as the ones in docs/usage.md, or as seconds since the epoch.',
    own: ONLY('Reporting a time the tool cannot read', 'a rule on time is false on such a row, and the file looks fine while the rule is blind'),
    cannot: 'It reads the text as a time and cannot tell a time in the wrong zone from a right one.'
  },
  {
    id: 'FRB019',
    name: 'timestamp-in-future',
    severity: 'warning',
    kind: 'data',
    summary: 'a transaction dated after the time given with --as-of; the tool reads no clock, so the check runs only when the time is given',
    fix: 'Check how the file was built: a time in the future often means a wrong unit (milliseconds read as seconds) or a wrong zone.',
    own: ONLY('Reporting a transaction from the future', 'it is a sign that the timestamps are wrong, and then every rule on time is wrong too'),
    cannot: 'It compares with the time you give. It does not know what time it is.'
  },
  {
    id: 'FRB020',
    name: 'too-few-fraud-cases',
    severity: 'info',
    kind: 'data',
    summary: 'the file holds fewer fraud cases than the min_fraud_cases limit (default 20); recall and precision on so few cases move a lot with one case',
    fix: 'Use a longer period or more sources, or read the results as a first look.',
    own: ONLY('Saying how few the fraud cases are', 'a rate on a handful of cases looks exact and is not'),
    cannot: 'It counts the cases. It cannot say how many are enough for your rules.'
  },
  {
    id: 'FRB021',
    name: 'rule-never-fires',
    severity: 'warning',
    kind: 'results',
    summary: 'a rule that fires on none of the labelled transactions',
    fix: 'Check the condition and the data; if the rule is not needed, retire it, and if it guards a rare case, say so in "note".',
    own: ONLY('Reporting a rule that never fires', 'it costs a place in the rule list and gives a false sense of cover'),
    cannot: 'It sees one file. A rule for a case that is not in the file looks the same as a rule that is broken.'
  },
  {
    id: 'FRB022',
    name: 'rule-catches-no-fraud',
    severity: 'warning',
    kind: 'results',
    summary: 'a rule that fires and catches none of the fraud cases in the file: every alert is a false alarm',
    fix: 'Tighten or retire the rule; look at the fields it uses against the fraud cases it should have caught.',
    own: ONLY('Reporting a rule that only adds false alarms', 'every alert of such a rule costs a review or a lost sale and finds nothing'),
    cannot: 'It sees the labels in one file. A rule may guard a fraud type that the file does not hold.'
  },
  {
    id: 'FRB023',
    name: 'alert-rate-over-limit',
    severity: 'error',
    kind: 'results',
    summary: 'a rule that fires on more transactions for each thousand than its max_alert_rate',
    fix: 'Tighten the condition, or raise max_alert_rate if the queue can take the volume.',
    own: ONLY('Holding a rule to its volume limit', 'the people who review alerts have a fixed capacity, and a rule that floods them hides the rest'),
    cannot: 'It uses the volume of the file. The volume on live traffic can differ.'
  },
  {
    id: 'FRB024',
    name: 'precision-under-floor',
    severity: 'error',
    kind: 'results',
    summary: 'a rule whose precision (the share of its alerts that were fraud) is under its min_precision',
    fix: 'Tighten the condition so more of the alerts are fraud, or lower min_precision if you accept the lower precision.',
    own: ONLY('Holding a rule to its precision floor', 'a floor that nobody checks is only a number in a file'),
    cannot: 'It uses the labels of the file. A rule with few alerts has a precision that moves a lot (see FRB028).'
  },
  {
    id: 'FRB025',
    name: 'rule-redundant',
    severity: 'warning',
    kind: 'results',
    summary: 'a rule that catches fraud and every case it catches is also caught by another rule of the set',
    fix: 'Retire the rule or merge it into the one that already catches the same cases, unless it is there on purpose.',
    own: ONLY('Reporting a rule that adds no catch', 'the rule adds false alarms and review work and no fraud that the set would not catch without it'),
    cannot: 'It sees one file. A rule that is redundant here may catch cases on other days, and two rules may be kept so that one still works if the other is turned off.'
  },
  {
    id: 'FRB026',
    name: 'block-low-precision',
    severity: 'error',
    kind: 'results',
    summary: 'a rule that blocks and has a precision under block_min_precision (default 0.9)',
    fix: 'Change the action to hold or flag, or tighten the condition until almost every block is fraud.',
    own: ONLY('Asking a blocking rule to be precise', 'a block stops a good customer with no human in between'),
    cannot: 'It uses the labels of the file and a floor that is the choice of this tool unless the rules file sets block_min_precision.'
  },
  {
    id: 'FRB027',
    name: 'hold-queue-over-limit',
    severity: 'error',
    kind: 'results',
    summary: 'the transactions whose strongest action is hold are more, for each thousand, than max_hold_per_thousand of the rules file; the check runs only when the limit is set',
    fix: 'Tighten the rules that hold, or give the review team more capacity and raise the limit.',
    own: ONLY('Holding the queue to a limit', 'held payments wait for a person, and a queue that grows is a queue that is not read'),
    cannot: 'It counts the rows of the file. It does not know how fast a person reviews.'
  },
  {
    id: 'FRB028',
    name: 'rule-low-evidence',
    severity: 'info',
    kind: 'results',
    summary: 'a rule that fired but caught fewer fraud cases than the min_true_positives limit (default 5): its precision rests on a few cases (the count is in the message)',
    fix: 'Read the precision of this rule as a first look, or replay a longer period.',
    own: ONLY('Marking a rule judged on few cases', 'a precision of one half on two cases is not the same as one half on two hundred'),
    cannot: 'It counts the cases that were caught. It cannot say how many are enough.'
  },
  {
    id: 'FRB029',
    name: 'candidate-loses-fraud',
    severity: 'error',
    kind: 'compare',
    summary: 'fraud that the current set catches and the candidate set does not, more cases than max_lost_fraud (default 0)',
    fix: 'Look at the cases named, and restore the rule or the part of it that caught them.',
    own: ONLY('Counting the fraud a change would let through', 'a change that looks like a tidy-up can quietly stop catching a pattern'),
    cannot: 'It compares the two sets on one file. Fraud that the file does not hold is not seen.'
  },
  {
    id: 'FRB030',
    name: 'candidate-adds-false-alarms',
    severity: 'error',
    kind: 'compare',
    summary: 'good transactions that the candidate set alerts on and the current set does not, more than max_new_false_alarms of the candidate rules file; the check runs only when the limit is set',
    fix: 'Tighten the new or changed rules, or raise the limit if you accept the added volume.',
    own: ONLY('Holding a change to its cost', 'new false alarms are new reviews and new declined customers'),
    cannot: 'It compares the two sets on one file. It does not know what a false alarm costs your business.'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === String(id).toUpperCase() || r.name === String(id).toLowerCase());

export const atOrAbove = (level, floor) => LEVELS.indexOf(level) >= LEVELS.indexOf(floor);

// The result of a run for the counts of findings of each level and the level that fails the run.
export function decide(byLevel, failOn) {
  const failing = LEVELS.filter((l) => atOrAbove(l, failOn)).reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const total = LEVELS.reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const parts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${byLevel[l]} ${l}`);
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  if (failing > 0) return { pass: false, failOn, text: `FAIL - ${failing} ${failing === 1 ? 'finding' : 'findings'} at or above ${failOn}${detail}` };
  return { pass: true, failOn, text: `PASS - no finding at or above ${failOn}${total ? detail : ''}` };
}
