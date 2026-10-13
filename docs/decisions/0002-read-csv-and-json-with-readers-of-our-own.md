# 2. Read CSV and JSON with readers of our own

## Status

Accepted

## Context

The files come from exports and from people. A reader that is general, or that builds objects from what it reads, accepts more than
the tool needs and can be made to do more than read. A finding that only says a file is wrong, with no line, is of little help
for a rules file that has a few hundred lines.

## Decision

1. The tool has its own CSV reader (quotes as in RFC 4180, a comma or a tab), its own JSON reader and a reader of JSON lines built
   on it. They keep the line and column of every key and cell, work through loops and stacks, have limits, and refuse what they
   cannot follow: a key written twice, a quote in the wrong place, a field written twice in a header, semicolons as separators.
2. There is no reader of YAML. The rules are data, and one strict format keeps the tool small.
3. A file that cannot be read is an error finding, no other check of that file runs, and the checks that need it are reported as
   not evaluated.

## Consequences

- No dependency to keep up to date, and no behaviour of a library that a hostile file can reach.
- A format the readers do not read must be converted first. docs/usage.md and docs/rule-format.md describe what is read.
