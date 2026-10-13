# Threat model

fraud-rule-backtest reads a transactions file (CSV, JSON lines or a JSON array) and one or two rules files (JSON). It never
connects to a payment system or a database, never runs what it reads, does not predict, and is not an audit. This document is about
the tool itself: what it touches, what a hostile or careless file can try, and what stops it.

## What the tool touches

- It reads the files named on the command line. Nothing else is opened, and no path, address, id or text written in a file is
  looked up, opened or followed. A field name, a rule id or an owner is only text.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL, follows no symbolic link, runs nothing it reads, evaluates nothing and reads no
  clock and no locale.

## What the input may hold

The files come from a person, from a colleague, from an export of a payment or case system, or, in a pipeline that checks every
pull request, from whoever sent the pull request. Through the files, a person can try to, or a careless run can:

- make the tool run something: a condition value that another tool would evaluate; a cell that a spreadsheet would read as a
  formula (a cell that starts with an equals sign, a plus sign or an at sign is only text here);
- make the tool reach something: a rule id, a note or a field name written as an address or a path;
- exhaust the memory, the stack or the time: a file of many megabytes, brackets nested a hundred thousand deep, a condition nested
  very deep or with very many parts, thousands of rules, hundreds of thousands of rows, thousands of columns, a cell of the longest
  length, a line of many quotes, one value on every row, a list of very many values;
- move the result: a key written twice so that two readers see two values, a misspelt key that hides a limit from every check, a
  field or rule id named `__proto__` or `constructor`, two ids that differ only in case, a very long text that pushes a finding
  out of sight;
- rewrite the terminal or the report: control characters, escape sequences, line and paragraph separators or direction controls in
  a rule id, an owner, a field, a transaction id or a file name; markup or an XML special character in a text that ends in the
  markdown or the JUnit report;
- make the exit code lie: a file that cannot be read must not pass, a check that did not run must say so, and a rule or a row that
  was not read must not be taken for one that is fine.

## What stops it

| Risk | What the tool does |
| --- | --- |
| Reading outside the files | Only the paths given are opened, through one handle whose type and size are checked first; a link, a folder, a device and an address are refused; nothing in a file is used as a path to open. |
| Running something | The readers are its own and evaluate nothing. A condition is a field, one of ten fixed operators and a value; the operators are functions inside the tool, chosen by name from a fixed list. No program and no pattern is built from a file. |
| Reaching something | There is no code that opens a connection, and a test fails if a module of src names one. |
| Memory, stack and time | Limits on size, rows, columns, cells, rules, nesting and parts of a condition and values in a list (docs/limits.md). No function calls itself: the readers use a stack and a loop, a condition is compiled by a walk over a list, and the checks use lists and maps. The replay is refused before it starts when it would need more than the limit of rule runs. A file past a limit is refused whole. |
| Two readings of one file | A key written twice is an error in the JSON reader. A field written twice in a CSV header is an error. An unknown key is a warning with the nearest name. |
| Object tricks | Keys, field names, rule ids and labels are kept in maps and sets, never set as properties of an object. `__proto__` is only a name. |
| Hidden characters | Text from the input is cleaned before it reaches a message; the markdown report escapes markdown and the JUnit report escapes XML and drops the characters XML 1.0 cannot hold. |
| A lying exit code | A file that cannot be read is an error finding and the checks it feeds are shown as not evaluated. A check that did not run says why. A report never shows a pass for what it did not read. |
| Flooding the report | At most 1,000 findings of one check are listed; the rest are counted and the report says so. |

## What the tool does not defend

- **The content of the files.** A file of labels can be wrong in every row and still be read. The tool counts, and does not know
  what is true.
- **Who may change the files, and who may read the reports.** A finding quotes rule ids, owners, field names and transaction ids.
  Keep the reports with the same care as the files, and do not put card numbers, names or other personal data in the files you
  check. The tool does not look for them.
- **The pipeline.** Pin the actions and the tool to a commit, give the job read access only, and do not hide the exit code
  (docs/secure-defaults.md).

## Not a promise about fraud

Nothing in the tool says that a rule catches fraud, or that a number is right. It checks files.
