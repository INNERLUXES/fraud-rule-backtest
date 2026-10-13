# Security

## Reporting a problem

Use private vulnerability reporting on this repository (the Security tab, "Report a vulnerability"). Please do not open a public
issue for a vulnerability.

Include a small made-up transactions file and rules file that show the problem, the command you ran, what you expected and what
happened. Use made-up ids, owners and rule names, never data of a real business or the name of a real company, never card numbers,
names or other personal data, and never a real key, token or password, even an old one.

## Scope

The tool reads the text of a transactions file and of one or two rules files. It never connects to a payment system or a database,
never changes a rule, does not predict and is not an audit. In scope:

- an input that makes the tool read a file other than the ones it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a URL, connect to a database, write or sign anything, run any other
  program, or evaluate anything it reads, such as a condition, a value, a rule id, a note or a cell of the table
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large file, brackets
  nested very deep, a condition nested or repeated very deep, thousands of rules, hundreds of thousands of rows, thousands of
  columns, a cell of the longest length, a line of many quotes, a list of very many values, or one value on every row
- binary or invalid input that the tool reads as if it were a table or a rules file
- a key written twice that is read without an error, a misspelt key that is not reported, or two rule ids that differ only in case
  that are taken for two
- a file that docs/method.md says is reported (a rule id used twice, a field that is not a column, an operator that does not fit the
  field, a label column that is missing) that the tool does not report
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is reported, or
  a file that cannot be read and still passes
- text from a file or a file name that rewrites the terminal through control or direction characters, is shown unescaped in the
  output, puts markup into the markdown report or breaks the XML of the JUnit report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the problems docs/limits.md says the tool does not see, whether a label or a rule is right, how a rule will behave on
future transactions, what a payment system does with a flag, a hold or a block, who may change or upload the files, and where your
pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
