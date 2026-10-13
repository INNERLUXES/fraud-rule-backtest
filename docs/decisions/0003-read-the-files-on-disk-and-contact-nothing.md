# 3. Read the files on disk, and contact nothing

## Status

Accepted

## Context

A tool that checks fraud rules could fetch labelled transactions from a case system, look up what an action does, or send its
report to a service. That would need the network and often a key, would send transaction data to a third party, and would let a
file in a pull request make the pipeline reach any address it names.

## Decision

1. The tool reads the files it is given, and nothing else. It contacts nothing over the network, fetches nothing, needs no key, runs
   no program and sends no data anywhere.
2. A path that looks like an address is refused. A symbolic link, a folder and a device are refused. A file that is not text, or is
   too large, is refused with exit code 2 and no report.
3. The tool reads no clock and no locale. The check for a transaction dated in the future runs against a time given with
   `--as-of`, so the same files give the same report on every day. The JUnit report records every time as 0.
4. The tool writes only to standard output and standard error. It keeps no cache, no log and no temporary file.

## Consequences

- The tool is usable in a pipeline that has no network, and a hostile file cannot make it reach anything.
- The tool does not know the current time, so FRB019 is skipped unless the time is given.
