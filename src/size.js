// Numbers and lists as the reports show them.

export const grouped = (n) => Number(n).toLocaleString('en-US');

// A list for a sentence: "a", "a and b", "a, b and c", and "a, b, c and 4 more" past the limit.
export function listText(items, max = 3) {
  const list = items.slice(0, max);
  const more = items.length - list.length;
  if (more > 0) return `${list.join(', ')} and ${grouped(more)} more`;
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

export function plural(count, one, many = `${one}s`) {
  return `${grouped(count)} ${count === 1 ? one : many}`;
}

// A number with a fixed count of decimals, as the reports show it; the same text on every system. A value that rounds to zero is
// shown without a sign.
export function fixed(value, decimals = 2) {
  const t = Number(value).toFixed(decimals);
  return /^-0(?:\.0+)?$/.test(t) ? t.slice(1) : t;
}

// A number for a table cell, with a comma between the thousands, or a dash for no value.
export function cell(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const t = fixed(value, decimals);
  const [whole, part] = t.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign ? whole.slice(1) : whole;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${part === undefined ? '' : `.${part}`}`;
}

// A number rounded to a count of decimals, as a number.
export const round = (value, decimals) => Number(Number(value).toFixed(decimals));

// The numbers of an object with the decimals the reports show: an amount to 2 decimals, any other fraction to 6. Whole numbers
// and other values stay as they are.
export function tidy(object) {
  const out = {};
  for (const [k, v] of Object.entries(object)) {
    if (typeof v === 'number' && !Number.isInteger(v)) out[k] = round(v, /mount/.test(k) ? 2 : 6);
    else out[k] = v;
  }
  return out;
}
