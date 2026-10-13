# The rules file

A rules file is JSON. It holds one rule set: a name, a few limits, and a list of rules. The reader is the tool's own. It keeps the
line and column of every key, refuses a key written twice, and never turns text into code: a condition is data that the tool
compares with a column, nothing more.

## A short rule set

This one passes every check on the example transactions, and a test of this repository checks that it still does.

```json
{
  "name": "Short rule set",
  "currency_note": "All amounts are in one currency, EUR.",
  "limits": { "max_hold_per_thousand": 60 },
  "rules": [
    {
      "id": "S001",
      "name": "Large gift card order",
      "owner": "Payments risk team",
      "action": "hold",
      "when": {
        "all": [
          { "field": "merchant_category", "op": "eq", "value": "gift_cards" },
          { "field": "amount", "op": "gte", "value": 300 }
        ]
      },
      "max_alert_rate": 40,
      "min_precision": 0.6
    },
    {
      "id": "S002",
      "name": "Very high amount",
      "owner": "Fraud operations",
      "action": "block",
      "when": { "field": "amount", "op": "gte", "value": 900 },
      "max_alert_rate": 30,
      "min_precision": 0.9
    }
  ]
}
```

## The keys of the file

| Key | What it is |
| --- | --- |
| `name` | A name for the rule set, shown in the report. |
| `description` | Free text. Not used. |
| `currency_note` | Text that says how the amounts were made comparable when the transactions hold more than one currency. FRB016 looks for it. |
| `limits` | The limits of the whole set, below. |
| `rules` | The list of rules. At least one; at most 1,000. |

## The limits

All are optional. A limit with a default is checked from the first run; the others are checked when the file sets them.

| Key | Meaning | Default |
| --- | --- | --- |
| `max_hold_per_thousand` | The most transactions for each thousand whose strongest action is hold (FRB027). A number from 0 to 1,000. | none |
| `block_min_precision` | The lowest precision a rule that blocks may have (FRB026). A number from 0 to 1. | 0.9 |
| `min_true_positives` | A rule that catches fewer fraud cases than this is marked as low evidence (FRB028). A whole number. | 5 |
| `min_fraud_cases` | A file with fewer fraud cases than this is marked (FRB020). A whole number. | 20 |
| `max_new_false_alarms` | The most good transactions the candidate may alert on that the current set does not (FRB030, compare only). A whole number. | none |
| `max_lost_fraud` | The most fraud cases the candidate may stop catching (FRB029, compare only). A whole number. | 0 |

The defaults are the choice of this tool. Set the limits to the numbers your team accepts.

## A rule

| Key | What it is |
| --- | --- |
| `id` | Text or a number. Unique in the file, compared without case and extra spaces. Required. |
| `name` | What the rule is for, in words. |
| `owner` | The person, role or team that answers for the rule (FRB005). |
| `action` | `flag`, `hold` or `block` (FRB006). What happens to a transaction the rule fires on. |
| `when` | The condition, below. Required. |
| `max_alert_rate` | The most alerts for each thousand transactions the rule may raise (FRB023). A number from 0 to 1,000. |
| `min_precision` | The lowest precision the rule may have (FRB024). A number from 0 to 1. A rule that blocks should set it (FRB011). |
| `note` | Free text. Not used. |

The three actions are ordered: a transaction that several rules fire on is counted once in the set, under the strongest action,
`block` over `hold` over `flag`. The tool does not know what your system does with an action. It only counts.

## A condition

A condition is a **leaf** or a **group**.

A leaf has a `field` (the name of a column of the transactions, compared without case), an `op` and a `value`:

```json
{ "field": "amount", "op": "gte", "value": 300 }
```

A group is a mapping with exactly one key:

```json
{ "all": [ condition, condition ] }
{ "any": [ condition, condition ] }
{ "not": condition }
```

`all` is true when every condition in the list is true, `any` when at least one is, and `not` when the one inside it is false.
Groups nest, to 20 levels and 500 parts for each rule.

### The operators

| Operator | Value | Meaning | Number | Time | Text |
| --- | --- | --- | --- | --- | --- |
| `eq` | one value | equal | yes | yes | yes |
| `ne` | one value | not equal | yes | yes | yes |
| `gt` | one value | greater than | yes | yes | no |
| `gte` | one value | greater than or equal | yes | yes | no |
| `lt` | one value | less than | yes | yes | no |
| `lte` | one value | less than or equal | yes | yes | no |
| `in` | a list | equal to one of the values | yes | no | yes |
| `not_in` | a list | equal to none of the values | yes | no | yes |
| `contains` | one text | the text holds the value | no | no | yes |
| `between` | a list of two | from the first to the second, both ends included | yes | yes | no |

- A number column takes numbers in a rule. A text column takes text in quotes. A time column takes a number (seconds since the
  epoch) or an ISO 8601 text. A value that does not fit is FRB009, and so is an operator the type does not take.
- Text is compared exactly, with case. `contains` looks for the value inside the text.
- An empty cell is no value, and every operator is false on it, `ne` and `not_in` included. Use `not` around a leaf to match the
  rows where it is false.
- `between` with the first value above the second matches nothing and is FRB007.
- A list holds at most 500 values.

### A rule on a field the data does not have

The rule is replayed as a rule that never fires, and FRB008 says so with the nearest column. The same goes for a rule whose
operator does not fit the column. The report notes the rules that could not be fully evaluated, and the checks of the results
leave them out so that one mistake is not reported twice.

## What the reader refuses

- A key written twice in one mapping.
- A comma before a closing bracket, a comment, a single quote: the file is JSON.
- A rule that is not a mapping, a condition with both a group key and a leaf key, an `all` or `any` with an empty list.
- A key it does not know is a warning (FRB003), with the nearest known name, and what is under it is not used.
