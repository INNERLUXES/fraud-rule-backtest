import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, parseTime } from '../src/index.js';
import { yr } from './helpers.js';

const at = (y, rest) => `${yr(y)}-${rest}`;

// Numbers: what is a plain decimal number and what is not.
test('parseNumber: plain decimals are numbers, with a sign, a leading or trailing point and spaces around', () => {
  for (const [text, value] of [['0', 0], ['12', 12], ['12.5', 12.5], ['-3', -3], ['+4.25', 4.25], ['.5', 0.5], ['7.', 7], ['  42  ', 42], ['0.001', 0.001], ['100000000', 100000000]]) {
    assert.equal(parseNumber(text), value, text);
  }
});

test('parseNumber: an exponent, a hexadecimal, a separator, a unit, a sign of currency and text are not numbers', () => {
  for (const text of ['', '  ', 'abc', '1e3', '0x10', 'Infinity', 'NaN', '1,000', '12 EUR', '$5', '1.2.3', '--1', '5%', `${'9'.repeat(41)}`]) {
    assert.equal(parseNumber(text), null, text.slice(0, 20));
  }
});

// Times: the same moment written in different ways.
test('parseTime: seconds since the epoch are read as they are', () => {
  assert.equal(parseTime('0'), 0);
  assert.equal(parseTime('1700000000'), 1700000000);
  assert.equal(parseTime(' 86400 '), 86400);
});

test('parseTime: twelve digits or more are milliseconds', () => {
  assert.equal(parseTime('1700000000000'), 1700000000);
  assert.equal(parseTime('999999999999'), 999999999.999);
  assert.equal(parseTime('99999999999'), 99999999999, 'eleven digits are still seconds');
});

test('parseTime: the first day of the epoch is zero', () => {
  assert.equal(parseTime(`${String(1000 + 970)}-01-01`), 0);
  assert.equal(parseTime(`${String(1000 + 970)}-01-01T00:00:00Z`), 0);
  assert.equal(parseTime(`${String(1000 + 970)}-01-02`), 86400);
});

test('parseTime: a date alone is midnight, and a space may stand for the T', () => {
  assert.equal(parseTime(at(24, '03-05')), parseTime(at(24, '03-05T00:00:00Z')));
  assert.equal(parseTime(at(24, '03-05 10:20:30')), parseTime(at(24, '03-05T10:20:30Z')));
  assert.equal(parseTime(at(24, '03-05T10:20')), parseTime(at(24, '03-05T10:20:00')));
});

test('parseTime: a day is 86400 seconds, across a month end and a year end', () => {
  assert.equal(parseTime(at(24, '03-01')) - parseTime(at(24, '02-29')), 86400);
  assert.equal(parseTime(`${yr(25)}-01-01`) - parseTime(`${yr(24)}-12-31`), 86400);
  assert.equal(parseTime(at(24, '12-31T23:59:59')) + 1, parseTime(`${yr(25)}-01-01`));
});

test('parseTime: a leap year has 366 days and the century rule holds', () => {
  assert.equal(parseTime(`${yr(25)}-01-01`) - parseTime(`${yr(24)}-01-01`), 366 * 86400);
  assert.equal(parseTime(`${yr(26)}-01-01`) - parseTime(`${yr(25)}-01-01`), 365 * 86400);
  assert.ok(parseTime(at(24, '02-29')) !== null);
  assert.equal(parseTime(at(23, '02-29')), null);
  assert.equal(parseTime(`${yr(100)}-02-29`), null, 'a year divisible by 100 and not by 400 is not a leap year');
  assert.ok(parseTime(`${yr(0)}-02-29`) !== null, 'a year divisible by 400 is a leap year');
});

test('parseTime: an offset moves the moment by its hours and minutes', () => {
  const utc = parseTime(at(24, '05-05T12:00:00Z'));
  assert.equal(parseTime(at(24, '05-05T14:00:00+02:00')), utc);
  assert.equal(parseTime(at(24, '05-05T14:00:00+0200')), utc);
  assert.equal(parseTime(at(24, '05-05T07:00:00-05:00')), utc);
  assert.equal(parseTime(at(24, '05-05T17:30:00+05:30')), utc);
  assert.equal(parseTime(at(24, '05-05T12:00:00z')), utc);
});

test('parseTime: a text with no offset is read as UTC', () => {
  assert.equal(parseTime(at(24, '05-05T12:00:00')), parseTime(at(24, '05-05T12:00:00Z')));
});

test('parseTime: a fraction of a second is kept', () => {
  assert.equal(parseTime(at(24, '05-05T12:00:00.5Z')) - parseTime(at(24, '05-05T12:00:00Z')), 0.5);
  assert.equal(parseTime(at(24, '05-05T12:00:00.250Z')) - parseTime(at(24, '05-05T12:00:00Z')), 0.25);
});

test('parseTime: a date that does not exist, a time out of range, an offset out of range and words are not times', () => {
  for (const [name, text] of [
    ['month 13', at(24, '13-01')],
    ['month 0', at(24, '00-10')],
    ['day 0', at(24, '05-00')],
    ['day 32', at(24, '05-32')],
    ['day 31 of a month with 30 days', at(24, '04-31')],
    ['hour 24', at(24, '05-05T24:00:00Z')],
    ['minute 60', at(24, '05-05T10:60:00Z')],
    ['second 60', at(24, '05-05T10:10:60Z')],
    ['offset hour 24', at(24, '05-05T10:10:10+24:00')],
    ['offset minute 60', at(24, '05-05T10:10:10+02:60')],
    ['words', 'soon'],
    ['empty', ''],
    ['a date with slashes', `05/05/${yr(24)}`],
    ['a short year', '24-05-05'],
    ['trailing text', at(24, '05-05T10:10:10Z later')],
    ['negative seconds', '-5']
  ]) {
    assert.equal(parseTime(text), null, name);
  }
});
