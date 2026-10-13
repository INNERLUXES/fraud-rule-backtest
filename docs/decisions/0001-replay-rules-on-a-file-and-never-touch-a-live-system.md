# 1. Replay rules on a file, and never touch a live system

## Status

Accepted

## Context

A fraud rule is tested before it goes live by running it on past transactions whose outcome is known. A tool that did this
inside a payment system, or that fetched the transactions from a database, would need access to the most sensitive data a business
has, would need keys, and would make the result depend on the state of other systems at the moment of the run.

What the people who change rules need first is an answer that can be repeated: the same transactions and the same rules give the
same numbers. The transactions can be exported to a file.

## Decision

1. The tool reads a transactions file and one or two rules files, and counts. It never connects to a payment system, a database or a
   rule engine, and it never changes a rule.
2. The tool does not predict. It says what the rules would have done on the file and says that this is not a forecast.
3. A result is worded as findings at or above a level. A clean result is never worded as a statement that the rules work.

## Consequences

- The tool runs in a pipeline with no network and no key, on an export that the team chose.
- The tool cannot see anything outside the file. docs/limits.md says what that is: fraud not yet found, how the labels were made,
  what an action does in the live system.
