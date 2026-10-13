# Limits

This document says what a clean result means, what the tool is not, what it cannot see and which limits bound its work.

## What a clean result means

A clean result means that none of the problems that the checks look for were found in the transactions file and the rules file
(or the two rules files of a comparison), at the level you set. It is worded "no finding at or above the level" and nothing
stronger. It is not a statement that the rules catch fraud, that the labels are complete or right, or that the numbers hold
on traffic the file does not hold.

## What the tool is not

- **Not connected to anything.** It never connects to a payment system, a database or a case tool. It reads two kinds of file.
- **Not a forecast.** It replays rules on past transactions and says what they would have done on that file. It does not say what
  they will do on future transactions. People who commit fraud change what they do, and the traffic of a business changes.
- **Not a fraud detection system.** It does not score a payment, hold one or learn from one. It reads two kinds of file and counts.
- **Not a model validation.** The sweep reads a score column and counts at cut-offs. It does not look at how the score was made, at
  drift, at fairness or at stability.
- **Not an audit.** No report of the tool says that a rule, a rule set or a process has been reviewed or approved by anybody.
- **Not a standard.** Every check is a best practice of this tool, and says so. The default limits (a block floor of 0.9, five
  true positives, twenty fraud cases) are its own choice, and the rules file can change them.

## What the tool cannot see

- **Fraud that is not in the file.** A fraud case that was not found when the file was made is labelled as not fraud. A rule that
  fired on it counts as a false alarm, and the fraud counts as left alone.
- **How the labels were made.** The tool reads the label as written. It does not know who confirmed it, when, or by what rule of
  evidence, and it does not know if the sample was cut so as to favour a rule.
- **Anything outside the files.** What your system does with a flag, a hold or a block, how long a review takes, what a false alarm
  costs, which rules run before the ones in the file, and whether the file's fields are the ones the live system has.
- **A rule written from the file.** A rule tuned to the cases in the file looks good on the file. The tool cannot tell.
- **Two conditions that mean one thing.** `gt 99` and `gte 100` on whole numbers, or two ways to list the same countries, are two
  conditions to the tool. The duplicate check compares the conditions as written, with the parts of a group in any order.
- **Dependencies between rules.** The tool treats each rule as a condition on one transaction. Rules that use the history of a
  customer or a device (a count of payments in the last hour) need that history as a field in the file; the tool does not build it.
- **Time order.** The file is read as a set of transactions. The order of the rows is not used, and a rule is not given the earlier
  rows.
- **Types the file does not show.** A column is a number column when every cell that is not empty is a plain number. An identifier
  made of digits is a number to the tool.
- **Currency conversion.** Amounts are added as written. With more than one currency the tool asks for a note and does no
  conversion.

## Limits of the work

A file past a limit is refused whole, with exit code 2 and no report. The tool never reads a part of a file and goes on.

| Limit | Value |
| --- | --- |
| Size of a file | 64 MiB |
| Rows of the transactions | 500,000 |
| Columns | 100 |
| Cells | 5,000,000 |
| Length of a cell | 20,000 characters |
| Rules in a rules file | 1,000 |
| Nesting of a condition | 20 levels |
| Parts of a condition | 500 for each rule |
| Values in a list of a condition | 500 |
| Nesting of brackets in a JSON file | 60 |
| Cut-offs of a sweep | 100 |
| Rule runs of a replay (rules times labelled rows) | 200,000,000 |

Up to 1,000 findings of one check are listed; the rest are counted and the report says so. The readers, the evaluator and the
checks work through loops and stacks, and no function calls itself, so a large or hostile file cannot exhaust the stack.
