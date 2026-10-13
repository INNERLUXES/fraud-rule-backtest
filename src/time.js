// Times and numbers as the transactions file writes them. A time is read to seconds since the epoch, by arithmetic of this
// tool: the tool reads no clock and uses no date object, so the same file gives the same result on every day and in every time
// zone. A time is either a number (seconds, or milliseconds when it has twelve digits or more) or an ISO 8601 text such as
// YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS, with an optional fraction and an optional Z or hh:mm offset. A text with no offset is read as UTC.

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const EPOCH = /^\d{1,14}$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

// A plain decimal number, or null. No exponent, no thousands separator, no hexadecimal, no Infinity.
export function parseNumber(text) {
  const t = String(text).trim();
  if (t.length === 0 || t.length > 40 || !NUMBER.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// The number of days from the first day of the epoch to the civil date.
function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// The seconds since the epoch of a time, or null when the text is not a time this tool reads.
export function parseTime(text) {
  const t = String(text).trim();
  if (EPOCH.test(t)) {
    const n = Number(t);
    return t.length >= 12 ? n / 1000 : n;
  }
  const m = ISO.exec(t);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (month < 1 || month > 12) return null;
  const length = DAYS[month - 1] + (month === 2 && leap(year) ? 1 : 0);
  if (day < 1 || day > length || hour > 23 || minute > 59 || second > 59) return null;
  let offset = 0;
  if (m[8] !== undefined && m[8].toUpperCase() !== 'Z') {
    const digits = m[8].replace(':', '');
    const sign = digits[0] === '-' ? -1 : 1;
    const oh = Number(digits.slice(1, 3));
    const om = Number(digits.slice(3, 5));
    if (oh > 23 || om > 59) return null;
    offset = sign * (oh * 3600 + om * 60);
  }
  const fraction = m[7] === undefined ? 0 : Number(`0.${m[7]}`);
  return daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second + fraction - offset;
}
