// What every report says about itself. The tool replays a set of fraud rules on a file of past transactions that carry a confirmed
// label, and reports how each rule and the whole set would have behaved on that file. It never connects to a payment system or a
// database, never changes a rule and never predicts how a rule will behave on future transactions. The checks are best practices
// of this tool: no standard sets any of them, and the reports and the documents say so.

export const LEVELS = ['info', 'warning', 'error'];

// The kinds of check: about a file (whether it can be read, and its keys), about the rules, about the transactions, about the
// results of the replay, and about the comparison of two rule sets.
export const KINDS = ['file', 'rules', 'data', 'results', 'compare'];

export const NOT_A = 'a replay of fraud rules on a file of past transactions with confirmed labels, from plain files; it does not predict how a rule will behave on future transactions, does not know whether the labels are complete or right, and is neither a fraud detection system, a model validation nor an audit';

export const NOTICE = 'This report reads the transactions file and the rules file and nothing else. It replays the rules on past transactions that carry a label. A result describes how the rules would have behaved on that file; it is not a forecast of how they will behave on future transactions, and it is not a statement that the labels are complete or right. A clean result means that none of the problems of its checks were found.';

// Why a check is a best practice and not a rule.
export const BEST = 'a best practice of this tool; no standard sets it';

// The commands.
export const COMMANDS = ['backtest', 'compare', 'sweep'];

// The actions of a rule, from the mildest to the strongest.
export const ACTIONS = ['flag', 'hold', 'block'];

// The operators of a condition.
export const OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'between'];

// The operators that are valid for each type of field.
export const OPERATORS_BY_TYPE = {
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'between'],
  time: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'],
  text: ['eq', 'ne', 'in', 'not_in', 'contains']
};
export const LIST_OPERATORS = ['in', 'not_in'];

// The groups of a condition.
export const GROUPS = ['all', 'any', 'not'];

// The keys of the rules file, of a rule, of the limits and of a condition.
export const RULESET_KEYS = ['name', 'description', 'currency_note', 'limits', 'rules'];
export const RULE_KEYS = ['id', 'name', 'owner', 'action', 'when', 'max_alert_rate', 'min_precision', 'note'];
export const LIMIT_KEYS = ['max_hold_per_thousand', 'block_min_precision', 'min_true_positives', 'min_fraud_cases', 'max_new_false_alarms', 'max_lost_fraud'];
export const LEAF_KEYS = ['field', 'op', 'value'];

// The defaults of the limits that have one. A limit with no default is not checked until the rules file sets it.
export const LIMIT_DEFAULTS = { block_min_precision: 0.9, min_true_positives: 5, min_fraud_cases: 20, max_lost_fraud: 0 };

// The columns of the transactions file, with the other names a column is read under (compared without case).
export const COLUMNS = {
  id: ['id', 'transaction_id', 'txn_id'],
  timestamp: ['timestamp', 'time', 'ts', 'created_at'],
  amount: ['amount', 'amt'],
  currency: ['currency', 'ccy'],
  label: ['is_fraud', 'fraud', 'label'],
  score: ['score']
};

// The values of the label. Anything else that is not empty is not recognised.
export const FRAUD_LABELS = ['1', 'true', 'yes', 'y', 't', 'fraud', 'confirmed'];
export const LEGIT_LABELS = ['0', 'false', 'no', 'n', 'f', 'legit', 'legitimate', 'genuine', 'ok'];

// The thresholds of a sweep when none are given and the scores lie between 0 and 1.
export const DEFAULT_THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

// The limits of the work. A file past a limit is refused; the tool never reads a part of a file and goes on.
export const LIMITS = {
  maxBytes: 64 * 1024 * 1024,
  maxLines: 2000000,
  maxDepth: 60,
  maxConditionDepth: 20,
  maxConditionNodes: 500,
  maxRules: 1000,
  maxRows: 500000,
  maxColumns: 100,
  maxCells: 5000000,
  maxCellLength: 20000,
  maxListItems: 500,
  maxThresholds: 100,
  maxTextLength: 20000
};
