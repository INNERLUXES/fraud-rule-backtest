# 4. Count, and never claim the rules work

## Status

Accepted

## Context

A table with a precision of 0.950 invites the reading that the rule is good. The number is a count on one file. It rests on how
many cases there were, on labels that may be incomplete, and on a rule that may have been written from the same file. A report
that sounds sure would lead people to switch off rules, or to ship them, on the strength of a few cases.

## Decision

1. Every check is a best practice of this tool, and says so. No check is presented as set by a standard.
2. The report states, in every format, that a result describes the file and is not a forecast, and that a clean result means only
   that no problem of the checks was found.
3. A rule or a file judged on few cases is marked, with the count (FRB028 and FRB020), instead of hidden.
4. The defaults of the limits are the choice of the tool, are documented, and can be set in the rules file.
5. The tool is not described as a fraud detection system, a model validation or an audit.

## Consequences

- Readers get the counts and the reasons to be careful with them, in the report and in docs/reading-precision-and-recall.md.
- A team that wants a verdict has to decide it, with the limits it chose written in the rules file.
