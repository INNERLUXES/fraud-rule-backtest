# How to read precision and recall for fraud rules

This page explains, in plain words, the numbers that fraud-rule-backtest puts next to each rule. The numbers in the examples on
this page are made up to show the arithmetic. They are not a claim about any real business.

## Four kinds of transaction

When a rule is replayed on past transactions, each transaction is one of four kinds, because it either was fraud or was not, and the
rule either fired on it or did not.

| | The rule fired | The rule did not fire |
| --- | --- | --- |
| **It was fraud** | caught (a true positive) | missed (a false negative) |
| **It was not fraud** | false alarm (a false positive) | left alone (a true negative) |

Everything below is a way of comparing those four counts.

## Precision: of the alerts, how many were fraud?

Precision is the fraud cases caught divided by all the alerts.

A made-up rule fires 40 times, and 30 of those transactions were fraud. Its precision is 30 divided by 40, which is 0.750. Three
alerts in four were right, and one in four was a good customer who was flagged, held or blocked.

Read precision as **the cost of the rule to good customers and to the people who review alerts**. A rule with low precision sends
most of its work to people who will find nothing, or stops good payments. That is why a rule that blocks, with no person looking,
is held to a higher floor (FRB026) than one that only flags.

Precision says nothing about how much fraud there was to find. A rule can have a precision of 1.000 and catch one case in a
hundred.

## Recall: of the fraud, how much did the rule catch?

Recall is the fraud cases caught divided by all the fraud cases in the file.

The same rule, in a file with 100 fraud cases, catches 30 of them. Its recall is 30 divided by 100, which is 0.300. The other 70
cases went through this rule.

Read recall as **how much of the problem the rule covers**. A rule with a low recall can still be worth keeping, if it catches a
kind of fraud that no other rule catches. That is the reason the report shows, for each rule, how many cases only this rule
catches, and why a rule whose every catch is also caught by another rule is reported as redundant (FRB025).

Recall of one rule is not recall of the set. The report gives both: the set's recall counts a fraud case once if any rule caught
it, and the report shows the cases that every rule missed.

## They pull against each other

Make a rule stricter and it fires less: precision tends to go up and recall tends to go down. Make it looser and recall goes up
while precision goes down. There is no best point that the tool can find for you, because it depends on what a false alarm costs
you compared with what a missed fraud case costs you. The tool gives you both numbers, and the limits of the rules file
(`min_precision`, `max_alert_rate`) are where a team writes down the trade it has chosen.

The sweep command shows the same trade for a score: a table of precision and recall at each cut-off.

## The other numbers in the report

- **False positive rate** is the false alarms divided by all the transactions that were not fraud. It answers a different question
  from precision: of the good customers, how many were touched. When fraud is rare, a rule can have a low precision and a very
  small false positive rate at the same time, because there are so many good transactions.
- **Alerts for each thousand transactions** is the volume the rule puts in front of people. It is the number to set against the
  capacity of a review team, and it is what `max_alert_rate` limits.
- **Amount of fraud caught** and **amount of good transactions affected** put money next to the counts. One large fraud case can
  matter more than ten small ones, and the counts alone do not show that. The tool adds the amounts as they are written in the
  file; with more than one currency the sums mix currencies (FRB016).
- **Fraud caught by more than one rule** is the overlap. A high overlap is not a fault; two rules can be kept so that one still
  works when the other is switched off. It is information for the person who decides which rules to keep.
- **Fraud missed by every rule** is the cases no rule of the set caught. Read it before reading anything else about the set.

## How far to trust the numbers

- **A few cases move a rate a lot.** If a rule caught 2 fraud cases in 3 alerts, its precision is 0.667, and one more false alarm
  makes it 0.500. The report marks a rule that caught only a few cases as low evidence (FRB028), with the count, and a file with few
  fraud cases (FRB020). Read those rates as a first look.
- **The past is not the future.** The report says how the rules would have behaved on this file. People who commit fraud change what
  they do when a rule stops them, so a rule that was precise on past data can behave differently later. The tool does not predict.
- **The labels are a confirmed outcome, and confirmation takes time.** A fraud case that was not yet found when the file was made
  is labelled as not fraud, and a rule that fired on it is counted as a false alarm. The newest rows of a file are the least
  reliable for this reason.
- **A rule written after looking at the file is judged on the data it was written from.** If you tighten a rule until it fits the
  cases in the file, its numbers on that file will be good and mean little. Keep some labelled transactions the rule was not written
  from, and replay on them.
- **A sample is not the traffic.** If the file holds all the fraud cases and a part of the good transactions, precision and the
  alerts for each thousand are not those of live traffic. Use the same sampling for the current and the candidate set, and do not
  compare the numbers with numbers from a differently built file.
- **The amounts are only as good as the column.** One bad cell is reported (FRB015), and counts as zero.

## Questions to ask of a report

1. How many fraud cases are in the file, and how many cases did each rule catch? Is it enough to say anything?
2. What does each action do to a customer? Are the rules that block precise enough for that?
3. What does the review team have to read each day at this volume?
4. Which fraud cases did no rule catch, and is there a rule that could catch them without a flood of false alarms?
5. In the comparison, which fraud cases does the candidate lose, and which false alarms does it add? Are they the ones you expected?
