# FRB025 rule-redundant

- Level: warning
- Kind: results

**What it looks at.** a rule that catches fraud and every case it catches is also caught by another rule of the set

**Why it exists.** Reporting a rule that adds no catch is a best practice of this tool; no standard sets it; the rule adds false alarms and review work and no fraud that the set would not catch without it

**What to change.** Retire the rule or merge it into the one that already catches the same cases, unless it is there on purpose.

**What it cannot see.** It sees one file. A rule that is redundant here may catch cases on other days, and two rules may be kept so that one still works if the other is turned off.

This check is a best practice of this tool; no standard sets it.
