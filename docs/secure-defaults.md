# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest of the
document is about what the tool cannot do for you: which files you give it, where the output goes, and who may change the files it
reads. A clean result is a pair of files with none of the problems the checks look for, not a finding that the rules catch
fraud: the tool reads files, it never connects to a payment system, it does not predict, and it is not an audit.

## How the tool behaves by default

- **Reads, never writes.** The tool reads the transactions file and the rules files it is given. It follows no symbolic link, fetches
  no URL, refuses an argument that looks like an address, contacts nothing over the network, evaluates nothing, runs no program and
  writes nothing to disk.
- **Never touches a live system.** It has no code that connects to a payment system, a database, a case tool or a rule engine, and
  needs no driver for one. A rule is a file, and the tool never changes one.
- **Never runs what it reads.** A condition is a field, one of ten fixed operators and a value. The operators are functions inside
  the tool. Nothing in a file is turned into code, an object or a pattern.
- **Its own readers.** The CSV reader and the JSON reader are written for this tool. They refuse a key written twice, a field
  written twice in a header, a quote in the wrong place and text that is not UTF-8 or UTF-16, and they turn no text into an object or
  a command. A cell that starts with an equals sign, a plus sign or an at sign is text.
- **Every check on from the first run.** A file the reader cannot follow, an id used twice, a rule with no action, a field that is not
  a column, a label column that is missing, a rule over its alert limit or under its precision floor, and a candidate that loses
  fraud are errors; a missing owner, an unreadable timestamp, a mixed currency and a rule that never fires are warnings. There is no
  configuration file of the tool that could set a check off; only the command line can, and the report names every check that was
  turned off.
- **Fail closed.** When a file cannot be read, no check of that file runs, the checks that need it are reported as not evaluated,
  and the run fails. A file past a limit is refused; it is never read in part. Rules are not replayed on labels that cannot be used.
- **No clock.** The tool reads no date and no time. The same files and options give the same report on every day, and the JUnit
  report records every time as 0. A time-based check runs against a time you give with `--as-of`.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option given twice
  stop the run, so a typo such as `--fail-no` cannot leave a default in place.
- **No pattern from the input.** No regular expression is built from a file or from an argument.
- **Bounded work.** The readers have limits (docs/limits.md), the checks visit each rule and each row a bounded number of times,
  a replay that would need too many rule runs is refused, and no function calls itself, so a large or hostile file cannot exhaust the
  stack, the memory or the time.
- **No prototype tricks.** Names from the files are kept in maps and sets, never set as properties of an object, so `__proto__` is
  only a name.
- **Clean output.** Text from the input, file names, rule ids, owners and transaction ids included, has control characters, line
  separators and direction controls replaced and its length capped before it reaches a report or an error message; the markdown
  report also escapes what markdown gives a meaning to, and the JUnit report escapes what XML gives a meaning to.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--fail-on warning`.** A missing owner, a rule that never fires or that catches nothing, a redundant rule, a repeated condition,
  a mixed currency, an unrecognised label and an unreadable timestamp fail the run too. Use it on the rule set that is about to go
  live, and record each warning the team keeps on purpose.
- **Limits in the rules file.** Set `max_alert_rate` and `min_precision` on every rule, `max_hold_per_thousand` for the review
  queue, and `max_new_false_alarms` for a candidate, so that the checks hold the numbers the team chose.
- **`--as-of`.** Give the time the file was made, so that a transaction dated after it is found.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@<full commit hash> # vX.Y.Z
  - uses: actions/setup-node@<full commit hash> # vX.Y.Z
    with:
      node-version: 22
  - name: Back-test the candidate rules
    run: npx --yes github:INNERLUXES/fraud-rule-backtest compare data/labelled.csv --current rules/live.json --candidate rules/next.json --format junit > backtest-junit.xml
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no key and no access to a server; never give
  it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx` runs what
  it downloads.
- Check the exact files that the next step uses. Files edited after the check are not what was checked.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error` and keep the
  JUnit, SARIF or JSON report as an artifact of the job.
- Keep the reports with the same care as the files, because a finding quotes rule ids, owners, field names and transaction ids.
- Do not put card numbers, names, addresses or other personal data in a transactions file you check. Use identifiers that mean
  nothing outside your system. The tool does not look for personal data, and a finding can quote the text it is about.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with `ssdf-repo-check`
pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
