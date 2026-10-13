## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run test:coverage`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a check is described in docs/checks.md, says what it can and cannot see, and has a test with the rules and the transactions written inline and a near miss on each side
- [ ] A change to what the tool cannot see is in docs/limits.md
- [ ] A change to the rules file format, the operators or the columns of the transactions file is in docs/rule-format.md or docs/usage.md, with an example, and the readers still refuse what they do not read instead of guessing
- [ ] A check is still a best practice of the tool and says so in its `own` and `cannot` text; nothing in the change claims that a standard sets it
- [ ] Nothing in the change, the README or the output reads as a forecast of how a rule will behave on future transactions, or as an audit; a clean report is still worded as "no finding at or above the level"
- [ ] The tool still reads the text of the transactions file and the rules files and nothing else: it never connects to a payment system or a database, contacts nothing over the network, reads no clock and writes nothing to disk
- [ ] A file the reader cannot follow is still a `FRB001` finding, and a check never takes a rule or a row it did not read for one that is fine
- [ ] A condition is still only read as fields, operators and values, never run as code and never turned into a pattern
- [ ] The readers, the evaluator and the checks still do not recurse, and no pattern is built from a file or from an argument
- [ ] Text from the input goes through `safeText` before it reaches the output or an error message, and the markdown format escapes what markdown gives a meaning to
- [ ] The work stays bounded: the limits of docs/limits.md hold, and a hostile test has a time check that widens under coverage through `NODE_V8_COVERAGE`
- [ ] A test that depends on the operating system (a link, a device) is guarded with `process.platform`, asserts no line of its own, and builds its paths with `resolve()` from forward-slash names; no test asserts the hash or version of an action
- [ ] The examples stay made up and minimal: no real company, product or person, no key, no date and no number that reads like a year
- [ ] The commit messages of this pull request follow Conventional Commits
